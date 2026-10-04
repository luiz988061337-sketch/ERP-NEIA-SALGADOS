-- 0025: impressão — fila, logs, anti-duplicidade, status de impressão
-- Idempotente. Rode APÓS 0024.

CREATE TABLE IF NOT EXISTS public.fila_impressao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabalho_uuid text NOT NULL UNIQUE,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'pedido' CHECK (tipo IN ('pedido','teste','ficha_cozinha')),
  payload text NOT NULL DEFAULT '',
  impressora text NOT NULL DEFAULT 'Tanca TP-550',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviando','impresso','erro','cancelado')),
  tentativa integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  reimpressoes integer NOT NULL DEFAULT 0,
  motivo_reimpressao text,
  imprimir_apos timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fila_status_idx ON public.fila_impressao (status);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS impresso boolean NOT NULL DEFAULT false;

ALTER TABLE public.fila_impressao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fila staff" ON public.fila_impressao;
CREATE POLICY "fila staff" ON public.fila_impressao FOR ALL USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'atendente')
);
GRANT ALL ON public.fila_impressao TO authenticated;
