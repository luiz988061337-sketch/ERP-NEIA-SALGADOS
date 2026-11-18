-- ============================================================================
-- TESTE DO LOTE 05 - EXCLUSIVAMENTE NO BANCO LOCAL lfl_partial
-- ============================================================================
-- Executar DEPOIS de 05-correcoes-b0-seguranca.sql, como postgres.
-- Nao cria dados de negocio: usa uma fixture com nome fixo em parceiros e a
-- remove no mesmo bloco. processar_lembretes e' executada dentro de BEGIN/ROLLBACK.
-- Cada bloco U* aborta com mensagem propria.
-- ============================================================================
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN
  RAISE EXCEPTION 'Teste exclusivamente local';
 END IF;
END $local$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- U1. parceiros: fim da escrita/leitura publica irrestrita (item 1)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bloqueou boolean := false;
  v_ok       boolean := false;
  v_erro     text;
  v_n        int;
  v_nome     text := 'fixture-b0-parceiro';
BEGIN
  -- 1a. policies permissivas removidas
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
              AND policyname IN ('parceiros write','parceiros read')) THEN
    RAISE EXCEPTION 'U1: policy permissiva de parceiros ainda presente';
  END IF;

  -- 1b. exatamente uma policy de INSERT (a candidatura) e uma de SELECT admin
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='parceiros' AND cmd='INSERT';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'U1: parceiros com % policies de INSERT (esperado 1: candidatura)', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
                  AND policyname='parceiros candidatura' AND cmd='INSERT') THEN
    RAISE EXCEPTION 'U1: policy candidatura ausente; fluxo publico legitimo perdido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
                  AND policyname='parceiros admin read' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'U1: admin perdeu leitura de parceiros';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='parceiros'
                  AND policyname='parceiros admin write' AND cmd='ALL') THEN
    RAISE EXCEPTION 'U1: admin sem escrita administrativa em parceiros';
  END IF;

  -- 1c. anon nao se auto-aprova (era o que WITH CHECK (true) permitia)
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    INSERT INTO public.parceiros (nome, categoria, status)
    VALUES (v_nome, 'teste-b0', 'aprovada');
  EXCEPTION WHEN insufficient_privilege THEN
    v_bloqueou := true;
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
  END;
  EXECUTE 'RESET ROLE';
  DELETE FROM public.parceiros WHERE nome = v_nome;
  IF NOT v_bloqueou THEN
    RAISE EXCEPTION 'U1: anon inseriu parceiro com status=aprovada';
  END IF;
  RAISE NOTICE 'U1: auto-aprovacao anonima bloqueada (%)', v_erro;

  -- 1d. candidatura publica legitima continua aceita
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    INSERT INTO public.parceiros (nome, categoria) VALUES (v_nome, 'teste-b0');
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := false;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT v_ok THEN
    RAISE EXCEPTION 'U1: candidatura publica legitima foi bloqueada';
  END IF;

  -- 1e. anon nao le mais a tabela (PII de candidaturas)
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO v_n FROM public.parceiros;
  EXCEPTION WHEN insufficient_privilege THEN
    v_n := -1;
  END;
  EXECUTE 'RESET ROLE';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'U1: anon leu % linha(s) de parceiros pela tabela', v_n;
  END IF;

  -- 1f. a view publica continua acessivel para anon
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT count(*) INTO v_n FROM public.parceiros_publicos;
  EXCEPTION WHEN insufficient_privilege THEN
    v_n := -1;
  END;
  EXECUTE 'RESET ROLE';
  IF v_n < 0 THEN
    RAISE EXCEPTION 'U1: anon perdeu acesso a view parceiros_publicos';
  END IF;

  DELETE FROM public.parceiros WHERE nome = v_nome;
END $$;

