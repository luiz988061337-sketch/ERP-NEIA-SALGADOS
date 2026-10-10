-- verify-0065.sql — view parceiros_publicos ('aprovado' → 'aprovada').
-- Somente leitura. Rode PRE antes de aplicar 0065; POST depois.

-- PRE: view com filtro antigo não retorna linhas (bug documentado) e o
-- CHECK só aceita 'aprovada'.
SELECT definition AS definicao_atual
FROM pg_views
WHERE viewname = 'parceiros_publicos';

SELECT conname, pg_get_constraintdef(oid) AS definicao_check
FROM pg_constraint
WHERE conname LIKE '%parceiro%';

-- (aplicar drizzle/migrations/0065_parceiros_publicos_view_fix.sql)

-- POST: definição contém 'aprovada' (e não 'aprovado' como filtro).
SELECT definition AS definicao_nova
FROM pg_views
WHERE viewname = 'parceiros_publicos';

-- POST: leitura pública mantida (anon + authenticated).
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'parceiros_publicos'
ORDER BY 1, 2;

-- Critério: POST com 'aprovada' na definição + 2 linhas de GRANT
-- (anon/SELECT, authenticated/SELECT). Divergência = interromper.
