-- SOMENTE LEITURA. Nenhuma escrita, migration ou reaplicação.
-- Inventário de homologação para decidir a janela das migrations 0139/0140/0141.
-- Destino obrigatório e explícito: --project-ref lflzlcqinarrcgncafol.

SELECT jsonb_pretty(jsonb_build_object(
  'migrations_recentes', (
    SELECT coalesce(jsonb_agg(m.version ORDER BY m.version DESC), '[]'::jsonb)
    FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 25) m
  ),
  'migrations_alvo', (
    SELECT coalesce(jsonb_agg(m.version ORDER BY m.version), '[]'::jsonb)
    FROM (
      SELECT version FROM supabase_migrations.schema_migrations
      WHERE right(version, 4) BETWEEN '0134' AND '0141'
    ) m
  ),
  'funcoes', jsonb_build_object(
    'consulta', to_regprocedure('public.consultar_recebimento_retirada(uuid)')::text,
    'registro', to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)')::text,
    'edicao', to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)')::text,
    'guarda', to_regprocedure('public.congelar_colunas_protegidas()')::text,
    'capacidade', to_regprocedure('neia_operacao.tem_capacidade(uuid,text)')::text
  ),
  'tabelas', jsonb_build_object(
    'ledger', to_regclass('public.pedido_pagamento_eventos')::text,
    'auditoria', to_regclass('public.pedido_edicoes_auditoria')::text,
    'papeis', to_regclass('public.user_roles')::text
  ),
  'gatilhos_pedidos', (
    SELECT coalesce(jsonb_agg(t.tgname ORDER BY t.tgname), '[]'::jsonb)
    FROM pg_trigger t
    WHERE t.tgrelid = to_regclass('public.pedidos') AND NOT t.tgisinternal
  ),
  'colunas_pedidos', (
    SELECT coalesce(jsonb_agg(c.column_name ORDER BY c.column_name), '[]'::jsonb)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'pedidos'
      AND c.column_name IN ('pagamento_status','pagamento_em','conferido_em',
                            'retirado_em','observacoes','total')
  ),
  'corpo_consulta', coalesce((
    SELECT jsonb_build_object(
      'tem_pode_receber', position('pode_receber' IN p.prosrc),
      'usa_capacidade', position('neia_operacao.tem_capacidade(ator' IN p.prosrc),
      'exige_admin', position('has_role(ator' IN p.prosrc),
      'tamanho', length(p.prosrc)
    )
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.consultar_recebimento_retirada(uuid)')
  ), '{}'::jsonb),
  'corpo_guarda', coalesce((
    SELECT jsonb_build_object(
      'excecao_0141', position('pagamento_sem_ledger_integro' IN p.prosrc),
      'tamanho', length(p.prosrc)
    )
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
  ), '{}'::jsonb)
)) AS inventario;
