-- 0039: tipo_venda, destaque, custo, embalagem_custo em produtos
-- Idempotente. Rode APÓS 0038.

-- Enum para tipo_venda
CREATE TYPE public.tipo_venda AS ENUM ('combo_50', 'unidade');

-- Colunas novas
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_venda public.tipo_venda NOT NULL DEFAULT 'combo_50',
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custo numeric(10,2),
  ADD COLUMN IF NOT EXISTS embalagem_custo numeric(10,2);

-- Índices
CREATE INDEX IF NOT EXISTS produtos_tipo_venda_idx ON public.produtos (tipo_venda);
CREATE INDEX IF NOT EXISTS produtos_destaque_idx ON public.produtos (destaque) WHERE destaque = true;

-- Classificação inicial baseada na categoria atual
-- congelados, bebidas, kits = unidade | demais = combo_50
UPDATE public.produtos p
SET tipo_venda = CASE
  WHEN c.slug IN ('mini-congelados', 'bebidas', 'kits-para-festa') THEN 'unidade'::public.tipo_venda
  ELSE 'combo_50'::public.tipo_venda
END
FROM public.categorias c
WHERE p.categoria_id = c.id
  AND p.tipo_venda = 'combo_50'; -- só atualiza os que ainda estão no default

-- Comentários
COMMENT ON COLUMN public.produtos.tipo_venda IS 'combo_50 = múltiplos de 50; unidade = venda avulsa';
COMMENT ON COLUMN public.produtos.destaque IS 'Aparece na seção Destaques do cardápio';
COMMENT ON COLUMN public.produtos.custo IS 'Custo unitário do produto (para rentabilidade)';
COMMENT ON COLUMN public.produtos.embalagem_custo IS 'Custo de embalagem por unidade';