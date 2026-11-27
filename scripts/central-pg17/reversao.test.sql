\set ON_ERROR_STOP on
-- Ensaio de reversão segura das migrations 0139/0140/0141 em banco descartável.
DO $$
BEGIN
  IF current_database() <> 'central_retirada_teste' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.ok(condicao boolean, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %', caso; END IF;
  RAISE NOTICE 'OK: %', caso;
END;
$$;

CREATE TEMP TABLE snapshot_reversao AS
SELECT (SELECT count(*) FROM public.pedido_pagamento_eventos) AS ledger,
       (SELECT count(*) FROM public.pedido_edicoes_auditoria) AS auditoria;

\ir reverter-0139-0141.sql

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
SELECT pg_temp.ok(
  NOT (public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000052')->>'pode_receber')::boolean,
  'após a reversão, atendente com capacidade perde a autorização de receber');
SELECT pg_temp.ok(
  public.registrar_pagamento_pedido(
    '00000000-0000-4000-8000-000000000052', 2500, 'reversao:bloqueio')::jsonb->>'status' = 'nao_autorizado',
  'após a reversão, a RPC volta a exigir Admin/Financeiro');
DO $$
BEGIN
  BEGIN
    UPDATE public.pedidos SET pagamento_status = 'pago'
      WHERE id = '00000000-0000-4000-8000-000000000052';
    RAISE EXCEPTION 'Reversão não restaurou o congelamento da 0084';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Coluna protegida%' THEN RAISE; END IF;
    RAISE NOTICE 'OK: após a reversão, o guard da 0084 volta a bloquear escrita direta';
  END;
END;
$$;
RESET ROLE;

SELECT pg_temp.ok(
  to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)') IS NULL,
  'reversão desativa a RPC de edição de observações');
SELECT pg_temp.ok(
  (SELECT ledger = (SELECT count(*) FROM public.pedido_pagamento_eventos)
        AND auditoria = (SELECT count(*) FROM public.pedido_edicoes_auditoria)
   FROM snapshot_reversao),
  'reversão preserva ledger e auditoria já gravados');

-- Reaplicação controlada: deve ser possível sem duplicar histórico.
\ir ../../drizzle/migrations/0139_recebimento_balcao_atendente.sql
\ir ../../drizzle/migrations/0140_edicao_observacoes_auditada.sql
\ir ../../drizzle/migrations/0141_guard_recebimento_com_capacidade.sql

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
SELECT pg_temp.ok(
  (public.consultar_recebimento_retirada('00000000-0000-4000-8000-000000000052')->>'pode_receber')::boolean,
  'reaplicação restaura a autorização da atendente');
SELECT pg_temp.ok(
  public.editar_observacoes_pedido(
    '00000000-0000-4000-8000-000000000052', 'Reaplicação validada', 'Reversao segura')::jsonb->>'status' = 'editado',
  'reaplicação restaura a edição auditada');
RESET ROLE;

SELECT pg_temp.ok(
  (SELECT auditoria + 1 = (SELECT count(*) FROM public.pedido_edicoes_auditoria)
   FROM snapshot_reversao),
  'reaplicação acrescenta uma auditoria sem apagar registros anteriores');
SELECT pg_temp.ok(
  (SELECT ledger = (SELECT count(*) FROM public.pedido_pagamento_eventos)
   FROM snapshot_reversao),
  'reaplicação não duplica eventos do ledger');
