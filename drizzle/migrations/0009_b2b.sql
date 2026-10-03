-- 0009: B2B — campos de empresa no cadastro único de clientes
-- Rode no SQL Editor do Supabase APÓS 0000–0008. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Não duplica base: estende public.crm_customers (mesma chave telefone_norm).

ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS tipo_cliente text NOT NULL DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS razao_social text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_fantasia text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cnpj text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_customers_tipo_check') THEN
    ALTER TABLE public.crm_customers ADD CONSTRAINT crm_customers_tipo_check CHECK (tipo_cliente IN ('PF','PJ'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS crm_customers_tipo_idx ON public.crm_customers (tipo_cliente);
