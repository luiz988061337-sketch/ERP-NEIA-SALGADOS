-- ============================================================================
-- TESTE DO COMPLEMENTO B - EXCLUSIVAMENTE NO BANCO LOCAL lfl_partial
-- ============================================================================
-- Executar DEPOIS de 04-complemento-hardening.sql, como postgres.
-- Nao cria dados de negocio: usa apenas linhas de teste com ids fixos e remove
-- tudo no final, exceto o fechamento sintetico que e' desfeito no mesmo bloco.
-- ============================================================================
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN
  RAISE EXCEPTION 'Teste exclusivamente local';
 END IF;
END $local$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 1. Objetos criados pelo complemento
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'contas_fechamento_trg'
                  AND tgrelid = 'public.contas'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'T1: trigger contas_fechamento_trg ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'contas_fechamento_guard') THEN
    RAISE EXCEPTION 'T1: funcao contas_fechamento_guard ausente';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'
       AND indexname IN ('caixa_sessao_aberta_unica','rotas_preparando_motoboy_uniq','notificacoes_log_idem_idx')) <> 3 THEN
    RAISE EXCEPTION 'T1: faltam indices unicos do complemento';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Guarda de mes fechado realmente dispara
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_bloqueou boolean := false; v_competencia text := '2099-12';
BEGIN
  INSERT INTO public.fechamentos_mensais (competencia, status) VALUES (v_competencia, 'fechado');
  BEGIN
    INSERT INTO public.contas (id, tipo, descricao, valor, vencimento)
    VALUES ('a1000000-0000-4000-8000-000000000001', 'pagar', 'teste mes fechado', 1, (v_competencia || '-15')::date);
    RAISE EXCEPTION 'T2: insercao em mes fechado foi aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'mes_fechado:%' THEN RAISE; END IF;
    v_bloqueou := true;
  END;
  IF NOT v_bloqueou THEN RAISE EXCEPTION 'T2: guarda de mes fechado inoperante'; END IF;
  -- Mes aberto continua aceitando lancamento.
  INSERT INTO public.contas (id, tipo, descricao, valor, vencimento)
  VALUES ('a1000000-0000-4000-8000-000000000002', 'pagar', 'teste mes aberto', 1, '2098-01-15');
  -- Limpeza integral da fixture.
  DELETE FROM public.contas WHERE id IN ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002');
  DELETE FROM public.fechamentos_mensais WHERE competencia = v_competencia;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Unicidade dos indices
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ok boolean;
BEGIN
  -- caixa: no maximo uma sessao aberta
  INSERT INTO public.caixa_sessoes (id, status) VALUES ('a2000000-0000-4000-8000-000000000001','aberta');
  BEGIN
    INSERT INTO public.caixa_sessoes (id, status) VALUES ('a2000000-0000-4000-8000-000000000002','aberta');
    RAISE EXCEPTION 'T3: duas sessoes de caixa abertas aceitas';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- notificacoes: idempotencia unica
  INSERT INTO public.notificacoes_log (id, status, canal, resultado, idempotencia)
  VALUES ('a3000000-0000-4000-8000-000000000001','enviado','push','enviado','teste-complemento-1');
  BEGIN
    INSERT INTO public.notificacoes_log (id, status, canal, resultado, idempotencia)
    VALUES ('a3000000-0000-4000-8000-000000000002','enviado','push','enviado','teste-complemento-1');
    RAISE EXCEPTION 'T3: idempotencia duplicada aceita';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- rotas: uma preparando por motoboy
  INSERT INTO public.rotas_entrega (id, motoboy_id, status)
  VALUES ('a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','preparando') ON CONFLICT DO NOTHING;
  BEGIN
    INSERT INTO public.rotas_entrega (id, motoboy_id, status)
    VALUES ('a4000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001','preparando');
    RAISE EXCEPTION 'T3: duas rotas preparando para o mesmo motoboy aceitas';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- limpeza
  DELETE FROM public.caixa_sessoes WHERE id::text LIKE 'a2000000-%';
  DELETE FROM public.notificacoes_log WHERE id::text LIKE 'a3000000-%';
  DELETE FROM public.rotas_entrega WHERE id::text LIKE 'a4000000-%';
  SELECT true INTO v_ok;
