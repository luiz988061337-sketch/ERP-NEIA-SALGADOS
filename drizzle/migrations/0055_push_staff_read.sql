-- 0055: staff pode VER se o cliente tem push (para não abrir WhatsApp à toa).
-- Só existência (o envio continua na Edge com service_role). Staff já vê
-- telefone/endereço do cliente no admin — endpoint sozinho não autoriza envio
-- (precisa da VAPID privada, só no cofre da função).
-- Idempotente. Rode APÓS 0054.

DROP POLICY IF EXISTS "push staff existe" ON public.push_subscriptions;
CREATE POLICY "push staff existe" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'motoboy')
  );

COMMENT ON TABLE public.push_subscriptions IS '0055: staff lê existência (evita WhatsApp redundante); envio só via push-enviar.';
