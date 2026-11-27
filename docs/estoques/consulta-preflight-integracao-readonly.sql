-- Consulta SOMENTE LEITURA do preflight de integração das migrations
-- 0129 (OpenCode), 0130–0132 (Codex) e 0133 (OpenCode).
-- Destino obrigatório e explícito: --project-ref lflzlcqinarrcgncafol.
--
-- Pode ser executada ANTES ou DEPOIS das migrations: só consulta catálogo,
-- `to_regclass`/`to_regprocedure` e `supabase_migrations`. Nenhum
-- INSERT/UPDATE/DELETE/DDL/GRANT. Nenhuma conexão foi aberta ao preparar este
-- arquivo. Um único SELECT final para o CLI devolver o resultado completo.
BEGIN TRANSACTION READ ONLY;

WITH versoes AS (
  SELECT v.version, v.name
  FROM supabase_migrations.schema_migrations v
  WHERE v.version IN (
    '20261126170000', -- base local até 0128
    '20261126190000', -- 0129 revisada (OpenCode)
    '20261127120000', -- 0130 Central da Atendente (Codex)
    '20261127120001', -- 0131 Central da Atendente (Codex)
    '20261127120002', -- 0132 Central da Atendente (Codex)
    '20261127230000'  -- 0133 ACL de reserva (OpenCode)
  )
  ORDER BY v.version
),
objetos AS (
  SELECT '0129:vw_saldos_sabores_estoque' AS nome,
         to_regclass('public.vw_saldos_sabores_estoque')::text AS valor
  UNION ALL SELECT '0129:vw_salgados_notificacoes_atendente',
         to_regclass('public.vw_salgados_notificacoes_atendente')::text
  UNION ALL SELECT '0129:sabores_estoque_vinculos',
         to_regclass('public.sabores_estoque_vinculos')::text
  UNION ALL SELECT '0129:sabores_estoque_config',
         to_regclass('public.sabores_estoque_config')::text
  UNION ALL SELECT '0129:salgados_operacao_config',
         to_regclass('public.salgados_operacao_config')::text
  UNION ALL SELECT '0129:salgados_bloqueios',
         to_regclass('public.salgados_bloqueios')::text
  UNION ALL SELECT '0129:salgados_solicitacoes',
         to_regclass('public.salgados_solicitacoes')::text
  UNION ALL SELECT '0129:salgados_autorizacoes',
         to_regclass('public.salgados_autorizacoes')::text
  UNION ALL SELECT '0129:salgados_compromissos',
         to_regclass('public.salgados_compromissos')::text
  UNION ALL SELECT '0129:salgados_compromisso_coberturas',
         to_regclass('public.salgados_compromisso_coberturas')::text
  UNION ALL SELECT '0129:estoque_mov_operacoes',
         to_regclass('public.estoque_mov_operacoes')::text
  UNION ALL SELECT '0129:consultar_estoque_dia_salgados(date)',
         to_regprocedure('public.consultar_estoque_dia_salgados(date)')::text
  UNION ALL SELECT '0129:avaliar_venda_salgado(text,integer,date,uuid)',
         to_regprocedure('public.avaliar_venda_salgado(text,integer,date,uuid)')::text
  UNION ALL SELECT '0129:avaliar_preparo_salgado(text,integer,uuid,date)',
         to_regprocedure('public.avaliar_preparo_salgado(text,integer,uuid,date)')::text
  UNION ALL SELECT '0129:reservar_sabor_estoque(text,integer,uuid,uuid,date)',
         to_regprocedure('public.reservar_sabor_estoque(text,integer,uuid,uuid,date)')::text
  UNION ALL SELECT '0129:liberar_reserva_sabor(uuid,text,uuid)',
         to_regprocedure('public.liberar_reserva_sabor(uuid,text,uuid)')::text
  UNION ALL SELECT '0129:solicitar_salgado(text,text,integer,text,uuid,date,uuid)',
         to_regprocedure('public.solicitar_salgado(text,text,integer,text,uuid,date,uuid)')::text
  UNION ALL SELECT '0129:responder_solicitacao_salgado(uuid,text,integer,integer,text,timestamptz,uuid)',
         to_regprocedure('public.responder_solicitacao_salgado(uuid,text,integer,integer,text,timestamptz,uuid)')::text
  UNION ALL SELECT '0129:reconhecer_resposta_salgado(uuid)',
         to_regprocedure('public.reconhecer_resposta_salgado(uuid)')::text
  UNION ALL SELECT '0129:usar_autorizacao_salgado(uuid,uuid,integer,uuid)',
         to_regprocedure('public.usar_autorizacao_salgado(uuid,uuid,integer,uuid)')::text
  UNION ALL SELECT '0129:bloquear_sabor_salgados(text,date,date,text)',
         to_regprocedure('public.bloquear_sabor_salgados(text,date,date,text)')::text
  UNION ALL SELECT '0129:desbloquear_sabor_salgados(uuid,text)',
         to_regprocedure('public.desbloquear_sabor_salgados(uuid,text)')::text
  UNION ALL SELECT '0129:registrar_compromisso_salgado(text,integer,date,uuid,uuid)',
         to_regprocedure('public.registrar_compromisso_salgado(text,integer,date,uuid,uuid)')::text
  UNION ALL SELECT '0129:cobrir_compromissos_salgados(uuid,uuid)',
         to_regprocedure('public.cobrir_compromissos_salgados(uuid,uuid)')::text
  UNION ALL SELECT '0129:movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)',
         to_regprocedure('public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid)')::text
  UNION ALL SELECT '0131:realtime.messages',
         to_regclass('realtime.messages')::text
  UNION ALL SELECT '0132:pedidos.prazo_prometido_inicio_em',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'pedidos'
             AND column_name = 'prazo_prometido_inicio_em'
         ) THEN 'presente' ELSE 'ausente' END
  UNION ALL SELECT '0132:pedidos.prazo_prometido_em',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'pedidos'
             AND column_name = 'prazo_prometido_em'
         ) THEN 'presente' ELSE 'ausente' END
  ORDER BY nome
),
acls AS (
  SELECT p.proname AS nome,
         p.oid::regprocedure::text AS assinatura,
         g.grantee::regrole::text AS concedido_a,
         g.privilege_type AS permissao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) g
  WHERE n.nspname = 'public'
    AND p.oid IN (
      to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      to_regprocedure('public.reservar_pedido_atomico(uuid)')
    )
  UNION ALL
  SELECT p.proname, p.oid::regprocedure::text, 'PUBLIC (padrão)', 'EXECUTE'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proacl IS NULL
    AND p.oid IN (
      to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      to_regprocedure('public.reservar_pedido_atomico(uuid)')
    )
  ORDER BY nome, assinatura, concedido_a
),
permissoes AS (
  SELECT p.proname AS nome,
         p.oid::regprocedure::text AS assinatura,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid IN (
      to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)'),
      to_regprocedure('public.reservar_pedido_atomico(uuid)')
    )
  ORDER BY nome, assinatura
)
SELECT jsonb_pretty(jsonb_build_object(
  'versoes', (SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) FROM versoes v),
  'objetos', (SELECT coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) FROM objetos o),
  'acls', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM acls a),
  'permissoes', (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM permissoes p)
)) AS relatorio;

ROLLBACK;
