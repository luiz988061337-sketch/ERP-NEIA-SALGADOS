-- 0059: pix_notification_events - events from Android Pix notifications
CREATE TABLE public.pix_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_hash text NOT NULL UNIQUE,
  source_app text NOT NULL,
  bank_name text,
  notification_title text NOT NULL,
  notification_text text NOT NULL,
  amount numeric(10,2),
  sender_name text,
  reference text,
  detected_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'PENDING',
  matched_order_id uuid,
  environment text NOT NULL DEFAULT 'TEST',
  device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.pix_notification_events TO authenticated;
GRANT ALL ON public.pix_notification_events TO service_role;
ALTER TABLE public.pix_notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pix_notification_events_select_own" ON public.pix_notification_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "pix_notification_events_insert" ON public.pix_notification_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pix_notification_events_update" ON public.pix_notification_events FOR UPDATE TO authenticated USING (true);

-- Indexes for performance and deduplication
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_event_hash ON public.pix_notification_events (event_hash);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_status ON public.pix_notification_events (status);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_received ON public.pix_notification_events (received_at);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_environment ON public.pix_notification_events (environment);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_device ON public.pix_notification_events (device_id);

COMMENT ON TABLE public.pix_notification_events IS 'Events from Android Pix notification listener. Tracks detected Pix notifications for order matching and payment processing.';
COMMENT ON COLUMN public.pix_notification_events.status IS 'PENDING: waiting processing, PROCESSED: matched and identified, DUPLICATE: duplicate event, INVALID: invalid format, ERROR: processing error, TEST: test event';
COMMENT ON COLUMN public.pix_notification_events.environment IS 'TEST: development/test environment, PRODUCTION: production environment';