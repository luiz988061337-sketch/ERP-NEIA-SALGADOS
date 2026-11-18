-- ============================================================================
-- AUDITORIA DO LOTE 05 - EXCLUSIVAMENTE NO BANCO LOCAL lfl_partial
-- ============================================================================
-- Executar DEPOIS de 05-correcoes-b0-seguranca.sql.
-- Responde, com medicao e nao suposicao:
--   A1. funcoes ainda executaveis por anon: quais, o que sao, qual o risco
--   A2. cobertura de search_path em TODA funcao SECURITY DEFINER de public
--   A3. experimento: search_path vazio com nomes totalmente qualificados e'
--       viavel? (alterado e revertido na mesma transacao)
--   A4. default privileges: por papel criador, e prova de que um GRANT
--       posterior reabre o privilegio (protecao de estado, nao de fluxo)
-- Nada permanece no banco: A3 e a demonstracao de A4 rodam em ROLLBACK.
-- ============================================================================
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN
  RAISE EXCEPTION 'Auditoria exclusivamente local';
 END IF;
END $local$;

-- ---------------------------------------------------------------------------
-- A1. Funcoes executaveis por anon: inventario nominal e classificacao
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_total int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosecdef,
           (SELECT coalesce(array_to_string(p.proconfig,','),'') ) AS cfg,
           (SELECT count(*) FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS gatilhos,
           (SELECT count(*) FROM pg_proc d
             WHERE d.prosrc LIKE '%'||p.proname||'(%' AND d.oid <> p.oid AND d.prosecdef) AS chamadores_definer
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
     ORDER BY p.proname
  LOOP
    v_total := v_total + 1;
    RAISE NOTICE 'A1: anon executa % | definer=% | search_path=% | usada_por_%_gatilho(s) | chamada_por_%_definer',
      r.proname, r.prosecdef, coalesce(nullif(r.cfg,''),'(nenhum)'), r.gatilhos, r.chamadores_definer;

    -- vetor de escalonamento: DEFINER sem search_path fixo e' inaceitavel
    IF r.prosecdef AND coalesce(r.cfg,'') = '' THEN
      RAISE EXCEPTION 'A1: funcao SECURITY DEFINER executavel por anon sem search_path: %', r.proname;
    END IF;
    -- nenhuma funcao declarada sensivel pelo lote pode estar exposta a anon
    IF EXISTS (SELECT 1 FROM (VALUES
         ('consumir_insumos_pedido'),('calcular_tempo_fritura'),('gerar_msg_apartamento'),
         ('liberar_reserva_pedido'),('reservar_estoque_pedido'),('registrar_mov_estoque'),
         ('processar_lembretes'),('enfileirar_cupom'),('gerar_cupons_pedidos_pagos'),
         ('receber_compra_item'),('converter_unidade'),('reservar_estoque_atomica'),
         ('liberar_reserva_atomica')) s(nome)
       WHERE s.nome = r.proname) THEN
      RAISE EXCEPTION 'A1: funcao declarada sensivel executavel por anon: %', r.proname;
    END IF;
  END LOOP;

  RAISE NOTICE 'A1: total de funcoes executaveis por anon = %', v_total;
  IF v_total > 6 THEN
    RAISE EXCEPTION 'A1: anon executa % funcoes; revisar matriz', v_total;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A2. search_path em toda funcao SECURITY DEFINER de public
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; v_total int := 0; v_sem int := 0; v_temp_antes int := 0; v_lista text := '';
        v_sem_pin int := 0; v_lista_pin text := '';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           coalesce(array_to_string(p.proconfig,','),'') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
     ORDER BY p.proname
  LOOP
    v_total := v_total + 1;
    IF r.cfg = '' THEN
      v_sem := v_sem + 1;
      v_lista := v_lista || ' ' || r.proname;
    ELSIF position('pg_temp' in r.cfg) = 0 THEN
      -- valor sem pg_temp explicito: seguro somente se o corpo qualifica tudo
      v_sem_pin := v_sem_pin + 1;
      v_lista_pin := v_lista_pin || ' ' || r.proname;
    ELSIF position('pg_temp' in r.cfg) < position('public' in r.cfg) THEN
      v_temp_antes := v_temp_antes + 1;
      v_lista := v_lista || ' [pg_temp antes] ' || r.proname;
    END IF;
  END LOOP;

  RAISE NOTICE 'A2: SECURITY DEFINER em public = % | sem search_path = % | pg_temp antes de public = % | sem pg_temp explicito = %',
    v_total, v_sem, v_temp_antes, v_sem_pin;
  IF v_sem_pin > 0 THEN
    RAISE NOTICE 'A2: sem pg_temp explicito (dependem de qualificacao total no corpo):%', v_lista_pin;
  END IF;
  IF v_sem > 0 OR v_temp_antes > 0 THEN
    RAISE EXCEPTION 'A2: funcoes DEFINER sem search_path seguro:%', v_lista;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- A3. search_path vazio: viavel sem reescrever o corpo?
--     Alterado dentro da transacao e revertido no ROLLBACK.
-- ---------------------------------------------------------------------------
BEGIN;

ALTER FUNCTION public.processar_lembretes() SET search_path = '';
DO $$
DECLARE v_resultado text;
BEGIN
  BEGIN
    PERFORM public.processar_lembretes();
    v_resultado := 'executou (nomes resolvem sem public no path)';
  EXCEPTION
    WHEN undefined_table OR undefined_column OR undefined_function THEN
      v_resultado := 'falhou na resolucao de nomes (' || SQLSTATE || ')';
    WHEN OTHERS THEN
      v_resultado := 'nomes resolvem; erro de negocio ' || SQLSTATE;
  END;
  RAISE NOTICE 'A3: processar_lembretes com search_path vazio -> %', v_resultado;
  IF v_resultado NOT LIKE 'falhou na resolucao%' THEN
    RAISE EXCEPTION 'A3: esperava falha de resolucao em processar_lembretes com search_path vazio';
  END IF;
END $$;

ALTER FUNCTION public.reservar_estoque_atomica(uuid,uuid,integer) SET search_path = '';
DO $$
DECLARE v_resultado text;
BEGIN
  BEGIN
    PERFORM public.reservar_estoque_atomica(gen_random_uuid(), gen_random_uuid(), 1);
    v_resultado := 'executou (nomes resolvem sem public no path)';
  EXCEPTION
    WHEN undefined_table OR undefined_column OR undefined_function THEN
      v_resultado := 'falhou na resolucao de nomes (' || SQLSTATE || ')';
    WHEN OTHERS THEN
      v_resultado := 'nomes resolvem; erro de negocio ' || SQLSTATE;
  END;
  RAISE NOTICE 'A3: reservar_estoque_atomica com search_path vazio -> %', v_resultado;
END $$;

ALTER FUNCTION public.liberar_reserva_atomica(uuid) SET search_path = '';
DO $$
DECLARE v_resultado text;
BEGIN
  BEGIN
    PERFORM public.liberar_reserva_atomica(gen_random_uuid());
    v_resultado := 'executou (nomes resolvem sem public no path)';
  EXCEPTION
    WHEN undefined_table OR undefined_column OR undefined_function THEN
      v_resultado := 'falhou na resolucao de nomes (' || SQLSTATE || ')';
    WHEN OTHERS THEN
      v_resultado := 'nomes resolvem; erro de negocio ' || SQLSTATE;
  END;
  RAISE NOTICE 'A3: liberar_reserva_atomica com search_path vazio -> %', v_resultado;
END $$;

ROLLBACK;

-- prova de que o experimento nao deixou efeito
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.proname, coalesce(array_to_string(p.proconfig,','),'') AS cfg
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname IN ('processar_lembretes','reservar_estoque_atomica','liberar_reserva_atomica') LOOP
    IF r.cfg NOT LIKE '%public%' THEN
      RAISE EXCEPTION 'A3: search_path de % nao voltou apos o ROLLBACK (%)', r.proname, r.cfg;
    END IF;
    RAISE NOTICE 'A3: apos ROLLBACK, % mantem %', r.proname, r.cfg;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- A4. Default privileges: por papel criador
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record; v_n int := 0; v_ruins text := '';
BEGIN
  FOR r IN
    SELECT pg_get_userbyid(d.defaclrole) AS papel, d.defaclobjtype AS tipo,
           coalesce(n.nspname,'(todos os schemas)') AS schema_nome,
           d.defaclacl::text AS acl
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
     ORDER BY 1,2,3
  LOOP
    v_n := v_n + 1;
    RAISE NOTICE 'A4: default ACL papel=% tipo=% schema=% acl=%', r.papel, r.tipo, r.schema_nome, r.acl;
  END LOOP;
  RAISE NOTICE 'A4: % entrada(s) de default privilege neste cluster', v_n;

  FOR r IN
    SELECT pg_get_userbyid(d.defaclrole) AS papel, a.privilege_type AS priv
      FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclobjtype='r'
       AND d.defaclnamespace = 'public'::regnamespace
       AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))
       AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
  LOOP
    v_ruins := v_ruins || ' ' || r.papel || ':' || r.priv;
  END LOOP;
  IF v_ruins <> '' THEN
    RAISE EXCEPTION 'A4: default privilege estrutural para anon/authenticated em public:%', v_ruins;
  END IF;
