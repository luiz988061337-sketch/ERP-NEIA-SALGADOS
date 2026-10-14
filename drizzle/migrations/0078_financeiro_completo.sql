-- 0078: ETAPA M — financeiro completo (bancos, plano, centros + extensões)
-- Tabelas novas: contas_bancarias (banco/PIX/maquininha), plano_contas
-- (receitas, custos, despesas, impostos...), centros_custo (cozinha, entrega...).
-- contas ganha: centro_custo, conta_bancaria_id, anexo_url, valor_pago
-- (baixa parcial: pago quando valor_pago >= valor).
-- RLS: admin/financeiro. Idempotente.

CREATE TABLE IF NOT EXISTS public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'banco'
    CHECK (tipo IN ('banco','pix','maquininha','caixa','outro')),
  saldo_inicial numeric(12,2) NOT NULL DEFAULT 0,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plano_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  grupo text NOT NULL DEFAULT 'despesas'
    CHECK (grupo IN ('receitas','custos_variaveis','despesas_fixas','impostos','pro_labore','investimentos','outros')),
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);
INSERT INTO public.centros_custo (nome)
SELECT v FROM (VALUES ('cozinha'),('entrega'),('administrativo'),('marketing')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM public.centros_custo WHERE nome = t.v);

ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS centro_custo text NOT NULL DEFAULT '';
ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS anexo_url text NOT NULL DEFAULT '';
ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0);

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bancos staff" ON public.contas_bancarias;
CREATE POLICY "bancos staff" ON public.contas_bancarias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "plano staff" ON public.plano_contas;
CREATE POLICY "plano staff" ON public.plano_contas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "centros staff" ON public.centros_custo;
CREATE POLICY "centros staff" ON public.centros_custo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.contas_bancarias TO authenticated;
GRANT ALL ON public.plano_contas TO authenticated;
GRANT ALL ON public.centros_custo TO authenticated;
GRANT ALL ON public.contas_bancarias TO service_role;
GRANT ALL ON public.plano_contas TO service_role;
GRANT ALL ON public.centros_custo TO service_role;
