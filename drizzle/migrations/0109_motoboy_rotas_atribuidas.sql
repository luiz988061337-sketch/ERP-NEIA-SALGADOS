-- M3-B: rotas atribuídas pela Central (0108). Ativar junto com o novo App.
-- O fluxo novo não permite que o motoboy descubra ou reivindique pedidos
-- sem rota. A Central é a única responsável pela atribuição.
DROP POLICY IF EXISTS "pedidos motoboy claim" ON public.pedidos;
DROP POLICY IF EXISTS "pedidos select" ON public.pedidos;
CREATE POLICY "pedidos select" ON public.pedidos FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR (public.has_role(auth.uid(), 'motoboy') AND motoboy_id = auth.uid())
);

DROP POLICY IF EXISTS "rotas staff" ON public.rotas_entrega;
CREATE POLICY "rotas staff" ON public.rotas_entrega FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
         OR public.has_role(auth.uid(), 'producao'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
              OR public.has_role(auth.uid(), 'producao'));

CREATE POLICY "rotas entrega motoboy dono" ON public.rotas_entrega FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'motoboy') AND EXISTS (
    SELECT 1 FROM public.motoboys m WHERE m.id = rotas_entrega.motoboy_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "rota pedidos motoboy dono" ON public.rota_pedidos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'motoboy') AND EXISTS (
    SELECT 1 FROM public.rotas_entrega r JOIN public.motoboys m ON m.id = r.motoboy_id
    WHERE r.id = rota_pedidos.rota_id AND m.user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = rota_pedidos.pedido_id AND p.motoboy_id = auth.uid()
  ));

CREATE FUNCTION public.motoboy_listar_rotas_atribuidas()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RAISE EXCEPTION 'rota_sem_autorizacao' USING ERRCODE = '42501';
  END IF;

  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motoboy_sem_cadastro' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'saiu_em', r.saiu_em,
      'pedidos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id, 'ordem', rp.ordem, 'numero', p.numero, 'status', p.status,
          'cliente_nome', p.cliente_nome, 'endereco', p.endereco,
          'bairro', p.bairro, 'complemento', p.complemento, 'observacoes', p.observacoes
        ) ORDER BY rp.ordem, p.id)
        FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
        WHERE rp.rota_id = r.id AND p.motoboy_id = v_uid
          AND p.tipo_entrega = 'entrega'
      ), '[]'::jsonb)
    ) ORDER BY r.created_at, r.id)
    FROM public.rotas_entrega r
    WHERE r.motoboy_id = v_motoboy_id AND r.status IN ('preparando', 'em_rota')
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.motoboy_listar_rotas_atribuidas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.motoboy_listar_rotas_atribuidas() TO authenticated;
