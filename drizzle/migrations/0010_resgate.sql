-- 0010: fidelidade — resgate próprio limitado (200 pts → cupom R$20, regra já anunciada no app)
-- Rode no SQL Editor do Supabase APÓS 0000–0009. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Modelo de ameaça: pontos já são atualizáveis pelo próprio dono (RLS 0000); esta policy
-- limita o estrago a cupons de no MÁXIMO R$20, uso único, vinculados ao próprio telefone,
-- prefixo FID-. Recomendado evoluir para Edge Function (validação server-side total).

DROP POLICY IF EXISTS "cupons resgate proprio" ON public.cupons;
CREATE POLICY "cupons resgate proprio" ON public.cupons FOR INSERT TO authenticated
  WITH CHECK (
    codigo LIKE 'FID-%'
    AND tipo = 'valor'
    AND valor <= 20
    AND (max_usos = 1)
    AND cliente_telefone <> ''
    AND (validade_fim IS NULL OR validade_fim > now())
  );
