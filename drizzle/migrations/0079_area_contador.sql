-- 0079: ETAPA N — área do contador (papel, fechamento, solicitações, acessos)
--
-- ATENÇÃO: rode a linha do ALTER TYPE SOZINHA primeiro (não roda dentro
-- de transação com o resto). Depois rode o restante do arquivo.
ALTER TYPE public.app_role ADD VALUE 'contador';

-- (resto idempotente; rode após a linha acima)
CREATE TABLE IF NOT EXISTS public.fechamentos_mensais (
  competencia text PRIMARY KEY CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','enviado','conferido','fechado')),
  enviado_em timestamptz,
  conferido_em timestamptz,
  fechado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  obs text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.solicitacoes_contador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia text NOT NULL DEFAULT '',
  texto text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','respondida','fechada')),
  resposta text NOT NULL DEFAULT '',
  anexo_url text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  respondida_em timestamptz
);
CREATE INDEX IF NOT EXISTS sol_contador_comp_idx ON public.solicitacoes_contador (competencia);

CREATE TABLE IF NOT EXISTS public.contador_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  competencia text NOT NULL DEFAULT '',
  acao text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contador_acessos_comp_idx ON public.contador_acessos (competencia);

ALTER TABLE public.fechamentos_mensais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_contador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contador_acessos ENABLE ROW LEVEL SECURITY;

-- Fechamentos: admin/financeiro gerenciam; contador só lê.
DROP POLICY IF EXISTS "fechamentos staff" ON public.fechamentos_mensais;
CREATE POLICY "fechamentos staff" ON public.fechamentos_mensais FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'contador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- Solicitações: contador abre e lê; admin/financeiro respondem.
DROP POLICY IF EXISTS "solic read" ON public.solicitacoes_contador;
CREATE POLICY "solic read" ON public.solicitacoes_contador FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "solic insert" ON public.solicitacoes_contador;
CREATE POLICY "solic insert" ON public.solicitacoes_contador FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "solic admin update" ON public.solicitacoes_contador;
CREATE POLICY "solic admin update" ON public.solicitacoes_contador FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- Acessos: cada um registra os próprios; leitura staff.
DROP POLICY IF EXISTS "acessos read" ON public.contador_acessos;
CREATE POLICY "acessos read" ON public.contador_acessos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "acessos insert" ON public.contador_acessos;
CREATE POLICY "acessos insert" ON public.contador_acessos FOR INSERT TO authenticated
  WITH CHECK (usuario = auth.uid());

-- Leitura do contador no fiscal/financeiro/pedidos (somente SELECT).
DROP POLICY IF EXISTS "contador read fiscal" ON public.empresa_fiscal;
CREATE POLICY "contador read fiscal" ON public.empresa_fiscal FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read docs" ON public.documentos_fiscais;
CREATE POLICY "contador read docs" ON public.documentos_fiscais FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read eventos" ON public.documento_eventos;
CREATE POLICY "contador read eventos" ON public.documento_eventos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read contas" ON public.contas;
CREATE POLICY "contador read contas" ON public.contas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read caixa" ON public.caixa_sessoes;
CREATE POLICY "contador read caixa" ON public.caixa_sessoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read bancos" ON public.contas_bancarias;
CREATE POLICY "contador read bancos" ON public.contas_bancarias FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read pedidos" ON public.pedidos;
CREATE POLICY "contador read pedidos" ON public.pedidos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

DROP POLICY IF EXISTS "contador read produtos" ON public.produtos;
CREATE POLICY "contador read produtos" ON public.produtos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'contador'));

GRANT SELECT ON public.empresa_fiscal TO authenticated;
GRANT SELECT ON public.documentos_fiscais TO authenticated;
GRANT SELECT ON public.documento_eventos TO authenticated;
GRANT SELECT ON public.contas TO authenticated;
GRANT SELECT ON public.caixa_sessoes TO authenticated;
GRANT SELECT ON public.contas_bancarias TO authenticated;
GRANT ALL ON public.fechamentos_mensais TO authenticated;
GRANT SELECT, INSERT ON public.solicitacoes_contador TO authenticated;
GRANT SELECT, INSERT ON public.contador_acessos TO authenticated;
GRANT ALL ON public.fechamentos_mensais TO service_role;
GRANT ALL ON public.solicitacoes_contador TO service_role;
GRANT ALL ON public.contador_acessos TO service_role;
