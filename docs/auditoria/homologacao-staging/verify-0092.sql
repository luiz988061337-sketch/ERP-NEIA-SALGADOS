-- verify-0092.sql — verificação ESTÁTICA (somente leitura) da 0092.
-- Rode PRE (antes de aplicar) e POST (depois). Consulta apenas catálogos.
-- NÃO acessa pedidos de clientes; NÃO exibe dados pessoais.

-- ---------------------------------------------------------------------------
-- (1) PRE: as tabelas ainda NÃO existem (esperado: 0 linhas / NULL).
-- ---------------------------------------------------------------------------
SELECT to_regclass('public.reserva_proveniencia')        AS marcador,
       to_regclass('public.reserva_proveniencia_config') AS config;

-- ---------------------------------------------------------------------------
-- (2) POST: tabelas existem e têm RLS habilitada (esperado relrowsecurity=true).
-- ---------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_proveniencia', 'reserva_proveniencia_config');

-- ---------------------------------------------------------------------------
-- (3) POST: colunas do marcador.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reserva_proveniencia'
ORDER BY ordinal_position;

-- ---------------------------------------------------------------------------
-- (4) POST: constraints do marcador (PK, UNIQUE(mov), CHECK, FK composta).
-- ---------------------------------------------------------------------------
SELECT conname, contype, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.reserva_proveniencia'::regclass
ORDER BY contype, conname;

-- (5) POST: a base da FK composta existe em reservas_estoque (UNIQUE).
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.reservas_estoque'::regclass
  AND conname = 'reservas_estoque_prov_uk';

-- ---------------------------------------------------------------------------
-- (6) POST: privilégios. Esperado: anon/authenticated SEM INSERT/UPDATE/DELETE;
--     authenticated apenas SELECT (RLS filtra). NENHUM grant de escrita.
-- ---------------------------------------------------------------------------
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('reserva_proveniencia', 'reserva_proveniencia_config')
ORDER BY table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- (7) POST: config singleton com controlado = FALSE (esperado 1 linha, false).
-- ---------------------------------------------------------------------------
SELECT id, controlado, ativado_em, ativado_por
FROM public.reserva_proveniencia_config;

-- ---------------------------------------------------------------------------
-- (8) POST: SEM gatilhos de backfill nas tabelas (esperado 0 linhas).
-- ---------------------------------------------------------------------------
SELECT tgname, pg_get_triggerdef(oid) AS definicao
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid IN ('public.reserva_proveniencia'::regclass,
                  'public.reserva_proveniencia_config'::regclass,
                  'public.reservas_estoque'::regclass);

-- ---------------------------------------------------------------------------
-- (9) POST: NENHUM marcador para reservas EXISTENTES (esperado 0 linhas).
--     Garante ausência de marcação retroativa automática.
-- ---------------------------------------------------------------------------
SELECT r.id AS reserva_id, r.status, r.pedido_id
FROM public.reservas_estoque r
JOIN public.reserva_proveniencia rp ON rp.reserva_id = r.id
WHERE r.created_at < now();   -- nada criado por esta migration

-- (10) POST (informativo): privilégio de CREATE no schema public.
--      Esperado: PUBLIC e authenticated SEM CREATE (endurecimento; se houver,
--      registrar como risco a tratar).
SELECT nspname, nspacl
FROM pg_namespace WHERE nspname = 'public';

-- Critério de aceite estático: (1) ausente no PRE; (2) RLS on; (3) colunas/
-- tipos conforme; (4) PK + UNIQUE(mov) + CHECK + FK composta presentes; (5) base
-- UNIQUE em reservas_estoque; (6) sem escrita para anon/authenticated; (7)
-- controlado=false; (8) 0 gatilhos de backfill; (9) 0 marcadores retroativos.
-- Testes transacionais: ver test-0092-proveniencia.sql (SOMENTE ambiente isolado).
