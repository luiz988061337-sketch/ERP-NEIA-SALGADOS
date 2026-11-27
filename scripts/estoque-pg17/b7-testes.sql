-- Ensaios NOVOS e descartáveis da corretiva B7 e dos contratos operacionais.
-- Não repete os testes já aprovados em testes-estoque.sql. Cluster local apenas.
CREATE OR REPLACE FUNCTION public.assert_b7(p_cond boolean, p_msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(p_cond, false) THEN
    RAISE EXCEPTION 'ASSERT B7: %', p_msg;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.assert_b7(boolean, text) TO authenticated;

CREATE TEMP TABLE b7_resumo (rotulo text PRIMARY KEY, res jsonb);
GRANT ALL ON b7_resumo TO authenticated;

-- ---------------------------------------------------------------------------
-- 0. Habilitação explícita da corretiva (padrão é desligada)
-- ---------------------------------------------------------------------------
SELECT assert_b7(
  (SELECT count(*) FROM public.sabores_estoque
    WHERE chave IN ('coxinha-frango', 'pizza-queijo')) = 2,
  'sabores canônicos da fixture');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
SELECT assert_b7(
  (public.configurar_b7_salgados(true)->>'status') = 'ok', 'ativar B7');

-- O rename preserva o OID: a base não pode continuar executável pelo cliente.
DO $$
BEGIN
  BEGIN
    PERFORM public.criar_pedido_com_reserva_base(
      md5('b7:pedido:bypass')::uuid, 'checkout', '{}'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'base chamável diretamente pelo cliente';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 1. Venda imediata com cobertura: reserva normal, sem registro de agendamento
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'cliente@estoque.teste'), false);

INSERT INTO b7_resumo (rotulo, res)
VALUES ('imediata', public.criar_pedido_com_reserva(
  md5('b7:pedido:imediata')::uuid, 'checkout',
  '{"cliente_nome":"Cliente B7","telefone":"11999999999","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:coxinha')::uuid, 'quantidade', 10))
));

RESET ROLE;
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'imediata') = 'criado',
  'venda imediata criada');
SELECT assert_b7(
  (SELECT count(*) FROM public.reservas_estoque
    WHERE pedido_id = md5('b7:pedido:imediata')::uuid) = 1,
  'venda imediata gerou uma única reserva');
SELECT assert_b7(
  NOT EXISTS (SELECT 1 FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:imediata')::uuid),
  'venda imediata não é agendamento');

-- ---------------------------------------------------------------------------
-- 2. Agendamento com cobertura física: protege sem criar reserva duplicada
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'cliente@estoque.teste'), false);

INSERT INTO b7_resumo (rotulo, res)
VALUES ('coberto', public.criar_pedido_com_reserva(
  md5('b7:pedido:coberto')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', '2026-12-02T10:00:00-03:00'),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:coxinha')::uuid, 'quantidade', 10))
));

-- Repetição com a mesma chave não pode duplicar pedido nem reserva.
INSERT INTO b7_resumo (rotulo, res)
VALUES ('coberto_retry', public.criar_pedido_com_reserva(
  md5('b7:pedido:coberto')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', '2026-12-02T10:00:00-03:00'),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:coxinha')::uuid, 'quantidade', 10))
));

RESET ROLE;
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'coberto') = 'criado',
  'agendamento coberto criado');
SELECT assert_b7(
  (SELECT res->'agendamento'->>'situacao' FROM b7_resumo WHERE rotulo = 'coberto')
    = 'reserva_fisica_protegida',
  'agendamento coberto protegido');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'coberto_retry') = 'ja_criado',
  'retry do agendamento coberto é idempotente');
