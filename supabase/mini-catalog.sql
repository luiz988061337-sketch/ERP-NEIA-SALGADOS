-- Néia Salgados — Catálogo 100% MINI
-- Como aplicar: Supabase Dashboard → SQL Editor → cole este script → Run.
-- Ele cria as categorias mini, apaga as antigas (e seus produtos) e insere
-- o cardápio novo. Kits e bebidas existentes são mantidos.
-- ATENÇÃO: avaliações/favoritos ligados a produtos apagados são removidos
-- junto (cascade). Pedidos antigos NÃO são afetados (guardam nome/preço).

-- 1) Categorias mini (idempotente)
INSERT INTO public.categorias (nome, slug, ordem) VALUES
 ('Mini Fritos','mini-fritos',1),
 ('Mini Assados','mini-assados',2),
 ('Mini Pastéis','mini-pasteis',3),
 ('Mini Pizzas','mini-pizzas',4),
 ('Mini Empadinhas','mini-empadinhas',5),
 ('Mini Congelados','mini-congelados',6),
 ('Kits para Festa','kits-para-festa',7),
 ('Bebidas','bebidas',8)
ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem;

-- 2) Remove categorias antigas (apaga em cascata os produtos delas)
DELETE FROM public.categorias
WHERE slug IN ('salgados-fritos','salgados-assados','salgados-congelados','mini-salgados');

-- 3) Limpa produtos das categorias mini/kits (evita duplicar ao rodar 2x)
DELETE FROM public.produtos p USING public.categorias c
WHERE p.categoria_id = c.id
  AND c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas','mini-congelados','kits-para-festa');

-- 4) Cardápio mini
INSERT INTO public.produtos (categoria_id, nome, descricao, preco, preco_promocional)
SELECT c.id, v.nome, v.descricao, v.preco, v.promo FROM public.categorias c
JOIN (VALUES
 ('mini-fritos','Mini Coxinha 25un','25 mini coxinhas de frango fritas na hora',39.90,NULL::numeric),
 ('mini-fritos','Mini Bolinha de Queijo 25un','25 mini bolinhas de mussarela douradas',39.90,34.90),
 ('mini-fritos','Mini Risole de Carne 25un','25 mini risoles de carne moída temperada',42.90,NULL),
 ('mini-fritos','Mini Kibe Frito 25un','25 mini kibes de trigo crocantes',44.90,NULL),
 ('mini-fritos','Mini Croquete 25un','25 mini croquetes de carne',42.90,NULL),
 ('mini-assados','Mini Esfiha de Carne 20un','20 mini esfihas abertas assadas na hora',47.90,NULL),
 ('mini-assados','Mini Enroladinho de Salsicha 20un','20 mini enroladinhos de massa macia',44.90,39.90),
 ('mini-assados','Mini Quibe Assado 20un','20 mini quibes assados de trigo',47.90,NULL),
 ('mini-assados','Mini Trouxinha de Frango 20un','20 mini trouxinhas de frango com catupiry',49.90,NULL),
 ('mini-pasteis','Mini Pastel de Carne 20un','20 mini pastéis de carne moída',44.90,NULL),
 ('mini-pasteis','Mini Pastel de Queijo 20un','20 mini pastéis de mussarela',44.90,39.90),
 ('mini-pasteis','Mini Pastel de Frango 20un','20 mini pastéis de frango desfiado',46.90,NULL),
 ('mini-pasteis','Mini Pastel de Pizza 20un','20 mini pastéis de presunto, queijo e tomate',46.90,NULL),
 ('mini-pizzas','Mini Pizza de Calabresa 15un','15 mini pizzas de calabresa com mussarela',54.90,NULL),
 ('mini-pizzas','Mini Pizza de Mussarela 15un','15 mini pizzas de mussarela e tomate',54.90,49.90),
 ('mini-pizzas','Mini Pizza de Frango 15un','15 mini pizzas de frango com catupiry',59.90,NULL),
 ('mini-pizzas','Mini Pizza Portuguesa 15un','15 mini pizzas de presunto, ovo e ervilha',59.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Frango 20un','20 mini empadinhas de frango',46.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Queijo 20un','20 mini empadinhas de queijo cremoso',46.90,41.90),
 ('mini-empadinhas','Mini Empadinha de Palmito 20un','20 mini empadinhas de palmito',49.90,NULL),
 ('mini-empadinhas','Mini Empadinha de Carne 20un','20 mini empadinhas de carne moída',48.90,NULL),
 ('mini-congelados','Mini Coxinha Congelada 100un','100 mini coxinhas congeladas prontas para fritar',99.90,89.90),
 ('mini-congelados','Mini Mix Congelado 100un','100 mini salgados sortidos congelados',159.90,NULL),
 ('mini-congelados','Mini Pastel Congelado 50un','50 mini pastéis congelados sortidos',79.90,NULL),
 ('kits-para-festa','Kit Festa 100 Mini Salgados','100 mini salgados sortidos + 1 refrigerante 2L',179.90,159.90),
 ('kits-para-festa','Kit Aniversário 200 Mini','200 mini salgados sortidos + 2 refrigerantes',329.90,NULL),
 ('kits-para-festa','Kit Reunião 50 Mini','50 mini salgados sortidos ideais para escritório',94.90,NULL)
 ) AS v(slug,nome,descricao,preco,promo) ON v.slug = c.slug;

-- 5) Taxa de entrega a partir de R$ 6 (cupom frete grátis acompanha)
UPDATE public.cupons SET valor = 6 WHERE codigo = 'FRETEGRATIS';
