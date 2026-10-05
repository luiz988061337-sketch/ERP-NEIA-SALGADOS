-- 0040: cidade em pedidos + status estendidos + agendado_para + confirmado_em
-- Idempotente. Rode APÓS 0039.

-- Nova coluna cidade em pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';

-- Estender enum order_status com novos status
-- Nota: não podemos alterar enum diretamente, criamos novo e migramos
-- Mas por enquanto adicionamos campos complementares

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS agendado_para timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pago_em timestamptz;

-- Índices
CREATE INDEX IF NOT EXISTS pedidos_cidade_idx ON public.pedidos (cidade);
CREATE INDEX IF NOT EXISTS pedidos_agendado_para_idx ON public.pedidos (agendado_para);
CREATE INDEX IF NOT EXISTS pedidos_confirmado_em_idx ON public.pedidos (confirmado_em);

-- Comentários
COMMENT ON COLUMN public.pedidos.cidade IS 'Cidade de entrega (obrigatória no checkout)';
COMMENT ON COLUMN public.pedidos.agendado_para IS 'Data/hora agendada para entrega/retirada';
COMMENT ON COLUMN public.pedidos.confirmado_em IS 'Timestamp da confirmação de pagamento/pedido';
COMMENT ON COLUMN public.pedidos.pago_em IS 'Timestamp da confirmação de pagamento (pix/dinheiro)';