END $$;

-- A4b. tabela criada pelo dono real de producao: o que herda?
SET SESSION AUTHORIZATION postgres;
CREATE TABLE public.teste_b0_default_acl (x int);
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  RAISE NOTICE 'A4b: tabela nova (dono postgres) -> authenticated: SELECT=% INSERT=% UPDATE=% DELETE=% TRUNCATE=% REFERENCES=% TRIGGER=%',
    has_table_privilege('authenticated','public.teste_b0_default_acl','SELECT'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','INSERT'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','UPDATE'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','DELETE'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','TRUNCATE'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','REFERENCES'),
    has_table_privilege('authenticated','public.teste_b0_default_acl','TRIGGER');
  IF has_table_privilege('authenticated','public.teste_b0_default_acl','TRUNCATE')
  OR has_table_privilege('anon','public.teste_b0_default_acl','TRUNCATE')
  OR has_table_privilege('authenticated','public.teste_b0_default_acl','TRIGGER')
  OR has_table_privilege('authenticated','public.teste_b0_default_acl','REFERENCES') THEN
    RAISE EXCEPTION 'A4b: default privilege reaplicou privilegio estrutural';
  END IF;
END $$;
DROP TABLE public.teste_b0_default_acl;

-- A4c. demonstracao do limite: um GRANT DEFAULT explicito posterior reabre.
--      Rodado em ROLLBACK: nada permanece.
BEGIN;
DO $$
DECLARE v_sql text;
BEGIN
  v_sql := format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO authenticated', current_user);
  EXECUTE v_sql;
  CREATE TABLE public.teste_b0_regressao (x int);
  IF NOT has_table_privilege('authenticated','public.teste_b0_regressao','TRUNCATE') THEN
    RAISE EXCEPTION 'A4c: esperava que o GRANT DEFAULT posterior reintroduzisse TRUNCATE';
  END IF;
  RAISE NOTICE 'A4c: confirmado - GRANT DEFAULT posterior reintroduz TRUNCATE; a protecao do item 5 e de estado, nao de fluxo';
END $$;
ROLLBACK;

DO $$ BEGIN
  IF to_regclass('public.teste_b0_regressao') IS NOT NULL THEN
    RAISE EXCEPTION 'A4c: tabela de demonstracao permaneceu apos o ROLLBACK';
  END IF;
  RAISE NOTICE 'A4c: demonstracao revertida, nenhum objeto remanescente';
END $$;

-- ---------------------------------------------------------------------------
-- A5. Semantica de pg_temp: 'search_path=public' (sem pg_temp explicito)
--     deixa o schema temporario na frente? Isso decide se o valor usado por
--     54 funcoes do esquema-alvo e' seguro para corpos com nomes nao
--     qualificados. Experimento em transacao revertida.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE pedidos (marcador text);
INSERT INTO pedidos VALUES ('TEMP');

SET LOCAL search_path = public;
DO $$
DECLARE v text; v_resultado text;
BEGIN
  BEGIN
    EXECUTE 'SELECT marcador FROM pedidos LIMIT 1' INTO v;
    v_resultado := 'resolveu para o schema TEMPORARIO (valor ' || v || ') - pg_temp vem antes de public';
  EXCEPTION WHEN undefined_column THEN
    v_resultado := 'resolveu para public.pedidos - pg_temp NAO vem antes de public';
  END;
  RAISE NOTICE 'A5: search_path=public -> %', v_resultado;
END $$;

SET LOCAL search_path = public, pg_temp;
DO $$
DECLARE v text; v_resultado text;
BEGIN
  BEGIN
    EXECUTE 'SELECT marcador FROM pedidos LIMIT 1' INTO v;
    v_resultado := 'resolveu para o schema TEMPORARIO';
  EXCEPTION WHEN undefined_column THEN
    v_resultado := 'resolveu para public.pedidos';
  END;
  RAISE NOTICE 'A5: search_path=public, pg_temp -> %', v_resultado;
  IF v_resultado NOT LIKE 'resolveu para public%' THEN
    RAISE EXCEPTION 'A5: pg_temp explicito no fim nao protegeu a resolucao';
  END IF;
END $$;

ROLLBACK;

\echo 'AUDITORIA 05: A1-A4 aprovadas'
