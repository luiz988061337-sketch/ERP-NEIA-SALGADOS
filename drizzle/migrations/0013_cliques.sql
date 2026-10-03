-- 0013: cliques em links de campanha (métrica real, sem PII)
-- Rode no SQL Editor do Supabase APÓS 0000–0012. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Risco consciente: insert anônimo restrito a (slug, data); sem PII, só contagem.
-- Sem rate-limit no banco — se houver abuso, desative a policy "cliques anon insert".

CREATE TABLE IF NOT EXISTS public.campanha_cliques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campanha_cliques_slug_idx ON public.campanha_cliques (slug, created_at DESC);

ALTER TABLE public.campanha_cliques ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.campanha_cliques TO service_role;
GRANT ALL ON public.campanha_cliques TO authenticated;

DROP POLICY IF EXISTS "cliques admin read" ON public.campanha_cliques;
CREATE POLICY "cliques admin read" ON public.campanha_cliques FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "cliques anon insert" ON public.campanha_cliques;
CREATE POLICY "cliques anon insert" ON public.campanha_cliques FOR INSERT TO anon, authenticated
  WITH CHECK (slug <> '' AND length(slug) <= 60);
