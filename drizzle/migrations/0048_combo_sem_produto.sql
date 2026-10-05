-- 0048: combos (produto_id NULL) não quebram confirmação do pedido.
-- Os triggers 0042 (reserva FEFO) e 0043 (fila de fritura) percorriam TODOS os
-- itens: o combo avulso abortava a transição recebido→em_producao ("estoque
-- insuficiente para produto null" / violação NOT NULL em fritura_fila).
-- Como o combo é o produto central (múltiplos de 50), isso travava o fluxo
-- principal. Correção: ambos ignoram itens sem produto (montagem).
-- Idempotente. Rode APÓS 0047. (Arquivos 0042/0043 já atualizados p/ fresh.)

-- Garante o enum da 0042 em reexecução
DO $$ BEGIN
CREATE TYPE public.tipo_mov_estoque AS ENUM (
  'entrada_producao',
  'entrada_manual',
  'venda',
  'reserva',
  'liberacao',
  'cancelamento',
  'perda',
  'vencimento',
  'ajuste',
  'devolucao',
  'degustacao'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reservar_estoque_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_qtd_restante integer;
  v_lote record;
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

        -- Registra movimentação de reserva
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
          )
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

CREATE OR REPLACE FUNCTION public.trigger_criar_fritura_fila()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_tempo integer;
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    -- Só itens COM produto (fritura_fila.produto_id é NOT NULL)
    FOR v_item IN
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = NEW.id
        AND pi.produto_id IS NOT NULL
    LOOP
      v_tempo := public.calcular_tempo_fritura(v_item.produto_id, v_item.quantidade);
      INSERT INTO public.fritura_fila (pedido_id, produto_id, quantidade, tempo_previsto_segundos)
      VALUES (NEW.id, v_item.produto_id, v_item.quantidade, v_tempo)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reservar_estoque_pedido(uuid) IS '0048: ignora itens sem produto (combo montado = montagem, sem baixa de lote).';
COMMENT ON FUNCTION public.trigger_criar_fritura_fila() IS '0048: ignora itens sem produto (fritura_fila.produto_id é NOT NULL).';
