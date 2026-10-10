-- 0072: financeiro — caixa e contas a pagar/receber (Fase F).
-- Escopo: controle de caixa (abertura/fechamento/conferência) e contas
-- (pagar/receber, vencimento, parcelas, recorrência). NÃO mexe em pedidos,
-- produtos, RLS alheia ou fluxos existentes. Idempotente.
-- NÃO aplicada ainda — homologar em staging antes (como 0065–0071).

CREATE TABLE IF NOT EXISTS public.caixa_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aberta_em timestamptz NOT NULL DEFAULT now(),
  fechada_em timestamptz,
  saldo_inicial numeric(10,2) NOT NULL DEFAULT 0,
  saldo_informado numeric(10,2),
  diferenca numeric(10,2),
  responsavel uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  observacao text NOT NULL DEFAULT ''
);
-- Uma única sessão aberta por vez (previne abertura/fechamento duplicado).
CREATE UNIQUE INDEX IF NOT EXISTS caixa_sessao_aberta_unica
  ON public.caixa_sessoes (status) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS public.contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('pagar','receber')),
  descricao text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  fornecedor text NOT NULL DEFAULT '',
  valor numeric(10,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  meio text NOT NULL DEFAULT 'dinheiro'
    CHECK (meio IN ('dinheiro','pix','credito','debito','transferencia','outro')),
  vencimento date,
  pago_em timestamptz,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','paga','vencida','cancelada')),
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  parcela_atual integer NOT NULL DEFAULT 1 CHECK (parcela_atual >= 1),
  parcela_total integer NOT NULL DEFAULT 1 CHECK (parcela_total >= 1),
  recorrente boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contas_status_idx ON public.contas (status);
CREATE INDEX IF NOT EXISTS contas_venc_idx ON public.contas (vencimento);
CREATE INDEX IF NOT EXISTS contas_tipo_idx ON public.contas (tipo);

ALTER TABLE public.caixa_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caixa staff" ON public.caixa_sessoes;
CREATE POLICY "caixa staff" ON public.caixa_sessoes FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
);

DROP POLICY IF EXISTS "contas staff" ON public.contas;
CREATE POLICY "contas staff" ON public.contas FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
);

GRANT ALL ON public.caixa_sessoes TO authenticated;
GRANT ALL ON public.contas TO authenticated;
GRANT ALL ON public.caixa_sessoes TO service_role;
GRANT ALL ON public.contas TO service_role;

COMMENT ON TABLE public.caixa_sessoes IS '0072: sessões de caixa (abertura/fechamento/conferência). Uma aberta por vez.';
COMMENT ON TABLE public.contas IS '0072: contas a pagar/receber (vencimento, parcelas, recorrência). Status vencida é derivado na leitura.';