SELECT assert_b7(
  (SELECT data_solicitada > current_date FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:coberto')::uuid),
  'data agendada preservada no registro operacional');
-- A data entra no INSERT da base; nenhum UPDATE posterior burla a guarda.
SELECT assert_b7(
  (SELECT agendado_para IS NOT NULL FROM public.pedidos
    WHERE id = md5('b7:pedido:coberto')::uuid),
  'data agendada preservada no pedido sem UPDATE');
SELECT assert_b7(
  (SELECT count(*) FROM public.reservas_estoque
    WHERE pedido_id = md5('b7:pedido:coberto')::uuid) = 1,
  'agendamento coberto não duplicou reserva');
SELECT assert_b7(
  (SELECT situacao FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:coberto')::uuid) = 'reserva_fisica_protegida',
  'registro de proteção gravado');

-- ---------------------------------------------------------------------------
-- 3. Agendamento sem cobertura: análise, sem pedido, reserva ou cobrança
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'cliente@estoque.teste'), false);

INSERT INTO b7_resumo (rotulo, res)
VALUES ('analise', public.criar_pedido_com_reserva(
  md5('b7:pedido:analise')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', '2026-12-01T10:00:00-03:00'),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:pizza')::uuid, 'quantidade', 10))
));

INSERT INTO b7_resumo (rotulo, res)
VALUES ('analise_retry', public.criar_pedido_com_reserva(
  md5('b7:pedido:analise')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', '2026-12-01T10:00:00-03:00'),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:pizza')::uuid, 'quantidade', 10))
));

-- Cliente não pode transformar análise em compromisso.
INSERT INTO b7_resumo (rotulo, res)
VALUES ('compromisso_negado', public.registrar_compromisso_aprovado_b7(
  md5('b7:pedido:analise')::uuid, md5('b7:idem:compromisso')::uuid));

RESET ROLE;
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'analise') = 'analise_necessaria',
  'agendamento sem cobertura encaminhado para análise');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'analise_retry') = 'analise_necessaria',
  'retry da análise é estável');
SELECT assert_b7(
  NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = md5('b7:pedido:analise')::uuid),
  'análise não criou pedido confirmado');
SELECT assert_b7(
  NOT EXISTS (SELECT 1 FROM public.reservas_estoque
    WHERE pedido_id = md5('b7:pedido:analise')::uuid),
  'análise não criou reserva');
SELECT assert_b7(
  (SELECT cardinality(solicitacoes) FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:analise')::uuid) = 1,
  'uma solicitação por sabor sem cobertura');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'compromisso_negado')
    = 'permissao_negada',
  'cliente não pode registrar compromisso');

-- ---------------------------------------------------------------------------
-- 4. Aprovação => compromisso futuro real, revalidável e idempotente
-- ---------------------------------------------------------------------------
-- A leitura do registro operacional é feita como proprietário do cluster:
-- authenticated não tem SELECT na tabela (RLS sem política e grants revogados).
SELECT solicitacoes[1] AS sol_aprovacao
FROM public.salgados_agendamentos_b7
WHERE pedido_id = md5('b7:pedido:analise')::uuid \gset

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);

INSERT INTO b7_resumo (rotulo, res)
VALUES ('aprovacao', public.responder_solicitacao_salgado(
  :'sol_aprovacao',
  'aprovada', 10, 0, 'Aprovado para fabricação futura', NULL, NULL
));

INSERT INTO b7_resumo (rotulo, res)
VALUES ('compromisso', public.registrar_compromisso_aprovado_b7(
  md5('b7:pedido:analise')::uuid, md5('b7:idem:compromisso')::uuid));

INSERT INTO b7_resumo (rotulo, res)
VALUES ('compromisso_retry', public.registrar_compromisso_aprovado_b7(
  md5('b7:pedido:analise')::uuid, md5('b7:idem:compromisso')::uuid));

RESET ROLE;
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'aprovacao') = 'ok',
  'responsável aprovou a análise');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'compromisso') = 'ok',
  'compromisso futuro registrado');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'compromisso_retry')
    = 'ja_registrado',
  'compromisso idempotente');
SELECT assert_b7(
  (SELECT count(*) FROM public.salgados_compromissos
    WHERE chave = 'pizza-queijo' AND status = 'pendente') = 1,
  'um único compromisso pendente de pizza');
SELECT assert_b7(
  (SELECT bool_and(pedido_id IS NULL) FROM public.salgados_compromissos
    WHERE chave = 'pizza-queijo' AND status = 'pendente'),
  'compromisso futuro não finge pedido confirmado');
