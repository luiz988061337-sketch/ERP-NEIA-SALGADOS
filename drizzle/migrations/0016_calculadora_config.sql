-- 0016: config da calculadora de salgados (linha única, id=true)
-- Rode no SQL Editor do Supabase APÓS 0015. Idempotente.

CREATE TABLE IF NOT EXISTS public.calculadora_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  permitir_personalizado boolean NOT NULL DEFAULT true,
  por_pessoa_padrao integer NOT NULL DEFAULT 20,
  minimo_por_pessoa integer NOT NULL DEFAULT 15,
  maximo_por_pessoa integer NOT NULL DEFAULT 40
);

INSERT INTO public.calculadora_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.calculadora_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.calculadora_config TO service_role;
GRANT SELECT ON public.calculadora_config TO anon, authenticated;
GRANT UPDATE ON public.calculadora_config TO authenticated;

DROP POLICY IF EXISTS "calc select publico" ON public.calculadora_config;
CREATE POLICY "calc select publico" ON public.calculadora_config FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "calc admin update" ON public.calculadora_config;
CREATE POLICY "calc admin update" ON public.calculadora_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
