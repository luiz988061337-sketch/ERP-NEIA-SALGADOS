-- 0044: motoboy_estados + rotas + historico
-- Idempotente. Rode APÓS 0043.

-- =============================================
-- 1. Enum para status do motoboy
-- =============================================
-- DO block = reexecutável (0047 repete por segurança).
DO $$ BEGIN
CREATE TYPE public.motoboy_status AS ENUM (
  'disponivel_base',
  'preparando_saida',
  'em_rota',
  'retornando_base',
  'aguardando_nova_rota',
  'offline'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Tabela de motoboys (estende papel existente)
-- =============================================
CREATE TABLE IF NOT EXISTS public.motoboys (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  status public.motoboy_status NOT NULL DEFAULT 'offline',
  veiculo text,
  placa text,
  observacao text,
  ultima_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motoboys_status_idx ON public.motoboys (status);

-- =============================================
-- 3. Tabela de rotas
-- =============================================
CREATE TABLE IF NOT EXISTS public.rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'concluida', 'cancelada')),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz
);

CREATE INDEX IF NOT EXISTS rotas_motoboy_idx ON public.rotas (motoboy_id);
CREATE INDEX IF NOT EXISTS rotas_status_idx ON public.rotas (status);

-- =============================================
-- 4. Pedidos na rota (ordem de entrega)
-- =============================================
CREATE TABLE IF NOT EXISTS public.rota_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  UNIQUE (rota_id, pedido_id)
);

CREATE INDEX IF NOT EXISTS rota_pedidos_rota_idx ON public.rota_pedidos (rota_id);

-- =============================================
-- 5. Histórico do motoboy (saída, entrega, retorno, atrasos)
-- =============================================
CREATE TABLE IF NOT EXISTS public.motoboy_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL REFERENCES public.motoboys(id) ON DELETE CASCADE,
  rota_id uuid REFERENCES public.rotas(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  evento text NOT NULL CHECK (evento IN (
    'saida_base',
    'chegada_entrega',
    'entrega_realizada',
    'atraso',
    'retorno_base',
    'inicio_preparacao_saida',
    'fim_preparacao_saida'
  )),
  detalhe text,
  localizacao_lat double precision,
  localizacao_lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS motoboy_hist_motoboy_idx ON public.motoboy_historico (motoboy_id);
CREATE INDEX IF NOT EXISTS motoboy_hist_created_idx ON public.motoboy_historico (created_at);
CREATE INDEX IF NOT EXISTS motoboy_hist_evento_idx ON public.motoboy_historico (evento);

-- =============================================
-- 6. Enum para motivos de atraso
-- =============================================
DO $$ BEGIN
CREATE TYPE public.atraso_motivo AS ENUM (
  'transito',
  'chuva',
  'veiculo',
  'endereco',
  'cliente_ausente',
  'espera',
  'acidente_bloqueio',
  'outro'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 7. Atrasos de entrega
-- =============================================
CREATE TABLE IF NOT EXISTS public.entrega_atrasos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  motoboy_id uuid REFERENCES public.motoboys(id) ON DELETE SET NULL,
  motivo public.atraso_motivo NOT NULL,
  descricao_outro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS atrasos_pedido_idx ON public.entrega_atrasos (pedido_id);
CREATE INDEX IF NOT EXISTS atrasos_motoboy_idx ON public.entrega_atrasos (motoboy_id);
CREATE INDEX IF NOT EXISTS atrasos_criado_idx ON public.entrega_atrasos (criado_em);

-- =============================================
-- 8. RLS
-- =============================================
ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoboy_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrega_atrasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motoboys staff" ON public.motoboys;
CREATE POLICY "motoboys staff" ON public.motoboys FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "rotas staff" ON public.rotas;
CREATE POLICY "rotas staff" ON public.rotas FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "rota_pedidos staff" ON public.rota_pedidos;
CREATE POLICY "rota_pedidos staff" ON public.rota_pedidos FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "motoboy_hist staff" ON public.motoboy_historico;
CREATE POLICY "motoboy_hist staff" ON public.motoboy_historico FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "atrasos staff" ON public.entrega_atrasos;
CREATE POLICY "atrasos staff" ON public.entrega_atrasos FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

-- Comentários
COMMENT ON TYPE public.motoboy_status IS 'disponivel_base, preparando_saida, em_rota, retornando_base, aguardando_nova_rota, offline';
COMMENT ON TYPE public.atraso_motivo IS 'Motivos padronizados de atraso de entrega';