-- 0014: fidelidade configurável (regras hoje fixas no código: 1pt/R$5, 200pts → R$20)
-- Rode no SQL Editor do Supabase APÓS 0000–0013. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS fid_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fid_reais_por_ponto numeric(10,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fid_meta_pontos integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS fid_recompensa_valor numeric(10,2) NOT NULL DEFAULT 20;

-- Reemite a policy de resgate com teto maior (configurável até R$100).
-- Dano máximo contido: cupom FID-*, uso único, próprio telefone, validade futura.
DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE POLICY "cupons resgate proprio" ON public.cupons FOR INSERT TO authenticated
  WITH CHECK (
    codigo LIKE 'FID-%'
    AND tipo = 'valor'
    AND valor <= 100
    AND (max_usos = 1)
    AND cliente_telefone <> ''
    AND (validade_fim IS NULL OR validade_fim > now())
  );
