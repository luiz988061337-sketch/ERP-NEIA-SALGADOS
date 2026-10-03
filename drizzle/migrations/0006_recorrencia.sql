-- 0006: recorrência comercial — aniversário, origem de campanha, cupons personalizados, metas
-- Rode no SQL Editor do Supabase APÓS 0000–0005. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

-- ---------- clientes: data de nascimento (só se o cliente informar) ----------
ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS data_nascimento date;

-- ---------- pedidos: origem de campanha (link rastreável) ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS campanha_origem text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS pedidos_campanha_idx ON public.pedidos (campanha_origem) WHERE campanha_origem <> '';

-- ---------- cupons personalizados ----------
ALTER TABLE public.cupons
  ADD COLUMN IF NOT EXISTS cliente_telefone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS validade_ini timestamptz,
  ADD COLUMN IF NOT EXISTS validade_fim timestamptz,
  ADD COLUMN IF NOT EXISTS max_usos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS produtos_ids jsonb NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS cupons_cliente_idx ON public.cupons (cliente_telefone) WHERE cliente_telefone <> '';

-- ---------- metas ----------
CREATE TABLE IF NOT EXISTS public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'mensal',
  periodo_ref text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_tipo CHECK (tipo IN ('diaria','semanal','mensal')),
  UNIQUE (tipo, periodo_ref)
);
CREATE INDEX IF NOT EXISTS metas_periodo_idx ON public.metas (tipo, periodo_ref DESC);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.metas TO service_role;
GRANT ALL ON public.metas TO authenticated;

DROP POLICY IF EXISTS "metas admin" ON public.metas;
CREATE POLICY "metas admin" ON public.metas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
