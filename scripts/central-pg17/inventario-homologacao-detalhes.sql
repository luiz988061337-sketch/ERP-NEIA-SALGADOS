-- SOMENTE LEITURA. Confirmação fina do estado de 0134/0135/0136 em homologação.
SELECT jsonb_pretty(jsonb_build_object(
  'versoes_apos_0134', (
    SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations
    WHERE version >= '20261127172951'
  ),
  'pode_receber_trecho', (
    SELECT substr(p.prosrc, greatest(position('pode_receber' IN p.prosrc) - 12, 1), 170)
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.consultar_recebimento_retirada(uuid)')
  ),
  'politicas_realtime_central', (
    SELECT coalesce(jsonb_agg(p.policyname ORDER BY p.policyname), '[]'::jsonb)
    FROM pg_policies p
    WHERE p.schemaname = 'realtime' AND p.tablename = 'messages'
      AND p.policyname LIKE 'central_atendente%'
  ),
  'guarda_corpo_inicial', (
    SELECT substr(p.prosrc, 1, 120)
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
  ),
  'gatilho_quitacao', (
    SELECT coalesce(jsonb_agg(t.tgname), '[]'::jsonb)
    FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.pedidos')
      AND t.tgname = 'exigir_quitacao_para_retirada' AND NOT t.tgisinternal
  )
)) AS detalhes;
