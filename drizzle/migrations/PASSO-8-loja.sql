-- ============================================================================
-- PASSO 8 - 0021: dados da loja (endereco de retirada + ponto no mapa)
-- Rode em UM New query. Idempotente.
-- ============================================================================

-- 0021: dados da loja (endereco de retirada, telefone e ponto no mapa)
-- Rode no SQL Editor do Supabase APÓS 0000. Idempotente.

CREATE TABLE IF NOT EXISTS public.loja_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  nome text NOT NULL DEFAULT 'Néia Salgados',
  telefone text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  referencia text NOT NULL DEFAULT '',
  instrucoes_retirada text NOT NULL DEFAULT '',
  mapa_lat double precision,
  mapa_lng double precision,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.loja_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.loja_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.loja_config TO service_role;
GRANT SELECT ON public.loja_config TO anon, authenticated;
GRANT UPDATE ON public.loja_config TO authenticated;

DROP POLICY IF EXISTS "loja select publico" ON public.loja_config;
CREATE POLICY "loja select publico" ON public.loja_config FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "loja admin update" ON public.loja_config;
CREATE POLICY "loja admin update" ON public.loja_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON COLUMN public.loja_config.instrucoes_retirada IS
  'Texto que o cliente ve no checkout ao escolher retirada (ex: horario de funcionamento).';
COMMENT ON COLUMN public.loja_config.mapa_lat IS
  'Latitude da loja. Com latitude e longitude preenchidas, a loja aparece no mapa do pedido de retirada.';
-- ----------------------------------------------------------------------------
-- VERIFICACAO
-- ----------------------------------------------------------------------------
SELECT
  (SELECT coalesce(nullif(endereco, ''), 'sem endereco') || ' | ' || coalesce(nullif(cidade, ''), 'sem cidade')
     FROM public.loja_config WHERE id = true) AS "1_LOJA",
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public' AND tablename = 'loja_config') AS "2_TABELA_LOJA";