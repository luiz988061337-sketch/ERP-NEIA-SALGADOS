-- 0019: contato e validade do orçamento na calculadora
-- Rode no SQL Editor do Supabase APÓS 0016. Idempotente.

ALTER TABLE public.calculadora_config
  ADD COLUMN IF NOT EXISTS zap_contato text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS orcamento_validade_dias integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.calculadora_config.zap_contato IS
  'WhatsApp que recebe os pedidos de orçamento (DDD + número, com ou sem 55).';
COMMENT ON COLUMN public.calculadora_config.orcamento_validade_dias IS
  'Validade padrão do orçamento em dias, informada ao cliente na página /calculadora.';