\set ON_ERROR_STOP on
-- Fase 1 — comportamento da forma efetiva, pagamento misto, troco, idempotência
-- e guarda de edição. Somente cluster PostgreSQL local descartável.
DO $$
BEGIN
  IF current_database() <> 'central_retirada_teste'
     OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
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

INSERT INTO public.pedidos
  (id, tipo_entrega, status, conferido_em, retirado_em, forma_pagamento, pagamento_status, total, observacoes)
VALUES
  ('00000000-0000-4000-8000-000000000060','retirada','pronto',now(),NULL,'pix','pendente',150,''),
  ('00000000-0000-4000-8000-000000000061','retirada','em_producao',NULL,NULL,'credito','pendente',50,''),
  ('00000000-0000-4000-8000-000000000062','retirada','entregue',now(),now(),'dinheiro','pago',80,''),
  ('00000000-0000-4000-8000-000000000063','retirada','cancelado',NULL,NULL,'pix','pendente',40,''),
  ('00000000-0000-4000-8000-000000000064','retirada','em_rota',NULL,NULL,'dinheiro','pendente',30,''),
  ('00000000-0000-4000-8000-000000000065','retirada','pronto',now(),NULL,'dinheiro','pendente',20,''),
  ('00000000-0000-4000-8000-000000000066','retirada','aguardando_motoboy',NULL,NULL,'pix','pendente',25,'');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;

-- Forma inválida e Pix/cartão sem confirmação efetiva são recusados.
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 1000, 'fase1:forma-invalida', 'boleto', NULL, true
)::jsonb->>'status' = 'dados_invalidos', 'forma efetiva fora da lista é recusada');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 1000, 'fase1:pix-sem-confirm', 'pix', NULL, false
)::jsonb->>'status' = 'confirmacao_efetiva_requerida', 'Pix sem confirmação não é recebido');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 5000, 'fase1:dinheiro-60', 'dinheiro', 4500, true
)::jsonb->>'status' = 'dados_invalidos', 'valor entregue menor que o devido é recusado');

-- Preferência original Pix, pagamento efetivo em dinheiro com troco.
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 5000, 'fase1:dinheiro-60', 'dinheiro', 5500, true
)::jsonb->>'status' = 'registrado', 'pedido originalmente Pix pode ser pago em dinheiro');
SELECT pg_temp.ok((SELECT forma_pagamento='pix' AND forma_pagamento_efetiva='dinheiro'
    AND valor_centavos=5000 AND valor_entregue_centavos=5500 AND troco_centavos=500
  FROM public.pedido_pagamento_eventos WHERE chave_idempotencia='fase1:dinheiro-60'),
  'ledger guarda preferência, forma efetiva, entregue e troco separadamente');
SELECT pg_temp.ok((SELECT sum(valor_centavos)=5000
  FROM public.pedido_pagamento_eventos WHERE pedido_id='00000000-0000-4000-8000-000000000060'),
  'troco não é contabilizado como receita');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 5000, 'fase1:dinheiro-60', 'dinheiro', 5500, true
)::jsonb->>'status' = 'repetido', 'repetição com a mesma chave não duplica');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 5000, 'fase1:dinheiro-60', 'pix', NULL, true
)::jsonb->>'status' = 'chave_idempotencia_conflitante',
  'mesma chave com forma diferente é conflito, não correção silenciosa');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.pedido_pagamento_eventos
  WHERE pedido_id='00000000-0000-4000-8000-000000000060'),
  'conflito de idempotência não gravou evento');

-- Consulta da chave após resposta inconclusiva.
SELECT pg_temp.ok((public.verificar_recebimento_por_chave('fase1:dinheiro-60')->>'status') = 'registrado'
  AND (public.verificar_recebimento_por_chave('fase1:dinheiro-60')->>'troco_centavos')::int = 500,
  'verificação por chave confirma o que foi gravado, inclusive o troco');
SELECT pg_temp.ok((public.verificar_recebimento_por_chave('fase1:inexistente')->>'status') = 'nao_registrado',
  'chave sem lançamento não é tratada como sucesso');

