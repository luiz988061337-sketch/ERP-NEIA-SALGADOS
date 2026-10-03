-- ============================================================================
-- PASSO 10 - 0022: status do pagamento separado do status do pedido
-- Rode em UM New query. Idempotente.
-- ============================================================================

-- 0022: status do pagamento separado do status do pedido
-- Rode no SQL Editor do Supabase APÓS 0000. Idempotente.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pagamento_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS pagamento_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pagamento_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pagamento_status_check
  CHECK (pagamento_status IN ('pendente', 'pago', 'falhou', 'reembolsado'));

-- Pedidos já existentes entram como pendentes: NUNCA marcar como pago sozinho.
UPDATE public.pedidos SET pagamento_status = 'pendente' WHERE pagamento_status IS NULL;

CREATE INDEX IF NOT EXISTS pedidos_pagamento_status_idx ON public.pedidos (pagamento_status);

COMMENT ON COLUMN public.pedidos.pagamento_status IS
  'Status financeiro, independente do status do pedido: pendente | pago | falhou | reembolsado.';
COMMENT ON COLUMN public.pedidos.pagamento_em IS
  'Quando o pagamento foi confirmado. Preenchido apenas por confirmação manual da loja.';
-- ----------------------------------------------------------------------------
-- VERIFICACAO
-- ----------------------------------------------------------------------------
SELECT
  (SELECT string_agg(column_name, ', ' ORDER BY column_name) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pedidos'
       AND column_name IN ('pagamento_status','pagamento_em')) AS "1_COLUNAS",
  (SELECT conname FROM pg_constraint WHERE conname='pedidos_pagamento_status_check') AS "2_CHECK",
  (SELECT pagamento_status || ' = ' || count(*)::text FROM public.pedidos
     GROUP BY pagamento_status ORDER BY pagamento_status) AS "3_PEDIDOS_POR_STATUS";