-- ---------------------------------------------------------------------------
-- U2. Matriz de EXECUTE (item 3)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record;
BEGIN
  -- 2a. somente o dono: sem chamador no app
  FOR r IN SELECT * FROM (VALUES
    ('public.consumir_insumos_pedido_trigger()'),
    ('public.handle_new_user()'),
    ('public.pedidos_guard_update()'),
    ('public.profiles_guard_pontos()'),
    ('public.profiles_guard_pontos_insert()'),
    ('public.trg_gerar_cupom_apos_itens()'),
    ('public.trg_pagamento_confirmado()'),
    ('public.trigger_criar_fritura_fila()'),
    ('public.trigger_entrega_motoboy()'),
    ('public.trigger_reservar_estoque()'),
    ('public.trigger_saida_motoboy()'),
    ('public.validar_dados_fiscais_emissao()'),
    ('public.validar_endereco_entrega()'),
    ('public.validar_transicao_status()'),
    ('public.processar_lembretes()'),
    ('public.calcular_tempo_fritura(uuid,integer)'),
    ('public.gerar_msg_apartamento(uuid)'),
    ('public.liberar_reserva_pedido(uuid)'),
    ('public.reservar_estoque_pedido(uuid)'),
    ('public.registrar_mov_estoque(uuid,public.tipo_mov_estoque,integer,uuid,uuid,text,uuid,text)'),
    ('public.registrar_mov_estoque(uuid,public.tipo_mov_estoque,integer,uuid,uuid,text,uuid,text,boolean)')
  ) t(sig) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE')          THEN v_falhas := v_falhas || ' anon:'  || r.sig; END IF;
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN v_falhas := v_falhas || ' auth:'  || r.sig; END IF;
    IF has_function_privilege('service_role', r.sig, 'EXECUTE')  THEN v_falhas := v_falhas || ' svc:'   || r.sig; END IF;
  END LOOP;

  -- 2b. somente authenticated
  FOR r IN SELECT * FROM (VALUES
    ('public.receber_compra_item(uuid,numeric,text,date)'),
    ('public.gerar_cupons_pedidos_pagos()'),
    ('public.consumir_insumos_pedido(uuid)'),
    ('public.converter_unidade(numeric,text,text)')
  ) t(sig) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN CONTINUE; END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN v_falhas := v_falhas || ' anon!:' || r.sig; END IF;
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN v_falhas := v_falhas || ' sem_auth:' || r.sig; END IF;
  END LOOP;

  -- 2c. enfileirar_cupom: authenticated + service_role, sem anon
  IF to_regprocedure('public.enfileirar_cupom(uuid)') IS NOT NULL THEN
    IF has_function_privilege('anon','public.enfileirar_cupom(uuid)','EXECUTE') THEN
      v_falhas := v_falhas || ' anon:enfileirar_cupom';
    END IF;
    IF NOT has_function_privilege('authenticated','public.enfileirar_cupom(uuid)','EXECUTE') THEN
      v_falhas := v_falhas || ' sem_auth:enfileirar_cupom';
    END IF;
    IF NOT has_function_privilege('service_role','public.enfileirar_cupom(uuid)','EXECUTE') THEN
      v_falhas := v_falhas || ' sem_svc:enfileirar_cupom';
    END IF;
  END IF;

  -- 2d. excecao consciente: has_role continua anon (as policies a invocam)
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NOT NULL THEN
    IF NOT has_function_privilege('anon','public.has_role(uuid,public.app_role)','EXECUTE') THEN
      v_falhas := v_falhas || ' has_role_sem_anon';
    END IF;
    IF NOT has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE') THEN
      v_falhas := v_falhas || ' has_role_sem_auth';
    END IF;
  END IF;

  IF v_falhas <> '' THEN RAISE EXCEPTION 'U2:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U3. search_path fixo nas tres funcoes (item 2)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record; v_cfg text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.processar_lembretes()'),
    ('public.reservar_estoque_atomica(uuid,uuid,integer)'),
    ('public.liberar_reserva_atomica(uuid)')
  ) t(sig) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN CONTINUE; END IF;
    SELECT coalesce(array_to_string(p.proconfig,','),'') INTO v_cfg
      FROM pg_proc p WHERE p.oid = to_regprocedure(r.sig);
    IF v_cfg NOT LIKE '%search_path=%' THEN
      v_falhas := v_falhas || ' sem_search_path:' || r.sig;
    ELSIF v_cfg NOT LIKE '%pg_temp%' THEN
      v_falhas := v_falhas || ' pg_temp_implicito:' || r.sig;
    ELSIF position('pg_temp' in v_cfg) < position('public' in v_cfg) THEN
      v_falhas := v_falhas || ' pg_temp_antes_de_public:' || r.sig;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(r.sig)) THEN
      v_falhas := v_falhas || ' nao_e_security_definer:' || r.sig;
    END IF;
  END LOOP;
  IF v_falhas <> '' THEN RAISE EXCEPTION 'U3:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U4. processar_lembretes: corpo intacto, dono (cron) executa, e a funcao
