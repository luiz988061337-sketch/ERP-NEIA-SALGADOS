-- 0053: dono do pedido pode registrar o próprio histórico de status.
-- O checkout (cliente, sem papel staff) insere o nascimento recebido→recebido
-- em pedido_status_historico, mas a policy 0023 só permitia staff: a linha era
-- barrada em silêncio (catch vazio) e as métricas de ciclo (separação) perdiam
-- a origem. Agora o dono insere no PRÓPRIO pedido; staff como antes.
-- Idempotente. Rode APÓS 0052. (Arquivo 0023 sincronizado p/ fresh.)

DROP POLICY IF EXISTS "hist staff insert" ON public.pedido_status_historico;
CREATE POLICY "hist staff insert" ON public.pedido_status_historico FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
  OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id AND p.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.pedido_status_historico IS '0053: dono insere no próprio pedido (nascimento via checkout); staff como antes.';
