-- 0140 — edição segura de observações do pedido, com motivo e auditoria.
--
-- Escopo deliberadamente mínimo: apenas `pedidos.observacoes`. Itens, valores,
-- pagamento, entrega, prazos, identidade e status continuam protegidos pelas
-- migrations 0084/0085/0094/0106/0134. A integração comercial posterior não
-- é implementada aqui: o contrato em docs/estoques segue como especificação.
--
-- Reversão segura (somente com autorização e janela coordenada): revogar a RPC
-- e remover a política/table `pedido_edicoes_auditoria` preservando os registros
-- já gravados em documentação de auditoria. Não reaplicar 0135/0136.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.pedido_edicoes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  campo text NOT NULL CHECK (campo = 'observacoes'),
  valor_anterior text,
  valor_novo text,
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_edicoes_auditoria_pedido_idx
  ON public.pedido_edicoes_auditoria (pedido_id, created_at DESC);
ALTER TABLE public.pedido_edicoes_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido edicoes leitura staff" ON public.pedido_edicoes_auditoria;
CREATE POLICY "pedido edicoes leitura staff" ON public.pedido_edicoes_auditoria
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'financeiro')
  );

REVOKE ALL ON public.pedido_edicoes_auditoria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedido_edicoes_auditoria TO authenticated;
GRANT ALL ON public.pedido_edicoes_auditoria TO service_role;

CREATE OR REPLACE FUNCTION public.editar_observacoes_pedido(
  p_pedido_id uuid, p_observacoes text, p_motivo text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  ator uuid := auth.uid();
  v_anterior text;
  v_novo text;
BEGIN
  IF ator IS NULL OR NOT (
    public.has_role(ator, 'admin') OR public.has_role(ator, 'atendente')
  ) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_pedido_id IS NULL OR p_motivo IS NULL OR length(btrim(p_motivo)) < 3
     OR length(COALESCE(p_observacoes, '')) > 1000 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  SELECT observacoes INTO v_anterior FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;

  -- `pedidos.observacoes` é NOT NULL DEFAULT ''. Texto vazio é representado por ''.
  v_novo := CASE WHEN length(btrim(COALESCE(p_observacoes, ''))) = 0 THEN '' ELSE p_observacoes END;
  IF v_anterior IS NOT DISTINCT FROM v_novo THEN
    RETURN jsonb_build_object('status', 'sem_alteracao');
  END IF;

  UPDATE public.pedidos SET observacoes = v_novo WHERE id = p_pedido_id;
  INSERT INTO public.pedido_edicoes_auditoria
    (pedido_id, campo, valor_anterior, valor_novo, motivo, actor)
  VALUES (p_pedido_id, 'observacoes', v_anterior, v_novo, btrim(p_motivo), ator);

  RETURN jsonb_build_object('status', 'editado', 'observacoes', v_novo);
END;
$$;
REVOKE ALL ON FUNCTION public.editar_observacoes_pedido(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.editar_observacoes_pedido(uuid, text, text) TO authenticated;

COMMIT;
