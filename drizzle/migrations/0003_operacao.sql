-- 0003: operação — agendamento, estoque, financeiro, logs, papéis
-- Rode no SQL Editor do Supabase APÓS 0000/0001/0002.

-- ---------- papéis ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'atendente') THEN
    ALTER TYPE public.app_role ADD VALUE 'atendente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'financeiro') THEN
    ALTER TYPE public.app_role ADD VALUE 'financeiro';
  END IF;
END $$;

-- ---------- pedidos: agendamento ----------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS agendado_para timestamptz,
  ADD COLUMN IF NOT EXISTS agendamento_obs text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS pedidos_agendado_idx ON public.pedidos (agendado_para) WHERE status <> 'cancelado';

-- ---------- produtos: estoque ----------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo integer,
  ADD COLUMN IF NOT EXISTS unidade_medida text NOT NULL DEFAULT 'un';

-- ---------- estoque_mov ----------
CREATE TABLE IF NOT EXISTS public.estoque_mov (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'ajuste',
  quantidade integer NOT NULL DEFAULT 0,
  motivo text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_mov_tipo CHECK (tipo IN ('entrada','saida','ajuste','perda','producao'))
);
CREATE INDEX IF NOT EXISTS estoque_mov_prod_idx ON public.estoque_mov (produto_id, created_at DESC);

-- ---------- despesas ----------
CREATE TABLE IF NOT EXISTS public.despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS despesas_data_idx ON public.despesas (data DESC);

-- ---------- admin_logs ----------
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_logs_created_idx ON public.admin_logs (created_at DESC);

-- ---------- RLS ----------
ALTER TABLE public.estoque_mov ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.estoque_mov TO service_role;
GRANT ALL ON public.despesas TO service_role;
GRANT ALL ON public.admin_logs TO service_role;

DROP POLICY IF EXISTS "estoque staff" ON public.estoque_mov;
CREATE POLICY "estoque staff" ON public.estoque_mov FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'atendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao'));

DROP POLICY IF EXISTS "despesas financeiro" ON public.despesas;
CREATE POLICY "despesas financeiro" ON public.despesas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "logs admin" ON public.admin_logs;
CREATE POLICY "logs admin" ON public.admin_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "logs staff insert" ON public.admin_logs;
CREATE POLICY "logs staff insert" ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'));
