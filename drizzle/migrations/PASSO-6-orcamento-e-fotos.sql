-- ============================================================================
-- PASSO 6 - 0019 (contato/validade do orcamento) + 0020 (bucket de fotos do hero)
-- Rode em UM New query. Idempotente.
-- ============================================================================

-- 0019: contato e validade do orçamento na calculadora
-- Rode no SQL Editor do Supabase APÓS 0016. Idempotente.

ALTER TABLE public.calculadora_config
  ADD COLUMN IF NOT EXISTS zap_contato text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS orcamento_validade_dias integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.calculadora_config.zap_contato IS
  'WhatsApp que recebe os pedidos de orçamento (DDD + número, com ou sem 55).';
COMMENT ON COLUMN public.calculadora_config.orcamento_validade_dias IS
  'Validade padrão do orçamento em dias, informada ao cliente na página /calculadora.';
-- 0020: bucket de imagens do carrossel do hero (upload pelo admin)
-- Rode no SQL Editor do Supabase APÓS 0015. Idempotente.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hero',
  'hero',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública: o banner da home é exibido para visitante sem login.
DROP POLICY IF EXISTS "hero bucket select publico" ON storage.objects;
CREATE POLICY "hero bucket select publico" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hero');

-- Admin envia/apaga; o layout é verificado pela policy do admin via public.has_role.
DROP POLICY IF EXISTS "hero bucket admin insert" ON storage.objects;
CREATE POLICY "hero bucket admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "hero bucket admin update" ON storage.objects;
CREATE POLICY "hero bucket admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "hero bucket admin delete" ON storage.objects;
CREATE POLICY "hero bucket admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hero' AND public.has_role(auth.uid(), 'admin'));
-- ----------------------------------------------------------------------------
-- VERIFICACAO
-- ----------------------------------------------------------------------------
SELECT
  (SELECT coalesce(zap_contato, '') || ' | validade ' || orcamento_validade_dias || 'd'
     FROM public.calculadora_config WHERE id = true) AS "1_ORCAMENTO",
  (SELECT coalesce(string_agg(name || ' publico=' || public, ', '), 'AUSENTE')
     FROM storage.buckets WHERE id = 'hero') AS "2_BUCKET_HERO";