-- Teste isolado da operacao 0113: confirmar_entrega.
-- Executar apos cadeia ate 0109 + rotas-app.sql.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/confirmar-entrega.sql

RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Motoboy 0003 (usuario ...0003): rota com pedidos 0001 e 0004.
-- Motoboy 0004 (usuario ...0004): rota com pedido 0002.
-- Pedido 0003: pronto, sem motoboy (nao atribuido).

-- Adiciona pedido 0004 à rota do motoboy 0003 (prova de que entregar um nao conclui o outro).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
BEGIN
  INSERT INTO public.pedidos (id, cliente_nome, telefone, endereco, bairro, cidade, tipo_entrega, status, motoboy_id, rota_id)
  SELECT '70000000-0000-0000-0000-000000000004','Cliente segundo pedido','','Rua 4','Bairro teste','Cidade teste','entrega','aguardando_motoboy',
         '10000000-0000-0000-0000-000000000003', v_rota
  WHERE NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000004');

  INSERT INTO public.rota_pedidos (rota_id, pedido_id, ordem)
  SELECT v_rota, '70000000-0000-0000-0000-000000000004', 2
  WHERE NOT EXISTS (SELECT 1 FROM public.rota_pedidos WHERE rota_id = v_rota AND pedido_id = '70000000-0000-0000-0000-000000000004');
END $$;

-- Caso 1: confirma entrega enquanto pedido ainda esta aguardando_motoboy (rota nao iniciada).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel' OR r->>'motivo' IS DISTINCT FROM 'pedido_nao_em_rota' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: motoboy 0003 inicia a propria rota (pedidos 0001 e 0004 passam a em_rota).
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: confirma entrega individual do pedido 0001.
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'entrega_confirmada' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  IF r->>'entregue_em' IS NULL THEN RAISE EXCEPTION 'Caso3 falhou: entregue_em nao preenchido'; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: repeticao e idempotente.
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'entrega_ja_confirmada' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: motoboy 0004 tenta entregar pedido do motoboy 0003.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' OR r->>'motivo' IS DISTINCT FROM 'pedido_de_outro_motoboy' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: pedido nao atribuído (sem motoboy) nao pode ser entregue.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000003');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: cliente (sem papel motoboy) chama a RPC.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso7 falhou: %', r; END IF;
  RAISE NOTICE 'Caso7 OK: %', r;
END $$;

-- Caso 8: pedido inexistente (identidade de motoboy valida).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.confirmar_entrega('00000000-0000-0000-0000-000000000000');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inexistente' THEN RAISE EXCEPTION 'Caso8 falhou: %', r; END IF;
  RAISE NOTICE 'Caso8 OK: %', r;
END $$;

-- Caso 9: estado final — so o pedido 0001 fica entregue; o pedido 0004 da mesma rota nao e concluido automaticamente.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v1_status text; v1_entregue timestamptz;
  v4_status text;
  v_hist integer;
BEGIN
  SELECT status, entregue_em INTO v1_status, v1_entregue FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000001';
  IF v1_status IS DISTINCT FROM 'entregue' OR v1_entregue IS NULL THEN
    RAISE EXCEPTION 'Caso9 falhou: pedido 0001 status=% entregue=%', v1_status, v1_entregue;
  END IF;
  SELECT status INTO v4_status FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000004';
  IF v4_status IS DISTINCT FROM 'em_rota' THEN
    RAISE EXCEPTION 'Caso9 falhou: pedido 0004 (outro da rota) foi concluido automaticamente: status=%', v4_status;
  END IF;
  SELECT count(*) INTO v_hist FROM public.motoboy_historico WHERE evento = 'entrega_realizada';
  IF v_hist < 1 THEN RAISE EXCEPTION 'Caso9 falhou: nenhum evento de entrega no historico'; END IF;
  RAISE NOTICE 'Caso9 OK: apenas o pedido 0001 entregue; historico com % evento(s)', v_hist;
END $$;
