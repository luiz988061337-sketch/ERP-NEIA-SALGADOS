-- 0017: cadastro de motoboys (usado no painel admin)
-- Rode no SQL Editor do Supabase APÓS 0016. Idempotente.

CREATE TABLE IF NOT EXISTS public.motoboys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  observacao text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.motoboys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoboys TO authenticated;

DROP POLICY IF EXISTS "motoboys admin all" ON public.motoboys;
CREATE POLICY "motoboys admin all" ON public.motoboys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
