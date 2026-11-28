-- SOMENTE LEITURA. Conferência pós-aplicação da 0142 em homologação.
-- Não chama RPC de escrita: apenas inspeciona catálogo, histórico e contagens.
SELECT jsonb_pretty(jsonb_build_object(
  'historico', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'name', v.name,
      'statements', coalesce(array_length(v.statements, 1), 0)) ORDER BY v.version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations v
    WHERE v.version IN ('20261127172951','20261127202230','20261127202504',
      '20261127210000','20261127210001','20261127210002','20261128071000')
  ),
  'colunas_novas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('coluna', c.column_name,
      'tipo', c.data_type, 'anulavel', c.is_nullable) ORDER BY c.column_name), '[]'::jsonb)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'pedido_pagamento_eventos'
      AND c.column_name IN ('forma_pagamento_efetiva','valor_entregue_centavos','troco_centavos')
  ),
  'constraints', (
    SELECT coalesce(jsonb_agg(con.conname ORDER BY con.conname), '[]'::jsonb)
    FROM pg_constraint con
    WHERE con.conrelid = to_regclass('public.pedido_pagamento_eventos')
      AND con.conname IN ('pedido_pagamento_eventos_forma_efetiva_check',
                          'pedido_pagamento_eventos_troco_check')
  ),
  'assinaturas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('funcao', p.proname,
      'args', pg_get_function_identity_arguments(p.oid)) ORDER BY p.proname, 2), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'registrar_pagamento_pedido','registrar_pagamento_pedido_efetivo',
      'verificar_recebimento_por_chave','editar_observacoes_pedido')
  ),
  'rpc_antiga_bloqueada', (
    SELECT jsonb_build_object(
      'sem_insert', position($q$INSERT INTO public.pedido_pagamento_eventos$q$ IN p.prosrc) = 0,
      'exige_rpc_nova', position($q$dados_invalidos$q$ IN p.prosrc) > 0,
      'guarda_capacidade', position($q$tem_capacidade(auth.uid(),'receber_pagamento')$q$ IN p.prosrc) > 0
    )
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)')
  ),
  'rpc_efetiva', (
    SELECT jsonb_build_object(
      'formas', position($q$dinheiro', 'pix', 'credito', 'debito'$q$ IN p.prosrc) > 0,
      'confirmacao', position($q$confirmacao_efetiva_requerida$q$ IN p.prosrc) > 0,
      'troco', position($q$v_troco := v_entregue - v_valor$q$ IN p.prosrc) > 0,
      'idempotencia', position($q$pg_advisory_xact_lock$q$ IN p.prosrc) > 0,
      'guarda_capacidade', position($q$tem_capacidade(auth.uid(),'receber_pagamento')$q$ IN p.prosrc) > 0,
      'grants', jsonb_build_object(
        'authenticated', has_function_privilege('authenticated',
          'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)', 'EXECUTE'),
        'anon', has_function_privilege('anon',
          'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)', 'EXECUTE')
      )
    )
    FROM pg_proc p WHERE p.oid = to_regprocedure(
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)')
  ),
  'rpc_chave', (
    SELECT jsonb_build_object(
      'presente', p.oid IS NOT NULL,
      'sem_gravacao', position($q$INSERT INTO$q$ IN p.prosrc) = 0 AND position($q$UPDATE$q$ IN p.prosrc) = 0,
      'grants', jsonb_build_object(
        'authenticated', has_function_privilege('authenticated',
          'public.verificar_recebimento_por_chave(text)', 'EXECUTE'),
        'anon', has_function_privilege('anon',
          'public.verificar_recebimento_por_chave(text)', 'EXECUTE')
      )
    )
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.verificar_recebimento_por_chave(text)')
  ),
  'edicao_guarda', (
    SELECT jsonb_build_object(
      'estagios', position($q$v_status IN ('cancelado', 'entregue', 'retirado', 'em_rota')$q$ IN p.prosrc) > 0,
      'requer_admin', position($q$NOT public.has_role(ator, 'admin')$q$ IN p.prosrc) > 0,
      'auditoria', position($q$INSERT INTO public.pedido_edicoes_auditoria$q$ IN p.prosrc) > 0
    )
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)')
  ),
  'historico_financeiro', jsonb_build_object(
    'eventos', (SELECT count(*) FROM public.pedido_pagamento_eventos),
    'soma_centavos', (SELECT coalesce(sum(valor_centavos), 0) FROM public.pedido_pagamento_eventos),
    'linhas_sem_forma_efetiva', (
      SELECT count(*) FROM public.pedido_pagamento_eventos WHERE forma_pagamento_efetiva IS NULL),
    'linhas_com_troco_preenchido', (
      SELECT count(*) FROM public.pedido_pagamento_eventos WHERE troco_centavos IS NOT NULL),
    'auditoria', (SELECT count(*) FROM public.pedido_edicoes_auditoria),
    'rls_ledger', (SELECT relrowsecurity FROM pg_class
      WHERE oid = to_regclass('public.pedido_pagamento_eventos')),
    'insert_authenticated', has_table_privilege('authenticated',
      'public.pedido_pagamento_eventos', 'INSERT'),
    'update_authenticated', has_table_privilege('authenticated',
      'public.pedido_pagamento_eventos', 'UPDATE'),
    'delete_authenticated', has_table_privilege('authenticated',
      'public.pedido_pagamento_eventos', 'DELETE')
  ),
  'configuracao', jsonb_build_object(
    'lojas_com_pix', (SELECT count(*) FROM public.loja_config
      WHERE pix_chave IS NOT NULL AND btrim(pix_chave) <> ''),
    'capacidades_receber_pagamento', (SELECT count(*) FROM neia_operacao.financeiro_capacidades
      WHERE capacidade = 'receber_pagamento'),
    'papeis', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', r.role, 'qv', r.qv)), '[]'::jsonb)
      FROM (SELECT role, count(*) AS qv FROM public.user_roles GROUP BY role ORDER BY role) r)
  )
)) AS conferencia;
