-- 0060: pix_reader_devices - authorized devices for Néia Pix Reader
CREATE TABLE public.pix_reader_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL,
  device_identifier text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE',
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  app_version text NOT NULL DEFAULT '1.0.0',
  environment text NOT NULL DEFAULT 'TEST',
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.pix_reader_devices TO authenticated;
GRANT ALL ON public.pix_reader_devices TO service_role;
ALTER TABLE public.pix_reader_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pix_reader_devices_select_own" ON public.pix_reader_devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "pix_reader_devices_insert" ON public.pix_reader_devices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pix_reader_devices_update" ON public.pix_reader_devices FOR UPDATE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pix_reader_devices_identifier ON public.pix_reader_devices (device_identifier);
CREATE INDEX IF NOT EXISTS idx_pix_reader_devices_status ON public.pix_reader_devices (status);
CREATE INDEX IF NOT EXISTS idx_pix_reader_devices_environment ON public.pix_reader_devices (environment);

-- Status enum comment
COMMENT ON TABLE public.pix_reader_devices IS 'Authorized devices for Néia Pix Reader Android APK. Tracks registered devices for security and monitoring.';
COMMENT ON COLUMN public.pix_reader_devices.status IS 'ACTIVE: device active and authorized, INACTIVE: device inactive, REVOKED: device revoked by admin, TEST: test device';
COMMENT ON COLUMN public.pix_reader_devices.environment IS 'TEST: development/test environment, PRODUCTION: production environment';