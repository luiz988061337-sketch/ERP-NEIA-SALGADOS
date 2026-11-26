-- Teste funcional somente leitura: todas as escritas acontecem em uma transação
-- que termina em ROLLBACK. Aplicar depois da migration 0128, em homologação.
BEGIN;

-- As claims são definidas ainda como postgres para que a RLS de user_roles não
-- oculte o administrador antes da troca para o papel autenticado.
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (SELECT user_id::text FROM public.user_roles
            WHERE role::text = 'admin' ORDER BY user_id LIMIT 1),
    'role', 'authenticated',
    'aud', 'authenticated'
  )::text,
  false
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('request.jwt.claims')::jsonb ->> 'sub',
  false
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_admin uuid;
  v_falso uuid := '00000000-0000-0000-0000-000000000099'::uuid;
  v_original text[];
  v_invertida text[];
  v_duplicadas text[];
  v_inexistentes text[];
  v_depois text[];
  v_resultado jsonb;
  v_logs_antes bigint;
  v_logs_depois bigint;
  v_status text;
BEGIN
  v_admin := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Não há usuário admin para o teste.';
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);

  SELECT array_agg(chave ORDER BY ordem) INTO v_original
  FROM public.sabores_estoque;
  IF coalesce(array_length(v_original, 1), 0) <> 26 THEN
    RAISE EXCEPTION 'O cadastro não contém 26 sabores.';
  END IF;

  v_invertida := v_original;
  v_invertida[1] := v_original[2];
  v_invertida[2] := v_original[1];

  SELECT count(*) INTO v_logs_antes FROM public.admin_logs;

  -- Persistência atômica da nova sequência.
  v_resultado := public.reordenar_sabores_estoque(v_invertida, 'salvar');
  v_status := v_resultado ->> 'status';
  IF v_status <> 'ok' THEN
    RAISE EXCEPTION 'Falha ao salvar: %', v_status;
  END IF;
  SELECT array_agg(chave ORDER BY ordem) INTO v_depois FROM public.sabores_estoque;
  IF v_depois IS DISTINCT FROM v_invertida THEN
    RAISE EXCEPTION 'A sequência salva não foi persistida.';
  END IF;

  -- Duplicatas e chaves desconhecidas são recusadas sem gravar auditoria.
  v_duplicadas := v_invertida;
  v_duplicadas[26] := v_invertida[1];
  IF public.reordenar_sabores_estoque(v_duplicadas, 'salvar') ->> 'status' <> 'chaves_duplicadas' THEN
    RAISE EXCEPTION 'Duplicatas não foram recusadas.';
  END IF;
  v_inexistentes := v_invertida;
  v_inexistentes[26] := 'chave-inexistente';
  IF public.reordenar_sabores_estoque(v_inexistentes, 'salvar') ->> 'status' <> 'chaves_invalidas' THEN
    RAISE EXCEPTION 'Chave inexistente não foi recusada.';
  END IF;

  -- Restauração da sequência capturada no início da edição.
  v_resultado := public.reordenar_sabores_estoque(v_original, 'restaurar');
  IF v_resultado ->> 'status' <> 'ok' THEN
    RAISE EXCEPTION 'Falha ao restaurar: %', v_resultado ->> 'status';
  END IF;
  SELECT array_agg(chave ORDER BY ordem) INTO v_depois FROM public.sabores_estoque;
  IF v_depois IS DISTINCT FROM v_original THEN
    RAISE EXCEPTION 'A restauração não voltou à sequência original.';
  END IF;
  IF public.reordenar_sabores_estoque(v_original, 'salvar') ->> 'status' <> 'sem_alteracao' THEN
    RAISE EXCEPTION 'Sequência idêntica não foi tratada como sem alteração.';
  END IF;

  SELECT count(*) INTO v_logs_depois FROM public.admin_logs;
  IF v_logs_depois <> v_logs_antes + 2 THEN
    RAISE EXCEPTION 'Auditoria esperava 2 registros, encontrou %.', v_logs_depois - v_logs_antes;
  END IF;

  -- Usuário autenticado sem papel administrativo não pode reordenar.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_falso::text, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true);
  PERFORM set_config('request.jwt.claim.sub', v_falso::text, true);
  IF public.reordenar_sabores_estoque(v_invertida, 'salvar') ->> 'status' <> 'permissao_negada' THEN
    RAISE EXCEPTION 'Permissão de não administrador não foi bloqueada.';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
