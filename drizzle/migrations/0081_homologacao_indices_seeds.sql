-- 0081: ETAPA P — índices de homologação + dados de exemplo (DEMO)
-- Índices nas tabelas novas mais consultadas. Seeds claramente marcadas
-- (prefixo DEMO, fáceis de apagar); só criam se ainda não existirem e só
-- referenciam produtos que já existirem (por nome aproximado).
-- Idempotente.

CREATE INDEX IF NOT EXISTS pedido_itens_pedido_idx ON public.pedido_itens (pedido_id);
CREATE INDEX IF NOT EXISTS contas_pago_em_idx ON public.contas (pago_em);
CREATE INDEX IF NOT EXISTS contas_banco_idx ON public.contas (conta_bancaria_id);

-- Fornecedor de exemplo
INSERT INTO public.fornecedores (nome, contato, prazo_entrega_dias, condicoes_pagamento)
SELECT 'DEMO Atacadão', '(11) 90000-0000', 3, 'à vista'
WHERE NOT EXISTS (SELECT 1 FROM public.fornecedores WHERE nome = 'DEMO Atacadão');

-- Insumos de exemplo (unidade base em gramas)
INSERT INTO public.insumos (nome, categoria, unidade_base, estoque_atual, estoque_minimo, custo_medio)
SELECT v.nome, v.cat, 'g', 0, 2000, 0
FROM (VALUES
  ('DEMO Frango desfiado', 'proteína'),
  ('DEMO Farinha de trigo', 'secos'),
  ('DEMO Óleo de soja', 'óleos')
) AS v(nome, cat)
WHERE NOT EXISTS (SELECT 1 FROM public.insumos WHERE nome = v.nome);

-- Um lote inicial para cada insumo DEMO (5 kg a R$ 12/kg = R$ 0,012/g)
DO $$ DECLARE
  r record;
  v_forn uuid;
BEGIN
  SELECT id INTO v_forn FROM public.fornecedores WHERE nome = 'DEMO Atacadão' LIMIT 1;
  FOR r IN SELECT id, nome FROM public.insumos WHERE nome LIKE 'DEMO %' LOOP
    IF NOT EXISTS (SELECT 1 FROM public.insumo_lotes WHERE insumo_id = r.id) THEN
      INSERT INTO public.insumo_lotes (insumo_id, quantidade, restante, custo_unitario, fornecedor_id)
      VALUES (r.id, 5000, 5000, 0.012, v_forn);
      UPDATE public.insumos SET estoque_atual = 5000, custo_medio = 0.012 WHERE id = r.id;
      INSERT INTO public.insumo_movimentacoes (insumo_id, tipo, quantidade, saldo_antes, saldo_depois, custo, referencia)
      VALUES (r.id, 'entrada', 5000, 0, 5000, 0.012, 'DEMO inicial');
    END IF;
  END LOOP;
END $$;

-- Ficha DEMO no primeiro produto parecido com coxinha (25 g frango/un, perda 4%)
DO $$ DECLARE
  v_prod uuid;
  v_ficha uuid;
  v_frango uuid;
BEGIN
  SELECT id INTO v_prod FROM public.produtos WHERE nome ILIKE '%coxinha%' AND disponivel LIMIT 1;
  SELECT id INTO v_frango FROM public.insumos WHERE nome = 'DEMO Frango desfiado' LIMIT 1;
  IF v_prod IS NOT NULL AND v_frango IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.fichas_tecnicas WHERE produto_id = v_prod) THEN
    INSERT INTO public.fichas_tecnicas (produto_id, rendimento, perda_pct, obs)
    VALUES (v_prod, 1, 4, 'DEMO — ficha de exemplo')
    RETURNING id INTO v_ficha;
    INSERT INTO public.ficha_itens (ficha_id, insumo_id, quantidade, unidade)
    VALUES (v_ficha, v_frango, 25, 'g');
  END IF;
END $$;

-- Contas DEMO do mês (apagar junto com o resto do prefixo)
INSERT INTO public.contas (tipo, descricao, categoria, valor, meio, status, vencimento)
SELECT 'pagar', 'DEMO Energia elétrica', 'fixo', 350, 'pix', 'pendente', (date_trunc('month', now()) + interval '1 month - 1 day')::date
WHERE NOT EXISTS (SELECT 1 FROM public.contas WHERE descricao = 'DEMO Energia elétrica');
INSERT INTO public.contas (tipo, descricao, categoria, valor, meio, status, vencimento)
SELECT 'receber', 'DEMO Evento corporativo', 'evento', 1200, 'pix', 'pendente', (date_trunc('month', now()) + interval '10 days')::date
WHERE NOT EXISTS (SELECT 1 FROM public.contas WHERE descricao LIKE 'DEMO Evento%');

-- Limpeza (rode quando quiser remover tudo de exemplo):
-- DELETE FROM public.contas WHERE descricao LIKE 'DEMO%';
-- DELETE FROM public.ficha_itens WHERE ficha_id IN (SELECT id FROM public.fichas_tecnicas WHERE obs LIKE 'DEMO%');
-- DELETE FROM public.fichas_tecnicas WHERE obs LIKE 'DEMO%';
-- DELETE FROM public.insumo_movimentacoes WHERE referencia = 'DEMO inicial';
-- DELETE FROM public.insumo_lotes WHERE insumo_id IN (SELECT id FROM public.insumos WHERE nome LIKE 'DEMO%');
-- DELETE FROM public.insumos WHERE nome LIKE 'DEMO%';
-- DELETE FROM public.fornecedores WHERE nome LIKE 'DEMO%';
