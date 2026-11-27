-- A Produção já tem acesso à Central de Entregas e a notificacoes.
-- Este tópico leva apenas o sinal de atualização. O RLS dos registros continua vigente.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS central_atendente_receber_avisos ON realtime.messages;
CREATE POLICY central_atendente_receber_avisos
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (SELECT realtime.topic()) = 'atendente-avisos-cozinha'
    AND extension = 'broadcast'
    AND (
      public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'producao'::public.app_role)
    )
  );

DROP POLICY IF EXISTS central_atendente_limitar_leitura_avisos ON realtime.messages;
CREATE POLICY central_atendente_limitar_leitura_avisos
  ON realtime.messages AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (
    (topic IS DISTINCT FROM 'atendente-avisos-cozinha'
     AND (SELECT realtime.topic()) IS DISTINCT FROM 'atendente-avisos-cozinha')
    OR (
      extension = 'broadcast'
      AND (
        public.has_role((SELECT auth.uid()), 'atendente'::public.app_role)
        OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
      OR public.has_role((SELECT auth.uid()), 'producao'::public.app_role)
      )
    )
  );

COMMIT;
