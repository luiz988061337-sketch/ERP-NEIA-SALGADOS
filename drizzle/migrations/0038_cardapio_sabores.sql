-- 0038: cardápio completo — 26 sabores em frito (combo_50) + congelado (unidade).
-- Idempotente: só insere o que ainda não existe (mesmo nome + tipo_venda).
-- REGRA DE PREÇO (revisar no /admin → Produtos se necessário):
--   fritos novos = mesmo preço dos irmãos da categoria (bolinhas 1.60, resto 2.30, pizzas 3.70);
--   congelados = 50x o preço unitário do frito (ex: 1.60 -> 80.00).
-- Doguinho NÃO incluído (substituído por enroladinho de salsicha, que já existe).

-- ---------- FRITOS (combo_50) que faltavam ----------
INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de calabresa 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de calabresa 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de milho 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de milho 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Bolinha de azeitona 25un', 1.60, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'bolinha de azeitona 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de milho com catupiry 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de milho com catupiry 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de calabresa 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de calabresa 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Trouxinha de ricota com zaatar 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'trouxinha de ricota com zaatar 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Hamburguinho 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'hamburguinho 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'e08980d5-ea59-4195-a535-b3f48275ea45', 'Pastel de palmito 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'pastel de palmito 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'f2302053-a296-43d0-8733-bb3caaf6871b', 'Esfiha de frango 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'esfiha de frango 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'f2302053-a296-43d0-8733-bb3caaf6871b', 'Esfiha de brocolis 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'esfiha de brocolis 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'aaefb477-bb46-4f7e-8ac8-8de1e79daf18', 'Enroladinho de presunto e queijo 25un', 2.30, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'enroladinho de presunto e queijo 25un' AND tipo_venda = 'combo_50');

INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT '74dc1431-b9c1-4146-a1fb-f670227225cd', 'Mini pizza de presunto e queijo 25un', 3.70, 'combo_50', true, 200
WHERE NOT EXISTS (SELECT 1 FROM public.produtos WHERE lower(nome) = 'mini pizza de presunto e queijo 25un' AND tipo_venda = 'combo_50');

-- ---------- CONGELADOS (unidade, Mini Congelados) ----------
INSERT INTO public.produtos (categoria_id, nome, preco, tipo_venda, disponivel, estoque)
SELECT 'a0fe8d5a-8275-4656-b2c6-5a7beadd9297', n.nome, n.preco, 'unidade', true, 100
FROM (VALUES
  ('Coxinha Congelada 50un', 80.00),
  ('Bolinha de queijo Congelada 50un', 80.00),
  ('Risole de carne Congelado 50un', 80.00),
  ('Bolinha de calabresa Congelada 50un', 80.00),
  ('Bolinha de milho Congelada 50un', 80.00),
  ('Bolinha de azeitona Congelada 50un', 80.00),
  ('Trouxinha de milho com catupiry Congelada 50un', 115.00),
  ('Kibe Congelado 50un', 80.00),
  ('Croquete de frango Congelado 50un', 80.00),
  ('Pastel de carne Congelado 50un', 115.00),
  ('Pastel de queijo Congelado 50un', 115.00),
  ('Pastel de pizza Congelado 50un', 115.00),
  ('Pastel de palmito Congelado 50un', 115.00),
  ('Esfiha de carne Congelada 50un', 115.00),
  ('Esfiha de frango Congelada 50un', 115.00),
  ('Esfiha de brocolis Congelada 50un', 115.00),
  ('Enroladinho de presunto e queijo Congelado 50un', 115.00),
  ('Trouxinha de calabresa Congelada 50un', 115.00),
  ('Hamburguinho Congelado 50un', 115.00),
  ('Enroladinho de salsicha Congelado 50un', 115.00),
  ('Trouxinha de ricota com zaatar Congelada 50un', 115.00),
  ('Mini pizza de calabresa Congelada 50un', 185.00),
  ('Mini pizza de mussarela Congelada 50un', 185.00),
  ('Mini pizza de presunto e queijo Congelada 50un', 185.00),
  ('Empadinha de frango Congelada 50un', 120.00),
  ('Empadinha de palmito Congelada 50un', 120.00)
) AS n(nome, preco)
WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE lower(p.nome) = lower(n.nome) AND p.tipo_venda = 'unidade');
