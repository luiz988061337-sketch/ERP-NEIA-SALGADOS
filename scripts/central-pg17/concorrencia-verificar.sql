\set ON_ERROR_STOP on
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

SELECT pg_temp.ok(
  (SELECT count(*)=1 AND sum(valor_centavos)=4000 FROM public.pedido_pagamento_eventos
    WHERE pedido_id='00000000-0000-4000-8000-000000000050'),
  'concorrência com a mesma chave gera um único evento de R$ 40,00');
SELECT pg_temp.ok(
  (SELECT pagamento_status='pendente' FROM public.pedidos
    WHERE id='00000000-0000-4000-8000-000000000050'),
  'pedido com parcial concorrente permanece pendente');
SELECT pg_temp.ok(
  (SELECT count(*)=2 AND sum(valor_centavos)=10000 FROM public.pedido_pagamento_eventos
    WHERE pedido_id='00000000-0000-4000-8000-000000000051'),
  'duas chaves concorrentes registram os dois parciais');
SELECT pg_temp.ok(
  (SELECT pagamento_status='pago' FROM public.pedidos
    WHERE id='00000000-0000-4000-8000-000000000051'),
  'soma dos parciais concorrentes quita o pedido');
