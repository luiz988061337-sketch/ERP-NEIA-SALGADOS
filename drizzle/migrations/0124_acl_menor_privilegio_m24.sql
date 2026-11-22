-- 0124: consolida M24 e menor privilegio das quatro RPCs atomicas.
-- Incremental: roda DEPOIS de 0123. Preserva o historico; NAO reaplica 0098.
-- Escopo: somente EXECUTE de public.reservar_estoque_atomica,
-- public.liberar_reserva_atomica, public.reservar_pedido_atomico e
-- public.liberar_pedido_atomico. Nao ha alteracao de corpo, owner, RLS, dados,
-- flags, Auth ou papeis. Sem BEGIN/COMMIT internos: a atomicidade e fornecida
-- pelo runner com psql --single-transaction e ON_ERROR_STOP=1.
--
-- Contrato verificado (somente leitura):
--   M24 / ACL alvo ............ scripts/homologacao-pg17/lfl-finalizacao-0123/funcoes-essenciais.test.sql:82
--   bloqueio da 0098 .......... drizzle/migrations/0098_acl_menor_privilegio.sql:24,29,34,37-40
--   lockdown pos-cutover ..... docs/auditoria/cutover-final/08_LOCKDOWN-ACL.sql:72-82,124-142
--   cadeia SD interna ........ 0093:443 -> 0090; 0095:913 / 0103:1051 -> 0089
--   auxiliares sem chamador .. 0088 e 0089 nao tem chamador browser vivo; flag OFF em src/lib/corte.ts:59-70
--   padrao de precondicao .... scripts/homologacao-pg17/lfl-finalizacao-0123/lote06-autorizacao-rpcs/06-autorizacao-rpcs.sql:5-27
--
-- A ausencia de qualquer assinatura obrigatoria ABORTA. Nao ha SKIP: este arquivo
-- e para o baseline de instalacao limpa, nao para o Supabase existente.
--
-- Runner efetivo: scripts/homologacao-pg17/executar.ps1:28-31,36,67-73 usa
-- psql --single-transaction e ON_ERROR_STOP=1 por migration. psql direto DEVE
-- usar as mesmas flags; NAO executar com psql -f sem transacao explicita.
-- scripts/baseline/apply-baseline.ps1:27,41-45 NAO usa a flag e NAO e o runner
-- da cadeia limpa; nao deve aplicar esta migration. Falha em pre ou pos-condicao
-- desfaz todos os REVOKE porque os tres blocos rodam na mesma transacao.

DO $pre$
DECLARE
  v_ref         regprocedure;
  v_owner       name;
  v_func_owner  name;
  v_sd          boolean;
  v_config      text[];
  r             record;
BEGIN
  v_ref := pg_catalog.to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)');
  IF v_ref IS NULL THEN
    RAISE EXCEPTION '0124: wrapper de referencia ausente: public.criar_pedido_com_reserva';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO v_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = v_ref::oid;

  IF v_owner IS NULL OR v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION '0124: owner de referencia invalido: %', v_owner;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)', true),
      ('public.liberar_reserva_atomica(uuid)',              true),
      ('public.reservar_pedido_atomico(uuid)',              true),
      ('public.liberar_pedido_atomico(uuid)',               true),
      ('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', true),
      ('public.cancelar_pedido_atomico(uuid,text)',         true),
      ('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)', true)
    ) t(sig, exige_sd)
  LOOP
    IF pg_catalog.to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '0124: assinatura obrigatoria ausente: %', r.sig;
    END IF;

    SELECT p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner), p.proconfig
      INTO v_sd, v_func_owner, v_config
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(r.sig)::oid;

    IF v_sd IS DISTINCT FROM r.exige_sd THEN
      RAISE EXCEPTION '0124: SECURITY DEFINER divergente: %', r.sig;
    END IF;
    IF v_func_owner IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '0124: owner divergente: % (esperado %)', r.sig, v_owner;
    END IF;
    IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public']::text[]) THEN
      RAISE EXCEPTION '0124: search_path divergente: %', r.sig;
    END IF;
  END LOOP;
END
$pre$;

-- 1. Helpers atomicas: somente o owner/DEFINER pode executar. -----------------
-- Triggers e chamadas internas de funcoes SECURITY DEFINER nao verificam
-- EXECUTE do chamador (convencao explicitada em 0067:11-17 e 0098:63-67).
DO $acl$
DECLARE
  r       record;
  v_role  name;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      ('public.liberar_reserva_atomica(uuid)'),
      ('public.reservar_pedido_atomico(uuid)'),
      ('public.liberar_pedido_atomico(uuid)')
    ) t(sig)
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']::name[] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, v_role);
      END IF;
    END LOOP;
  END LOOP;
END
$acl$;

-- 2. Pos-condicao: falha fecha a transacao antes de qualquer commit. ----------
DO $post$
DECLARE
  r            record;
  v_role       name;
  v_func_owner name;
  v_acl        aclitem[];
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      ('public.liberar_reserva_atomica(uuid)'),
      ('public.reservar_pedido_atomico(uuid)'),
      ('public.liberar_pedido_atomico(uuid)')
    ) t(sig)
  LOOP
    SELECT pg_catalog.pg_get_userbyid(p.proowner), p.proacl
      INTO v_func_owner, v_acl
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(r.sig)::oid;

    IF v_acl IS NULL OR EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(v_acl) a
      WHERE a.grantee = 0
        AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '0124: PUBLIC ainda executa %', r.sig;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']::name[] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role)
         AND pg_catalog.has_function_privilege(v_role, r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION '0124: % ainda executa %', v_role, r.sig;
      END IF;
    END LOOP;

    FOR v_role IN
      SELECT rl.rolname
      FROM pg_catalog.pg_roles rl
      WHERE rl.rolname <> v_func_owner
        AND NOT rl.rolsuper
        AND pg_catalog.has_function_privilege(rl.rolname, r.sig, 'EXECUTE')
    LOOP
      RAISE EXCEPTION '0124: % executa % por grant direto ou herdado', v_role, r.sig;
    END LOOP;
  END LOOP;

  -- Wrappers autorizados nao foram tocados e permanecem exigidos pelo app.
  IF NOT pg_catalog.has_function_privilege(
       'authenticated', 'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '0124: authenticated perdeu criar_pedido_com_reserva';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'authenticated', 'public.cancelar_pedido_atomico(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0124: authenticated perdeu cancelar_pedido_atomico';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'authenticated', 'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '0124: authenticated perdeu registrar_consumo_reserva';
  END IF;
END
$post$;
