-- ============================================================================
-- PASSO 5z - verificacao final (rode depois de 5a..5f)
-- RODE CADA ARQUIVO EM UM "New query" SEPARADO (um Run por arquivo).
-- ============================================================================


SELECT
  (SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role') AS "1_APP_ROLE",
  (SELECT coalesce(string_agg(x, ', '), 'TODAS OK') FROM unnest(ARRAY['crm_events', 'crm_recipients', 'admin_logs', 'despesas', 'estoque_mov', 'carrinho_eventos', 'notificacoes', 'orcamentos', 'pedido_notas', 'pedidos_recorrentes']) AS x
   WHERE to_regclass('public.' || x) IS NULL) AS "2_TABELAS_AINDA_FALTANDO",
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public') AS "3_TOTAL_TABELAS";
