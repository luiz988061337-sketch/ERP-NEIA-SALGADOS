-- 0024: entrega — status motoboy, rotas, atrasos, endereço estruturado
-- Idempotente. Rode APÓS 0023.

CREATE TABLE IF NOT EXISTS public.rotas_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid REFERENCES public.motoboys(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'preparando' CHECK (status IN ('preparando','em_rota','concluida','cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  saiu_em timestamptz,
  chegou_em timestamptz
);

CREATE TABLE IF NOT EXISTS public.rota_pedidos (
  rota_id uuid NOT NULL REFERENCES public.rotas_entrega(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 1,
  PRIMARY KEY (rota_id, pedido_id)
);

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS atraso_motivo text,
  ADD COLUMN IF NOT EXISTS atraso_descricao text,
  ADD COLUMN IF NOT EXISTS pode_subir boolean,
  ADD COLUMN IF NOT EXISTS tipo_imovel text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS apartamento text,
  ADD COLUMN IF NOT EXISTS interfone text,
  ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.rotas_entrega(id) ON DELETE SET NULL;

ALTER TABLE public.motoboys
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disponivel_base',
  ADD COLUMN IF NOT EXISTS ultima_base_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_atraso_motivo_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_atraso_motivo_check CHECK (
  atraso_motivo IS NULL OR atraso_motivo IN ('transito','chuva_via','problema_veiculo','endereco_dificil','problema_endereco','cliente_ausente','espera','acidente_bloqueio','outro')
);

ALTER TABLE public.rotas_entrega ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rota_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rotas staff" ON public.rotas_entrega;
CREATE POLICY "rotas staff" ON public.rotas_entrega FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
);
DROP POLICY IF EXISTS "rota_pedidos staff" ON public.rota_pedidos;
CREATE POLICY "rota_pedidos staff" ON public.rota_pedidos FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'motoboy') OR public.has_role(auth.uid(),'producao')
);
GRANT ALL ON public.rotas_entrega, public.rota_pedidos TO authenticated;
