-- 0001: tipo_venda/destaque/promo + cidade + CRM base
-- Rode no SQL Editor do Supabase APÓS a migration 0000.

-- ---------- produtos ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_venda text NOT NULL DEFAULT 'combo_50',
  ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS promo_fim timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ativo boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produtos_tipo_venda_check') THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_tipo_venda_check CHECK (tipo_venda IN ('combo_50','unidade'));
  END IF;
END $$;

-- classifica o catálogo atual: congelados/kits/bebidas = unidade
UPDATE public.produtos p SET tipo_venda = 'unidade' FROM public.categorias c
WHERE p.categoria_id = c.id AND c.slug IN ('mini-congelados','kits-para-festa','bebidas');

-- ---------- pedidos: cidade ----------
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS cidade text NOT NULL DEFAULT '';

-- ---------- CRM ----------
CREATE TABLE IF NOT EXISTS public.crm_customers (
  telefone_norm text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endereco_recente text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  opt_out boolean NOT NULL DEFAULT false,
  notas text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_settings (
  id boolean PRIMARY KEY DEFAULT true,
  ativo_ate_dias integer NOT NULL DEFAULT 14,
  risco_apos_dias integer NOT NULL DEFAULT 21,
  inativo_apos_dias integer NOT NULL DEFAULT 30,
  muito_inativo_apos_dias integer NOT NULL DEFAULT 60,
  intervalo_min_campanhas_dias integer NOT NULL DEFAULT 7,
  campanhas_habilitadas boolean NOT NULL DEFAULT true,
  mensagem_padrao text NOT NULL DEFAULT 'Olá {{cliente}}! Sentimos sua falta aqui na Néia Salgados! Já faz {{dias_sem_comprar}} dias desde seu último pedido. Quer receber nosso cardápio? {{link_cardapio}}',
  CONSTRAINT crm_settings_singleton CHECK (id = true)
);
INSERT INTO public.crm_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  segmento text NOT NULL DEFAULT 'inativo',
  filtros jsonb NOT NULL DEFAULT '{}',
  mensagem_template text NOT NULL DEFAULT '',
  link_rastreavel text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_recipients (
  campaign_id uuid NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  telefone_norm text NOT NULL REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE,
  nome_snapshot text NOT NULL DEFAULT '',
  variaveis jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'apto',
  motivo text NOT NULL DEFAULT '',
  sent_at timestamptz,
  PRIMARY KEY (campaign_id, telefone_norm)
);

CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_norm text NOT NULL REFERENCES public.crm_customers(telefone_norm) ON DELETE CASCADE,
  tipo text NOT NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.crm_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS crm_events_tel_idx ON public.crm_events (telefone_norm, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_recipients_tel_idx ON public.crm_recipients (telefone_norm);
CREATE INDEX IF NOT EXISTS pedidos_tel_idx ON public.pedidos (telefone);
CREATE INDEX IF NOT EXISTS pedidos_status_created_idx ON public.pedidos (status, created_at DESC);

-- RLS: só admin
ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.crm_customers TO service_role;
GRANT ALL ON public.crm_settings TO service_role;
GRANT ALL ON public.crm_campaigns TO service_role;
GRANT ALL ON public.crm_recipients TO service_role;
GRANT ALL ON public.crm_events TO service_role;

DROP POLICY IF EXISTS "crm admin all customers" ON public.crm_customers;
CREATE POLICY "crm admin all customers" ON public.crm_customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all settings" ON public.crm_settings;
CREATE POLICY "crm admin all settings" ON public.crm_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all campaigns" ON public.crm_campaigns;
CREATE POLICY "crm admin all campaigns" ON public.crm_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all recipients" ON public.crm_recipients;
CREATE POLICY "crm admin all recipients" ON public.crm_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "crm admin all events" ON public.crm_events;
CREATE POLICY "crm admin all events" ON public.crm_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
