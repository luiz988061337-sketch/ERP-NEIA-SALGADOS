-- 0114: operações persistidas do motoboy — lote 5: retorno e chegada à loja.
-- O motoboy informa o retorno e confirma a chegada da própria rota em andamento.
-- A chegada só é confirmada quando não restam pedidos pendentes na rota.
-- Local/homologação. Não aplicar em produção sem staging autorizado.
-- Idempotente (DROP/CREATE). Execução isolada em PostgreSQL 17 descartável.

-- =============================================
-- 1. RPC: informar_retorno_loja
-- =============================================
CREATE OR REPLACE FUNCTION public.informar_retorno_loja(p_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_rota_status text;
  v_rota_motoboy uuid;
  v_mstatus text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;
  SELECT m.id INTO v_motoboy_row_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;
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
  IF v_rota_status <> 'em_rota' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_estava_em_rota');
  END IF;
  -- Idempotencia: retorno já informado.
  SELECT m.status::text INTO v_mstatus FROM public.motoboys m WHERE m.id = v_motoboy_row_id;
  IF v_mstatus = 'retornando_base' THEN
    RETURN jsonb_build_object('status', 'ok', 'motivo', 'retorno_ja_informado', 'rota_id', p_rota_id);
  END IF;
  UPDATE public.motoboys
     SET status = 'retornando_base', ultima_atualizacao = now()
   WHERE id = v_motoboy_row_id;
  INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
  VALUES (
    v_motoboy_row_id, NULL, NULL, 'retorno_base',
    'Motoboy informou retorno à loja (rota ' || p_rota_id::text || ')'
  );
  RETURN jsonb_build_object('status', 'ok', 'motivo', 'retorno_informado', 'rota_id', p_rota_id);
END;
$$;

-- =============================================
-- 2. RPC: confirmar_chegada_loja
-- =============================================
CREATE OR REPLACE FUNCTION public.confirmar_chegada_loja(p_rota_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_rota_status text;
  v_chegou_em timestamptz;
  v_rota_motoboy uuid;
  v_pendentes integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;
  SELECT m.id INTO v_motoboy_row_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;
  SELECT r.status, r.chegou_em, r.motoboy_id INTO v_rota_status, v_chegou_em, v_rota_motoboy
    FROM public.rotas_entrega r
   WHERE r.id = p_rota_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'rota_nao_encontrada');
  END IF;
  IF v_rota_motoboy IS DISTINCT FROM v_motoboy_row_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'rota_de_outro_motoboy');
  END IF;
  -- Idempotencia: chegada já confirmada.
  IF v_rota_status = 'concluida' AND v_chegou_em IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ok', 'motivo', 'chegada_ja_confirmada',
      'rota_id', p_rota_id, 'chegou_em', v_chegou_em
    );
  END IF;
  IF v_rota_status <> 'em_rota' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_estava_em_rota');
  END IF;
  -- Chegada só com todos os pedidos da rota entregues ou cancelados.
  SELECT count(*) INTO v_pendentes
    FROM public.rota_pedidos rp
    JOIN public.pedidos p ON p.id = rp.pedido_id
   WHERE rp.rota_id = p_rota_id
     AND p.status NOT IN ('entregue', 'cancelado');
  IF v_pendentes > 0 THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'rota_com_pendentes');
  END IF;
  UPDATE public.rotas_entrega
     SET status = 'concluida', chegou_em = now()
   WHERE id = p_rota_id AND status = 'em_rota';
  UPDATE public.motoboys
     SET status = 'disponivel_base', ultima_atualizacao = now()
   WHERE id = v_motoboy_row_id;
  INSERT INTO public.motoboy_historico (motoboy_id, rota_id, pedido_id, evento, detalhe)
  VALUES (
    v_motoboy_row_id, NULL, NULL, 'retorno_base',
    'Chegada à loja confirmada; rota concluída (rota ' || p_rota_id::text || ')'
  );
  RETURN jsonb_build_object(
    'status', 'ok', 'motivo', 'chegada_confirmada',
    'rota_id', p_rota_id, 'chegou_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.informar_retorno_loja(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_chegada_loja(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.informar_retorno_loja(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_chegada_loja(uuid) TO authenticated;
COMMENT ON FUNCTION public.informar_retorno_loja(uuid) IS '0114: motoboy informa retorno à loja da própria rota em andamento. Idempotente.';
COMMENT ON FUNCTION public.confirmar_chegada_loja(uuid) IS '0114: motoboy confirma chegada à loja quando não restam pedidos pendentes. Rota concluída. Idempotente.';
