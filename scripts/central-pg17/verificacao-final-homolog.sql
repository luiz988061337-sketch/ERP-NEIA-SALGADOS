-- SOMENTE LEITURA. Verificações finais anteriores à aplicação de 0139/0140/0141.
SELECT jsonb_pretty(jsonb_build_object(
  'historico_ultimas', (
    SELECT coalesce(jsonb_agg(v.version ORDER BY v.version DESC), '[]'::jsonb)
    FROM (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8) v
  ),
  'versoes_reservadas_livres', (
    SELECT coalesce(jsonb_agg(v.version ORDER BY v.version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations v
    WHERE v.version IN ('20261127210000','20261127210001','20261127210002')
  ),
  'assinaturas', jsonb_build_object(
    'has_role', (
      SELECT coalesce(jsonb_agg('public.has_role(' || pg_get_function_identity_arguments(p.oid) || ')'), '[]'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'has_role'
    ),
    'tem_capacidade', (
      SELECT coalesce(jsonb_agg('neia_operacao.tem_capacidade(' || pg_get_function_identity_arguments(p.oid) || ')'), '[]'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'neia_operacao' AND p.proname = 'tem_capacidade'
    ),
    'auth_users', to_regclass('auth.users')::text
  ),
  'rpc_0106', coalesce((
    SELECT jsonb_build_object(
      'admin', position($q$has_role(auth.uid(), 'admin')$q$ IN p.prosrc),
      'financeiro', position($q$has_role(auth.uid(), 'financeiro')$q$ IN p.prosrc),
      'atendente', position($q$has_role(auth.uid(), 'atendente')$q$ IN p.prosrc),
      'capacidade', position($q$tem_capacidade$q$ IN p.prosrc),
      'ledger', position($q$INSERT INTO public.pedido_pagamento_eventos$q$ IN p.prosrc),
      'guarda_trecho', substr(p.prosrc, greatest(position($q$IF NOT ($q$ IN p.prosrc), 1), 210)
    )
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)')
  ), '{}'::jsonb),
  'permissoes_banco', jsonb_build_object(
    'rpc_execute_authenticated', has_function_privilege('authenticated', 'public.registrar_pagamento_pedido(uuid,bigint,text)', 'EXECUTE'),
    'rpc_execute_anon', has_function_privilege('anon', 'public.registrar_pagamento_pedido(uuid,bigint,text)', 'EXECUTE'),
    'rpc_execute_public', has_function_privilege('public', 'public.registrar_pagamento_pedido(uuid,bigint,text)', 'EXECUTE'),
    'ledger_insert_authenticated', has_table_privilege('authenticated', 'public.pedido_pagamento_eventos', 'INSERT'),
    'ledger_update_authenticated', has_table_privilege('authenticated', 'public.pedido_pagamento_eventos', 'UPDATE'),
    'ledger_delete_authenticated', has_table_privilege('authenticated', 'public.pedido_pagamento_eventos', 'DELETE'),
    'ledger_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.pedido_pagamento_eventos')),
    'ledger_policies', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', pol.policyname, 'cmd', pol.cmd)), '[]'::jsonb)
      FROM pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = 'pedido_pagamento_eventos'
    ),
    'ledger_trigger', (
      SELECT coalesce(jsonb_agg(t.tgname), '[]'::jsonb) FROM pg_trigger t
      WHERE t.tgrelid = to_regclass('public.pedidos') AND t.tgname = 'pedidos_pagamento_ledger_trg'
    )
  ),
  'objetos_0140_livres', jsonb_build_object(
    'tabela', to_regclass('public.pedido_edicoes_auditoria')::text,
    'rpc', to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)')::text,
    'indice', (
      SELECT coalesce(jsonb_agg(c.relname), '[]'::jsonb) FROM pg_class c
      WHERE c.relname = 'pedido_edicoes_auditoria_pedido_idx'
    ),
    'politica', (
      SELECT coalesce(jsonb_agg(p.policyname), '[]'::jsonb) FROM pg_policies p
      WHERE p.policyname = 'pedido edicoes leitura staff'
    )
  ),
  'coluna_observacoes', (
    SELECT jsonb_build_object('data_type', c.data_type, 'is_nullable', c.is_nullable, 'column_default', c.column_default)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'pedidos' AND c.column_name = 'observacoes'
  ),
  'guarda_0084_corpo', (
    SELECT p.prosrc FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
  ),
  'guarda_0084_tamanho_md5', (
    SELECT jsonb_build_object('tamanho', length(p.prosrc), 'md5', md5(p.prosrc))
    FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.congelar_colunas_protegidas()')
  )
)) AS verificacao;
