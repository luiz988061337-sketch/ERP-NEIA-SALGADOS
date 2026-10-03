-- ============================================================================
-- PASSO 1 - diagnostico + recria public.has_role com seguranca
-- Rode no SQL Editor do projeto iqirsunzgavsuhgyjjsi. Pode rodar varias vezes.
-- Este arquivo NAO mexe em nenhuma tabela: so le e (se possivel) cria a funcao.
-- ============================================================================

-- 1) Recria has_role SOMENTE se o enum app_role e a tabela user_roles existirem.
--    Se nao existirem, o bloco nao faz nada e nao dá erro.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace)
     AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'user_roles' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
        SELECT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role = _role
        )
      $fn$;
    $sql$;
    RAISE NOTICE 'has_role recriada.';
  ELSE
    RAISE NOTICE 'app_role ou user_roles nao existem -> has_role NAO foi criada. Veja o diagnostico abaixo.';
  END IF;
END
$do$;


-- 2) DIAGNOSTICO - leia os resultados e me envie
--Quem sou eu no SQL Editor:
SELECT current_user AS usuario, current_database() AS banco;

-- Que tabelas existem em public (a lista toda):
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Existe o enum app_role? Quais valores?
SELECT t.typname AS enum, e.enumlabel AS valor
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'app_role' ORDER BY e.enumsortorder;

-- Quais funcoes existem em public? (procure has_role)
SELECT proname AS funcao,
       pg_get_function_identity_arguments(oid) AS argumentos
FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;

-- Tabelas-chave do app existem?
SELECT
  to_regclass('public.pedidos')      AS pedidos,
  to_regclass('public.user_roles')   AS user_roles,
  to_regclass('public.produtos')     AS produtos,
  to_regclass('public.profiles')     AS profiles;

-- has_role existe agora? (deve aparecer has_role | _user_id uuid, _role app_role)
SELECT to_regprocedure('public.has_role(uuid,public.app_role)') AS has_role_criada;