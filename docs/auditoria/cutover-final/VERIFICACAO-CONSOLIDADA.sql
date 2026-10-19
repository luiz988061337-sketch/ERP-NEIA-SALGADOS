-- ============================================================================
-- VERIFICAÇÃO CONSOLIDADA DO ESTADO DO CORTE (read-only, 1 linha)
-- ============================================================================
-- Cole depois de: migrations + 03_CONFIGURACAO + 08_LOCKDOWN + 04_CONTROLADO
-- e ANTES de publicar o bundle. Nao escreve nada.
--
-- Esperado: go = 'PRONTO_PUBLICAO'
-- ============================================================================

SELECT
  -- 1) nenhum pedido criado na janela (bundle antigo nao operou)
  (SELECT count(*) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours')                     AS pedidos_na_janela,
  -- 2) reservas ativas sem proveniencia = as 19 legadas, em quarentena
  (SELECT count(*) FROM public.reservas_estoque r
    WHERE r.status = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia pr WHERE pr.reserva_id = r.id))
                                                                      AS ativas_sem_proveniencia,
  (SELECT COALESCE(sum(r.quantidade),0) FROM public.reservas_estoque r
    WHERE r.status = 'ativa'
      AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia pr WHERE pr.reserva_id = r.id))
                                                                      AS unidades_em_quarentena,
  -- 3) nada criado no regime novo ainda
  (SELECT count(*) FROM public.reserva_proveniencia)                  AS marcadores,
  (SELECT count(*) FROM public.reserva_consumos)                     AS consumos,
  (SELECT count(*) FROM public.pedido_item_componentes)               AS componentes,
  -- 4) regime ativado
  (SELECT controlado FROM public.reserva_proveniencia_config WHERE id = true)
                                                                      AS controlado,
  -- 5) caminho legado fechado para 'authenticated'
  (SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))   AS legadas_executaveis,
  (SELECT count(*) FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes')
      AND grantee = 'authenticated'
      AND privilege_type IN ('INSERT','UPDATE','DELETE'))             AS dml_legado_sobre_reserva,
  -- 6) objetos obrigatorios
  (SELECT count(*) FROM (VALUES
      (to_regclass('public.reserva_consumos')::text),
      (to_regclass('public.reserva_proveniencia')::text),
      (to_regclass('public.reserva_proveniencia_config')::text),
      (to_regclass('public.pedido_item_componentes')::text),
      (to_regprocedure('public.reservar_pedido_atomico(uuid)')::text),
      (to_regprocedure('public.liberar_pedido_atomico(uuid)')::text),
      (to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)')::text),
      (to_regprocedure('public.cancelar_pedido_atomico(uuid,text)')::text),
      (to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)')::text),
      (to_regprocedure('public.pedido_cobertura_reserva(uuid)')::text)
   ) AS v(obj) WHERE v.obj IS NOT NULL)                             AS objetos_ok,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='categorias'
      AND column_name='combo_preco_unit')                           AS coluna_combo_ok,
  (SELECT count(*) FROM public.categorias c
    WHERE c.ativo AND c.combo_preco_unit IS NULL
      AND EXISTS (SELECT 1 FROM public.produtos p
                   WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50'))
                                                                      AS combos_sem_preco,
  -- VEREDITO
  CASE
    WHEN (SELECT count(*) FROM public.pedidos
           WHERE created_at > now() - interval '6 hours') > 0
      THEN 'NO-GO: houve pedido na janela (bundle antigo operou) — reconciliar antes'
    WHEN (SELECT controlado FROM public.reserva_proveniencia_config WHERE id = true) IS DISTINCT FROM true
      THEN 'NO-GO: controlado nao esta true'
    WHEN (SELECT count(*) FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) > 0
      THEN 'NO-GO: caminho legado ainda executavel por authenticated'
    WHEN (SELECT count(*) FROM information_schema.table_privileges
            WHERE table_schema='public'
              AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes')
              AND grantee='authenticated'
              AND privilege_type IN ('INSERT','UPDATE','DELETE')) > 0
      THEN 'NO-GO: ainda ha DML de reserva para authenticated'
    WHEN (SELECT count(*) FROM (VALUES
              (to_regclass('public.reserva_consumos')::text),
              (to_regclass('public.reserva_proveniencia')::text),
              (to_regclass('public.reserva_proveniencia_config')::text),
              (to_regclass('public.pedido_item_componentes')::text),
              (to_regprocedure('public.reservar_pedido_atomico(uuid)')::text),
              (to_regprocedure('public.liberar_pedido_atomico(uuid)')::text),
              (to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)')::text),
              (to_regprocedure('public.cancelar_pedido_atomico(uuid,text)')::text),
              (to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)')::text),
              (to_regprocedure('public.pedido_cobertura_reserva(uuid)')::text)
           ) AS v(obj) WHERE v.obj IS NOT NULL) < 10
      THEN 'NO-GO: objeto obrigatorio ausente'
    WHEN (SELECT count(*) FROM public.categorias c
            WHERE c.ativo AND c.combo_preco_unit IS NULL
              AND EXISTS (SELECT 1 FROM public.produtos p
                           WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50')) > 0
      THEN 'NO-GO: categoria de combo ativa sem preco'
    WHEN (SELECT count(*) FROM public.reservas_estoque r
            WHERE r.status = 'ativa'
              AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia pr WHERE pr.reserva_id = r.id)) = 0
      THEN 'NO-GO: nenhuma reserva em quarentena — as 19 historicas sumiram? conferir'
    ELSE 'PRONTO_PUBLICAO'
  END AS go;
