-- 0108 — criação/atribuição de rota em uma transação.
-- Reutiliza atribuir_pedido_motoboy (0084), mantendo status, identidade e limites.
-- A rota fica no estado operacional existente 'preparando'; o motoboy não precisa
-- aceitar a atribuição. Não executar antes de validar em PostgreSQL isolado.

CREATE OR REPLACE FUNCTION public.criar_rota_entrega_atomica(
  p_pedido_ids uuid[],
  p_motoboy_id uuid,
  p_exigir_conferencia boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
  v_unicos integer;
  v_encontrados integer;
  v_rotas_preexistentes integer;
  v_rotas_ativas integer;
  v_total_paradas integer;
  v_paradas_selecionadas integer;
  v_motoboy_encontrado integer;
  v_pedido_id uuid;
  v_resultado text;
  v_detalhe text;
  v_motivo text;
  v_sqlstate text;
  v_rota_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'producao')) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_motoboy_id IS NULL OR p_pedido_ids IS NULL OR cardinality(p_pedido_ids) NOT BETWEEN 1 AND 3
     OR array_position(p_pedido_ids, NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  SELECT count(*), count(DISTINCT pedido_id)
    INTO v_total, v_unicos FROM unnest(p_pedido_ids) AS x(pedido_id);
  IF v_total <> v_unicos THEN RETURN jsonb_build_object('status', 'pedido_duplicado'); END IF;

  -- Ordem fixa pedido (UUID crescente) -> motoboy -> rota, igual à RPC 0084.
  -- Trava todos os pedidos antes de processar qualquer atribuição do lote.
  PERFORM p.id FROM public.pedidos p
   WHERE p.id = ANY(p_pedido_ids) ORDER BY p.id FOR UPDATE;
  GET DIAGNOSTICS v_encontrados = ROW_COUNT;
  IF v_encontrados <> v_total THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;

  -- 0084 reutiliza uma rota 'preparando'. Para esta operação em lote, não
  -- aceitar esse reaproveitamento: o sucesso deve referir-se à rota criada
  -- nesta mesma chamada. Trava o motoboy antes da verificação para serializar
  -- outros lotes legítimos que usam a RPC 0084/0108.
  PERFORM m.id FROM public.motoboys m WHERE m.id = p_motoboy_id FOR UPDATE;
  GET DIAGNOSTICS v_motoboy_encontrado = ROW_COUNT;
  IF v_motoboy_encontrado <> 1 THEN
    RETURN jsonb_build_object('status', 'motoboy_inexistente');
  END IF;
  PERFORM r.id FROM public.rotas_entrega r
   WHERE r.motoboy_id = p_motoboy_id AND r.status IN ('preparando', 'em_rota')
   ORDER BY r.id FOR UPDATE;
  GET DIAGNOSTICS v_rotas_preexistentes = ROW_COUNT;
  IF v_rotas_preexistentes > 0 THEN
    RETURN jsonb_build_object('status', 'rota_preexistente');
  END IF;

  BEGIN
    FOR v_pedido_id IN
      SELECT x.pedido_id FROM unnest(p_pedido_ids) WITH ORDINALITY AS x(pedido_id, ordem)
       ORDER BY x.ordem
    LOOP
      SELECT resultado, detalhe INTO v_resultado, v_detalhe
        FROM public.atribuir_pedido_motoboy(
          v_pedido_id, p_motoboy_id, false, COALESCE(p_exigir_conferencia, false)
        );
      IF v_resultado IS DISTINCT FROM 'ok' THEN
        v_motivo := COALESCE(v_resultado, 'resposta_invalida');
        RAISE EXCEPTION 'lote_de_atribuicao_recusado' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    SELECT count(*) INTO v_rotas_ativas FROM public.rotas_entrega r
     WHERE r.motoboy_id = p_motoboy_id AND r.status IN ('preparando', 'em_rota');
    IF v_rotas_ativas <> 1 THEN
      v_motivo := 'rota_nao_unica';
      RAISE EXCEPTION 'rota_nao_unica' USING ERRCODE = 'P0001';
    END IF;
    SELECT r.id INTO v_rota_id FROM public.rotas_entrega r
     WHERE r.motoboy_id = p_motoboy_id AND r.status = 'preparando';
    IF v_rota_id IS NULL THEN
      v_motivo := 'rota_nao_confirmada';
      RAISE EXCEPTION 'rota_nao_confirmada' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*), count(*) FILTER (WHERE rp.pedido_id = ANY(p_pedido_ids))
      INTO v_total_paradas, v_paradas_selecionadas
      FROM public.rota_pedidos rp WHERE rp.rota_id = v_rota_id;
    IF v_total_paradas <> v_total OR v_paradas_selecionadas <> v_total THEN
      v_motivo := 'rota_incompleta_ou_com_paradas_extras';
      RAISE EXCEPTION 'rota_incompleta_ou_com_paradas_extras' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('status', 'criada', 'rota_id', v_rota_id,
      'motoboy_id', p_motoboy_id, 'pedidos', to_jsonb(p_pedido_ids), 'quantidade', v_total);
  EXCEPTION WHEN OTHERS THEN
    -- O bloco interno reverte todas as atribuições e a rota criadas pelo lote.
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    RETURN jsonb_build_object('status', 'falha_atomica',
      'motivo', COALESCE(v_motivo, 'erro_interno'), 'sqlstate', v_sqlstate,
      'detalhe', v_detalhe);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_rota_entrega_atomica(uuid[], uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_rota_entrega_atomica(uuid[], uuid, boolean) TO authenticated;