--     REALMENTE executa com o search_path fixado. A execucao ocorre dentro de
--     uma transacao revertida: nada permanece no banco.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_owner text; v_src text;
BEGIN
  IF to_regprocedure('public.processar_lembretes()') IS NULL THEN
    RAISE NOTICE 'U4: processar_lembretes() ausente neste banco - nao aplicavel';
    RETURN;
  END IF;
  SELECT pg_get_userbyid(p.proowner), p.prosrc INTO v_owner, v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.processar_lembretes()');

  IF v_src NOT LIKE '%pedido_lembretes%' OR v_src NOT LIKE '%pedidos%' THEN
    RAISE EXCEPTION 'U4: corpo de processar_lembretes foi alterado';
  END IF;
  IF NOT has_function_privilege(v_owner, 'public.processar_lembretes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'U4: dono/cron perdeu EXECUTE em processar_lembretes';
  END IF;
  RAISE NOTICE 'U4: processar_lembretes intacto; dono (%) mantem EXECUTE', v_owner;
END $$;

-- execucao real, revertida: prova que a resolucao de nomes ainda funciona
BEGIN;
DO $$
DECLARE v_n bigint;
BEGIN
  BEGIN
    SELECT count(*) INTO v_n FROM public.processar_lembretes();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'U4b: processar_lembretes falhou ao executar com search_path fixado: % (%)', SQLERRM, SQLSTATE;
  END;
  RAISE NOTICE 'U4b: processar_lembretes executou (%, linhas) e sera revertido', v_n;
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- U5. staff ALL substituida por leitura/escrita minimas (item 6)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record; v_qual text; v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('compra_itens','compra_itens staff','compra_itens read','compra_itens write'),
    ('compras','compras staff','compras read','compras write'),
    ('ficha_itens','ficha_itens staff','ficha_itens read','ficha_itens write'),
    ('fichas_tecnicas','fichas staff','fichas read','fichas write'),
    ('fornecedores','fornecedores staff','fornecedores read','fornecedores write'),
    ('insumo_lotes','insumo_lotes staff','insumo_lotes read','insumo_lotes write'),
    ('insumos','insumos staff','insumos read','insumos write')
  ) t(tab, antiga, leitura, escrita) LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tab
                AND policyname=r.antiga) THEN
      v_falhas := v_falhas || ' antiga_presente:' || r.antiga;
    END IF;

    -- Nenhuma policy capaz de escrever pode citar 'producao' (regra do item 6).
    -- A policy "write" do alvo e' FOR ALL (inclui DELETE), portanto cmd='ALL'
    -- aqui e' o esperado, nao uma falha.
    SELECT count(*) INTO v_n FROM pg_policies
     WHERE schemaname='public' AND tablename=r.tab
       AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
       AND (coalesce(qual,'') LIKE '%producao%' OR coalesce(with_check,'') LIKE '%producao%');
    IF v_n > 0 THEN v_falhas := v_falhas || ' escrita_com_producao:' || r.tab; END IF;
    IF r.tab <> 'insumos' THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tab
                      AND policyname=r.escrita AND cmd='ALL') THEN
        v_falhas := v_falhas || ' escrita_nao_e_ALL:' || r.escrita;
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tab
                    AND policyname=r.leitura AND cmd='SELECT') THEN
      v_falhas := v_falhas || ' sem_leitura:' || r.leitura;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.tab
                    AND policyname=r.escrita) THEN
      v_falhas := v_falhas || ' sem_escrita:' || r.escrita;
    END IF;

    SELECT qual INTO v_qual FROM pg_policies WHERE schemaname='public' AND tablename=r.tab
      AND policyname=r.leitura;
    IF v_qual IS NULL OR position('producao' in v_qual) = 0 THEN
      v_falhas := v_falhas || ' leitura_sem_producao:' || r.leitura;
    END IF;

    SELECT coalesce(qual,'') || '|' || coalesce(with_check,'') INTO v_qual
      FROM pg_policies WHERE schemaname='public' AND tablename=r.tab AND policyname=r.escrita;
    IF position('producao' in v_qual) > 0 THEN
      v_falhas := v_falhas || ' escrita_ainda_com_producao:' || r.escrita;
    END IF;
    IF position('admin' in v_qual) = 0 OR position('financeiro' in v_qual) = 0 THEN
      v_falhas := v_falhas || ' escrita_sem_admin_financeiro:' || r.escrita;
    END IF;
  END LOOP;

  -- insumos: operacoes separadas, como no alvo
  FOR r IN SELECT * FROM (VALUES ('insumos write','INSERT'),('insumos update','UPDATE'),('insumos delete','DELETE')) t(pol,cmd) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='insumos'
                    AND policyname=r.pol AND cmd=r.cmd) THEN
      v_falhas := v_falhas || ' insumos:' || r.pol || '/' || r.cmd;
    END IF;
  END LOOP;

  IF v_falhas <> '' THEN RAISE EXCEPTION 'U5:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U6. TRUNCATE, REFERENCES, TRIGGER e MAINTAIN revogados (item 5)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (
         has_table_privilege('anon', c.oid, 'TRUNCATE')
      OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      OR has_table_privilege('anon', c.oid, 'REFERENCES')
      OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
      OR has_table_privilege('anon', c.oid, 'TRIGGER')
      OR has_table_privilege('authenticated', c.oid, 'TRIGGER'));
  IF v_n > 0 THEN RAISE EXCEPTION 'U6: % tabela(s) ainda com TRUNCATE/REFERENCES/TRIGGER', v_n; END IF;

  IF current_setting('server_version_num')::int >= 170000 THEN
    SELECT count(*) INTO v_n
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND (has_table_privilege('anon', c.oid, 'MAINTAIN')
         OR has_table_privilege('authenticated', c.oid, 'MAINTAIN'));
    IF v_n > 0 THEN RAISE EXCEPTION 'U6: % tabela(s) ainda com MAINTAIN', v_n; END IF;
  END IF;

  -- default privileges: nenhum papel deve recriar esses privilegios
  SELECT count(*) INTO v_n FROM pg_default_acl d
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclobjtype='r' AND a.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated'))
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
     AND d.defaclnamespace = 'public'::regnamespace;
  IF v_n > 0 THEN RAISE EXCEPTION 'U6: % default privilege(s) de escrita estrutural remanescente(s)', v_n; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U7. Fluxos legitimos preservados e nenhuma regressao do 04
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record; v_n int;
BEGIN
  -- 7a. DML continua concedido nas 7 tabelas (o que muda e' a policy, nao o grant)
  FOR r IN SELECT * FROM (VALUES
    ('compra_itens'),('compras'),('ficha_itens'),('fichas_tecnicas'),
    ('fornecedores'),('insumo_lotes'),('insumos')
  ) t(tab) LOOP
    IF NOT has_table_privilege('authenticated','public.'||quote_ident(r.tab),'SELECT') THEN
      v_falhas := v_falhas || ' sem_select:' || r.tab;
    END IF;
    IF NOT has_table_privilege('authenticated','public.'||quote_ident(r.tab),'INSERT') THEN
      v_falhas := v_falhas || ' sem_insert:' || r.tab;
    END IF;
    IF NOT has_table_privilege('authenticated','public.'||quote_ident(r.tab),'UPDATE') THEN
      v_falhas := v_falhas || ' sem_update:' || r.tab;
    END IF;
    -- regime de DELETE do alvo preservado (a policy write e' FOR ALL)
    IF NOT has_table_privilege('authenticated','public.'||quote_ident(r.tab),'DELETE') THEN
      v_falhas := v_falhas || ' delete_perdido:' || r.tab;
    END IF;
  END LOOP;

  -- 7b. RLS continua ligada em toda tabela de public
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF v_n > 0 THEN v_falhas := v_falhas || ' tabelas_sem_rls:' || v_n; END IF;

  -- 7c. invariantes do 04 (financeiro) inalteradas
  SELECT count(*) INTO v_n FROM (VALUES ('contas'),('caixa_sessoes'),('contas_bancarias'),('centros_custo'),
      ('plano_contas'),('extratos'),('fechamentos_mensais'),('precificacao_config'),('preco_historico'),
      ('acertos_motoboy'),('funcionarios'),('escalas'),('pontos'),('vales'),('config_entrega')) t(n)
   WHERE has_table_privilege('authenticated','public.'||quote_ident(t.n),'DELETE');
  IF v_n <> 0 THEN v_falhas := v_falhas || ' delete_financeiro:' || v_n; END IF;

  SELECT count(*) INTO v_n FROM (VALUES ('contas'),('caixa_sessoes'),('contas_bancarias'),('centros_custo'),
      ('plano_contas'),('extratos'),('fechamentos_mensais'),('precificacao_config'),('preco_historico'),
      ('acertos_motoboy'),('funcionarios'),('escalas'),('pontos'),('vales'),('config_entrega')) t(n)
   WHERE has_table_privilege('authenticated','public.'||quote_ident(t.n),'SELECT');
  IF v_n <> 15 THEN v_falhas := v_falhas || ' select_financeiro:' || v_n; END IF;

  SELECT count(*) INTO v_n FROM (VALUES
     ('public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text)'),
     ('public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text)'),
     ('public.registrar_pagamento_conta(uuid,bigint,text)'),
     ('public.estornar_pagamento_conta(uuid,bigint,text,text)'),
     ('public.cancelar_conta_financeira(uuid)'),
     ('public.conciliar_extrato_atomico(uuid,text,uuid)'),
     ('public.registrar_movimento_caixa(text,bigint,text)'),
     ('public.registrar_pagamento_pedido(uuid,bigint,text)'),
     ('public.estornar_pagamento_pedido(uuid,bigint,text,text)'),
     ('public.estornar_conta(uuid,text)')) t(sig)
   WHERE has_function_privilege('anon', t.sig, 'EXECUTE');
  IF v_n <> 0 THEN v_falhas := v_falhas || ' rpc_financeira_anon:' || v_n; END IF;

  IF v_falhas <> '' THEN RAISE EXCEPTION 'U7:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U8. Item 4 e' somente analise: o lote nao contem GRANT para as duas funcoes
--     de reserva, e a prova de que o ACL nao mudou e' medida pelo driver
--     (comparacao antes/depois). Aqui registra-se o estado e o motivo tecnico.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_acl text; v_guarda boolean;
BEGIN
  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NULL THEN
    RAISE NOTICE 'U8: reservar_estoque_atomica ausente neste banco - nao aplicavel';
    RETURN;
  END IF;

  v_acl := concat_ws(', ',
    CASE WHEN has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE')
         THEN 'authenticated:reservar' END,
    CASE WHEN has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE')
         THEN 'authenticated:liberar' END,
    CASE WHEN has_function_privilege('anon','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE')
         THEN 'anon:reservar' END,
    CASE WHEN has_function_privilege('anon','public.liberar_reserva_atomica(uuid)','EXECUTE')
         THEN 'anon:liberar' END);
  IF coalesce(v_acl,'') = '' THEN v_acl := 'nenhum'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc
                  WHERE oid = to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)')
                    AND prosrc LIKE '%auth.uid()%') INTO v_guarda;

  RAISE NOTICE 'U8: ACL de reserva (%) / guarda de dono auth.uid()=%', v_acl, v_guarda;
  IF NOT v_guarda THEN
    RAISE NOTICE 'U8/F2: corpo NAO tem guarda de dono; conceder authenticated permitiria reservar/liberar estoque de pedidos alheios - item 4 mantido fora do lote';
  ELSE
    RAISE NOTICE 'U8/F2: corpo tem guarda de dono; a concessao depende de autorizacao expressa (item 4)';
  END IF;

  -- anon em funcao que mexe em estoque e' inaceitavel em qualquer cenario
  IF has_function_privilege('anon','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE')
  OR has_function_privilege('anon','public.liberar_reserva_atomica(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'U8: anon com EXECUTE em funcao de reserva de estoque';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- U9. Invariante global: nenhuma policy de escrita sem expressao
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ruins text;
BEGIN
  SELECT string_agg(tablename||'.'||policyname||':'||cmd, ', ') INTO v_ruins
    FROM pg_policies
   WHERE schemaname='public'
     AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
     AND (qual = 'true' OR with_check = 'true');
  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'U9: policy de escrita sem expressao: %', v_ruins;
  END IF;
END $$;

\echo 'LOTE 05: testes locais aprovados (U1-U9)'
