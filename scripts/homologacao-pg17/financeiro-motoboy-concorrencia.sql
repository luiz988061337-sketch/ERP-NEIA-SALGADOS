\getenv senha_teste PGPASSWORD
SELECT set_config('teste_inicio.senha', :'senha_teste', true) IS NOT NULL AS configurada;
\unset senha_teste

DO $$
DECLARE
  turno uuid := (SELECT id FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001');
  acerto uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:pix-concorrente');
  v_dsn text;
  ator text;
  comando text;
  repeticao_esperada text;
  primeiro jsonb;
  segundo jsonb;
  pid_a integer;
  pid_b integer;
  i integer;
  bloqueado boolean;
  modo text;
  efetivo timestamptz := now() - interval '1 second';
  conta uuid;
BEGIN
  v_dsn := format('host=127.0.0.1 port=%s dbname=%s user=%s password=%s connect_timeout=5',
                  current_setting('port'),current_database(),current_user,current_setting('teste_inicio.senha'));
  PERFORM public.dblink_connect('fin_a',v_dsn);
  PERFORM public.dblink_connect('fin_b',v_dsn);
  SELECT pid INTO pid_a FROM public.dblink('fin_a','SELECT pg_backend_pid()') AS x(pid integer);
  SELECT pid INTO pid_b FROM public.dblink('fin_b','SELECT pg_backend_pid()') AS x(pid integer);

  FOREACH modo IN ARRAY ARRAY['aprovar','pagar'] LOOP
    IF modo = 'aprovar' THEN
      ator := '10000000-0000-0000-0000-000000000001';
      comando := format('SELECT public.aprovar_acerto_rota(%L::uuid,%L,true,%L)',acerto,'aprovar:concorrente','Aprovação Pix');
    ELSE
      ator := '10000000-0000-0000-0000-000000000005';
      comando := format('SELECT public.confirmar_pagamento_turno_motoboy(%L::uuid,4785,%L,%L::timestamptz,%L,%L)',
        turno,'pix',efetivo,'Pix-sintetico-integração','pagar:concorrente');
    END IF;
    PERFORM public.dblink_exec('fin_a',format('BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = %L',ator));
    PERFORM public.dblink_exec('fin_b',format('BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = %L',ator));
    SELECT r INTO primeiro FROM public.dblink('fin_a',comando) AS x(r jsonb);
    PERFORM public.dblink_send_query('fin_b',comando);
    bloqueado := false;
    FOR i IN 1..100 LOOP
      IF pid_a = ANY(pg_blocking_pids(pid_b)) THEN bloqueado := true; EXIT; END IF;
      PERFORM pg_sleep(0.05);
    END LOOP;
    IF NOT bloqueado THEN RAISE EXCEPTION 'Segunda sessão não aguardou %',modo; END IF;
    PERFORM public.dblink_exec('fin_a','COMMIT');
    SELECT r INTO segundo FROM public.dblink_get_result('fin_b') AS x(r jsonb);
    PERFORM r FROM public.dblink_get_result('fin_b') AS x(r jsonb);
    PERFORM public.dblink_exec('fin_b','COMMIT');
    repeticao_esperada := CASE WHEN modo = 'aprovar' THEN 'ok' ELSE 'registrado' END;
    IF primeiro->>'status' IS DISTINCT FROM repeticao_esperada OR segundo->>'status' IS DISTINCT FROM 'repetido' THEN
      RAISE EXCEPTION 'Concorrência %: % / %',modo,primeiro,segundo;
    END IF;
  END LOOP;
  PERFORM public.dblink_disconnect('fin_a');
  PERFORM public.dblink_disconnect('fin_b');
  IF (SELECT count(*) FROM public.acertos_rota_eventos WHERE acerto_id=acerto AND tipo='compensacao') <> 1 THEN
    RAISE EXCEPTION 'Aprovação duplicada';
  END IF;
  conta := (primeiro->>'conta_id')::uuid;
  IF conta IS NULL OR (SELECT count(*) FROM public.conta_pagamento_eventos
     WHERE conta_id=conta AND tipo='pagamento' AND valor_centavos=4785 AND created_at=efetivo) <> 1
     OR (SELECT count(*) FROM public.turnos_motoboy_eventos WHERE turno_id=turno AND tipo='pagamento') <> 1 THEN
    RAISE EXCEPTION 'Ledger do turno não corresponde ao pagamento efetivo';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
  IF public.confirmar_pagamento_turno_motoboy(turno,4785,'pix',efetivo,'Pix-sintetico-integração','pagar:outra-chave')->>'status' IS DISTINCT FROM 'ja_pago'
     OR public.conferir_acerto_rota_independente(acerto,'alterar:apos-aprovar',0,0,'Alteração')->>'status' IS DISTINCT FROM 'inelegivel' THEN
    RAISE EXCEPTION 'Turno pago ou acerto aprovado aceitou duplicação/alteração';
  END IF;
  RAISE NOTICE 'Financeiro: aprovação e pagamento concorrentes, idempotência e ledger único';
END $$;
