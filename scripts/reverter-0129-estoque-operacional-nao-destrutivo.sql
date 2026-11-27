-- REVERSÃO NÃO DESTRUTIVA DA 0129 — SOMENTE HOMOLOGAÇÃO AUTORIZADA — NÃO APLICADA.
-- Preparada em 27/11/2026. Exige autorização expressa e destino declarado
-- --project-ref lflzlcqinarrcgncafol, pela barreira `npm run sql:homolog`.
-- NUNCA transferir para produção.
--
-- Esta NÃO é uma reversão DDL completa. Ela desativa o módulo sem apagar nada:
--   * força modo `monitoramento`, `habilitado = false` e proteções essenciais;
--   * revoga SELECT de `authenticated` nas tabelas/views criadas pela 0129;
--   * revoga EXECUTE de `authenticated` nas RPCs criadas/concedidas pela 0129;
--   * preserva pedidos, reservas, lotes, compromissos, movimentações, solicitações,
--     autorizações, bloqueios, configurações, views, funções, policies, RLS e o
--     histórico `20261126190000`.
--
-- Não há DELETE, DROP, TRUNCATE, ALTER TABLE DROP COLUMN, remoção de enum,
-- remoção de policy, alteração DDL destrutiva nem alteração de dados operacionais.
-- O label `caixa` do enum `app_role`, colunas, constraints, índices e tabelas
-- permanecem instalados, porém inertes para o transporte `authenticated`.
--
-- Pré-requisito: reverter a 0133 antes desta reversão, se ela tiver sido aplicada.
-- Idempotente: a segunda execução mantém o mesmo estado e registra nova auditoria.
-- Se a versão ou qualquer objeto esperado estiver ausente, aborta antes de agir.

BEGIN;

DO $pre$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261126190000'
  ) THEN
    RAISE EXCEPTION 'reversao 0129: versao 20261126190000 ausente no historico';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'reversao 0129: papel authenticated ausente';
  END IF;

  IF to_regclass('public.salgados_operacao_config') IS NULL THEN
    RAISE EXCEPTION 'reversao 0129: tabela de configuracao operacional ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.salgados_operacao_config WHERE id IS TRUE
  ) THEN
    RAISE EXCEPTION 'reversao 0129: linha unica de configuracao operacional ausente';
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
      RAISE EXCEPTION 'reversao 0129: objeto ausente: %', t;
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
    'public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)'
  ]::text[] LOOP
    IF to_regprocedure(t) IS NULL THEN
      RAISE EXCEPTION 'reversao 0129: assinatura ausente: %', t;
    END IF;
  END LOOP;
END
$pre$;

-- Neutralização funcional: volta ao modo padrão aprovado, sem tocar em dados.
UPDATE public.salgados_operacao_config
   SET modo = 'monitoramento',
       habilitado = false,
       protecoes_essenciais = true,
       atualizado_por = coalesce(auth.uid(), atualizado_por),
       atualizado_em = now()
 WHERE id IS TRUE;

INSERT INTO public.admin_logs (actor, acao, detalhe)
VALUES (
  auth.uid(),
  'estoque_0129_reversao_nao_destrutiva',
  jsonb_build_object(
    'modo', 'monitoramento',
    'habilitado', false,
    'dados_preservados', true,
    'historico_preservado', '20261126190000'
  )::text
);

-- Remove somente o acesso de transporte concedido pela 0129. RLS, policies e
-- objetos permanecem intactos para futura reativação coordenada.
DO $acl$
DECLARE
  t text;
BEGIN
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
    EXECUTE format('REVOKE ALL ON TABLE %s FROM authenticated', t);
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
    'public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)'
  ]::text[] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', t);
  END LOOP;
END
$acl$;

DO $post$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.salgados_operacao_config
    WHERE id IS TRUE
      AND modo = 'monitoramento'
      AND habilitado IS FALSE
      AND protecoes_essenciais IS TRUE
  ) THEN
    RAISE EXCEPTION 'reversao 0129: configuracao operacional nao neutralizada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261126190000'
  ) THEN
    RAISE EXCEPTION 'reversao 0129: historico da migration foi alterado';
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
    IF has_table_privilege('authenticated', t, 'SELECT') THEN
      RAISE EXCEPTION 'reversao 0129: authenticated ainda le %', t;
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
    'public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)'
  ]::text[] LOOP
    IF has_function_privilege('authenticated', t, 'EXECUTE') THEN
      RAISE EXCEPTION 'reversao 0129: authenticated ainda executa %', t;
    END IF;
  END LOOP;
END
$post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
