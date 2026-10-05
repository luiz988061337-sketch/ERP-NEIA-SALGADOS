-- 0050: um dono por coluna (0030 x 0042 debitavam produtos.estoque 2x).
-- Cenário: checkout reserva via 0030 (baixa produtos.estoque) e a confirmação
-- via 0042 baixava produtos.estoque DE NOVO + lotes. Cancelar sem RPC ainda
-- vazava. Regra única a partir daqui:
--   - 0030 é dona do produtos.estoque quando engajou (linhas em reservas_estoque);
--   - 0042 move LOTES e registra trilha; só encosta em produtos.estoque no modo
--     legado (sem 0030: tabela ausente ou sem linhas do pedido);
--   - no cancel, 0042 chama liberar_reserva_atomica antes de devolver os lotes,
--     então cancelar pelo admin (sem RPC no front) continua balanceado.
-- Idempotente (OR REPLACE + guards p/ 0030 ausente). Rode APÓS 0049.
-- 0050 é autoritativo nas 3 funções (0042/0048 ficam como histórico).

CREATE OR REPLACE FUNCTION public.registrar_mov_estoque(
  p_produto_id uuid,
  p_tipo public.tipo_mov_estoque,
  p_quantidade integer,
  p_lote_id uuid DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_atualizar_estoque boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saldo_anterior integer;
  v_saldo_posterior integer;
BEGIN
  -- Trava o produto para evitar race condition
  PERFORM * FROM public.produtos WHERE id = p_produto_id FOR UPDATE;

  SELECT estoque INTO v_saldo_anterior FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado: %', p_produto_id;
  END IF;

  -- Modo trilha (0030 já moveu produtos.estoque): só registra, não soma 2x
  IF p_atualizar_estoque THEN
    v_saldo_posterior := v_saldo_anterior + p_quantidade;
    IF v_saldo_posterior < 0 THEN
      RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
        p_produto_id, v_saldo_anterior, p_quantidade;
    END IF;

    -- Atualiza estoque do produto
    UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;
  ELSE
    v_saldo_posterior := v_saldo_anterior;
  END IF;

  -- Registra movimentação
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id, p_lote_id, p_tipo, p_quantidade,
    v_saldo_anterior, v_saldo_posterior,
    p_referencia_id, p_referencia_tipo, p_usuario_id, p_observacao
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
  v_ja_0030 boolean;
BEGIN
  -- Valida se pedido existe e está em status confirmado
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos
    WHERE id = p_pedido_id AND status = 'em_producao'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está em status "em_producao": %', p_pedido_id;
  END IF;

  -- Só itens COM produto (combo montado = montagem, sem baixa de lote)
  FOR v_item IN
    SELECT pi.produto_id, pi.quantidade
    FROM public.pedido_itens pi
    WHERE pi.pedido_id = p_pedido_id
      AND pi.produto_id IS NOT NULL
  LOOP
    -- 0030 já baixou produtos.estoque no checkout? Então aqui só movemos lotes.
    v_ja_0030 := false;
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM public.reservas_estoque
        WHERE pedido_id = p_pedido_id
          AND produto_id = v_item.produto_id
          AND status = 'ativa'
      ) INTO v_ja_0030;
    EXCEPTION WHEN undefined_table THEN
      v_ja_0030 := false;
    END;

    v_qtd_restante := v_item.quantidade;

    -- Busca lotes FEFO (First Expire, First Out) com saldo disponível
    FOR v_lote IN
      SELECT id, restante
      FROM public.lotes
      WHERE produto_id = v_item.produto_id
        AND status = 'ativo'
        AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE)
      ORDER BY validade ASC NULLS LAST, created_at ASC
    LOOP
      IF v_qtd_restante <= 0 THEN
        EXIT;
      END IF;

      DECLARE
        v_qtd_lote integer := LEAST(v_lote.restante, v_qtd_restante);
      BEGIN
        -- Atualiza lote
        UPDATE public.lotes
        SET restante = restante - v_qtd_lote
        WHERE id = v_lote.id;

        -- Registra movimentação de reserva (sem rebaixar produtos.estoque se 0030 já o fez)
        PERFORM public.registrar_mov_estoque(
          v_item.produto_id,
          'reserva',
          -v_qtd_lote,
          v_lote.id,
          p_pedido_id,
          'pedido',
          NULL,
          'Reserva FEFO para pedido #' || (
            SELECT numero::text FROM public.pedidos WHERE id = p_pedido_id
          ),
          NOT v_ja_0030
        );

        v_qtd_restante := v_qtd_restante - v_qtd_lote;
      END;
    END LOOP;

    IF v_qtd_restante > 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente para produto % (faltam % unidades). Lotes disponíveis: %',
        v_item.produto_id, v_qtd_restante, (
          SELECT COALESCE(SUM(restante), 0)
          FROM public.lotes
          WHERE produto_id = v_item.produto_id
            AND status = 'ativo'
            AND restante > 0
        );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record;
  v_tem_0030 boolean := false;
BEGIN
  -- 0030 primeiro: restaura produtos.estoque e marca as reservas (no-op se vazio).
  -- Erro aqui aborta o cancel com mensagem visível (melhor que corromper saldo
  -- em silêncio). Só ignora se 0030 nunca foi aplicada (modo legado).
  BEGIN
    PERFORM public.liberar_reserva_atomica(p_pedido_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  -- Se 0030 engajou neste pedido, ela é dona do produtos.estoque: aqui só
  -- devolvemos os LOTES (modo legado = sem linhas 0030 → restaura tudo).
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.reservas_estoque WHERE pedido_id = p_pedido_id
    ) INTO v_tem_0030;
  EXCEPTION WHEN undefined_table THEN
    v_tem_0030 := false;
  END;

  -- Busca movimentações de reserva deste pedido
  FOR v_mov IN
    SELECT produto_id, lote_id, ABS(quantidade) AS qtd
    FROM public.estoque_movimentacoes
    WHERE referencia_id = p_pedido_id
      AND referencia_tipo = 'pedido'
      AND tipo = 'reserva'
  LOOP
    -- Devolve ao lote
    IF v_mov.lote_id IS NOT NULL THEN
      UPDATE public.lotes
      SET restante = restante + v_mov.qtd
      WHERE id = v_mov.lote_id;
    END IF;

    -- Registra liberação (sem recreditar produtos.estoque se 0030 já o fez)
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido',
      NOT v_tem_0030
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.registrar_mov_estoque(uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text, boolean) IS '0050: p_atualizar_estoque=false registra trilha sem mover produtos.estoque (0030 é dona quando engajou).';
COMMENT ON FUNCTION public.reservar_estoque_pedido(uuid) IS '0050: regra única — 0030 dona de produtos.estoque; 0042 move lotes.';
COMMENT ON FUNCTION public.liberar_reserva_pedido(uuid) IS '0050: chama 0030 antes de devolver lotes; sem 0030, restaura tudo (legado).';
