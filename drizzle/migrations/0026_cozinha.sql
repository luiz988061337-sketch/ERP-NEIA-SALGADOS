-- 0026: cozinha — fritura, sons/config, tempo por produto
-- Idempotente. Rode APÓS 0025.

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS tempo_fritura_50s integer NOT NULL DEFAULT 210;

CREATE TABLE IF NOT EXISTS public.fila_fritura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  quantidade integer NOT NULL DEFAULT 50,
  tempo_est_s integer NOT NULL DEFAULT 210,
  inicio timestamptz,
  fim timestamptz,
  tempo_real_s integer,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','fritando','pronto','cancelado')),
  funcionario text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fritura_status_idx ON public.fila_fritura (status);

ALTER TABLE public.fila_fritura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fritura staff" ON public.fila_fritura;
CREATE POLICY "fritura staff" ON public.fila_fritura FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
);
GRANT ALL ON public.fila_fritura TO authenticated;
