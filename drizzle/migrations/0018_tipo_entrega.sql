-- 0018: tipo de entrega no pedido (entrega | retirada)
-- Rode no SQL Editor do Supabase APÓS 0017. Idempotente.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_entrega_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_tipo_entrega_check
  CHECK (tipo_entrega IN ('entrega', 'retirada'));
