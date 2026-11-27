-- SOMENTE LEITURA. Conferência pós-aplicação de 0139/0140/0141 em homologação.
SELECT jsonb_pretty(jsonb_build_object(
  'historico', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'name', v.name) ORDER BY v.version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations v
    WHERE v.version IN ('20261127172951','20261127202230','20261127202504',
                        '20261127210000','20261127210001','20261127210002')
  ),
  'consulta', (
    SELECT jsonb_build_object(
      'status_producao', public.consultar_recebimento_retirada(
        '00000000-0000-4000-8000-000000000000')::text IS NOT NULL,
      'usa_capacidade', position('''pode_receber'', neia_operacao.tem_capacidade(ator' in p.prosrc) > 0,
      'exige_admin', position('''pode_receber'',public.has_role(ator' in p.prosrc) > 0
    )
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.consultar_recebimento_retirada(uuid)')
  ),
  'rpc_financeira', (
    SELECT jsonb_build_object(
      'tamanho', length(p.prosrc),
      'md5', md5(p.prosrc),
      'guarda_capacidade', position($q$IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento')$q$ IN p.prosrc) > 0,
      'papel_atendente', position($q$public.has_role(auth.uid(), 'atendente')$q$ IN p.prosrc) > 0,
      'atendente_exige_capacidade_inline', position($q$has_role(auth.uid(), 'atendente') AND neia_operacao.tem_capacidade$q$ IN p.prosrc) > 0,
      'grava_ledger', position($q$INSERT INTO public.pedido_pagamento_eventos$q$ IN p.prosrc) > 0,
      'grants', jsonb_build_object(
        'authenticated', has_function_privilege('authenticated','public.registrar_pagamento_pedido(uuid,bigint,text)','EXECUTE'),
        'anon', has_function_privilege('anon','public.registrar_pagamento_pedido(uuid,bigint,text)','EXECUTE'),
        'publico', has_function_privilege('public','public.registrar_pagamento_pedido(uuid,bigint,text)','EXECUTE')
      )
    )
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)')
  ),
  'objetos', jsonb_build_object(
    'tabela_auditoria', to_regclass('public.pedido_edicoes_auditoria')::text,
    'rls_auditoria', (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.pedido_edicoes_auditoria')),
    'rpc_edicao', to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)')::text,
    'guarda_0141', (
      SELECT position($q$pagamento_sem_ledger_integro$q$ IN p.prosrc) > 0
      FROM pg_proc p WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
    ),
    'guarda_0084_preservada', (
      SELECT position($q$Coluna protegida: alteração apenas via fluxo financeiro/RPC$q$ IN p.prosrc) > 0
      FROM pg_proc p WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
    ),
    'gatilho_retirada', (
      SELECT coalesce(jsonb_agg(t.tgname), '[]'::jsonb) FROM pg_trigger t
      WHERE t.tgrelid = to_regclass('public.pedidos') AND t.tgname = 'exigir_quitacao_para_retirada'
    ),
    'ledger_permissoes', jsonb_build_object(
      'insert_authenticated', has_table_privilege('authenticated','public.pedido_pagamento_eventos','INSERT'),
      'update_authenticated', has_table_privilege('authenticated','public.pedido_pagamento_eventos','UPDATE'),
      'delete_authenticated', has_table_privilege('authenticated','public.pedido_pagamento_eventos','DELETE')
    )
  )
)) AS conferencia;
