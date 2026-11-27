-- Reversão NÃO DESTRUTIVA do rascunho local da corretiva B7.
-- Somente cluster local/homologação autorizada. Nunca apagar histórico.
-- Efeito: desliga a feature flag (o wrapper passa a delegar integralmente à
-- função base 0095/0103) e revoga as duas RPCs novas. Objetos, pedidos,
-- solicitações, compromissos, reservas e histórico permanecem intactos.
-- Idempotente: pode ser executado mais de uma vez.

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.salgados_b7_config') IS NULL
     OR to_regclass('public.salgados_agendamentos_b7') IS NULL
     OR to_regprocedure('public.configurar_b7_salgados(boolean)') IS NULL
     OR to_regprocedure('public.registrar_compromisso_aprovado_b7(uuid,uuid)') IS NULL
     OR to_regprocedure('public.registrar_compromisso_futuro_b7(text,integer,date,uuid,text)') IS NULL
     OR to_regprocedure('public.vincular_pedido_compromisso_b7(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.converter_compromisso_reserva_b7(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.cancelar_compromisso_b7(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.criar_pedido_com_reserva_base(uuid,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Reversão B7: objetos da corretiva não estão instalados';
  END IF;
END
$pre$;

UPDATE public.salgados_b7_config
   SET habilitado = false, atualizado_em = now()
 WHERE id;

INSERT INTO public.admin_logs (actor, acao, detalhe)
VALUES (NULL, 'b7_reversao_desativado',
        'Reversão não destrutiva: wrapper delegando à base; RPCs novas revogadas.');

REVOKE EXECUTE ON FUNCTION public.configurar_b7_salgados(boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_compromisso_aprovado_b7(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.registrar_compromisso_futuro_b7(text, integer, date, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.vincular_pedido_compromisso_b7(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.converter_compromisso_reserva_b7(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cancelar_compromisso_b7(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DO $pos$
DECLARE
  v_habilitado boolean;
BEGIN
  SELECT habilitado INTO v_habilitado FROM public.salgados_b7_config WHERE id;
  IF coalesce(v_habilitado, true) THEN
    RAISE EXCEPTION 'Reversão B7: flag ainda habilitada';
  END IF;
  IF pg_catalog.has_function_privilege(
       'authenticated', 'public.configurar_b7_salgados(boolean)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.registrar_compromisso_aprovado_b7(uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.registrar_compromisso_futuro_b7(text,integer,date,uuid,text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.vincular_pedido_compromisso_b7(uuid,uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.converter_compromisso_reserva_b7(uuid,uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.cancelar_compromisso_b7(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Reversão B7: RPC nova ainda acessível a authenticated';
  END IF;
END
$pos$;

COMMIT;
