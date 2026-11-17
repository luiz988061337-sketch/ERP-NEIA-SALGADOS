-- 0107 — baixa manual de estoque atômica e idempotente.
-- Não substitui reserva FEFO, reserva de pedido ou consumo físico (0089/0091).
-- Incremental; executar somente após revisão e homologação em banco isolado.

CREATE TABLE IF NOT EXISTS public.estoque_mov_operacoes (
  chave_idempotencia uuid PRIMARY KEY,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida', 'ajuste', 'perda', 'producao')),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  motivo text NOT NULL DEFAULT '',
  movimento_id uuid NOT NULL REFERENCES public.estoque_mov(id) ON DELETE RESTRICT,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_mov_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estoque operacoes leitura staff" ON public.estoque_mov_operacoes;
CREATE POLICY "estoque operacoes leitura staff" ON public.estoque_mov_operacoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao'));
REVOKE ALL ON public.estoque_mov_operacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.estoque_mov_operacoes TO authenticated;
GRANT ALL ON public.estoque_mov_operacoes TO service_role;

CREATE OR REPLACE FUNCTION public.movimentar_estoque_manual_atomico(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text,
  p_chave_idempotencia uuid,
  p_estoque_esperado integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_existente public.estoque_mov_operacoes%ROWTYPE;
  v_estoque integer;
  v_delta integer;
  v_tipo_ledger public.tipo_mov_estoque;
  v_mov_id uuid;
  v_motivo text := left(btrim(COALESCE(p_motivo, '')), 200);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao')) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_produto_id IS NULL OR p_chave_idempotencia IS NULL
     OR p_tipo IS NULL OR p_tipo NOT IN ('entrada', 'saida', 'ajuste', 'perda', 'producao')
     OR p_quantidade IS NULL OR p_quantidade <= 0
     OR (p_estoque_esperado IS NOT NULL AND p_estoque_esperado < 0) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia::text, 0));
  SELECT * INTO v_existente FROM public.estoque_mov_operacoes
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.produto_id <> p_produto_id OR v_existente.tipo <> p_tipo
       OR v_existente.quantidade <> p_quantidade OR v_existente.motivo <> v_motivo THEN
      RETURN jsonb_build_object('status', 'chave_conflitante');
    END IF;
    SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id;
    RETURN jsonb_build_object('status', 'ja_registrado', 'movimento_id', v_existente.movimento_id,
      'estoque_atual', v_estoque);
  END IF;

  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'produto_inexistente'); END IF;
  IF v_estoque IS NULL OR v_estoque < 0 THEN
    RETURN jsonb_build_object('status', 'estoque_inconsistente');
  END IF;
  IF p_estoque_esperado IS NOT NULL AND v_estoque <> p_estoque_esperado THEN
    RETURN jsonb_build_object('status', 'conflito_saldo', 'estoque_atual', v_estoque);
  END IF;
  IF p_tipo IN ('entrada', 'ajuste', 'producao') THEN
    v_delta := p_quantidade;
    v_tipo_ledger := CASE
      WHEN p_tipo = 'producao' THEN 'entrada_producao'::public.tipo_mov_estoque
      WHEN p_tipo = 'ajuste' THEN 'ajuste'::public.tipo_mov_estoque
      ELSE 'entrada_manual'::public.tipo_mov_estoque END;
  ELSE
    v_delta := -p_quantidade;
    v_tipo_ledger := CASE WHEN p_tipo = 'perda' THEN 'perda'::public.tipo_mov_estoque
      ELSE 'ajuste'::public.tipo_mov_estoque END;
  END IF;
  IF v_estoque + v_delta < 0 THEN
    RETURN jsonb_build_object('status', 'estoque_insuficiente', 'estoque_atual', v_estoque);
  END IF;
  IF v_estoque + v_delta > 2147483647 THEN
    RETURN jsonb_build_object('status', 'limite_excedido', 'estoque_atual', v_estoque);
  END IF;

  -- O helper existente trava produtos, atualiza o saldo e escreve o ledger 0042.
  -- As três gravações abaixo participam da mesma transação do RPC.
  PERFORM public.registrar_mov_estoque(
    p_produto_id, v_tipo_ledger, v_delta, NULL::uuid, NULL::uuid,
    'manual'::text, auth.uid(), v_motivo, true
  );
  INSERT INTO public.estoque_mov (produto_id, tipo, quantidade, motivo, created_by)
  VALUES (p_produto_id, p_tipo, p_quantidade, v_motivo, auth.uid())
  RETURNING id INTO v_mov_id;
  INSERT INTO public.estoque_mov_operacoes (
    chave_idempotencia, produto_id, tipo, quantidade, motivo, movimento_id, actor
  ) VALUES (p_chave_idempotencia, p_produto_id, p_tipo, p_quantidade, v_motivo, v_mov_id, auth.uid());
  SELECT estoque INTO v_estoque FROM public.produtos WHERE id = p_produto_id;
  RETURN jsonb_build_object('status', 'registrado', 'movimento_id', v_mov_id,
    'estoque_anterior', v_estoque - v_delta, 'estoque_atual', v_estoque);
END;
$$;

REVOKE ALL ON FUNCTION public.movimentar_estoque_manual_atomico(uuid, text, integer, text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimentar_estoque_manual_atomico(uuid, text, integer, text, uuid, integer)
  TO authenticated;
