-- 0033: fiscal base — empresa, documentos, eventos, dados fiscais de produto/cliente.
-- NENHUM valor tributário é preenchido: tudo nullable, "configuração fiscal pendente".
-- Idempotente. Rode no SQL Editor APÓS 0032.

-- Empresa (singleton id=true). Ambiente separa homologação de produção.
CREATE TABLE IF NOT EXISTS public.empresa_fiscal (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  razao_social text NOT NULL DEFAULT '',
  nome_fantasia text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  inscricao_estadual text NOT NULL DEFAULT '',
  inscricao_municipal text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  numero text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT 'SP',
  cep text NOT NULL DEFAULT '',
  regime_tributario text NOT NULL DEFAULT '',
  serie text NOT NULL DEFAULT '',
  numero_inicial integer NOT NULL DEFAULT 1,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  modelo_padrao text NOT NULL DEFAULT '' CHECK (modelo_padrao IN ('','55','65')),
  provedor text NOT NULL DEFAULT '',
  csc_id text NOT NULL DEFAULT '',
  info_adicionais text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.empresa_fiscal (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Documentos fiscais: UM por pedido (UNIQUE = idempotência fiscal).
CREATE TABLE IF NOT EXISTS public.documentos_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  modelo text NOT NULL DEFAULT '' CHECK (modelo IN ('','55','65')),
  serie text NOT NULL DEFAULT '',
  numero integer,
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),
  status text NOT NULL DEFAULT 'nao_emitida' CHECK (status IN ('nao_emitida','em_processamento','autorizada','rejeitada','cancelada','inutilizada','contingencia','pendente','erro_comunicacao')),
  chave_acesso text,
  protocolo text,
  codigo_rejeicao text,
  mensagem_rejeicao text,
  xml text,
  danfe_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_pedido_idx ON public.documentos_fiscais (pedido_id);
CREATE INDEX IF NOT EXISTS docs_status_idx ON public.documentos_fiscais (status);

-- Histórico de tentativas (nunca apagar)
CREATE TABLE IF NOT EXISTS public.documento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE,
  evento text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  actor uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docev_doc_idx ON public.documento_eventos (documento_id);

-- Dados fiscais do produto (preenchidos pelo contador; NULL = pendente)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao_fiscal text,
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS cfop_padrao text,
  ADD COLUMN IF NOT EXISTS cst text,
  ADD COLUMN IF NOT EXISTS csosn text,
  ADD COLUMN IF NOT EXISTS origem_mercadoria text,
  ADD COLUMN IF NOT EXISTS gtin text;

-- Destinatário (checkout opcional, §47) + origem do cliente (§61, só 1º pedido)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS nome_fiscal text,
  ADD COLUMN IF NOT EXISTS origem_cliente text;

-- RLS: fiscal é administrativo
ALTER TABLE public.empresa_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal admin" ON public.empresa_fiscal;
CREATE POLICY "fiscal admin" ON public.empresa_fiscal FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "fiscal docs admin" ON public.documentos_fiscais;
CREATE POLICY "fiscal docs admin" ON public.documentos_fiscais FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fiscal docs own read" ON public.documentos_fiscais;
CREATE POLICY "fiscal docs own read" ON public.documentos_fiscais FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "fiscal ev staff" ON public.documento_eventos;
CREATE POLICY "fiscal ev staff" ON public.documento_eventos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

GRANT ALL ON public.empresa_fiscal, public.documentos_fiscais, public.documento_eventos TO authenticated;
