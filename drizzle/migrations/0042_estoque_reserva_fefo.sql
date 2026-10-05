-- 0042: estoque_movimentacoes + reserva atômica FEFO
-- Idempotente. Rode APÓS 0041.

-- =============================================
-- 1. Tabela de movimentações de estoque
-- =============================================
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

CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  tipo public.tipo_mov_estoque NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade != 0),
  saldo_anterior integer NOT NULL,
  saldo_posterior integer NOT NULL,
  referencia_id uuid, -- pedido_id, degustacao_id, etc.
  referencia_tipo text, -- 'pedido', 'degustacao', 'lote', 'manual'
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS est_mov_produto_idx ON public.estoque_movimentacoes (produto_id);
CREATE INDEX IF NOT EXISTS est_mov_lote_idx ON public.estoque_movimentacoes (lote_id);
CREATE INDEX IF NOT EXISTS est_mov_tipo_idx ON public.estoque_movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS est_mov_created_idx ON public.estoque_movimentacoes (created_at);

-- =============================================
-- 2. Função helper para registrar movimentação
-- =============================================
CREATE OR REPLACE FUNCTION public.registrar_mov_estoque(
  p_produto_id uuid,
  p_tipo public.tipo_mov_estoque,
  p_quantidade integer,
  p_lote_id uuid DEFAULT NULL,
  p_referencia_id uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
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

  v_saldo_posterior := v_saldo_anterior + p_quantidade;
  IF v_saldo_posterior < 0 THEN
    RAISE EXCEPTION 'Estoque não pode ficar negativo (produto: %, atual: %, tentando: %)',
      p_produto_id, v_saldo_anterior, p_quantidade;
  END IF;

  -- Atualiza estoque do produto
  UPDATE public.produtos SET estoque = v_saldo_posterior WHERE id = p_produto_id;

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

-- =============================================
-- 3. Reserva atômica FEFO para pedido confirmado
-- =============================================
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

  -- Para cada item do pedido COM produto (combo montado tem produto_id NULL:
  -- é montagem, não baixa de lote — sem este filtro a confirmação de QUALQUER
  -- combo abortava com "estoque insuficiente para produto (null)").
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

-- =============================================
-- 4. Liberação de reserva (cancelamento pedido)
-- =============================================
CREATE OR REPLACE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record;
BEGIN
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

    -- Registra liberação
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido'
    );
  END LOOP;
END;
$$;

-- =============================================
-- 5. Trigger: ao confirmar pedido (status -> em_producao), reserva estoque
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_reservar_estoque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    PERFORM public.reservar_estoque_pedido(NEW.id);
  ELSIF NEW.status = 'recebido' AND OLD.status = 'em_producao' THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  ELSIF NEW.status = 'cancelado' AND OLD.status IN ('recebido', 'em_producao') THEN
    PERFORM public.liberar_reserva_pedido(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reserva_estoque_pedido ON public.pedidos;
CREATE TRIGGER trigger_reserva_estoque_pedido
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reservar_estoque();

-- RLS
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "est_mov staff" ON public.estoque_movimentacoes;
CREATE POLICY "est_mov staff" ON public.estoque_movimentacoes FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'financeiro')
);

COMMENT ON TABLE public.estoque_movimentacoes IS 'Todas as movimentações de estoque (FEFO, reservas, liberações, ajustes). Nunca apagar.';