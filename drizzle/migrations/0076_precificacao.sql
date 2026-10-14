-- 0076: ETAPA L — precificação (config + histórico de preços)
-- precificacao_config: linha única com margens, R$/h, fixos, volume e taxas.
-- preco_historico: quem alterou o preço e quando (botão "aplicar sugerido").
-- produtos.tempo_mao_obra_min: minutos de mão de obra por unidade.
-- Custo de insumos vem da ficha × insumos.custo_medio (K); rateio e taxas
-- são calculados no app (src/lib/precificacao.ts). Idempotente.

-- Minutos de mão de obra por unidade (padrão 0,5 min).
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tempo_mao_obra_min numeric(8,2) NOT NULL DEFAULT 0.5
  CHECK (tempo_mao_obra_min >= 0);

COMMENT ON COLUMN public.produtos.tempo_mao_obra_min IS
  'Minutos de mão de obra por unidade (custo = tempo × R$/h ÷ rendimento).';

CREATE TABLE IF NOT EXISTS public.precificacao_config (
  id boolean PRIMARY KEY DEFAULT true,
  margem_desejada_pct numeric(5,2) NOT NULL DEFAULT 40 CHECK (margem_desejada_pct >= 0 AND margem_desejada_pct < 100),
  margem_baixa_pct numeric(5,2) NOT NULL DEFAULT 15 CHECK (margem_baixa_pct >= 0 AND margem_baixa_pct < 100),
  mao_obra_hora numeric(10,2) NOT NULL DEFAULT 25 CHECK (mao_obra_hora >= 0),
  gas_hora numeric(10,2) NOT NULL DEFAULT 8 CHECK (gas_hora >= 0),
  custos_fixos_mensais numeric(12,2) NOT NULL DEFAULT 6000 CHECK (custos_fixos_mensais >= 0),
  volume_mensal_estimado integer NOT NULL DEFAULT 10000 CHECK (volume_mensal_estimado > 0),
  taxa_credito_pct numeric(5,2) NOT NULL DEFAULT 5 CHECK (taxa_credito_pct >= 0 AND taxa_credito_pct < 100),
  taxa_debito_pct numeric(5,2) NOT NULL DEFAULT 2 CHECK (taxa_debito_pct >= 0 AND taxa_debito_pct < 100),
  taxa_pix_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (taxa_pix_pct >= 0 AND taxa_pix_pct < 100),
  taxa_ifood_pct numeric(5,2) NOT NULL DEFAULT 27 CHECK (taxa_ifood_pct >= 0 AND taxa_ifood_pct < 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT precificacao_config_uma_linha CHECK (id = true)
);

INSERT INTO public.precificacao_config (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.preco_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  preco_antigo numeric(10,2) NOT NULL,
  preco_novo numeric(10,2) NOT NULL,
  usuario uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preco_hist_produto_idx ON public.preco_historico (produto_id);

-- RLS: admin e financeiro configuram; demais sem acesso (contador entra na N).
ALTER TABLE public.precificacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preco_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precificacao staff" ON public.precificacao_config;
CREATE POLICY "precificacao staff" ON public.precificacao_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "preco_hist staff" ON public.preco_historico;
CREATE POLICY "preco_hist staff" ON public.preco_historico FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.precificacao_config TO authenticated;
GRANT ALL ON public.preco_historico TO authenticated;
GRANT ALL ON public.precificacao_config TO service_role;
GRANT ALL ON public.preco_historico TO service_role;
