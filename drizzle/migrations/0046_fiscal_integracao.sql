-- 0046: Fiscal provider config + certificado ref + documento_fiscal_itens
-- Idempotente. Rode APÓS 0045.

-- =============================================
-- 1. Configuração do provedor fiscal (Focus NFe, Nuvem Fiscal, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS public.fiscal_provedor_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  provedor text NOT NULL DEFAULT 'focus' CHECK (provedor IN ('focus', 'nuvem_fiscal', 'tecnospeed', 'sefaz_direto')),
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  url_base text NOT NULL DEFAULT '',
  token text NOT NULL DEFAULT '',
  timeout_segundos integer NOT NULL DEFAULT 30,
  homologacao_url text,
  producao_url text,
  homologacao_token text,
  producao_token text,
  certificado_ref text, -- referência ao certificado no cofre (Azure Key Vault, AWS Secrets, etc.)
  certificado_senha_ref text,
  csc_id text,
  csc_token text,
  contingencia_habilitada boolean NOT NULL DEFAULT false,
  contingencia_tipo text CHECK (contingencia_tipo IN ('SVC-AN', 'SVC-RS', 'offline')),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fiscal_provedor_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Certificados digitais (referência segura, nunca armazena o .pfx aqui)
-- =============================================
CREATE TABLE IF NOT EXISTS public.fiscal_certificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id boolean NOT NULL DEFAULT true REFERENCES public.empresa_fiscal(id),
  nome text NOT NULL, -- ex: "Certificado A1 Produção"
  tipo text NOT NULL CHECK (tipo IN ('A1', 'A3')),
  ref_cofre text NOT NULL, -- URI/secreto no Azure Key Vault / AWS Secrets Manager / HashiCorp Vault
  senha_ref_cofre text, -- referência separada para a senha
  cnpj_titular text NOT NULL,
  validade_inicio date,
  validade_fim date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'vencido', 'revogado', 'teste')),
  ambiente text NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_cert_empresa_idx ON public.fiscal_certificados (empresa_id);
CREATE INDEX IF NOT EXISTS fiscal_cert_status_idx ON public.fiscal_certificados (status);

-- =============================================
-- 3. Itens fiscais do documento (dados por item para geração XML)
-- =============================================
CREATE TABLE IF NOT EXISTS public.documento_fiscal_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  n_item integer NOT NULL, -- número sequencial do item na nota (1, 2, 3...)
  codigo_produto text NOT NULL,
  descricao text NOT NULL,
  ncm text,
  cest text,
  cfop text,
  unidade text NOT NULL DEFAULT 'UN',
  quantidade numeric(10,3) NOT NULL,
  valor_unitario numeric(10,2) NOT NULL,
  valor_total numeric(10,2) NOT NULL,
  -- ICMS
  icms_origem text CHECK (icms_origem IN ('0','1','2','3','4','5','6','7','8')),
  icms_cst text,
  icms_csosn text,
  icms_aliquota numeric(5,2),
  icms_valor numeric(10,2),
  icms_base numeric(10,2),
  -- IPI
  ipi_cst text,
  ipi_aliquota numeric(5,2),
  ipi_valor numeric(10,2),
  -- PIS
  pis_cst text,
  pis_aliquota numeric(5,2),
  pis_valor numeric(10,2),
  -- COFINS
  cofins_cst text,
  cofins_aliquota numeric(5,2),
  cofins_valor numeric(10,2),
  -- Informações adicionais
  inf_adicionais text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_fiscal_itens_doc_idx ON public.documento_fiscal_itens (documento_id);
CREATE INDEX IF NOT EXISTS doc_fiscal_itens_prod_idx ON public.documento_fiscal_itens (produto_id);

-- =============================================
-- 4. Trigger: valida dados fiscais obrigatórios antes de emitir
-- =============================================
CREATE OR REPLACE FUNCTION public.validar_dados_fiscais_emissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa record;
  v_item record;
  v_faltando text[];