-- Pagamento misto: dinheiro + Pix + débito no mesmo pedido.
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 7000, 'fase1:pix-60', 'pix', NULL, true
)::jsonb->>'status' = 'registrado', 'Pix efetivo confirmado é registrado');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 3000, 'fase1:debito-60', 'debito', NULL, true
)::jsonb->>'status' = 'registrado', 'débito efetivo confirmado é registrado');
SELECT pg_temp.ok((SELECT count(DISTINCT forma_pagamento_efetiva)=3
    AND sum(valor_centavos)=15000
  FROM public.pedido_pagamento_eventos WHERE pedido_id='00000000-0000-4000-8000-000000000060'),
  'pagamento misto gera eventos próprios e quita sem duplicidade');
SELECT pg_temp.ok((public.consultar_recebimento_retirada(
  '00000000-0000-4000-8000-000000000060')->>'status') = 'quitado',
  'saldo resultante é zero após as formas mistas');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000060', 100, 'fase1:duplico-60', 'pix', NULL, true
)::jsonb->>'status' = 'sem_saldo', 'pedido quitado não gera nova cobrança');

-- Recebimento durante a produção, com preferência original diferente.
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000061', 5000, 'fase1:dinheiro-61', 'dinheiro', 5000, true
)::jsonb->>'status' = 'registrado', 'recebimento em dinheiro durante a produção');
SELECT pg_temp.ok((SELECT forma_pagamento='credito' AND forma_pagamento_efetiva='dinheiro'
  FROM public.pedido_pagamento_eventos WHERE chave_idempotencia='fase1:dinheiro-61'),
  'forma original de cartão permanece preservada no pedido');

-- Assinatura antiga não é caminho paralelo de gravação.
SELECT pg_temp.ok(public.registrar_pagamento_pedido(
  '00000000-0000-4000-8000-000000000061', 100, 'fase1:legado-61')::jsonb->>'status' = 'dados_invalidos',
  'RPC antiga sem forma efetiva não registra');

-- Capacidade continua sendo autoridade para todos os papéis.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false) IS NOT NULL;
SELECT pg_temp.ok((public.verificar_recebimento_por_chave('fase1:dinheiro-60')->>'status') = 'nao_autorizado',
  'sem capacidade não é possível nem consultar a chave');
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000061', 100, 'fase1:sem-capacidade-61', 'pix', NULL, true
)::jsonb->>'status' = 'nao_autorizado', 'atendente sem capacidade continua bloqueada');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false) IS NOT NULL;
SELECT pg_temp.ok(public.registrar_pagamento_pedido_efetivo(
  '00000000-0000-4000-8000-000000000061', 100, 'fase1:admin-sem-capacidade', 'pix', NULL, true
)::jsonb->>'status' = 'nao_autorizado', 'Admin sem capacidade continua bloqueado');

-- Guarda de edição por estágio (chamada direta à RPC não contorna a interface).
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false) IS NOT NULL;
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000062', 'tentativa', 'motivo valido'
)::jsonb->>'status' = 'pedido_nao_editavel', 'pedido entregue não é editável');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000063', 'tentativa', 'motivo valido'
)::jsonb->>'status' = 'pedido_nao_editavel', 'pedido cancelado não é editável');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000064', 'tentativa', 'motivo valido'
)::jsonb->>'status' = 'pedido_nao_editavel', 'pedido em rota não é editável');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000065', 'retirar na portaria', 'motivo administrativo'
)::jsonb->>'status' = 'editado', 'admin pode editar pedido pronto com motivo');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000066', 'confirmar prazo', 'motivo administrativo'
)::jsonb->>'status' = 'editado', 'admin pode editar pedido aguardando motoboy');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false) IS NOT NULL;
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000065', 'segunda tentativa', 'motivo da atendente'
)::jsonb->>'status' = 'pedido_nao_editavel',
  'atendente não edita pedido pronto sem autorização específica');
SELECT pg_temp.ok(public.editar_observacoes_pedido(
  '00000000-0000-4000-8000-000000000061', 'cliente ligou', 'motivo da atendente'
)::jsonb->>'status' = 'editado', 'atendente edita pedido em produção com auditoria');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.pedido_edicoes_auditoria
  WHERE pedido_id IN ('00000000-0000-4000-8000-000000000062',
                      '00000000-0000-4000-8000-000000000063',
                      '00000000-0000-4000-8000-000000000064')),
  'estados terminais e em rota não geraram auditoria de edição');

RESET ROLE;
