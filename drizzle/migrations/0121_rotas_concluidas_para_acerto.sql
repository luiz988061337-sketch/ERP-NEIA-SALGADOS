-- Rotas concluídas que ainda precisam de solicitação aparecem no App sem dados do cliente.
CREATE OR REPLACE FUNCTION public.motoboy_listar_rotas_atribuidas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'motoboy') THEN
    RAISE EXCEPTION 'rota_sem_autorizacao' USING ERRCODE = '42501';
  END IF;
  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'motoboy_sem_cadastro' USING ERRCODE = '42501'; END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'status',r.status,'saiu_em',r.saiu_em,
      'pedidos', CASE WHEN r.status = 'concluida' THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',p.id,'ordem',rp.ordem,'numero',p.numero,'status',p.status,
          'cliente_nome',p.cliente_nome,'endereco',p.endereco,'bairro',p.bairro,
          'complemento',p.complemento,'observacoes',p.observacoes
        ) ORDER BY rp.ordem,p.id)
        FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
        WHERE rp.rota_id = r.id AND p.motoboy_id = v_uid AND p.tipo_entrega = 'entrega'
      ),'[]'::jsonb) END
    ) ORDER BY r.created_at,r.id)
    FROM public.rotas_entrega r
    WHERE r.motoboy_id = v_motoboy_id
      AND (r.status IN ('preparando','em_rota') OR (r.status = 'concluida' AND NOT EXISTS (
        SELECT 1 FROM public.acertos_rota a WHERE a.rota_id = r.id AND a.status <> 'rejeitado'
      )))
  ),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.motoboy_listar_rotas_atribuidas() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.motoboy_listar_rotas_atribuidas() TO authenticated;
