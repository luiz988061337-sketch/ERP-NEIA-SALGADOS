-- ============================================================
-- NEIA SALGADOS — Seed complementar de demonstração
-- Execute no SQL Editor do Supabase APÓS a migration 0000
-- ============================================================

-- Cupons extras de demonstração
INSERT INTO public.cupons (codigo, tipo, valor, minimo) VALUES
  ('BEMVINDO5', 'valor', 5, 30),
  ('FESTA15', 'percentual', 15, 150)
ON CONFLICT (codigo) DO NOTHING;

-- Taxa padrão do motoboy por pedido (ajuste conforme operação)
-- UPDATE public.pedidos SET taxa_motoboy = 6.00 WHERE taxa_motoboy IS NULL;

-- ============================================================
-- COMO CRIAR USUÁRIOS DE DEMONSTRAÇÃO (via Dashboard Supabase)
-- 1. Authentication > Users > Create user (email+senha):
--    admin@neiasalgados.com / Admin123!
--    producao@neiasalgados.com / Prod123!
--    motoboy@neiasalgados.com / Moto123!
--    cliente@neiasalgados.com / Cli123!
-- 2. Copie o UUID de cada um e rode:
-- ============================================================
-- INSERT INTO public.user_roles (user_id, role) VALUES
--   ('<UUID-ADMIN>', 'admin'),
--   ('<UUID-PRODUCAO>', 'producao'),
--   ('<UUID-MOTOBOY>', 'motoboy')
-- ON CONFLICT DO NOTHING;
--
-- UPDATE public.profiles SET nome='Neia (Admin)', telefone='(11) 90000-0001' WHERE id='<UUID-ADMIN>';
-- UPDATE public.profiles SET nome='Cozinha', telefone='(11) 90000-0002' WHERE id='<UUID-PRODUCAO>';
-- UPDATE public.profiles SET nome='Carlos Motoboy', telefone='(11) 90000-0003' WHERE id='<UUID-MOTOBOY>';
-- UPDATE public.profiles SET nome='Maria Cliente', telefone='(11) 90000-0004', pontos=35 WHERE id='<UUID-CLIENTE>';

-- ============================================================
-- PEDIDO DE EXEMPLO (para testar produção/motoboy sem front)
-- Substitua <UUID-CLIENTE> e rode:
-- ============================================================
-- WITH novo AS (
--   INSERT INTO public.pedidos (user_id, cliente_nome, telefone, endereco, bairro, forma_pagamento, subtotal, taxa_entrega, total)
--   VALUES ('<UUID-CLIENTE>', 'Maria Cliente', '(11) 90000-0004', 'Rua das Flores, 123', 'Centro', 'pix', 39.9, 8, 47.9)
--   RETURNING id
-- )
-- INSERT INTO public.pedido_itens (pedido_id, nome, preco_unitario, quantidade)
-- SELECT id, 'Coxinha de Frango', 6.50, 4 FROM novo;
