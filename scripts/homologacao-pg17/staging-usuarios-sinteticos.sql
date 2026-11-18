-- APENAS o Auth substituto em PostgreSQL descartavel. Nunca usar no Supabase.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_user<>'neia_homologador'
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='encrypted_password') THEN
   RAISE EXCEPTION 'Gerador restrito ao Auth sintetico local';
 END IF;
END $$;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb NOT NULL DEFAULT '{}';
WITH v(email,conta) AS (VALUES ('cliente','cliente'),('atendente','atendente'),('producao','producao'),
 ('caixa','caixa'),('financeiro','financeiro'),('responsavel','responsavel'),('motoboy-a','motoboyA'),('motoboy-b','motoboyB')),
novos AS (
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data)
 SELECT gen_random_uuid(),'neia-qa+'||v.email||'-'||replace(:'fixture_protocolo','-','')||'@example.invalid',now(),
   jsonb_build_object('neia_homologacao',jsonb_build_object('protocolo',:'fixture_protocolo','conta',v.conta,'staging_ref',:'staging_ref'))
 FROM v RETURNING id,raw_app_meta_data
)
SELECT jsonb_object_agg(raw_app_meta_data->'neia_homologacao'->>'conta',id) FROM novos;
