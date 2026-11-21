-- Teste isolado das operacoes 0114: informar_retorno_loja / confirmar_chegada_loja.
-- Executar apos cadeia ate 0109 + rotas-app.sql.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/retorno-chegada.sql

RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Caso 1: retorno de rota ainda preparando (nao iniciada) nao e aceito.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.informar_retorno_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel' OR r->>'motivo' IS DISTINCT FROM 'rota_nao_estava_em_rota' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: motoboy 0003 inicia a propria rota.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: motoboy 0004 nao informa retorno de rota alheia.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.informar_retorno_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' OR r->>'motivo' IS DISTINCT FROM 'rota_de_outro_motoboy' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: motoboy 0003 informa retorno.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.informar_retorno_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'retorno_informado' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: repeticao e idempotente.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.informar_retorno_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'retorno_ja_informado' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: chegada com pedido pendente na rota é bloqueada.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.confirmar_chegada_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'bloqueado' OR r->>'motivo' IS DISTINCT FROM 'rota_com_pendentes' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: motoboy 0003 confirma entrega do pedido 0001.
DO $$
DECLARE r jsonb := public.confirmar_entrega('70000000-0000-0000-0000-000000000001');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'entrega_confirmada' THEN RAISE EXCEPTION 'Caso7 falhou: %', r; END IF;
  RAISE NOTICE 'Caso7 OK: %', r;
END $$;

-- Caso 8: motoboy 0003 confirma chegada à loja.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.confirmar_chegada_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'chegada_confirmada' THEN RAISE EXCEPTION 'Caso8 falhou: %', r; END IF;
  IF r->>'chegou_em' IS NULL THEN RAISE EXCEPTION 'Caso8 falhou: chegou_em nao preenchido'; END IF;
  RAISE NOTICE 'Caso8 OK: %', r;
END $$;

-- Caso 9: repeticao da chegada é idempotente.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.confirmar_chegada_loja(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'chegada_ja_confirmada' THEN RAISE EXCEPTION 'Caso9 falhou: %', r; END IF;
  RAISE NOTICE 'Caso9 OK: %', r;
END $$;

-- Caso 10: estado final.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  v_status text; v_chegou timestamptz; v_mstatus text; v_pedido text;
BEGIN
  SELECT status, chegou_em INTO v_status, v_chegou FROM public.rotas_entrega WHERE id = v_rota;
  IF v_status IS DISTINCT FROM 'concluida' OR v_chegou IS NULL THEN
    RAISE EXCEPTION 'Caso10 falhou: rota status=% chegou=%', v_status, v_chegou;
  END IF;
  SELECT status::text INTO v_mstatus FROM public.motoboys WHERE id = '60000000-0000-0000-0000-000000000001';
  IF v_mstatus IS DISTINCT FROM 'disponivel_base' THEN
    RAISE EXCEPTION 'Caso10 falhou: motobiro status=%', v_mstatus;
  END IF;
  SELECT status INTO v_pedido FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000001';
  IF v_pedido IS DISTINCT FROM 'entregue' THEN
    RAISE EXCEPTION 'Caso10 falhou: pedido status=%', v_pedido;
  END IF;
  RAISE NOTICE 'Caso10 OK: rota concluida, motoboy disponivel, pedido entregue';
END $$;
