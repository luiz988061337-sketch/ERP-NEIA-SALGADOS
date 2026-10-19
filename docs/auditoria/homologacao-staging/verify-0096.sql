-- verify-0096.sql: RLS/GRANT de parceiros apos o reparo.
-- Somente leitura. Falha com excecao se o estado esperado nao existir.

BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  v_count integer;
BEGIN
  -- As policies permissivas da 0028 nao podem existir.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='parceiros'
    AND policyname IN ('parceiros read','parceiros write');
  IF v_count <> 0 THEN
    RAISE EXCEPTION '0096: policies permissivas de parceiros ainda existem (%)', v_count;
  END IF;

  -- As tres policies do reparo precisam existir.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='parceiros'
    AND policyname IN ('parceiros admin read','parceiros candidatura','parceiros admin write');
  IF v_count <> 3 THEN
    RAISE EXCEPTION '0096: policies esperadas ausentes (encontradas %)', v_count;
  END IF;

  -- anon: INSERT sim, SELECT direto nao, SELECT na view sim.
  IF NOT has_table_privilege('anon','public.parceiros','INSERT') THEN
    RAISE EXCEPTION '0096: anon sem INSERT na candidatura';
  END IF;
  IF has_table_privilege('anon','public.parceiros','SELECT') THEN
    RAISE EXCEPTION '0096: anon ainda le a tabela direta';
  END IF;
  IF NOT has_table_privilege('anon','public.parceiros_publicos','SELECT') THEN
    RAISE EXCEPTION '0096: anon sem SELECT na view publica';
  END IF;

  -- service_role nao foi concedido automaticamente.
  IF has_table_privilege('service_role','public.parceiros','SELECT')
     OR has_table_privilege('service_role','public.parceiros','INSERT')
     OR has_table_privilege('service_role','public.parceiros','UPDATE')
     OR has_table_privilege('service_role','public.parceiros','DELETE') THEN
    RAISE EXCEPTION '0096: service_role recebeu privilegio em parceiros';
  END IF;
END $$;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='parceiros'
ORDER BY policyname;

SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='parceiros'
GROUP BY grantee
ORDER BY grantee;

ROLLBACK;
