-- 0015: carrossel de hero configurável pelo admin
-- Rode no SQL Editor do Supabase APÓS 0000–0014. Idempotente.

CREATE TABLE IF NOT EXISTS public.hero_carousel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imagem_url text NOT NULL,
  legenda text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_carousel_ativo_ordem_idx ON public.hero_carousel (ativo, ordem);

ALTER TABLE public.hero_carousel ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hero_carousel TO service_role;
GRANT SELECT ON public.hero_carousel TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hero_carousel TO authenticated;

DROP POLICY IF EXISTS "hero select publico" ON public.hero_carousel;
CREATE POLICY "hero select publico" ON public.hero_carousel FOR SELECT TO anon, authenticated
  USING (ativo = true);

DROP POLICY IF EXISTS "hero admin all" ON public.hero_carousel;
CREATE POLICY "hero admin all" ON public.hero_carousel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
