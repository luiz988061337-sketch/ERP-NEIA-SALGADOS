-- Verificação do ensaio local das reversões 0129/0133.
-- Somente cluster PostgreSQL 17 descartável. Nunca aplicar em homologação.
-- Confirma: dados preservados, modo neutralizado, ACL desativada, histórico e
-- objetos mantidos. Não repete os testes funcionais já aprovados.
BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  t text;
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261126190000', '20261127230000')
    GROUP BY version HAVING count(*) = 1
  ) THEN
    RAISE EXCEPTION 'histórico das migrations não preservado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.salgados_operacao_config
    WHERE id IS TRUE AND modo = 'monitoramento'
      AND habilitado IS FALSE AND protecoes_essenciais IS TRUE
  ) THEN
    RAISE EXCEPTION 'modo operacional não foi neutralizado';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'public.sabores_estoque_vinculos',
    'public.sabores_estoque_config',
    'public.salgados_operacao_config',
    'public.salgados_bloqueios',
    'public.salgados_solicitacoes',
    'public.salgados_autorizacoes',
    'public.salgados_compromissos',
    'public.salgados_compromisso_coberturas',
    'public.vw_saldos_sabores_estoque',
    'public.vw_salgados_notificacoes_atendente'
  ]::text[] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE EXCEPTION 'objeto removido pela reversão: %', t;
    END IF;
    IF has_table_privilege('authenticated', t, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated ainda lê %', t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'public.salgados_pode_consultar()',
    'public.salgados_eh_responsavel()',
    'public.configurar_salgado_estoque(text,integer,integer,boolean,text)',
    'public.configurar_modo_salgados(text,boolean)',
    'public.consultar_estoque_dia_salgados(date)',
    'public.avaliar_venda_salgado(text,integer,date,uuid)',
    'public.avaliar_preparo_salgado(text,integer,uuid,date)',
    'public.reservar_sabor_estoque(text,integer,uuid,uuid,date)',
    'public.liberar_reserva_sabor(uuid,text,uuid)',
    'public.solicitar_salgado(text,text,integer,text,uuid,date,uuid)',
    'public.responder_solicitacao_salgado(uuid,text,integer,integer,text,timestamptz,uuid)',
    'public.reconhecer_resposta_salgado(uuid)',
    'public.usar_autorizacao_salgado(uuid,uuid,integer)',
    'public.bloquear_sabor_salgados(text,date,date,text)',
    'public.desbloquear_sabor_salgados(uuid,text)',
    'public.registrar_compromisso_salgado(text,integer,date,uuid,uuid)',
    'public.cobrir_compromissos_salgados(uuid,uuid)',
    'public.vincular_sabor_estoque_produto(text,uuid,integer,text,text,boolean)',
    'public.desvincular_sabor_estoque_produto(text,uuid,text)',
    'public.registrar_movimento_sabor(text,uuid,text,integer,uuid,text)',
    'public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)',
    'public.reservar_estoque_atomica(uuid,uuid,integer)',
    'public.reservar_pedido_atomico(uuid)'
  ]::text[] LOOP
    IF to_regprocedure(t) IS NULL THEN
      RAISE EXCEPTION 'função removida pela reversão: %', t;
    END IF;
    IF has_function_privilege('authenticated', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated ainda executa %', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM public.pedidos;
  IF v_count < 4 THEN RAISE EXCEPTION 'pedidos foram removidos'; END IF;

  SELECT count(*) INTO v_count FROM public.lotes WHERE codigo = 'REV-TESTE-COXINHA';
  IF v_count < 1 THEN RAISE EXCEPTION 'lote marcador foi removido'; END IF;

  SELECT count(*) INTO v_count FROM public.reservas_estoque
  WHERE chave_idempotencia = md5('reversao:reserva:coxinha')::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'reserva marcador foi removida ou duplicada'; END IF;

  SELECT count(*) INTO v_count FROM public.salgados_compromissos
  WHERE chave_idempotencia = md5('reversao:compromisso:pizza')::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'compromisso marcador foi removido ou duplicado'; END IF;

  SELECT count(*) INTO v_count FROM public.salgados_solicitacoes
  WHERE chave_idempotencia = md5('reversao:solicitacao:trouxinha')::uuid;
  IF v_count <> 1 THEN RAISE EXCEPTION 'solicitação marcador foi removida ou duplicada'; END IF;

  SELECT count(*) INTO v_count FROM public.salgados_bloqueios
  WHERE chave = 'kibe' AND ativo;
  IF v_count < 1 THEN RAISE EXCEPTION 'bloqueio marcador foi removido'; END IF;

  SELECT count(*) INTO v_count FROM public.estoque_movimentacoes
  WHERE sabor_chave = 'coxinha-frango';
  IF v_count < 1 THEN RAISE EXCEPTION 'movimentações foram removidas'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'caixa'
  ) THEN
    RAISE EXCEPTION 'enum app_role foi alterado destrutivamente';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'salgados_%'
      AND c.relkind = 'r' AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS das tabelas operacionais foi desativado';
  END IF;
END $$;

SELECT jsonb_pretty(jsonb_build_object(
  'resultado', 'reversao_nao_destrutiva_ok',
  'modo', (SELECT modo FROM public.salgados_operacao_config WHERE id IS TRUE),
  'habilitado', (SELECT habilitado FROM public.salgados_operacao_config WHERE id IS TRUE),
  'pedidos', (SELECT count(*) FROM public.pedidos),
  'lotes_marcador', (SELECT count(*) FROM public.lotes WHERE codigo = 'REV-TESTE-COXINHA'),
  'reservas_marcador', (SELECT count(*) FROM public.reservas_estoque WHERE chave_idempotencia = md5('reversao:reserva:coxinha')::uuid),
  'compromissos_marcador', (SELECT count(*) FROM public.salgados_compromissos WHERE chave_idempotencia = md5('reversao:compromisso:pizza')::uuid),
  'historico', (SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb)
                FROM supabase_migrations.schema_migrations
                WHERE version IN ('20261126190000', '20261127230000'))
)) AS relatorio;

ROLLBACK;
