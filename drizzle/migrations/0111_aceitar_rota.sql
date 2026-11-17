-- 0111: operações persistidas do motoboy — lote 2: aceite de rota.
-- O motoboy apenas aceita uma rota JÁ atribuída pela Central (0108). Não há
-- auto-atribuição: rota e pedidos devem estar vinculados a este motoboy.
-- Local/homologação. Não aplicar em produção sem staging autorizado.
-- Idempotente (DROP/CREATE). Execução isolada em PostgreSQL 17 descartável.

-- =============================================
-- 1. RPC: aceitar_rota
-- =============================================
CREATE OR REPLACE FUNCTION public.aceitar_rota(p_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_rota_status text;
  v_rota_motoboy uuid;
  v_pendentes integer;
  v_aceitos integer;
  v_pedido_id uuid;
  v_pedidos uuid[];
BEGIN
  -- 1. Autenticacao e papel do chamador.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Ponte login -> cadastro do motoboy (motoboys.user_id = auth.users.id).
  SELECT m.id INTO v_motoboy_row_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- Mesma ordem da atribuição e do início: pedidos, motoboy, rota.
  SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) INTO v_pedidos
    FROM public.rota_pedidos rp JOIN public.rotas_entrega r ON r.id = rp.rota_id
   WHERE r.id = p_rota_id AND r.motoboy_id = v_motoboy_row_id;
  PERFORM p.id FROM public.pedidos p WHERE p.id = ANY(v_pedidos) ORDER BY p.id FOR UPDATE;
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;

  -- 3. Trava a rota: propriedade do motoboy e existencia.
  SELECT r.status, r.motoboy_id INTO v_rota_status, v_rota_motoboy
    FROM public.rotas_entrega r
   WHERE r.id = p_rota_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'rota_nao_encontrada');
  END IF;
  IF v_rota_motoboy IS DISTINCT FROM v_motoboy_row_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'rota_de_outro_motoboy');
  END IF;

  -- 4. Transicao: so e possivel aceitar rota em preparacao.
  IF v_rota_status <> 'preparando' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_esta_preparando');
  END IF;
  IF v_pedidos IS NULL OR v_pedidos IS DISTINCT FROM (
    SELECT array_agg(rp.pedido_id ORDER BY rp.pedido_id) FROM public.rota_pedidos rp WHERE rp.rota_id = p_rota_id
  ) OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = ANY(v_pedidos)
      AND (p.motoboy_id IS DISTINCT FROM v_uid OR p.status <> 'aguardando_motoboy')) THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'pedidos_da_rota_invalidos');
  END IF;

  -- 5. Idempotencia: todos os pedidos da rota ja aceitos por este motoboy.
  SELECT count(*) INTO v_pendentes
    FROM public.rota_pedidos rp
    JOIN public.pedidos p ON p.id = rp.pedido_id
   WHERE rp.rota_id = p_rota_id
     AND p.aceito_motoboy_em IS NULL
     AND p.motoboy_id = v_uid
     AND p.status = 'aguardando_motoboy';
  IF v_pendentes = 0 THEN
    RETURN jsonb_build_object(
      'status', 'ok',
      'motivo', 'rota_ja_aceita',
      'rota_id', p_rota_id,
      'motoboy_id', v_uid
    );
  END IF;

  -- 6. Registra o aceite do motoboy nos pedidos ainda pendentes (mesma transacao).
  UPDATE public.pedidos
     SET aceito_motoboy_em = now(),
         aceito_motoboy_por = v_uid
   WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = p_rota_id)
     AND aceito_motoboy_em IS NULL
     AND motoboy_id = v_uid
     AND status = 'aguardando_motoboy';
  GET DIAGNOSTICS v_aceitos = ROW_COUNT;

  -- 7. Eventos de histórico de aceite (mesma transacao, rollback automático).
  FOR v_pedido_id IN
    SELECT rp.pedido_id FROM public.rota_pedidos rp
    WHERE rp.rota_id = p_rota_id
  LOOP
    INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
    VALUES (
      v_motoboy_row_id,
      NULL,
      v_pedido_id,
      'inicio_preparacao_saida',
      'Motoboy aceitou a rota para entrega do pedido #' || (SELECT numero FROM public.pedidos WHERE id = v_pedido_id) || ' (rota ' || p_rota_id::text || ')'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'motivo', 'rota_aceita',
    'rota_id', p_rota_id,
    'motoboy_id', v_uid,
    'pedidos_aceitos', v_aceitos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aceitar_rota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceitar_rota(uuid) TO authenticated;
COMMENT ON FUNCTION public.aceitar_rota(uuid) IS '0111: motoboy aceita rota atribuída pela Central. Registra aceito_motoboy_em nos pedidos. Transação única, idempotente.';
