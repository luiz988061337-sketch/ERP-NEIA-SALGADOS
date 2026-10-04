-- 0027: comunicação — lembretes de pedidos futuros, sem auto-cancelar
-- Idempotente. Rode APÓS 0026.

CREATE TABLE IF NOT EXISTS public.pedido_lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('7d','3d','24h','dia')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','confirmado','alterado','cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, tipo)
);
ALTER TABLE public.pedido_lembretes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lembretes staff" ON public.pedido_lembretes;
CREATE POLICY "lembretes staff" ON public.pedido_lembretes FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'producao')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'producao')
);
GRANT ALL ON public.pedido_lembretes TO authenticated;
