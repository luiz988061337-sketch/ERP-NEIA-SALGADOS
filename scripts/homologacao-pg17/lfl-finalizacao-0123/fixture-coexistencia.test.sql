\set ON_ERROR_STOP on
DO $local$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' OR current_user !~ '^restore_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Somente copia privada local'; END IF; END $local$;
\set staging_ref abcdefghijklmnopqrst
\set escritas_autorizadas_ref abcdefghijklmnopqrst
\set fixture_protocolo d0000000-0000-4000-8000-000000000123
BEGIN;
DO $$ BEGIN IF (SELECT count(*) FROM auth.users)<>1 THEN RAISE EXCEPTION 'Exige um usuario sintetico anterior ou usuario da copia privada, que sera preservado'; END IF; END $$;
WITH v(email,conta,n) AS (VALUES ('cliente','cliente',1),('atendente','atendente',2),('producao','producao',3),('caixa','caixa',4),('financeiro','financeiro',5),('responsavel','responsavel',6),('motoboy-a','motoboyA',7),('motoboy-b','motoboyB',8))
INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data)
SELECT ('d1000000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,
 'neia-qa+'||v.email||'-'||replace(:'fixture_protocolo','-','')||'@example.invalid',now(),
 jsonb_build_object('neia_homologacao',jsonb_build_object('protocolo',:'fixture_protocolo','conta',v.conta,'staging_ref',:'staging_ref')) FROM v;
SELECT jsonb_object_agg(raw_app_meta_data->'neia_homologacao'->>'conta',id)::text AS fixture_atores FROM auth.users WHERE raw_app_meta_data->'neia_homologacao'->>'protocolo'=:'fixture_protocolo' \gset
UPDATE neia_operacao.motoboy_config SET corte_rpc=true WHERE id;
COMMIT;
\ir ../../homologacao-staging-fixture.sql
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>9 OR (SELECT count(*) FROM neia_homologacao.atores)<>8 THEN RAISE EXCEPTION 'Contagens da coexistencia incorretas'; END IF;
 IF EXISTS(SELECT 1 FROM neia_operacao.financeiro_capacidades c LEFT JOIN neia_homologacao.atores a ON a.usuario=c.usuario WHERE a.usuario IS NULL) THEN RAISE EXCEPTION 'Capacidade atribuida a usuario antigo'; END IF;
END $$;
SELECT set_config('teste.atores',(SELECT jsonb_object_agg(conta,usuario)::text FROM neia_homologacao.atores),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; r jsonb; esperado jsonb; BEGIN
 FOR a IN SELECT * FROM jsonb_each_text(current_setting('teste.atores')::jsonb) LOOP
  PERFORM set_config('request.jwt.claim.sub',a.value,true);
  r:=public.neia_staging_identidade('d0000000-0000-4000-8000-000000000123');
  esperado:=CASE a.key WHEN 'caixa' THEN '["conferir_caixa","receber_pagamento"]'::jsonb WHEN 'financeiro' THEN '["executar_financeiro","receber_pagamento"]'::jsonb ELSE '[]'::jsonb END;
  IF r IS NULL OR r->>'conta' IS DISTINCT FROM a.key OR r->>'usuario' IS DISTINCT FROM a.value OR r->'capacidades' IS DISTINCT FROM esperado OR r->>'cutover' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Identidade/capacidade inconsistente'; END IF;
 END LOOP;
END $$;
ROLLBACK;