SELECT assert_b7(
  (SELECT situacao FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:analise')::uuid) = 'compromisso_aprovado',
  'situação final do agendamento');
SELECT assert_b7(
  NOT EXISTS (
    SELECT 1 FROM public.lotes WHERE sabor_chave = 'pizza-queijo'
  ),
  'compromisso não criou lote fictício');

-- ---------------------------------------------------------------------------
-- 5. Retirada parcial, FEFO e devolução do não consumido
-- ---------------------------------------------------------------------------
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);

DO $$
DECLARE
  v_reserva uuid;
  v_lote text;
  v_ret text;
  v_status text;
  v_total integer;
BEGIN
  v_status := public.reservar_sabor_estoque(
    'coxinha-frango', 30, md5('b7:pedido:imediata')::uuid,
    md5('b7:reserva:parcial')::uuid, current_date) ->> 'status';
  IF v_status <> 'ok' THEN
    RAISE EXCEPTION 'reserva para retirada parcial falhou: %', v_status;
  END IF;
  SELECT id INTO v_reserva FROM public.reservas_estoque
  WHERE chave_idempotencia = md5('b7:reserva:parcial')::uuid;
  SELECT l.codigo INTO v_lote FROM public.reservas_estoque r
  JOIN public.lotes l ON l.id = r.lote_id WHERE r.id = v_reserva;
  IF v_lote <> 'B7-FEFO-1' THEN
    RAISE EXCEPTION 'FEFO escolheu % em vez do lote mais antigo', v_lote;
  END IF;

  v_ret := public.movimentar_lote_salgado(
    p_sabor => 'coxinha-frango', p_produto => NULL, p_tipo => 'retirada',
    p_quantidade => 10, p_chave => md5('b7:retirada:parcial')::uuid,
    p_observacao => 'Retirada física parcial', p_reserva => v_reserva);
  IF v_ret NOT IN ('registrado', 'ja_registrado') THEN
    RAISE EXCEPTION 'retirada parcial falhou: %', v_ret;
  END IF;

  SELECT coalesce(sum(quantidade), 0)::integer INTO v_total
  FROM public.reserva_consumos WHERE reserva_id = v_reserva;
  IF v_total <> 10 THEN
    RAISE EXCEPTION 'consumo parcial divergente: %', v_total;
  END IF;
  IF (SELECT status FROM public.reservas_estoque WHERE id = v_reserva) <> 'ativa' THEN
    RAISE EXCEPTION 'reserva parcialmente consumida deixou de estar ativa';
  END IF;

  v_status := public.liberar_reserva_sabor(
    v_reserva, 'Devolução das unidades não consumidas',
    md5('b7:devolucao:parcial')::uuid) ->> 'status';
  IF v_status <> 'ok' THEN
    RAISE EXCEPTION 'devolução do não consumido falhou: %', v_status;
  END IF;

  IF (SELECT status FROM public.reservas_estoque WHERE id = v_reserva) <> 'liberada' THEN
    RAISE EXCEPTION 'reserva não foi liberada após devolução';
  END IF;
  IF (SELECT fisico FROM public.vw_saldos_sabores_estoque
      WHERE chave = 'coxinha-frango') <> 140 THEN
    RAISE EXCEPTION 'saldo físico após retirada parcial divergente';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Ciclo completo de agendamento dependente de aprovação
-- ---------------------------------------------------------------------------
-- 6a. Recusa: nenhum compromisso é criado.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'cliente@estoque.teste'), false);
INSERT INTO b7_resumo (rotulo, res)
VALUES ('recusa', public.criar_pedido_com_reserva(
  md5('b7:pedido:recusa')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', '2026-12-05T10:00:00-03:00'),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:pizza')::uuid, 'quantidade', 5))
));
RESET ROLE;

SELECT solicitacoes[1] AS sol_recusa
FROM public.salgados_agendamentos_b7
WHERE pedido_id = md5('b7:pedido:recusa')::uuid \gset

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
INSERT INTO b7_resumo (rotulo, res)
VALUES ('recusa_resposta', public.responder_solicitacao_salgado(
  :'sol_recusa', 'recusada', 0, 0, 'Sem capacidade de fabricação', NULL, NULL));
