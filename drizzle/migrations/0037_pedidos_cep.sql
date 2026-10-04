-- 0037: CEP do endereço de entrega (comanda + fiscal futuro). Idempotente.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cep text;
