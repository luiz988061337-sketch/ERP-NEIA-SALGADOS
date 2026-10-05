-- 0023: base operacional — histórico, lotes FEFO, reservas, horário/capacidade
-- Idempotente. Rode no SQL Editor APÓS 0022.

-- Histórico/timeline de status (override auditado: quem, quando, de, para, motivo)
CREATE TABLE IF NOT EXISTS public.pedido_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  de_status text,
  para_status text NOT NULL,
  actor uuid REFERENCES auth.users(id),
  motivo text,
  override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_hist_pedido_idx ON public.pedido_status_historico (pedido_id);

-- Flags operacionais no pedido (atraso é ALERTA, não apaga estágio real)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS atrasado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS problema text,
  ADD COLUMN IF NOT EXISTS agendamento_janela text,
  ADD COLUMN IF NOT EXISTS preparo_em timestamptz,
  ADD COLUMN IF NOT EXISTS pronto_em timestamptz,
  ADD COLUMN IF NOT EXISTS saiu_em timestamptz;

-- Lotes e validade (FEFO)
CREATE TABLE IF NOT EXISTS public.lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  restante integer NOT NULL DEFAULT 0,
  produzido_em date,
  validade date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','esgotado','vencido')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, codigo)
);
CREATE INDEX IF NOT EXISTS lotes_prod_validade_idx ON public.lotes (produto_id, validade);

-- Reservas de estoque (confirmação reserva, cancelamento libera)
CREATE TABLE IF NOT EXISTS public.reservas_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','liberada','consumida','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservas_pedido_idx ON public.reservas_estoque (pedido_id);

-- Movimentações: garantir tipos novos nunca quebram CHECK antigo -> sem CHECK, só texto
-- (estoque_mov.tipo já é texto livre nas migrations)

-- Config de horário/capacidade (singleton id=true)
CREATE TABLE IF NOT EXISTS public.horario_config (
  id boolean PRIMARY KEY DEFAULT true,
  antecedencia_min integer NOT NULL DEFAULT 30,
  teto_unidades_janela integer NOT NULL DEFAULT 2000,
  tempo_fritura_50s integer NOT NULL DEFAULT 210,
  CONSTRAINT horario_config_single CHECK (id = true)
);
INSERT INTO public.horario_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.pedido_status_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hist dono/staff" ON public.pedido_status_historico;
CREATE POLICY "hist dono/staff" ON public.pedido_status_historico FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND (p.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'motoboy')))
);
DROP POLICY IF EXISTS "hist staff insert" ON public.pedido_status_historico;
-- NOTA 0053: dono insere no próprio pedido (nascimento via checkout); 0053 repete p/ bancos já criados.
CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
  OR EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "lotes staff" ON public.lotes;
CREATE POLICY "lotes staff" ON public.lotes FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente')
);
DROP POLICY IF EXISTS "lotes public read" ON public.lotes;
CREATE POLICY "lotes public read" ON public.lotes FOR SELECT USING (true);

DROP POLICY IF EXISTS "reservas staff" ON public.reservas_estoque;
CREATE POLICY "reservas staff" ON public.reservas_estoque FOR ALL USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'atendente') OR public.has_role(auth.uid(), 'financeiro')
);

DROP POLICY IF EXISTS "horario public read" ON public.horario_config;
CREATE POLICY "horario public read" ON public.horario_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "horario admin write" ON public.horario_config;
CREATE POLICY "horario admin write" ON public.horario_config FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Grants (evita 42501 mesmo com RLS ok)
GRANT ALL ON public.pedido_status_historico TO authenticated;
GRANT ALL ON public.lotes TO authenticated;
GRANT ALL ON public.reservas_estoque TO authenticated;
GRANT ALL ON public.horario_config TO authenticated;
GRANT SELECT ON public.pedido_status_historico, public.lotes, public.horario_config TO anon;
