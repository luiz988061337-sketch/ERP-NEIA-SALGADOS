-- Teste isolado da operacao 0110: confirmar_retirada.
-- Executar apos a cadeia ate 0109 + rotas-app.sql (usuarios/motoboys/pedidos/rotas sinteticos).
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/retirada.sql

RESET ROLE;

-- Garante papel admin ao usuario 0001 (criador de rotas na cadeia anterior).
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Estado esperado apos rotas-app.sql:
--   pedido 0001: aguardando_motoboy, motoboy 0003 (user 0003), rota 'preparando' do motoboy 0003.
--   pedido 0002: aguardando_motoboy, motoboy 0004 (user 0004), rota do motoboy 0004.
--   pedido 0003: pronto, sem motoboy (nao atribuido).

-- Caso 1: motoboy 0003 confirma retirada do proprio pedido atribuido.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repeticao e idempotente (mesma chamada nao duplica lancamento).
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok'
     OR r->>'motivo' IS DISTINCT FROM 'retirada_ja_confirmada' THEN
    RAISE EXCEPTION 'Caso2 falhou: %', r;
  END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: motoboy 0004 tenta retirar pedido de motoboy 0003 (pedido alheio).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado'
     OR r->>'motivo' IS DISTINCT FROM 'pedido_de_outro_motoboy' THEN
    RAISE EXCEPTION 'Caso3 falhou: %', r;
  END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: pedido nao atribuido (motoboy_id null) nao pode ser retirado por motoboy algum.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000003');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: pedido em status invalido (pronto, nao aguardando_motoboy) para retirada.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  INSERT INTO public.pedidos (id, cliente_nome, telefone, endereco, bairro, cidade, tipo_entrega, status, motoboy_id, rota_id)
  SELECT '70000000-0000-0000-0000-000000000004','Cliente pronto sem retirada','','Rua 4','Bairro teste','Cidade teste','entrega','pronto',
         '10000000-0000-0000-0000-000000000003',
         (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status IN ('preparando','em_rota') LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000004');

  INSERT INTO public.rota_pedidos (rota_id, pedido_id, ordem)
  SELECT r.id, '70000000-0000-0000-0000-000000000004', 1
  FROM public.rotas_entrega r
  WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status IN ('preparando','em_rota')
  ON CONFLICT DO NOTHING;
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000004');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel'
     OR r->>'motivo' IS DISTINCT FROM 'pedido_nao_aguarda_retirada' THEN
    RAISE EXCEPTION 'Caso5 falhou: %', r;
  END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: cliente (sem papel motoboy) chama a RPC.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE r jsonb := public.confirmar_retirada('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: pedido inexistente (identidade de motoboy valida, pedido nao existe).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_retirada('00000000-0000-0000-0000-000000000000');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inexistente' THEN RAISE EXCEPTION 'Caso7 falhou: %', r; END IF;
  RAISE NOTICE 'Caso7 OK: %', r;
END $$;

-- Caso 8: estado final persistido (retirada_em, retirada_por e evento de historico).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_em timestamptz;
  v_por uuid;
  v_hist integer;
BEGIN
  SELECT retirada_em, retirada_por INTO v_em, v_por
    FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000001';
  IF v_em IS NULL THEN RAISE EXCEPTION 'Estado final: retirada_em nulo'; END IF;
  IF v_por IS DISTINCT FROM '10000000-0000-0000-0000-000000000003'::uuid THEN
    RAISE EXCEPTION 'Estado final: retirada_por incorreto';
  END IF;
  SELECT count(*) INTO v_hist
    FROM public.motoboy_historico
   WHERE pedido_id = '70000000-0000-0000-0000-000000000001' AND evento = 'saida_base';
  IF v_hist <> 1 THEN RAISE EXCEPTION 'Estado final: historico esperado 1, obteve %', v_hist; END IF;
  RAISE NOTICE 'Estado final OK: retirada_em=%', v_em;
END $$;

-- Caso 9: concorrencia — duas retiradas do mesmo pedido na mesma transacao nao sao possiveis
--         por FOR UPDATE; a segunda dentro de uma sessao separada aguarda e depois encontra
--         ja confirmada (idempotente) ou condicao de corrida. Aqui apenas garante que nao
--         houve corrupcao: o pedido continua com exatamente uma retirada registrada.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_qtd integer;
BEGIN
  SELECT count(*) INTO v_qtd FROM public.pedidos
   WHERE id = '70000000-0000-0000-0000-000000000001' AND retirada_em IS NOT NULL AND retirada_por IS NOT NULL;
  IF v_qtd <> 1 THEN RAISE EXCEPTION 'Caso9 falhou: retiradas duplicadas ou ausentes (%s)', v_qtd; END IF;
  RAISE NOTICE 'Caso9 OK: unica retirada confirmada';
END $$;
