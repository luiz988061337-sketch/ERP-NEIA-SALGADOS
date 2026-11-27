\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
SELECT public.registrar_pagamento_pedido(:'pedido'::uuid, :valor::bigint, :'chave')::jsonb->>'status';
