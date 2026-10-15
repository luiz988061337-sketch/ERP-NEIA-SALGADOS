-- 0082: importação de extratos (OFX/CSV) com conciliação manual
-- Linhas importadas ficam pendentes; o vínculo com pedido/conta é sempre
-- confirmado por humano (nunca automático). Idempotente.

CREATE TABLE IF NOT EXISTS public.extratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  arquivo text NOT NULL DEFAULT '',
  linha integer NOT NULL DEFAULT 0,
  data date NOT NULL,
  descricao text NOT NULL DEFAULT '',
  valor numeric(12,2) NOT NULL DEFAULT 0,
  referencia text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','conciliado','ignorado')),
  vinculo_tipo text NOT NULL DEFAULT ''
    CHECK (vinculo_tipo IN ('','pedido','conta')),
  vinculo_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_bancaria_id, referencia)
);
CREATE INDEX IF NOT EXISTS extratos_status_idx ON public.extratos (status);
CREATE INDEX IF NOT EXISTS extratos_data_idx ON public.extratos (data);

ALTER TABLE public.extratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "extratos staff" ON public.extratos;
CREATE POLICY "extratos staff" ON public.extratos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.extratos TO authenticated;
GRANT ALL ON public.extratos TO service_role;
