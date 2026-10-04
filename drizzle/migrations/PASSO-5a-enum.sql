-- ============================================================================
-- PASSO 5a - completa o enum app_role (atendente, financeiro)
-- RODE CADA ARQUIVO EM UM "New query" SEPARADO (um Run por arquivo).
-- ============================================================================


-- Se rodar tudo junto com outra migration, o ALTER TYPE falha.
DO $add$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'atendente') THEN
    ALTER TYPE public.app_role ADD VALUE 'atendente';
    RAISE NOTICE 'papel atendente adicionado';
  ELSE
    RAISE NOTICE 'atendente ja existia';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'financeiro') THEN
    ALTER TYPE public.app_role ADD VALUE 'financeiro';
    RAISE NOTICE 'papel financeiro adicionado';
  ELSE
    RAISE NOTICE 'financeiro ja existia';
  END IF;
END
$add$;

SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) AS app_role
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role';
