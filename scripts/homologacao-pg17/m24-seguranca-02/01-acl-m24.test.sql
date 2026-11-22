-- M24-SEGURANÇA-02/03 — verificacao SQL da ACL resultante da 0124.
-- Preparado para execucao FUTURA em laboratorio isolado, nunca no Supabase existente.
-- ON_ERROR_STOP=1. Toda escrita e reversivel: BEGIN ... ROLLBACK. Este teste
-- e autonomo e NAO deve ser envolvido em --single-transaction; a migration
-- 0124, ao contrario, exige --single-transaction no runner.
--
-- Este teste usa SET LOCAL ROLE e GUCs request.jwt.* para simular papeis de
-- banco. Ele NAO valida tokens do Supabase Auth, troca de papel do PostgREST,
-- RLS via API, Storage ou middleware da aplicacao; esses testes reais ficam
-- pendentes de homologacao Auth/PostgREST separada.
\set ON_ERROR_STOP on

BEGIN;

-- 1. Catalogo: quatro helpers fechadas e wrappers autorizados preservados. ----
DO $cat$
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
    IF pg_catalog.to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'M24: assinatura ausente: %', r.sig;
    END IF;

    SELECT pg_catalog.pg_get_userbyid(p.proowner), p.proacl
      INTO v_func_owner, v_acl
    FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(r.sig)::oid;

    IF v_acl IS NULL OR EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(v_acl) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'M24: PUBLIC executa %', r.sig;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role']::name[] LOOP
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role)
         AND pg_catalog.has_function_privilege(v_role, r.sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'M24: % executa %', v_role, r.sig;
      END IF;
    END LOOP;

    FOR v_role IN
      SELECT rl.rolname
      FROM pg_catalog.pg_roles rl
      WHERE rl.rolname <> v_func_owner
        AND NOT rl.rolsuper
        AND pg_catalog.has_function_privilege(rl.rolname, r.sig, 'EXECUTE')
    LOOP
      RAISE EXCEPTION 'M24: % executa % por grant direto ou herdado', v_role, r.sig;
    END LOOP;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('authenticated','public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated','public.cancelar_pedido_atomico(uuid,text)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated','public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'M24: wrapper autorizado perdeu EXECUTE';
  END IF;
END
$cat$;

-- 2. Tentativa direta deve ser negada por ACL, antes de entrar no corpo. -----
CREATE FUNCTION pg_temp.m24_espera_negado(
  p_func    text,
  p_pedido  uuid,
  p_produto uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_negado boolean := false;
BEGIN
  BEGIN
    CASE p_func
      WHEN 'reservar_estoque_atomica' THEN
        PERFORM public.reservar_estoque_atomica(p_pedido, COALESCE(p_produto, p_pedido), 1);
      WHEN 'liberar_reserva_atomica' THEN
        PERFORM public.liberar_reserva_atomica(p_pedido);
      WHEN 'reservar_pedido_atomico' THEN
        PERFORM public.reservar_pedido_atomico(p_pedido);
      WHEN 'liberar_pedido_atomico' THEN
        PERFORM public.liberar_pedido_atomico(p_pedido);
      ELSE
        RAISE EXCEPTION 'caso desconhecido: %', p_func;
    END CASE;
  EXCEPTION WHEN insufficient_privilege THEN
    v_negado := true;
  END;

  IF NOT v_negado THEN
    RAISE EXCEPTION 'ACL nao fechou % para %', p_func, current_user;
  END IF;
END
$$;

-- 3. Papeis de banco simulados. UUIDs sinteticos; nenhum dado real e usado. ---
-- Cliente autenticado.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000101'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Atendente autenticado (mesma ACL; papel e verificado dentro do wrapper).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000002';
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000102'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Producao autenticada.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000103'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Admin autenticado.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-4000-8000-000000000004';
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000104'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Autenticado sem claims.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims = '{}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000105'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Anonimo.
SET LOCAL ROLE anon;
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000106'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

-- Servico tambem nao recebe EXECUTE; RLS bypass nao substitui ACL.
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SELECT pg_temp.m24_espera_negado(f, 'a0000000-0000-4000-8000-000000000107'::uuid)
FROM unnest(ARRAY[
  'reservar_estoque_atomica','liberar_reserva_atomica',
  'reservar_pedido_atomico','liberar_pedido_atomico'
]) f;
RESET ROLE;

ROLLBACK;

\echo 'M24-SEGURANCA-02: ACL e negacoes por ator aprovadas (sem persistencia).'