INSERT INTO b7_resumo (rotulo, res)
VALUES ('recusa_compromisso', public.registrar_compromisso_aprovado_b7(
  md5('b7:pedido:recusa')::uuid, md5('b7:idem:recusa')::uuid));
RESET ROLE;

SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'recusa') = 'analise_necessaria',
  'recusa: solicitação aberta');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'recusa_compromisso') = 'recusado',
  'recusa: compromisso não registrado');
SELECT assert_b7(
  NOT EXISTS (
    SELECT 1 FROM public.salgados_compromissos
    WHERE chave_idempotencia = md5(
      'b7:compromisso:' || md5('b7:pedido:recusa')::uuid::text || ':pizza-queijo')::uuid
  ),
  'recusa: nenhum compromisso criado');

-- 6b. Pedido definitivo é criado depois da aprovação, sem cobrança antecipada.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
INSERT INTO b7_resumo (rotulo, res)
VALUES ('definitivo', public.criar_pedido_com_reserva_base(
  md5('b7:pedido:definitivo')::uuid, 'checkout',
  '{"cliente_nome":"Cliente B7","telefone":"11999999999","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:pizza')::uuid, 'quantidade', 10))
));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
INSERT INTO b7_resumo (rotulo, res)
VALUES ('vinculacao', public.vincular_pedido_compromisso_b7(
  md5('b7:pedido:analise')::uuid, md5('b7:pedido:definitivo')::uuid,
  md5('b7:idem:vinculacao')::uuid));
INSERT INTO b7_resumo (rotulo, res)
VALUES ('vinculacao_retry', public.vincular_pedido_compromisso_b7(
  md5('b7:pedido:analise')::uuid, md5('b7:pedido:definitivo')::uuid,
  md5('b7:idem:vinculacao')::uuid));
RESET ROLE;

SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'definitivo') = 'criado',
  'pedido definitivo criado após aprovação');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'vinculacao') = 'ok',
  'compromisso vinculado ao pedido definitivo');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'vinculacao_retry') = 'ja_vinculado',
  'vinculação idempotente');
SELECT assert_b7(
  (SELECT pedido_id = md5('b7:pedido:definitivo')::uuid
     FROM public.salgados_compromissos
    WHERE chave_idempotencia = md5(
      'b7:compromisso:' || md5('b7:pedido:analise')::uuid::text || ':pizza-queijo')::uuid),
  'compromisso aprovado aponta para o pedido definitivo');
SELECT assert_b7(
  (SELECT pagamento_status FROM public.pedidos
    WHERE id = md5('b7:pedido:definitivo')::uuid) <> 'pago',
  'nenhuma cobrança antes da confirmação autorizada');

-- 6c. Entrada real cobre o compromisso; conversão em reserva FEFO não duplica.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
DO $$
DECLARE
  v_ret text;
BEGIN
  v_ret := public.movimentar_lote_salgado(
    p_sabor => 'pizza-queijo', p_produto => NULL, p_tipo => 'entrada',
    p_quantidade => 120, p_chave => md5('b7:lote:pizza')::uuid,
    p_codigo => 'B7-PIZZA-1', p_fabricacao => DATE '2026-11-25',
    p_validade => DATE '2027-01-15', p_observacao => 'Entrada real para cobertura B7');
  IF v_ret NOT IN ('registrado', 'ja_registrado') THEN
    RAISE EXCEPTION 'entrada de pizza falhou: %', v_ret;
  END IF;
END $$;
SELECT id AS comp_id FROM public.salgados_compromissos
WHERE status = 'coberto' AND chave = 'pizza-queijo' \gset

INSERT INTO b7_resumo (rotulo, res)
VALUES ('conversao', public.converter_compromisso_reserva_b7(
  :'comp_id'::uuid, md5('b7:pedido:definitivo')::uuid,
  md5('b7:reserva:pizza')::uuid));
