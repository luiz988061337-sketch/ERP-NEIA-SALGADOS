-- Organização da sequência dos sabores do Estoque de Salgados.
-- Aplicar somente em homologação (lflzlcqinarrcgncafol), com --project-ref explícito.
-- Usa o campo public.sabores_estoque.ordem existente; não cria tabela duplicada
-- nem concede UPDATE direto para authenticated.
BEGIN;

CREATE OR REPLACE FUNCTION public.reordenar_sabores_estoque(
  p_chaves text[],
  p_acao text DEFAULT 'salvar'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_acao text := lower(btrim(coalesce(p_acao, 'salvar')));
  v_total integer;
  v_maximo integer;
  v_chaves text[];
  v_anterior jsonb;
  v_posterior jsonb;
  v_indice integer;
  v_chave text;
BEGIN
  IF v_acao NOT IN ('salvar', 'restaurar') THEN
    RETURN jsonb_build_object('status', 'acao_invalida');
  END IF;
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chaves IS NULL OR array_length(p_chaves, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  -- Uma única trava por operação evita corridas entre duas sessões administrativas.
  PERFORM pg_advisory_xact_lock(hashtextextended('sabores_estoque:ordem', 0));

  SELECT count(*), max(ordem)::integer INTO v_total, v_maximo
  FROM public.sabores_estoque;
  IF v_total <> 26 THEN
    RETURN jsonb_build_object('status', 'cadastro_incompleto', 'total', v_total);
  END IF;
  IF v_maximo IS NULL OR v_maximo > 100 THEN
    RETURN jsonb_build_object('status', 'ordem_inconsistente', 'maximo', v_maximo);
  END IF;
  IF array_length(p_chaves, 1) <> v_total THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  SELECT array_agg(chave ORDER BY ordem) INTO v_chaves
  FROM public.sabores_estoque;
  SELECT jsonb_object_agg(chave, ordem ORDER BY ordem) INTO v_anterior
  FROM public.sabores_estoque;

  IF (SELECT count(*) FROM unnest(p_chaves) AS c(chave)) <>
     (SELECT count(DISTINCT c.chave) FROM unnest(p_chaves) AS c(chave)) THEN
    RETURN jsonb_build_object('status', 'chaves_duplicadas');
  END IF;
  IF (SELECT count(*)
      FROM unnest(p_chaves) AS c(chave)
      JOIN public.sabores_estoque AS s ON s.chave = c.chave) <> v_total THEN
    RETURN jsonb_build_object('status', 'chaves_invalidas');
  END IF;

  IF p_chaves = v_chaves THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'ordens', v_anterior);
  END IF;

  -- Deslocamento temporário rompe o UNIQUE(ordem) sem alterar a constraint.
  UPDATE public.sabores_estoque SET ordem = ordem + 1000;
  FOR v_indice IN 1..v_total LOOP
    v_chave := p_chaves[v_indice];
    UPDATE public.sabores_estoque SET ordem = v_indice WHERE chave = v_chave;
  END LOOP;

  SELECT jsonb_object_agg(chave, ordem ORDER BY ordem) INTO v_posterior
  FROM public.sabores_estoque;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (
    v_ator,
    CASE WHEN v_acao = 'restaurar'
      THEN 'sabores_estoque_ordem_restaurada'
      ELSE 'sabores_estoque_ordem_alterada' END,
    jsonb_build_object(
      'acao', v_acao,
      'anterior', v_anterior,
      'posterior', v_posterior
    )::text
  );

  RETURN jsonb_build_object('status', 'ok', 'acao', v_acao, 'ordens', v_posterior);
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_sabores_estoque(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_sabores_estoque(text[], text) TO authenticated;

-- Registro do histórico com o conteúdo integral aplicado (sem o invólucro da
-- transação e sem esta própria inserção), conforme a norma P0.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261126170000', 'organizar_sabores_estoque', ARRAY[$mig$CREATE OR REPLACE FUNCTION public.reordenar_sabores_estoque(
  p_chaves text[],
  p_acao text DEFAULT 'salvar'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_acao text := lower(btrim(coalesce(p_acao, 'salvar')));
  v_total integer;
  v_maximo integer;
  v_chaves text[];
  v_anterior jsonb;
  v_posterior jsonb;
  v_indice integer;
  v_chave text;
BEGIN
  IF v_acao NOT IN ('salvar', 'restaurar') THEN
    RETURN jsonb_build_object('status', 'acao_invalida');
  END IF;
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chaves IS NULL OR array_length(p_chaves, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  -- Uma única trava por operação evita corridas entre duas sessões administrativas.
  PERFORM pg_advisory_xact_lock(hashtextextended('sabores_estoque:ordem', 0));

  SELECT count(*), max(ordem)::integer INTO v_total, v_maximo
  FROM public.sabores_estoque;
  IF v_total <> 26 THEN
    RETURN jsonb_build_object('status', 'cadastro_incompleto', 'total', v_total);
  END IF;
  IF v_maximo IS NULL OR v_maximo > 100 THEN
    RETURN jsonb_build_object('status', 'ordem_inconsistente', 'maximo', v_maximo);
  END IF;
  IF array_length(p_chaves, 1) <> v_total THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  SELECT array_agg(chave ORDER BY ordem) INTO v_chaves
  FROM public.sabores_estoque;
  SELECT jsonb_object_agg(chave, ordem ORDER BY ordem) INTO v_anterior
  FROM public.sabores_estoque;

  IF (SELECT count(*) FROM unnest(p_chaves) AS c(chave)) <>
     (SELECT count(DISTINCT c.chave) FROM unnest(p_chaves) AS c(chave)) THEN
    RETURN jsonb_build_object('status', 'chaves_duplicadas');
  END IF;
  IF (SELECT count(*)
      FROM unnest(p_chaves) AS c(chave)
      JOIN public.sabores_estoque AS s ON s.chave = c.chave) <> v_total THEN
    RETURN jsonb_build_object('status', 'chaves_invalidas');
  END IF;

  IF p_chaves = v_chaves THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'ordens', v_anterior);
  END IF;

  -- Deslocamento temporário rompe o UNIQUE(ordem) sem alterar a constraint.
  UPDATE public.sabores_estoque SET ordem = ordem + 1000;
  FOR v_indice IN 1..v_total LOOP
    v_chave := p_chaves[v_indice];
    UPDATE public.sabores_estoque SET ordem = v_indice WHERE chave = v_chave;
  END LOOP;

  SELECT jsonb_object_agg(chave, ordem ORDER BY ordem) INTO v_posterior
  FROM public.sabores_estoque;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (
    v_ator,
    CASE WHEN v_acao = 'restaurar'
      THEN 'sabores_estoque_ordem_restaurada'
      ELSE 'sabores_estoque_ordem_alterada' END,
    jsonb_build_object(
      'acao', v_acao,
      'anterior', v_anterior,
      'posterior', v_posterior
    )::text
  );

  RETURN jsonb_build_object('status', 'ok', 'acao', v_acao, 'ordens', v_posterior);
END;
$$;

REVOKE ALL ON FUNCTION public.reordenar_sabores_estoque(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reordenar_sabores_estoque(text[], text) TO authenticated;$mig$]::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
