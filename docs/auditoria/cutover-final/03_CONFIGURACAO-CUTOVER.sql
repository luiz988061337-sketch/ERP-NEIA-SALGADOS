-- ============================================================================
-- 03_CONFIGURACAO-CUTOVER.sql — CONFIGURAÇÃO DO NOVO FLUXO
-- ============================================================================
-- Executar DEPOIS de 02_MIGRATIONS-CUTOVER.sql e ANTES de ativar o
-- `controlado` e de publicar o bundle de corte.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 03_CONFIGURACAO-CUTOVER.sql
--
-- ESCOPO (deliberadamente restrito):
--   * configura `categorias.combo_preco_unit` — a autoridade de preço do combo no
--     regime novo (migration 0097);
--   * NÃO altera `produtos.preco` de NENHUM item;
--   * NÃO corrige os preços históricos dos 54 produtos `combo_50`;
--   * NÃO toca em estoque, pedidos, pagamentos ou reservas.
--
-- Por que os preços NÃO mudam: o preço do combo sai de `combo_preco_unit`,
-- que recebe exatamente os mesmos 5 valores que a lista estática do frontend
-- já usava (ver PRECO-COMBOS-PRODUCAO.md — 54/54 itens IGUAL). A autoridade
-- muda de lugar (do código para o banco), não de valor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.0 GUARDA DE ORDEM: a coluna combo_preco_unit e criada pela migration 0097.
--     Se ela nao existir, este script foi rodado ANTES das migrations.
-- ---------------------------------------------------------------------------
SELECT '=== 03_CONFIGURACAO: guarda de ordem ===' AS secao;
DO $ordem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categorias'
       AND column_name = 'combo_preco_unit'
  ) THEN
    RAISE EXCEPTION 'NO-GO: rodou na ordem errada — a coluna categorias.combo_preco_unit nao existe. Aplique 02_MIGRATIONS-CUTOVER.sql ANTES deste script.';
  END IF;
  IF to_regclass('public.pedido_item_componentes') IS NULL THEN
    RAISE EXCEPTION 'NO-GO: rodou na ordem errada — a tabela pedido_item_componentes (0097) nao existe. Aplique 02_MIGRATIONS-CUTOVER.sql ANTES deste script.';
  END IF;
END
$ordem$;

SELECT '=== 03_CONFIGURACAO: estado antes ===' AS secao;
DO $estado$
DECLARE v_txt text;
BEGIN
  EXECUTE $q$
    SELECT string_agg(c.slug || ' = ' || coalesce(c.combo_preco_unit::text,'sem preco'), ', ' ORDER BY c.slug)
      FROM public.categorias c
     WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
  $q$ INTO v_txt;
  RAISE NOTICE 'estado antes: %', coalesce(v_txt, '(nenhuma das 5 categorias encontrada)');
END
$estado$;

-- ---------------------------------------------------------------------------
-- 3.1 Preco unitario do combo por categoria (mesmos valores do seed da 0097)
--     `AND combo_preco_unit IS NULL` => NAO sobrescreve configuracao do admin.
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: aplicando combo_preco_unit (sem sobrescrever admin) ===' AS secao;
UPDATE public.categorias SET combo_preco_unit = 1.60 WHERE slug = 'mini-fritos'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-assados'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-pasteis'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 3.70 WHERE slug = 'mini-pizzas'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.40 WHERE slug = 'mini-empadinhas' AND combo_preco_unit IS NULL;

-- ---------------------------------------------------------------------------
-- 3.2 GUARDA: nenhuma categoria de combo ATIVA pode ficar sem preco.
--     A 0095 falha fechada com `montagem_preco_ausente`; aqui a falha é
--     antecipada, com mensagem clara, e o script ABORTA.
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: guarda de preco (fail-closed) ===' AS secao;
DO $guarda$
DECLARE
  v_faltando text;
  v_n integer;
BEGIN
  SELECT string_agg(c.slug || ' (' || c.nome || ')', ', ')
    INTO v_faltando
  FROM public.categorias c
  WHERE c.ativo
    AND c.combo_preco_unit IS NULL
    AND EXISTS (SELECT 1 FROM public.produtos p
                 WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50');

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'NO-GO: categoria(s) de combo ativa(s) sem combo_preco_unit: % — configurar antes de abrir vendas', v_faltando;
  END IF;

  -- Nenhuma categoria de combo ativa pode ter preco negativo ou zero.
  EXECUTE 'SELECT count(*)::int FROM public.categorias
            WHERE ativo AND combo_preco_unit IS NOT NULL AND combo_preco_unit <= 0' INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'NO-GO: % categoria(s) de combo com combo_preco_unit <= 0', v_n;
  END IF;

    PERFORM set_config('neia.config', 'CONFIGURACAO_OK', false);
  RAISE NOTICE 'CONFIGURACAO_OK: toda categoria de combo ativa tem preco valido';
END
$guarda$;

-- ---------------------------------------------------------------------------
-- 3.3 Estado depois
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: estado depois ===' AS secao;
SELECT c.slug, c.nome, c.combo_preco_unit,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: precos dos 54 itens combo_50 (inalterados, so conferencia) ===' AS secao;
SELECT c.slug,
       count(*)                                            AS itens,
       count(DISTINCT p.preco)                             AS precos_distintos,
       min(p.preco)                                        AS preco_min,
       max(p.preco)                                        AS preco_max
FROM public.produtos p
JOIN public.categorias c ON c.id = p.categoria_id
WHERE p.tipo_venda = 'combo_50'
GROUP BY c.slug
ORDER BY c.slug;
-- Nota: estes precos de `produtos.preco` NAO foram alterados por este script
-- (e nao devem ser: ver PRECO-COMBOS-PRODUCAO.md, secao 4).

SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: 3.4 verificacao final de cobertura ===' AS secao;
SELECT
  (SELECT count(*) FROM public.categorias
    WHERE ativo AND combo_preco_unit IS NOT NULL)                       AS categorias_com_preco,
  (SELECT count(*) FROM public.categorias c
    WHERE c.ativo AND c.combo_preco_unit IS NULL
      AND EXISTS (SELECT 1 FROM public.produtos p
                    WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50')) AS combos_sem_preco,
  'CONFIGURACAO_OK'::text                                              AS resultado;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.config', true) AS resultado;
