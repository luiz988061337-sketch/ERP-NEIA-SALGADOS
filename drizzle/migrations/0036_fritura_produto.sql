-- 0036: fritura por produto — tempo de 50un configurável (padrão 210s = 3:30).
-- NULL = usa o padrão. Idempotente.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tempo_fritura_s integer;
