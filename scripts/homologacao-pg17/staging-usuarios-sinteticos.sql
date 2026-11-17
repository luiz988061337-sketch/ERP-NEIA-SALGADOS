-- Simula somente os registros de Auth necessários para validar a fixture em PG puro.
ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT gen_random_uuid(),'neia-qa+' || email || '@example.invalid',now()
FROM unnest(ARRAY['cliente','atendente','producao','caixa','financeiro','responsavel','motoboy-a','motoboy-b']) AS email;