END $$;

-- ---------------------------------------------------------------------------
-- 4. ACL das RPCs financeiras
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := '';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text)'),
      ('public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text)'),
      ('public.registrar_pagamento_conta(uuid,bigint,text)'),
      ('public.estornar_pagamento_conta(uuid,bigint,text,text)'),
      ('public.cancelar_conta_financeira(uuid)'),
      ('public.conciliar_extrato_atomico(uuid,text,uuid)'),
      ('public.registrar_movimento_caixa(text,bigint,text)'),
      ('public.registrar_pagamento_pedido(uuid,bigint,text)'),
      ('public.estornar_pagamento_pedido(uuid,bigint,text,text)'),
      ('public.estornar_conta(uuid,text)')
    ) AS t(sig)
  LOOP
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      v_falhas := v_falhas || ' sem_authenticated:' || r.sig;
    END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      v_falhas := v_falhas || ' anon_executa:' || r.sig;
    END IF;
    IF has_function_privilege('service_role', r.sig, 'EXECUTE') THEN
      v_falhas := v_falhas || ' service_role_executa:' || r.sig;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
       'public.registrar_pagamento_pedido_status_ledger()', 'EXECUTE') THEN
    v_falhas := v_falhas || ' ledger_executavel';
  END IF;
  IF v_falhas <> '' THEN RAISE EXCEPTION 'T4:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Menor privilegio nas tabelas
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record;
BEGIN
  FOR r IN
    SELECT t FROM (VALUES ('contas'),('caixa_sessoes'),('contas_bancarias'),('centros_custo'),
      ('plano_contas'),('extratos'),('fechamentos_mensais'),('precificacao_config'),
      ('preco_historico'),('acertos_motoboy'),('funcionarios'),('escalas'),('pontos'),
      ('vales'),('config_entrega')) AS x(t)
  LOOP
    IF has_table_privilege('authenticated', 'public.' || quote_ident(r.t), 'DELETE') THEN
      v_falhas := v_falhas || ' delete:' || r.t;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.plano_contas','INSERT')
     OR has_table_privilege('authenticated','public.plano_contas','UPDATE') THEN
    v_falhas := v_falhas || ' plano_contas_escrita';
  END IF;
  IF has_table_privilege('authenticated','public.centros_custo','INSERT')
     OR has_table_privilege('authenticated','public.centros_custo','UPDATE') THEN
    v_falhas := v_falhas || ' centros_custo_escrita';
  END IF;
  IF v_falhas <> '' THEN RAISE EXCEPTION 'T5:%', v_falhas; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Leitura preservada (nao endurecemos demais)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_falhas text := ''; r record;
BEGIN
  FOR r IN
    SELECT t FROM (VALUES ('contas'),('caixa_sessoes'),('extratos'),('fechamentos_mensais'),
      ('funcionarios'),('pontos'),('vales'),('plano_contas'),('centros_custo'),
      ('contas_bancarias'),('precificacao_config'),('preco_historico'),('acertos_motoboy'),
      ('escalas'),('config_entrega')) AS x(t)
  LOOP
    IF NOT has_table_privilege('authenticated', 'public.' || quote_ident(r.t), 'SELECT') THEN
      v_falhas := v_falhas || ' sem_select:' || r.t;
    END IF;
  END LOOP;
  -- Escritas hoje usadas pelo app continuam concedidas.
  IF NOT has_table_privilege('authenticated','public.contas','INSERT') THEN
    v_falhas := v_falhas || ' contas_insert';
  END IF;
  IF NOT has_table_privilege('authenticated','public.extratos','UPDATE') THEN
    v_falhas := v_falhas || ' extratos_update';
  END IF;
  IF NOT has_table_privilege('authenticated','public.fechamentos_mensais','UPDATE') THEN
    v_falhas := v_falhas || ' fechamentos_update';
  END IF;
  IF v_falhas <> '' THEN RAISE EXCEPTION 'T6:%', v_falhas; END IF;
END $$;

\echo 'COMPLEMENTO B: testes locais aprovados (T1-T6)'