BEGIN
  -- Só valida em transição para em_processamento/autorizada
  IF NEW.status NOT IN ('em_processamento', 'autorizada') THEN
    RETURN NEW;
  END IF;

  -- Valida empresa
  SELECT * INTO v_empresa FROM public.empresa_fiscal WHERE id = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração fiscal da empresa não encontrada (execute migração 0033)';
  END IF;

  v_faltando := ARRAY[]::text[];
  IF v_empresa.razao_social = '' THEN v_faltando := array_append(v_faltando, 'razao_social'); END IF;
  IF v_empresa.cnpj = '' THEN v_faltando := array_append(v_faltando, 'cnpj'); END IF;
  IF v_empresa.inscricao_estadual = '' THEN v_faltando := array_append(v_faltando, 'inscricao_estadual'); END IF;
  IF v_empresa.endereco = '' THEN v_faltando := array_append(v_faltando, 'endereco'); END IF;
  IF v_empresa.cidade = '' THEN v_faltando := array_append(v_faltando, 'cidade'); END IF;
  IF v_empresa.uf = '' THEN v_faltando := array_append(v_faltando, 'uf'); END IF;
  IF v_empresa.cep = '' THEN v_faltando := array_append(v_faltando, 'cep'); END IF;
  IF v_empresa.regime_tributario = '' THEN v_faltando := array_append(v_faltando, 'regime_tributario'); END IF;
  IF v_empresa.serie = '' THEN v_faltando := array_append(v_faltando, 'serie'); END IF;
  IF v_empresa.modelo_padrao = '' THEN v_faltando := array_append(v_faltando, 'modelo_padrao (55 ou 65)'); END IF;
  IF v_empresa.ambiente = '' THEN v_faltando := array_append(v_faltando, 'ambiente'); END IF;
  IF v_empresa.provedor = '' THEN v_faltando := array_append(v_faltando, 'provedor'); END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Configuração fiscal incompleta. Faltam: %', array_to_string(v_faltando, ', ');
  END IF;

  -- Itens avulsos (combo montado, produto_id NULL) não têm NCM próprio:
  -- bloqueia com mensagem clara em vez de emitir com tributo inventado.
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = NEW.pedido_id AND pi.produto_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pedido tem item avulso/combo sem produto vinculado. Desmembre em sabores com NCM/CFOP ou cadastre um produto kit antes de emitir.';
  END IF;

  -- Valida itens fiscais do pedido (usa NEW.pedido_id: no BEFORE INSERT a
  -- linha ainda não existe na tabela, então subquery em documentos_fiscais
  -- retornaria NULL e a validação seria silenciosamente pulada).
  FOR v_item IN
    SELECT DISTINCT p.id, p.nome, p.ncm, p.cst, p.csosn, p.cfop_padrao, p.origem_mercadoria
    FROM public.produtos p
    JOIN public.pedido_itens pi ON pi.produto_id = p.id
    WHERE pi.pedido_id = NEW.pedido_id
  LOOP
    v_faltando := ARRAY[]::text[];
    IF v_item.ncm IS NULL OR v_item.ncm = '' THEN v_faltando := array_append(v_faltando, 'NCM'); END IF;
    IF v_item.cst IS NULL AND v_item.csosn IS NULL THEN v_faltando := array_append(v_faltando, 'CST/CSOSN'); END IF;
    IF v_item.cfop_padrao IS NULL OR v_item.cfop_padrao = '' THEN v_faltando := array_append(v_faltando, 'CFOP'); END IF;
    IF v_item.origem_mercadoria IS NULL OR v_item.origem_mercadoria = '' THEN v_faltando := array_append(v_faltando, 'origem_mercadoria'); END IF;

    IF array_length(v_faltando, 1) > 0 THEN
      RAISE EXCEPTION 'Produto "%" sem dados fiscais obrigatórios: %', v_item.nome, array_to_string(v_faltando, ', ');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_fiscal_emissao ON public.documentos_fiscais;
CREATE TRIGGER trigger_validar_fiscal_emissao
  BEFORE INSERT OR UPDATE OF status ON public.documentos_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_dados_fiscais_emissao();

-- RLS
ALTER TABLE public.fiscal_provedor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_certificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_fiscal_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_provedor admin" ON public.fiscal_provedor_config;
CREATE POLICY "fiscal_provedor admin" ON public.fiscal_provedor_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "fiscal_cert admin" ON public.fiscal_certificados;
CREATE POLICY "fiscal_cert admin" ON public.fiscal_certificados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "doc_fiscal_itens admin" ON public.documento_fiscal_itens;
CREATE POLICY "doc_fiscal_itens admin" ON public.documento_fiscal_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

COMMENT ON TABLE public.fiscal_provedor_config IS 'Configuração do provedor fiscal (Focus, Nuvem Fiscal, etc.). Singleton id=true.';
COMMENT ON TABLE public.fiscal_certificados IS 'Referências a certificados digitais no cofre seguro. NUNCA armazene .pfx ou senha aqui.';
COMMENT ON TABLE public.documento_fiscal_itens IS 'Dados fiscais detalhados por item para geração do XML da NF-e/NFC-e.';