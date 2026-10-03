-- ============================================================================
-- APLIQUE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase (projeto iqirsunzgavsuhgyjjsi)
-- Contem as migrations 0015, 0016, 0017 e 0018. Pode rodar quantas vezes quiser.
-- ============================================================================


-- 0015: carrossel de hero configuravel pelo admin -----------------------------
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
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 0016: config da calculadora de salgados (linha unica, id=true) --------------
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
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 0017: cadastro de motoboys (usado no painel admin) --------------------------
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
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- 0018: tipo de entrega no pedido (entrega | retirada) -------------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_entrega_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_tipo_entrega_check
  CHECK (tipo_entrega IN ('entrega', 'retirada'));


-- VERIFICACAO: rode isto depois, deve vir tudo preenchido ------------------------
SELECT count(*) AS hero_slides FROM public.hero_carousel;
SELECT * FROM public.calculadora_config;
SELECT count(*) AS motoboys FROM public.motoboys;
SELECT column_name, is_nullable, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tipo_entrega';
SELECT conname FROM pg_constraint WHERE conname = 'pedidos_tipo_entrega_check';
SELECT count(*) AS sem_tipo FROM public.pedidos WHERE tipo_entrega IS NULL;