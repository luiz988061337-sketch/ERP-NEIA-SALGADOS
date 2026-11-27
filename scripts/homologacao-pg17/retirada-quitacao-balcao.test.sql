\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'central_retirada_teste' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;
CREATE SCHEMA auth;
CREATE SCHEMA neia_operacao;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION public.has_role(usuario uuid, papel text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT right(usuario::text,2) = CASE papel WHEN 'admin' THEN '01' WHEN 'atendente' THEN '02' WHEN 'producao' THEN '03' END;
$$;
CREATE FUNCTION neia_operacao.tem_capacidade(usuario uuid, capacidade text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT right(usuario::text,2) = '01' AND capacidade = 'receber_pagamento';
$$;
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY, tipo_entrega text, status text, conferido_em timestamptz, retirado_em timestamptz,
  forma_pagamento text, pagamento_status text, total numeric
);
CREATE TABLE public.pedido_pagamento_eventos (pedido_id uuid, tipo text, valor_centavos bigint);
\ir ../../drizzle/migrations/0136_retirada_quitacao_balcao.sql

INSERT INTO public.pedidos VALUES
  ('00000000-0000-4000-8000-000000000010','retirada','pronto',now(),NULL,'dinheiro','pendente',100),
  ('00000000-0000-4000-8000-000000000020','retirada','pronto',now(),NULL,'pix','pago',80),
  ('00000000-0000-4000-8000-000000000030','entrega','pronto',now(),NULL,'dinheiro','pendente',75),
  ('00000000-0000-4000-8000-000000000040','retirada','pronto',now(),NULL,'pix','pago',90);
INSERT INTO public.pedido_pagamento_eventos VALUES
  ('00000000-0000-4000-8000-000000000010','pagamento',2500),
  ('00000000-0000-4000-8000-000000000020','pagamento',8000);

CREATE FUNCTION pg_temp.ok(condicao boolean, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %', caso; END IF;
  RAISE NOTICE 'OK: %', caso;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false) IS NOT NULL;
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'saldo_centavos')::int = 7500,
  'saldo parcial vem do ledger');
SELECT pg_temp.ok((public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'administrador com capacidade de Caixa pode registrar recebimento');
SELECT pg_temp.ok(public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000020')->>'status' = 'quitado',
  'Pix confirmado dispensa novo recebimento');
SELECT pg_temp.ok(public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000040')->>'status' = 'revisao_necessaria',
  'pagamento divergente passa por revisão');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false) IS NOT NULL;
SELECT pg_temp.ok(NOT (public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'pode_receber')::boolean,
  'atendente sem capacidade financeira pode consultar e encaminhar ao Caixa');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false) IS NOT NULL;
SELECT pg_temp.ok(public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000010')->>'status' = 'nao_autorizado',
  'cozinha não confirma pagamento');
SET ROLE anon;
SELECT pg_temp.ok(NOT has_function_privilege(current_user,'public.consultar_recebimento_retirada(uuid)','EXECUTE'),
  'cliente anônimo sem consulta financeira');
RESET ROLE;

DO $$
BEGIN
  BEGIN
    UPDATE public.pedidos SET status='entregue',retirado_em=now() WHERE id='00000000-0000-4000-8000-000000000010';
    RAISE EXCEPTION 'Retirada com saldo indevida';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'retirada_recebimento_pendente' THEN RAISE; END IF;
    RAISE NOTICE 'OK: retirada com saldo parcial é bloqueada no banco';
  END;
END;
$$;
UPDATE public.pedidos SET status='entregue',retirado_em=now() WHERE id='00000000-0000-4000-8000-000000000020';
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.pedido_pagamento_eventos WHERE pedido_id='00000000-0000-4000-8000-000000000020'),
  'retirada quitada não cria outro pagamento');
UPDATE public.pedidos SET status='entregue' WHERE id='00000000-0000-4000-8000-000000000030';
SELECT pg_temp.ok((SELECT status='entregue' AND pagamento_status='pendente' FROM public.pedidos WHERE id='00000000-0000-4000-8000-000000000030'),
  'pedido com pagamento na entrega não passa pela regra de balcão');
