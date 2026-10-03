-- 0007: orçamento — validade explícita
-- Rode no SQL Editor do Supabase APÓS 0000–0006. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS validade date;
