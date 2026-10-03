-- 0004: inteligência — evento, custo, avaliação pós-pedido, orçamentos, carrinho, notificações, config CRM
-- Rode no SQL Editor do Supabase APÓS 0000/0001/0002/0003. Idempotente (IF NOT EXISTS).

-- ---------- pedidos: tipo de evento ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_evento text NOT NULL DEFAULT '';

-- ---------- produtos: custo (margem estimada) ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS custo numeric(10,2);

-- ---------- avaliacoes: pós-pedido (qualidade/nota + prazo + atendimento) ----------
ALTER TABLE public.avaliacoes
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo integer,
  ADD COLUMN IF NOT EXISTS atendimento integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avaliacoes_prazo_check') THEN
    ALTER TABLE public.avaliacoes ADD CONSTRAINT avaliacoes_prazo_check CHECK (prazo IS NULL OR (prazo BETWEEN 1 AND 5));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avaliacoes_atendimento_check') THEN
    ALTER TABLE public.avaliacoes ADD CONSTRAINT avaliacoes_atendimento_check CHECK (atendimento IS NULL OR (atendimento BETWEEN 1 AND 5));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS avaliacoes_pedido_idx ON public.avaliacoes (pedido_id);

-- ---------- orcamentos (eventos/festas; NÃO é pedido) ----------
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  tipo_evento text NOT NULL DEFAULT '',
  pessoas integer NOT NULL DEFAULT 0,
  data_evento date,
  horario text NOT NULL DEFAULT '',
  mix jsonb NOT NULL DEFAULT '[]',
  observacoes text NOT NULL DEFAULT '',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho',
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orcamentos_user_idx ON public.orcamentos (user_id, created_at DESC);

-- ---------- carrinho_eventos (abandono / funil) ----------
CREATE TABLE IF NOT EXISTS public.carrinho_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  telefone text NOT NULL DEFAULT '',
  etapa text NOT NULL DEFAULT 'carrinho',
  itens jsonb NOT NULL DEFAULT '[]',
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carrinho_eventos_created_idx ON public.carrinho_eventos (created_at DESC);
CREATE INDEX IF NOT EXISTS carrinho_eventos_tel_idx ON public.carrinho_eventos (telefone, created_at DESC);

-- ---------- notificacoes (painel; lida por usuário via UPDATE) ----------
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'info',
  titulo text NOT NULL DEFAULT '',
  detalhe text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_created_idx ON public.notificacoes (created_at DESC);

-- ---------- crm_settings: inteligência configurável ----------
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS vip_min_pedidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_min_valor numeric(10,2) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS freq_min_pedidos integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS sugestoes_ativas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recompra_ativa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS carrinho_recuperacao_ativa boolean NOT NULL DEFAULT true;

-- ---------- RLS ----------
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrinho_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.orcamentos TO service_role;
GRANT ALL ON public.carrinho_eventos TO service_role;
GRANT ALL ON public.notificacoes TO service_role;

DROP POLICY IF EXISTS "orcamentos own" ON public.orcamentos;
CREATE POLICY "orcamentos own" ON public.orcamentos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "carrinho_eventos own" ON public.carrinho_eventos;
CREATE POLICY "carrinho_eventos own" ON public.carrinho_eventos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "notificacoes staff" ON public.notificacoes;
CREATE POLICY "notificacoes staff" ON public.notificacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
