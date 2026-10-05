-- 0035: loja social — links usados no "enquanto preparamos" e no convite Google.
-- Tudo opcional: a UI só mostra o que estiver preenchido. Idempotente.
ALTER TABLE public.loja_config
  ADD COLUMN IF NOT EXISTS instagram text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_avaliacao text NOT NULL DEFAULT '';
