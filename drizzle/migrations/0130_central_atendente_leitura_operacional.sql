-- A Central lê os itens e as remessas dos pedidos que ela pode operar.
-- As políticas de proprietário, produção, motoboy e administrador continuam vigentes.
BEGIN;

DROP POLICY IF EXISTS central_atendente_itens_ativos ON public.pedido_itens;
CREATE POLICY central_atendente_itens_ativos
  ON public.pedido_itens FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_itens.pedido_id
        AND p.status IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy')
        AND p.retirado_em IS NULL
        AND (p.status <> 'aguardando_motoboy' OR p.motoboy_id IS NULL)
    )
  );

-- A política existente dos componentes já verifica o papel e passa por pedido_itens.
DROP POLICY IF EXISTS central_atendente_remessas_ativas ON public.producao_remessas;
CREATE POLICY central_atendente_remessas_ativas
  ON public.producao_remessas FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = producao_remessas.pedido_id
        AND p.status IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy')
        AND p.retirado_em IS NULL
        AND (p.status <> 'aguardando_motoboy' OR p.motoboy_id IS NULL)
    )
  );

COMMIT;
