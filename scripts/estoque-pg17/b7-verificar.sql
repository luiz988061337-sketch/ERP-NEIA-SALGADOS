-- Verificação pós-reversão do B7. Cluster descartável.
DO $$
BEGIN
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.criar_pedido_com_reserva_base(uuid,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'B7 verificação: wrapper ou base ausente';
  END IF;
  IF (SELECT habilitado FROM public.salgados_b7_config WHERE id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B7 verificação: flag ainda habilitada';
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
    RAISE EXCEPTION 'B7 verificação: RPC nova ainda executável';
  END IF;
  IF (SELECT count(*) FROM public.salgados_compromissos) < 1
     OR (SELECT count(*) FROM public.salgados_agendamentos_b7) < 1 THEN
    RAISE EXCEPTION 'B7 verificação: histórico operacional foi perdido';
  END IF;
  RAISE NOTICE 'VERIFICACAO B7 OK';
END $$;
