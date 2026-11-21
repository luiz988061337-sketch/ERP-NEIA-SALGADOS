-- Ponte opcional antes da 0077. Usar apenas no caminho legado com 0059/0060.
-- Executar no mesmo BEGIN/COMMIT que a 0077. Mantém os dados e tokens existentes.
ALTER TABLE public.pix_reader_devices ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE public.pix_notification_events
  ADD COLUMN IF NOT EXISTS device_identifier text,
  ADD COLUMN IF NOT EXISTS conferencia_motivo text,
  ALTER COLUMN status SET DEFAULT 'PENDENTE';

DROP POLICY IF EXISTS "pix_notification_events_select_own" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_insert" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_update" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_admin_all" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_reader_devices_select_own" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_insert" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_update" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_admin_all" ON public.pix_reader_devices;
