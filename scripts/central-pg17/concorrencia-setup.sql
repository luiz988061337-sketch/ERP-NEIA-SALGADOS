\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() <> 'central_retirada_teste' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;

INSERT INTO public.pedidos
  (id, tipo_entrega, status, conferido_em, retirado_em, forma_pagamento, pagamento_status, total, observacoes)
VALUES
  ('00000000-0000-4000-8000-000000000050','retirada','em_producao',NULL,NULL,'pix','pendente',100,''),
  ('00000000-0000-4000-8000-000000000051','retirada','pronto',now(),NULL,'pix','pendente',100,''),
  ('00000000-0000-4000-8000-000000000052','retirada','pronto',now(),NULL,'dinheiro','pendente',100,'');
