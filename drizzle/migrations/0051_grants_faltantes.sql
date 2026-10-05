-- 0051: GRANTs que faltavam (0043–0046 criaram RLS+policies sem GRANT).
-- Sem GRANT, o PostgREST nega tudo mesmo com policy permissiva: a seção
-- Provedor do /fiscal e qualquer leitura dessas tabelas falhavam com
-- "permission denied". RLS continua mandando (só staff lê/escreve).
-- Idempotente. Rode APÓS 0050.

GRANT ALL ON public.fritura_fila TO authenticated;
GRANT ALL ON public.entrega_atrasos TO authenticated;
GRANT ALL ON public.motoboy_historico TO authenticated;
GRANT ALL ON public.rotas TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO authenticated;
GRANT ALL ON public.documento_fiscal_itens TO authenticated;
GRANT ALL ON public.fiscal_certificados TO authenticated;
GRANT ALL ON public.fiscal_provedor_config TO authenticated;

-- Transições de status: só o trigger (definer) usa hoje; RLS staff p/ leitura
-- futura sem abrir para anônimo (sem GRANT ninguém lia; sem RLS ninguém barrava).
ALTER TABLE public.pedido_status_transicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transicoes staff read" ON public.pedido_status_transicoes;
CREATE POLICY "transicoes staff read" ON public.pedido_status_transicoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'motoboy')
  );
GRANT SELECT ON public.pedido_status_transicoes TO authenticated;

COMMENT ON TABLE public.fritura_fila IS '0051: grants p/ leitura staff (preenchida pelo trigger ao confirmar). Não confundir com fila_fritura (UI da produção).';
