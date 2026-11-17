-- Regressão de permissões para as migrations 0115–0118.
-- Executar após rotas-app.sql, com papéis sintéticos, somente em PostgreSQL isolado.

RESET ROLE;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.acertos_rota', 'INSERT')
     OR has_table_privilege('authenticated', 'public.acertos_rota_eventos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.turnos_motoboy', 'INSERT')
     OR has_table_privilege('authenticated', 'public.turnos_motoboy_eventos', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated mantém INSERT direto em ledger/acerto/turno';
  END IF;
  IF has_function_privilege('authenticated',
      'public.pagar_fechamento_turno(uuid,bigint,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated ainda pode executar o pagamento de turno sem confirmação financeira';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['public.acertos_rota','public.acertos_rota_eventos',
      'public.turnos_motoboy','public.turnos_motoboy_eventos']) AS tabela
    WHERE has_table_privilege('authenticated',tabela,'UPDATE,DELETE,TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'Authenticated mantém escrita direta em acerto, turno ou seus eventos';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';

DO $$
BEGIN
  BEGIN
    UPDATE public.acertos_rota SET status = 'aprovado' WHERE chave_idempotencia = 'acerto:turno:001';
    RAISE EXCEPTION 'Motoboy conseguiu alterar acerto diretamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    EXECUTE $sql$INSERT INTO public.turnos_motoboy (motoboy_id,user_id,data_turno,tipo,valor_fixo_turno,taxas_entrega_acumuladas,valor_devido_motoboy,valor_pago,status,chave_idempotencia) VALUES ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',CURRENT_DATE,'normal',40,0,0,0,'pago','forged-turno')$sql$;
    RAISE EXCEPTION 'Motoboy inseriu turno diretamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    EXECUTE $sql$INSERT INTO public.acertos_rota_eventos (acerto_id,tipo,valor_centavos,actor,chave_idempotencia) VALUES ('00000000-0000-0000-0000-000000000001','compensacao',1,'10000000-0000-0000-0000-000000000003','forged-acerto-event')$sql$;
    RAISE EXCEPTION 'Motoboy inseriu evento financeiro diretamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    EXECUTE $sql$SELECT public.pagar_fechamento_turno('00000000-0000-0000-0000-000000000001',1,'forged-payment','dinheiro','')$sql$;
    RAISE EXCEPTION 'Motoboy executou pagamento de turno';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
