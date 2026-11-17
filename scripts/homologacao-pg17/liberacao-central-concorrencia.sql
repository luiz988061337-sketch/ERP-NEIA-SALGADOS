-- Duas sessões reais liberam a mesma rota. Nenhum teste utiliza banco externo.
\getenv senha_teste PGPASSWORD
SELECT set_config('teste_liberacao.senha', :'senha_teste', true) IS NOT NULL AS configurada;
\unset senha_teste
DO $$ DECLARE c teste_liberacao.casos; dsn text; a int; b int; r1 jsonb;r2 jsonb; esperado boolean:=false;BEGIN
 SELECT * INTO c FROM teste_liberacao.casos WHERE n=5;
 dsn:=format('host=127.0.0.1 port=%s dbname=%s user=%s password=%s connect_timeout=5',current_setting('port'),current_database(),current_user,current_setting('teste_liberacao.senha'));
 PERFORM public.dblink_connect('lib_a',dsn);PERFORM public.dblink_connect('lib_b',dsn);
 SELECT pid INTO a FROM public.dblink('lib_a','SELECT pg_backend_pid()') x(pid int);
 SELECT pid INTO b FROM public.dblink('lib_b','SELECT pg_backend_pid()') x(pid int);
 PERFORM public.dblink_exec('lib_a','BEGIN');PERFORM public.dblink_exec('lib_b','BEGIN');
 PERFORM public.dblink_exec('lib_a','SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=''10000000-0000-0000-0000-000000000001''');
 PERFORM public.dblink_exec('lib_b','SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=''10000000-0000-0000-0000-000000000001''');
 SELECT resposta INTO r1 FROM public.dblink('lib_a',format('SELECT public.liberar_rota_entrega(%L::uuid)',c.rota)) x(resposta jsonb);
 PERFORM public.dblink_send_query('lib_b',format('SELECT public.liberar_rota_entrega(%L::uuid)',c.rota));
 FOR i IN 1..100 LOOP IF a=ANY(pg_blocking_pids(b)) THEN esperado:=true;EXIT;END IF;PERFORM pg_sleep(0.05);END LOOP;
 IF NOT esperado THEN RAISE EXCEPTION 'Liberação simultânea não esperou lock';END IF;
 PERFORM public.dblink_exec('lib_a','COMMIT');
 SELECT resposta INTO r2 FROM public.dblink_get_result('lib_b') x(resposta jsonb);
 PERFORM resposta FROM public.dblink_get_result('lib_b') x(resposta jsonb);PERFORM public.dblink_exec('lib_b','COMMIT');
 PERFORM public.dblink_disconnect('lib_a');PERFORM public.dblink_disconnect('lib_b');
 IF r1->>'motivo' IS DISTINCT FROM 'rota_liberada' OR r2->>'motivo' IS DISTINCT FROM 'rota_ja_liberada' OR r1->>'liberada_em' IS DISTINCT FROM r2->>'liberada_em' THEN RAISE EXCEPTION 'Concorrência: % / %',r1,r2;END IF;
 RAISE NOTICE '0123: duas sessões, um único registro de liberação OK';
END $$;
