-- ============================================================================
-- 0097: MODELAGEM ESTRUTURADA DO COMBO (MONTAGEM) + PRECO AUTORITATIVO
-- ============================================================================
-- PROBLEMA
--   O carrinho antigo guardava apenas "Combo <categoria> 50un (...)" e a
--   quantidade total. Sem os produtos/quantidades escolhidos, o servidor nao
--   consegue reservar/debitar os componentes e a 0095 falhava fechado com
--   'montagem_sem_modelagem'. Preco tambem vinha de constante do frontend.
--
-- SOLUCAO MINIMA (sem inventar composicao)
--   1. `pedido_item_componentes`: uma linha por produto/quantidade escolhida,
--      ligada ao `pedido_itens` do combo. A soma das quantidades e IGUAL a
--      quantidade do item pai (validado pela 0095/0089).
--   2. `categorias.combo_preco_unit`: preco unitario autoritativo do combo,
--      lido pelo servidor. A 0095 rejeita combo sem preco configurado.
--
-- UNIDADE
--   `quantidade` e sempre a unidade comercial do produto (mini salgado), a
--   mesma unidade de `produtos.estoque` e do preco unitario. O rotulo "25un"
--   no nome e apenas apresentacao; NAO existe conversao de embalagem.
--
-- SEGURANCA
--   - Tabela de leitura; escrita somente pela funcao SECURITY DEFINER 0095.
--   - RLS: dono do pedido ou staff operacional; sem grants para anon.
--   - Nao altera pedidos/reservas existentes; nenhum backfill automatico.
--
-- ORDEM DE CUTOVER
--   Aplicar esta migration ANTES de ligar a flag da criacao atomica (0095).
--   Sem ela, a 0095 continua falhando fechada para combo (nao ha fallback).
-- ============================================================================

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS combo_preco_unit numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'categorias_combo_preco_unit_check'
       AND conrelid = 'public.categorias'::regclass
  ) THEN
    ALTER TABLE public.categorias
      ADD CONSTRAINT categorias_combo_preco_unit_check
      CHECK (combo_preco_unit IS NULL OR combo_preco_unit >= 0);
  END IF;
END;
$$;

-- Semente dos precos unitarios vigentes (mesmos valores do fallback do frontend
-- em src/lib/combo.ts). Nao sobrescreve configuracao ja feita pelo admin.
UPDATE public.categorias
   SET combo_preco_unit = CASE slug
         WHEN 'mini-fritos'      THEN 1.60
         WHEN 'mini-assados'     THEN 2.30
         WHEN 'mini-pasteis'     THEN 2.30
         WHEN 'mini-pizzas'      THEN 3.70
         WHEN 'mini-empadinhas'  THEN 2.40
       END
 WHERE slug IN ('mini-fritos', 'mini-assados', 'mini-pasteis', 'mini-pizzas', 'mini-empadinhas')
   AND combo_preco_unit IS NULL;

CREATE TABLE IF NOT EXISTS public.pedido_item_componentes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id uuid NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  produto_id     uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade     integer NOT NULL CHECK (quantidade > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_item_componentes_item_produto_key UNIQUE (pedido_item_id, produto_id)
);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_item_idx
  ON public.pedido_item_componentes (pedido_item_id);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_produto_idx
  ON public.pedido_item_componentes (produto_id);

ALTER TABLE public.pedido_item_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_item_componentes_select ON public.pedido_item_componentes;
CREATE POLICY pedido_item_componentes_select
  ON public.pedido_item_componentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.pedido_itens i
        JOIN public.pedidos p ON p.id = i.pedido_id
       WHERE i.id = pedido_item_id
         AND (
           p.user_id = auth.uid()
           OR p.motoboy_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'atendente'::public.app_role)
           OR public.has_role(auth.uid(), 'producao'::public.app_role)
         )
    )
  );

REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM authenticated;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

COMMENT ON TABLE public.pedido_item_componentes IS
$$Composicao estruturada de um item de combo (montagem). Cada linha e um
produto/quantidade escolhido; a soma deve ser igual a pedido_itens.quantidade.
Escrita apenas pelas funcoes atomicas SECURITY DEFINER (0095).$$;

COMMENT ON COLUMN public.categorias.combo_preco_unit IS
$$Preco unitario autoritativo do combo para esta categoria. A 0095 recalcula o
subtotal do combo com este valor e falha fechada se estiver NULL.$$;
