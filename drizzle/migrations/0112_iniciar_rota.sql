-- 0112: operações persistidas do motoboy — lote 3: início da rota.
-- O motoboy só inicia a própria rota em preparo. Não há alteração de pedidos
-- de outros motoboys. Os triggers legados (0047) continuam disparando sobre
-- troca de status dos pedidos (historico e motoboys.status).
-- Local/homologação. Não aplicar em produção sem staging autorizado.
-- Idempotente (DROP/CREATE). Execução isolada em PostgreSQL 17 descartável.

-- =============================================
-- 1. RPC: iniciar_rota
-- =============================================
CREATE OR REPLACE FUNCTION public.iniciar_rota(p_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_rota_status text;
  v_saiu_em timestamptz;
  v_rota_motoboy uuid;
  v_iniciados integer;
  v_total integer;
  v_nao_retirados integer;
  v_pedidos uuid[];
  v_pedidos_atuais uuid[];
BEGIN
  -- 1. Autenticacao e papel do chamador.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Ponte login -> cadastro do motoboy.
  SELECT m.id INTO v_motoboy_row_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- Mesma ordem da atribuição: pedidos, motoboy, rota. Confira os vínculos
  -- novamente com a rota já travada.
  SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos
    FROM public.rota_pedidos rp WHERE rp.rota_id = p_rota_id;
  PERFORM p.id FROM public.pedidos p
   WHERE p.id = ANY(v_pedidos)
     AND EXISTS (SELECT 1 FROM public.rotas_entrega r WHERE r.id = p_rota_id
       AND r.motoboy_id = v_motoboy_row_id)
   ORDER BY p.id FOR UPDATE;
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;

  -- 3. Trava a rota: existencia e propriedade.
  SELECT r.status, r.saiu_em, r.motoboy_id INTO v_rota_status, v_saiu_em, v_rota_motoboy
    FROM public.rotas_entrega r
   WHERE r.id = p_rota_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'rota_nao_encontrada');
  END IF;
  IF v_rota_motoboy IS DISTINCT FROM v_motoboy_row_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'rota_de_outro_motoboy');
  END IF;

  -- 4. Idempotencia: rota ja iniciada com horario de saida.
  IF v_rota_status = 'em_rota' AND v_saiu_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ok', 'motivo', 'rota_ja_iniciada',
      'rota_id', p_rota_id, 'saiu_em', v_saiu_em
    );
  END IF;

  -- 5. Transicao: somente rotas preparando podem ser iniciadas.
  IF v_rota_status <> 'preparando' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_esta_preparando');
  END IF;

  SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos_atuais
    FROM public.rota_pedidos rp WHERE rp.rota_id = p_rota_id;
  IF v_pedidos_atuais IS DISTINCT FROM v_pedidos THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'vinculos_da_rota_alterados');
  END IF;
  IF v_pedidos IS NULL THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_sem_pedidos');
  END IF;
  v_total := cardinality(v_pedidos);
  SELECT count(*) INTO v_nao_retirados
    FROM public.pedidos p WHERE p.id = ANY(v_pedidos)
      AND (p.tipo_entrega IS DISTINCT FROM 'entrega'
        OR p.motoboy_id IS DISTINCT FROM v_uid
        OR p.retirada_em IS NULL
        OR p.retirada_por IS DISTINCT FROM v_uid
        OR p.retirada_rota_id IS DISTINCT FROM p_rota_id
        OR p.status IS DISTINCT FROM 'aguardando_motoboy');
  IF v_nao_retirados > 0 THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'retirada_de_todos_os_pedidos_obrigatoria',
      'total_pedidos', v_total, 'pendentes_retirada', v_nao_retirados);
  END IF;

  -- 6. Inicia a rota: em_rota + saiu_em, condicional (rollback automatico em falha).
  UPDATE public.rotas_entrega
     SET status = 'em_rota',
         saiu_em = now()
   WHERE id = p_rota_id
     AND status = 'preparando'
     AND saiu_em IS NULL;
  GET DIAGNOSTICS v_iniciados = ROW_COUNT;
  IF v_iniciados <> 1 THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'condicao_de_corrida');
  END IF;

  -- 7. Pedidos da rota deste motoboy saem para entrega (aguardando_motoboy -> em_rota).
  --    A matriz de transicoes (0041) e os triggers (0047) sao respeitados;
  --    pedidos ja em_rota ou de outro motoboy nao sao tocados.
  UPDATE public.pedidos
     SET status = 'em_rota'
   WHERE id = ANY(v_pedidos)
     AND motoboy_id = v_uid
     AND status = 'aguardando_motoboy';
  GET DIAGNOSTICS v_iniciados = ROW_COUNT;
  IF v_iniciados <> v_total THEN
    RAISE EXCEPTION 'A quantidade de pedidos não corresponde à rota; operação revertida';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok', 'motivo', 'rota_iniciada',
    'rota_id', p_rota_id, 'saiu_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_rota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_rota(uuid) TO authenticated;
COMMENT ON FUNCTION public.iniciar_rota(uuid) IS '0112: motoboy inicia a própria rota (preparando -> em_rota) com horario de saida. Idempotente.';
