-- Segundo cliente PostgreSQL real para observar a disputa por lock.
-- O runner confirma o diretório e passa a senha efêmera via ambiente.
CREATE EXTENSION dblink;
\getenv senha_teste PGPASSWORD
SELECT set_config('teste_inicio.senha', :'senha_teste', true) IS NOT NULL AS configurada;
\unset senha_teste

DO $$
DECLARE
  c teste_inicio.casos;
  v_dsn text;
  v_config text;
  primeira jsonb;
  segunda jsonb;
  pid_a integer;
  pid_b integer;
  bloqueado boolean := false;
  tentativa integer;
BEGIN
  SELECT * INTO c FROM teste_inicio.casos WHERE n = 5;
  v_dsn := format('host=127.0.0.1 port=%s dbname=%s user=%s password=%s connect_timeout=5',
                  current_setting('port'),current_database(),current_user,current_setting('teste_inicio.senha'));
  PERFORM public.dblink_connect('inicio_a',v_dsn);
  PERFORM public.dblink_connect('inicio_b',v_dsn);
  SELECT pid INTO pid_a FROM public.dblink('inicio_a','SELECT pg_backend_pid()') AS x(pid integer);
  SELECT pid INTO pid_b FROM public.dblink('inicio_b','SELECT pg_backend_pid()') AS x(pid integer);
  v_config := format('SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = %L', c.usuario);
  PERFORM public.dblink_exec('inicio_a','BEGIN');
  PERFORM public.dblink_exec('inicio_b','BEGIN');
  PERFORM public.dblink_exec('inicio_a',v_config);
  PERFORM public.dblink_exec('inicio_b',v_config);
  -- A primeira sessão fica com a última retirada ainda não confirmada por COMMIT.
  SELECT resposta INTO primeira FROM public.dblink('inicio_a',format(
    'SELECT public.confirmar_retirada(%L::uuid)',c.pedidos[3])) AS x(resposta jsonb);
  IF primeira->>'motivo' IS DISTINCT FROM 'retirada_confirmada' THEN RAISE EXCEPTION 'Última retirada: %',primeira; END IF;
  PERFORM public.dblink_send_query('inicio_b',format('SELECT public.iniciar_rota(%L::uuid)',c.rota));
  FOR tentativa IN 1..100 LOOP
    IF pid_a = ANY(pg_blocking_pids(pid_b)) THEN bloqueado := true; EXIT; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  IF NOT bloqueado THEN RAISE EXCEPTION 'Sessão de início não esperou a retirada concorrente'; END IF;
  PERFORM public.dblink_exec('inicio_a','COMMIT');
  SELECT resposta INTO segunda FROM public.dblink_get_result('inicio_b') AS x(resposta jsonb);
  PERFORM resposta FROM public.dblink_get_result('inicio_b') AS x(resposta jsonb);
  PERFORM public.dblink_exec('inicio_b','COMMIT');
  IF segunda->>'motivo' IS DISTINCT FROM 'rota_iniciada' THEN
    RAISE EXCEPTION 'Início após retirada concorrente: %',segunda;
  END IF;

  SELECT * INTO c FROM teste_inicio.casos WHERE n = 4;
  v_config := format('SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = %L', c.usuario);
  PERFORM public.dblink_exec('inicio_a','BEGIN');
  PERFORM public.dblink_exec('inicio_b','BEGIN');
  PERFORM public.dblink_exec('inicio_a',v_config);
  PERFORM public.dblink_exec('inicio_b',v_config);
  SELECT resposta INTO primeira FROM public.dblink('inicio_a',format(
    'SELECT public.iniciar_rota(%L::uuid)',c.rota)) AS x(resposta jsonb);
  PERFORM public.dblink_send_query('inicio_b',format('SELECT public.iniciar_rota(%L::uuid)',c.rota));
  bloqueado := false;
  FOR tentativa IN 1..100 LOOP
    IF pid_a = ANY(pg_blocking_pids(pid_b)) THEN bloqueado := true; EXIT; END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;
  IF NOT bloqueado THEN RAISE EXCEPTION 'Segundo início não esperou a primeira transação'; END IF;
  PERFORM public.dblink_exec('inicio_a','COMMIT');
  SELECT resposta INTO segunda FROM public.dblink_get_result('inicio_b') AS x(resposta jsonb);
  PERFORM resposta FROM public.dblink_get_result('inicio_b') AS x(resposta jsonb);
  PERFORM public.dblink_exec('inicio_b','COMMIT');
  PERFORM public.dblink_disconnect('inicio_a');
  PERFORM public.dblink_disconnect('inicio_b');
  IF primeira->>'motivo' IS DISTINCT FROM 'rota_iniciada'
    OR segunda->>'motivo' IS DISTINCT FROM 'rota_ja_iniciada'
    OR segunda->>'saiu_em' IS DISTINCT FROM primeira->>'saiu_em' THEN
    RAISE EXCEPTION 'Inícios concorrentes: % / %',primeira,segunda;
  END IF;
  RAISE NOTICE '0112: duas sessões observaram uma única transição após a última retirada';
END $$;
