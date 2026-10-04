-- ============================================================================
-- PASSO 3 (corrigido) - DIAGNOSTICO COMPACTO
-- 5 queries. Cada uma devolve UM valor so. Copie os 5 valores e me envie.
-- ============================================================================

-- 1) TODAS as tabelas de public, em uma celula so:
SELECT string_agg(tablename, ', ' ORDER BY tablename) AS "1_TABELAS"
FROM pg_tables WHERE schemaname = 'public';

-- 2) TODAS as funcoes de public, em uma celula so:
SELECT string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ', ' ORDER BY proname) AS "2_FUNCOES"
FROM pg_proc WHERE pronamespace = 'public'::regnamespace;

-- 3) Enums de public e seus valores:
SELECT string_agg(typname || '{' || vals || '}', ', ' ORDER BY typname) AS "3_ENUMS"
FROM (
  SELECT t.typname AS typname,
         string_agg(e.enumlabel, '/' ORDER BY e.enumsortorder) AS vals
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typnamespace = 'public'::regnamespace
  GROUP BY t.typname
) s;

-- 4) Colunas de 'pedidos' (o nome exato da tabela e das colunas):
SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS "4_COLUNAS_PEDIDOS"
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pedidos';

-- 5) Qualquer tabela com 'role' no nome, e suas colunas:
SELECT coalesce(string_agg(c.relname || '{' || (
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid, NULL), ', ' ORDER BY a.attnum)
  FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
) || '}', '  ||  '), 'NENHUMA') AS "5_TABELAS_DE_ROLE"
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname ILIKE '%role%';