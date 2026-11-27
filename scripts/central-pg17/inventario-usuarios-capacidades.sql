-- SOMENTE LEITURA. Usuários, papéis e capacidades financeiras em homologação.
SELECT jsonb_pretty(jsonb_build_object(
  'usuarios', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'papeis', (SELECT coalesce(jsonb_agg(r.role ORDER BY r.role), '[]'::jsonb)
                 FROM public.user_roles r WHERE r.user_id = u.id),
      'capacidades', (SELECT coalesce(jsonb_agg(c.capacidade ORDER BY c.capacidade), '[]'::jsonb)
                      FROM neia_operacao.financeiro_capacidades c WHERE c.usuario = u.id)
    ) ORDER BY u.email), '[]'::jsonb)
    FROM auth.users u WHERE u.deleted_at IS NULL
  )
)) AS info;
