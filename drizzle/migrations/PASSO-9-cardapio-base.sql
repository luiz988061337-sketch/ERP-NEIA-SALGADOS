-- ============================================================================
-- PASSO 9 - Cardápio base: categorias e produtos iniciais
-- Rode em UM New query. Idempotente: pode rodar várias vezes sem duplicar.
-- Só INSERE o que falta — nada que já existe é sobrescrito ou apagado.
--
-- Os slugs das categorias batem com src/lib/combo.ts (COMBO_CATEGORIAS),
-- que é o que o /combo e o /calculadora usam para calcular preço.
-- ============================================================================

-- ---------- 0) colunas opcionais (vêm de 0001 e 0003) ----------
-- Se alguma dessas faltar, o INSERT de produtos falha. Criamos aqui para o
-- script ser autossuficiente. IF NOT EXISTS: não mexe no que já existe.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_venda text NOT NULL DEFAULT 'combo_50',
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidade_medida text NOT NULL DEFAULT 'un';

-- ---------- categorias ----------
INSERT INTO public.categorias (slug, nome, ordem, ativo) VALUES
  ('mini-fritos',       'Mini Fritos',       1, true),
  ('mini-assados',      'Mini Assados',      2, true),
  ('mini-pasteis',      'Mini Pastéis',      3, true),
  ('mini-pizzas',       'Mini Pizzas',       4, true),
  ('mini-empadinhas',   'Mini Empadinhas',   5, true)
ON CONFLICT (slug) DO NOTHING;

-- ---------- produtos ----------
-- preco = preço por unidade; os 4 primeiros slugs são os do combo (múltiplos de 50).
-- estoque 200 só para o produto não nascer como "esgotado" (estoque <= 0 esconde o card).
-- Ajuste depois em /admin -> Produtos: salgados são feitos sob encomenda.
INSERT INTO public.produtos (categoria_id, nome, descricao, preco, tipo_venda, disponivel, estoque, estoque_minimo, unidade_medida, destaque)
SELECT c.id, v.nome, v.descricao, v.preco, v.tipo_venda, true, 200, 0, 'un', v.destaque
FROM (VALUES
  -- Mini Fritos (R$ 1,60) — combina com src/lib/combo.ts
  ('mini-fritos',     'Coxinha de frango 25un',      'Coxinha de frango crocante, 25 unidades',           1.60, 'combo_50', true),
  ('mini-fritos',     'Bolinha de queijo 25un',      'Bolinha de queijo cremosa, 25 unidades',           1.60, 'combo_50', false),
  ('mini-fritos',     'Risole de carne 25un',        'Risole de carne bovina, 25 unidades',               1.60, 'combo_50', false),
  ('mini-fritos',     'Kibe 25un',                   'Kibe de batata com carne, 25 unidades',             1.60, 'combo_50', false),
  ('mini-fritos',     'Croquete de frango 25un',     'Croquete de frango crocante, 25 unidades',          1.60, 'combo_50', false),

  -- Mini Assados (R$ 2,30)
  ('mini-assados',    'Esfiha de carne 25un',        'Esfiha de carne assada, 25 unidades',              2.30, 'combo_50', true),
  ('mini-assados',    'Enroladinho de salsicha 25un','Enroladinho de salsicha, 25 unidades',             2.30, 'combo_50', false),
  ('mini-assados',    'Quibe assado 25un',           'Quibe assado com queijo, 25 unidades',              2.30, 'combo_50', false),
  ('mini-assados',    'Trouxinha de frango 25un',    'Trouxinha de frango, 25 unidades',                  2.30, 'combo_50', false),

  -- Mini Pastéis (R$ 2,30)
  ('mini-pasteis',    'Pastel de carne 25un',        'Pastel de carne, 25 unidades',                      2.30, 'combo_50', true),
  ('mini-pasteis',    'Pastel de queijo 25un',       'Pastel de queijo, 25 unidades',                     2.30, 'combo_50', false),
  ('mini-pasteis',    'Pastel de frango 25un',       'Pastel de frango, 25 unidades',                     2.30, 'combo_50', false),
  ('mini-pasteis',    'Pastel de pizza 25un',        'Pastel de pizza, 25 unidades',                      2.30, 'combo_50', false),

  -- Mini Pizzas (R$ 3,70)
  ('mini-pizzas',     'Mini pizza de calabresa 25un','Mini pizza de calabresa, 25 unidades',              3.70, 'combo_50', true),
  ('mini-pizzas',     'Mini pizza mussarela 25un',   'Mini pizza de mussarela, 25 unidades',              3.70, 'combo_50', false),
  ('mini-pizzas',     'Mini pizza de frango 25un',   'Mini pizza de frango, 25 unidades',                 3.70, 'combo_50', false),
  ('mini-pizzas',     'Mini pizza portuguesa 25un',  'Mini pizza portuguesa, 25 unidades',                3.70, 'combo_50', false),

  -- Mini Empadinhas (R$ 2,40)
  ('mini-empadinhas', 'Empadinha de frango 25un',    'Empadinha de frango, 25 unidades',                  2.40, 'combo_50', true),
  ('mini-empadinhas', 'Empadinha de queijo 25un',    'Empadinha de queijo, 25 unidades',                  2.40, 'combo_50', false),
  ('mini-empadinhas', 'Empadinha de palmito 25un',   'Empadinha de palmito, 25 unidades',                 2.40, 'combo_50', false),
  ('mini-empadinhas', 'Empadinha de carne 25un',     'Empadinha de carne, 25 unidades',                   2.40, 'combo_50', false)
) AS v(cat_slug, nome, descricao, preco, tipo_venda, destaque)
JOIN public.categorias c ON c.slug = v.cat_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.produtos p WHERE p.categoria_id = c.id AND p.nome = v.nome
);


-- ----------------------------------------------------------------------------
-- VERIFICAÇÃO
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*)::text FROM public.categorias WHERE slug LIKE 'mini-%') AS "1_CATEGORIAS_MINI",
  (SELECT string_agg(slug, ', ' ORDER BY ordem) FROM public.categorias WHERE slug LIKE 'mini-%') AS "2_SLUGS",
  (SELECT count(*)::text FROM public.produtos p JOIN public.categorias c ON c.id = p.categoria_id
     WHERE c.slug LIKE 'mini-%') AS "3_PRODUTOS_COMBO",
  (SELECT string_agg(DISTINCT p.preco::text, ' / ' ORDER BY p.preco::text)
     FROM public.produtos p JOIN public.categorias c ON c.id = p.categoria_id
     WHERE c.slug LIKE 'mini-%') AS "4_PRECOS_ENCONTRADOS",
  (SELECT string_agg(DISTINCT v.preco::text, ' / ' ORDER BY v.preco::text)
     FROM (VALUES (1.60),(2.30),(3.70),(2.40)) AS v(preco)) AS "5_PRECOS_ESPERADOS";

-- Se 1_CATEGORIAS_MINI ou 3_PRODUTOS_COMBO vierem vazio/0, o problema NAO e este
-- script: e o banco onde ele rodou. Compare com o resultado do PASSO-7.
SELECT
  current_user AS "6_USUARIO",
  current_database() AS "7_BANCO",
  current_setting('server_version') AS "8_POSTGRES",
  (SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'produtos') AS "9_COLUNAS_PRODUTOS";