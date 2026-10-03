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