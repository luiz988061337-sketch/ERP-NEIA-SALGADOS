-- 0113: operações persistidas do motoboy — lote 4: confirmação de entrega individual.
-- O motoboy confirma a entrega de UM pedido da rota. Nunca conclui os demais
-- pedidos automaticamente. Os triggers legados (0041 matriz, 0047 historico
-- e motoboys.status) continuam disparando sobre a troca de status.
-- Local/homologação. Não aplicar em produção sem staging autorizado.
-- Idempotente (DROP/CREATE). Execução isolada em PostgreSQL 17 descartável.

-- =============================================
-- 1. RPC: confirmar_entrega
-- =============================================
CREATE OR REPLACE FUNCTION public.confirmar_entrega(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_motoboy_row_id uuid;
  v_status public.order_status;
  v_tipo text;
  v_dono uuid;
  v_entregue_em timestamptz;
  v_rota_id uuid;
  v_retirada_rota uuid;
  v_retirada_por uuid;
  v_retirada_em timestamptz;
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

  -- 3. Trava o pedido: existencia, propriedade e estado atual.
  SELECT p.status, p.tipo_entrega, p.motoboy_id, p.entregue_em, p.retirada_rota_id, p.retirada_por, p.retirada_em
    INTO v_status, v_tipo, v_dono, v_entregue_em, v_retirada_rota, v_retirada_por, v_retirada_em
    FROM public.pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'pedido_nao_encontrado');
  END IF;

  -- 4. Tipo de entrega: confirmacao de entrega so para entregas.
  IF v_tipo <> 'entrega' THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'entrega_apenas_entrega');
  END IF;

  -- 5. Propriedade: o pedido deve estar atribuído a este motoboy.
  IF v_dono IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'pedido_de_outro_motoboy');
  END IF;

  -- 6. Idempotencia: entrega já confirmada.
  IF v_status = 'entregue' THEN
    RETURN jsonb_build_object(
      'status', 'ok', 'motivo', 'entrega_ja_confirmada',
      'pedido_id', p_pedido_id, 'entregue_em', v_entregue_em
    );
  END IF;

  -- 7. Transicao valida: em_rota -> entregue (matriz 0041 também valida via trigger).
  IF v_status <> 'em_rota' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'pedido_nao_em_rota');
  END IF;

  -- 8. O pedido deve estar em rota ativa deste motoboy (vinculo via rota_pedidos).
  PERFORM m.id FROM public.motoboys m WHERE m.id = v_motoboy_row_id FOR UPDATE;
  SELECT r.id INTO v_rota_id
    FROM public.rota_pedidos rp
    JOIN public.rotas_entrega r ON r.id = rp.rota_id
   WHERE rp.pedido_id = p_pedido_id
     AND r.motoboy_id = v_motoboy_row_id
     AND r.status = 'em_rota'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'pedido_sem_rota_ativa');
  END IF;
  IF v_retirada_rota IS DISTINCT FROM v_rota_id OR v_retirada_por IS DISTINCT FROM v_uid OR v_retirada_em IS NULL THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'retirada_do_pedido_obrigatoria');
  END IF;

  -- 9. Confirma entrega na mesma transação.
  UPDATE public.pedidos
     SET status = 'entregue',
         entregue_em = now()
   WHERE id = p_pedido_id
     AND status = 'em_rota'
     AND motoboy_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'condicao_de_corrida');
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok', 'motivo', 'entrega_confirmada',
    'pedido_id', p_pedido_id, 'rota_id', v_rota_id, 'entregue_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_entrega(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_entrega(uuid) TO authenticated;
COMMENT ON FUNCTION public.confirmar_entrega(uuid) IS '0113: motoboy confirma entrega individual de pedido da própria rota. Não conclui outros pedidos. Idempotente.';
