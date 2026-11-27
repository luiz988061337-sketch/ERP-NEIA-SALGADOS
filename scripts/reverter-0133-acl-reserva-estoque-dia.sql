-- REVERSÃO NÃO DESTRUTIVA DA 0133 — SOMENTE HOMOLOGAÇÃO AUTORIZADA — NÃO APLICADA.
-- Preparada em 27/11/2026. Exige autorização expressa e destino declarado
-- --project-ref lflzlcqinarrcgncafol, pela barreira `npm run sql:homolog`.
-- NUNCA transferir para produção.
--
-- Escopo: desfazer somente o GRANT de EXECUTE concedido pela 0133 nas duas RPCs
-- de reserva. Não altera corpo, owner, SECURITY DEFINER, search_path, RLS,
-- papéis, flags, dados nem histórico de migrations. Não reaplica 0098.
--
-- Idempotente: revoked repetido não altera estado. Se a versão 20261127230000
-- não estiver registrada ou alguma assinatura estiver ausente, aborta antes de
-- qualquer revogação.
--
-- Estado esperado após a reversão: somente o owner (e superusuários) executa as
-- duas funções. `PUBLIC`, `anon`, `authenticated` e `service_role` sem EXECUTE.

BEGIN;

DO $pre$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261127230000'
  ) THEN
    RAISE EXCEPTION 'reversao 0133: versao 20261127230000 ausente no historico';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'reversao 0133: papel authenticated ausente';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      ('public.reservar_pedido_atomico(uuid)')
    ) t(sig)
  LOOP
    IF pg_catalog.to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'reversao 0133: assinatura ausente: %', r.sig;
    END IF;
  END LOOP;
END
$pre$;

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM authenticated;

DO $post$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      ('public.reservar_pedido_atomico(uuid)'),
      ('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)')
    ) t(sig)
  LOOP
    IF pg_catalog.to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'reversao 0133: assinatura ausente no pos-check: %', r.sig;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('authenticated', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.reservar_pedido_atomico(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reversao 0133: authenticated ainda executa uma das RPCs';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.reservar_pedido_atomico(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role', 'public.reservar_pedido_atomico(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reversao 0133: anon/service_role executam uma das RPCs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid IN (
      pg_catalog.to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)')::oid,
      pg_catalog.to_regprocedure('public.reservar_pedido_atomico(uuid)')::oid
    )
      AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'reversao 0133: SECURITY DEFINER divergente';
  END IF;
END
$post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