INSERT INTO b7_resumo (rotulo, res)
VALUES ('conversao_retry', public.converter_compromisso_reserva_b7(
  :'comp_id'::uuid, md5('b7:pedido:definitivo')::uuid,
  md5('b7:reserva:pizza')::uuid));
RESET ROLE;

SELECT assert_b7(
  (SELECT status FROM public.salgados_compromissos WHERE id = :'comp_id'::uuid) = 'coberto',
  'entrada real cobriu o compromisso');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'conversao') = 'ok',
  'compromisso coberto convertido em reserva física');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'conversao_retry') = 'ja_registrado',
  'conversão idempotente');
SELECT assert_b7(
  (SELECT count(*) FROM public.reservas_estoque
    WHERE chave_idempotencia = md5('b7:reserva:pizza')::uuid) = 1,
  'uma única reserva física');
SELECT assert_b7(
  (SELECT situacao FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:analise')::uuid) = 'reserva_convertida',
  'situação final após conversão');
SELECT assert_b7(
  (SELECT reservado = 10 AND compromissos_futuros = 0
     FROM public.vw_saldos_sabores_estoque WHERE chave = 'pizza-queijo'),
  'saldo não contém compromisso e reserva duplicados');

-- 6d. Cancelamento libera a reserva convertida e é idempotente.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
INSERT INTO b7_resumo (rotulo, res)
VALUES ('cancelamento', public.cancelar_compromisso_b7(
  md5('b7:pedido:analise')::uuid, 'Cancelamento autorizado pela atendente',
  md5('b7:idem:cancelamento')::uuid));
INSERT INTO b7_resumo (rotulo, res)
VALUES ('cancelamento_retry', public.cancelar_compromisso_b7(
  md5('b7:pedido:analise')::uuid, 'Cancelamento autorizado pela atendente',
  md5('b7:idem:cancelamento')::uuid));
RESET ROLE;

SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'cancelamento') = 'ok',
  'cancelamento do agendamento aprovado');
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'cancelamento_retry') = 'ja_cancelado',
  'cancelamento idempotente');
SELECT assert_b7(
  (SELECT status FROM public.reservas_estoque
    WHERE chave_idempotencia = md5('b7:reserva:pizza')::uuid) = 'liberada',
  'reserva convertida foi liberada');
SELECT assert_b7(
  (SELECT status FROM public.salgados_compromissos WHERE id = :'comp_id'::uuid) = 'cancelado',
  'compromisso cancelado');
SELECT assert_b7(
  (SELECT situacao FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:analise')::uuid) = 'cancelado',
  'situação final cancelada');

-- ---------------------------------------------------------------------------
-- 7. Reversão não destrutiva: flag desligada restaura o comportamento da base
-- ---------------------------------------------------------------------------
SELECT assert_b7(
  (public.configurar_b7_salgados(false)->>'habilitado') = 'false',
  'desativar B7');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'cliente@estoque.teste'), false);

INSERT INTO b7_resumo (rotulo, res)
VALUES ('desligado', public.criar_pedido_com_reserva(
  md5('b7:pedido:desligado')::uuid, 'checkout',
  jsonb_build_object(
    'cliente_nome', 'Cliente B7', 'telefone', '11999999999',
    'tipo_entrega', 'retirada', 'forma_pagamento', 'dinheiro',
    'agendado_para', (now() + interval '4 days')::text),
  jsonb_build_array(jsonb_build_object(
    'produto_id', md5('b7:produto:pizza')::uuid, 'quantidade', 10))
));

RESET ROLE;
SELECT assert_b7(
  (SELECT res->>'status' FROM b7_resumo WHERE rotulo = 'desligado') = 'criado',
  'com flag desligada a base volta a criar/reservar como antes');
SELECT assert_b7(
  NOT EXISTS (SELECT 1 FROM public.salgados_agendamentos_b7
    WHERE pedido_id = md5('b7:pedido:desligado')::uuid),
  'flag desligada não grava novo agendamento');
SELECT assert_b7(
  (SELECT count(*) FROM public.reservas_estoque
    WHERE pedido_id = md5('b7:pedido:desligado')::uuid) = 1,
  'flag desligada preserva reserva única');
