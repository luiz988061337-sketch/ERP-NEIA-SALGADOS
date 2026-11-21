-- PROPOSTA NAO EXECUTADA. Operacao A_REVERTER_PAUSA_JOB_1, somente candidato lflzlcqinarrcgncafol.
-- Requer autorizacao humana especifica e executor fixado no host/TLS do candidato.
-- As marcas abaixo sao declaracoes do executor, nao comprovam a identidade sozinhas.
-- Nao usar o leitor READ ONLY para executar escrita. Nao alterar os scripts protegidos.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='2s';
DO $operacao$
DECLARE antes jsonb; depois jsonb;
BEGIN
 IF current_setting('neia_homologacao.project_ref',true) IS DISTINCT FROM 'lflzlcqinarrcgncafol'
 OR current_setting('neia_homologacao.operacao_autorizada',true) IS DISTINCT FROM 'A_REVERTER_PAUSA_JOB_1' THEN
  RAISE EXCEPTION 'Sem autorizacao especifica desta operacao';
 END IF;
 IF current_user<>'postgres' OR current_database()<>'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) THEN
  RAISE EXCEPTION 'Executor ou TLS inesperado';
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('neia:lfl:homologacao:cron:1',0)) THEN
  RAISE EXCEPTION 'Outra operacao desta janela em andamento';
 END IF;
 SELECT to_jsonb(j) INTO antes FROM cron.job j WHERE jobid=1;
 IF antes IS NULL OR antes->>'schedule'<>'0 12 * * *' OR antes->>'database'<>'postgres'
 OR antes->>'username'<>current_user OR md5(antes->>'command')<>'07eac244df4872c8cc446aee7afc9f17'
 OR (antes->>'active')::boolean IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Job diverge do snapshot; parar sem alterar';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job_run_details WHERE jobid=1 AND status='running' AND end_time IS NULL) THEN
  RAISE EXCEPTION 'Job em execucao; nao cancelar processo nem prosseguir';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pedidos) THEN
  RAISE EXCEPTION 'Pedidos passaram a existir; revisar impacto antes desta operacao';
 END IF;
 PERFORM cron.alter_job(job_id:=1,active:=true);
 SELECT to_jsonb(j) INTO depois FROM cron.job j WHERE jobid=1;
 IF depois IS NULL OR (depois->>'active')::boolean IS DISTINCT FROM true
 OR (antes-'active') IS DISTINCT FROM (depois-'active') THEN
  RAISE EXCEPTION 'Alteracao excedeu o unico campo autorizado';
 END IF;
END $operacao$;
COMMIT;
SELECT jobid,schedule,active,database,md5(command) AS command_md5 FROM cron.job WHERE jobid=1;
-- Apos commit: confirmar novamente ausencia de execucao em andamento por leitura.
-- O job pode ter sido invocado por outro caminho; esta operacao nao revoga EXECUTE.
