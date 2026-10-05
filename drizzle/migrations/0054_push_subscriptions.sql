-- 0054: inscrições Web Push (notificação de status sem WhatsApp).
-- Uma linha por aparelho/navegador (endpoint único). O dono gerencia as
-- próprias; o envio é pela Edge Function push-enviar (service_role).
-- Idempotente. Rode APÓS 0053.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_sub_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push own manage" ON public.push_subscriptions;
CREATE POLICY "push own manage" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

GRANT ALL ON public.push_subscriptions TO authenticated;

COMMENT ON TABLE public.push_subscriptions IS '0054: endpoints Web Push por usuário (1 linha por aparelho). Envio via push-enviar.';
