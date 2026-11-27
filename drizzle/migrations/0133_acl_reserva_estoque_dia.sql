-- 0133 — reconciliação de ACL das RPCs de reserva (0098 × 0124).
-- Preparada localmente. NÃO aplicar sem autorização expressa.
-- Destino permitido, quando autorizado: homologação lflzlcqinarrcgncafol.
--
-- Numeração coordenada: a Central da Atendente do Codex ocupa 0130 (permissões
-- da atendente), 0131 (notificações Realtime privadas) e 0132 (janelas
-- prometidas). Esta reconciliação foi renumerada de 0130 para 0133 e deve ser
-- aplicada DEPOIS de 0130–0132 e da 0129 revisada. A branch do Codex não foi
-- alterada; a ordem aqui registrada evita colisão de versão no histórico.
--
-- Histórico divergente:
--   * 0031/0088/0089 davam `service_role` e/ou `authenticated`;
--   * 0098 removeu `PUBLIC`/`anon`/`service_role` e concedeu `authenticated`;
--   * 0124 removeu também `authenticated` das quatro helpers internas, porque
--     os wrappers de app as chamam como owner (SECURITY DEFINER).
--   * Em homologação as duas funções abaixo ficaram executáveis apenas por
--     `postgres`, mas o painel de estoque ainda chama
--     `reservar_estoque_atomica` diretamente via PostgREST.
--
-- Esta migration NÃO reaplica 0098 e NÃO altera corpo, owner, RLS, dados,
-- flags ou papéis. Ela só reconcilia o EXECUTE de duas assinaturas:
--   - public.reservar_estoque_atomica(uuid, uuid, integer)
--   - public.reservar_pedido_atomico(uuid)
--
-- `authenticated` é apenas transporte PostgREST. A autoridade vem da checagem
-- funcional dentro das próprias RPCs (`auth.uid()` + `has_role` + dono do
-- pedido), de `SECURITY DEFINER`, `search_path=public` e RLS nas tabelas.
-- `PUBLIC`, `anon`, `service_role`, motoboy e cliente continuam sem acesso.
-- Se qualquer pré-condição falhar, a transação aborta antes de conceder.

BEGIN;

DO $pre$
DECLARE
  v_owner      name;
  v_func_owner name;
  v_sd         boolean;
  v_config     text[];
  v_def        text;
  r            record;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner)
    INTO v_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure(
    'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)'
  )::oid;

  IF v_owner IS NULL OR v_owner IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION '0133: owner de referência inválido: %', v_owner;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)', true),
      ('public.reservar_pedido_atomico(uuid)', true)
    ) t(sig, exige_sd)
  LOOP
    IF pg_catalog.to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION '0133: assinatura obrigatória ausente: %', r.sig;
    END IF;

    SELECT p.prosecdef,
           pg_catalog.pg_get_userbyid(p.proowner),
           p.proconfig,
           pg_catalog.pg_get_functiondef(p.oid)
      INTO v_sd, v_func_owner, v_config, v_def
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(r.sig)::oid;

    IF v_sd IS DISTINCT FROM r.exige_sd THEN
      RAISE EXCEPTION '0133: SECURITY DEFINER divergente: %', r.sig;
    END IF;
    IF v_func_owner IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '0133: owner divergente: % (esperado %)', r.sig, v_owner;
    END IF;
    IF v_config IS NULL OR NOT (v_config @> ARRAY['search_path=public']::text[]) THEN
      RAISE EXCEPTION '0133: search_path divergente: %', r.sig;
    END IF;
    IF v_def IS NULL OR v_def NOT LIKE '%has_role%' OR v_def NOT LIKE '%auth.uid()%' THEN
      RAISE EXCEPTION '0133: RPC sem validação funcional de papel: %', r.sig;
    END IF;
  END LOOP;
END
$pre$;

DO $rls$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'public.reservas_estoque',
      'public.estoque_movimentacoes',
      'public.lotes',
      'public.reserva_consumos'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid = t::regclass AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '0133: RLS ausente em %', t;
    END IF;
  END LOOP;
END
$rls$;

-- 1. Remove qualquer grant amplo e reconhece apenas o transporte autenticado.
DO $acl$
DECLARE
  r      record;
  v_role name;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      ('public.reservar_pedido_atomico(uuid)')
    ) t(sig)
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']::name[] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role) THEN
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I', r.sig, v_role);
      END IF;
    END LOOP;
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$acl$;

-- 2. Pós-condição: falha fecha a transação e desfaz os REVOKE/GRANT.
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
      ('public.reservar_pedido_atomico(uuid)')
    ) t(sig)
  LOOP
    SELECT pg_catalog.pg_get_userbyid(p.proowner), p.proacl
      INTO v_func_owner, v_acl
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(r.sig)::oid;

    IF v_acl IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(v_acl) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '0133: PUBLIC ainda executa %', r.sig;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION '0133: authenticated sem EXECUTE em %', r.sig;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon', 'service_role']::name[] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role)
         AND pg_catalog.has_function_privilege(v_role, r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION '0133: % ainda executa %', v_role, r.sig;
      END IF;
    END LOOP;
    FOR v_role IN
      SELECT rl.rolname
      FROM pg_catalog.pg_roles rl
      WHERE rl.rolname <> v_func_owner
        AND rl.rolname <> 'authenticated'
        AND NOT rl.rolsuper
        AND pg_catalog.has_function_privilege(rl.rolname, r.sig, 'EXECUTE')
    LOOP
      RAISE EXCEPTION '0133: % executa % por grant direto ou herdado', v_role, r.sig;
    END LOOP;
  END LOOP;
END
$post$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (
  '20261127230000',
  'acl_reserva_estoque_dia',
  ARRAY[$mig$-- 0133: reconcilia 0098/0124. authenticated pode chamar as duas RPCs
-- porque o corpo valida auth.uid(), dono do pedido e has_role; PUBLIC, anon e
-- service_role não têm EXECUTE. RLS e SECURITY DEFINER são pré-condição.$mig$]::text[]
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
