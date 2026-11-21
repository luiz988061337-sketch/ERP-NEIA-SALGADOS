-- Teste isolado da operacao 0112: iniciar_rota.
-- Executar apos cadeia ate 0109 + rotas-app.sql.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/iniciar-rota.sql

RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Motoboy 0003 (usuario ...0003, cadastro ...0001): rota preparando, pedido 0001.
-- Motoboy 0004 (usuario ...0004, cadastro ...0002): rota preparando, pedido 0002.

-- Caso 1: motoboy 0003 inicia a propria rota preparando.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'rota_iniciada' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  IF r->>'saiu_em' IS NULL THEN RAISE EXCEPTION 'Caso1 falhou: saiu_em nao preenchido'; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repeticao e idempotente.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'rota_ja_iniciada' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: motoboy 0004 nao inicia rota do motoboy 0003.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' OR r->>'motivo' IS DISTINCT FROM 'rota_de_outro_motoboy' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 3b: motoboy 0004 inicia a propria rota (prepara o caso 6).
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000002' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso3b falhou: %', r; END IF;
  RAISE NOTICE 'Caso3b OK: %', r;
END $$;

-- Caso 4: rota inexistente.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.iniciar_rota('00000000-0000-0000-0000-000000000000');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inexistente' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: cliente (sem papel motoboy) chama a RPC.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: rota ja concluida nao aceita inicio (apenas preparando).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.rotas_entrega SET status = 'concluida', chegou_em = now()
 WHERE motoboy_id = '60000000-0000-0000-0000-000000000002' AND status = 'em_rota';
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000002' LIMIT 1);
  r jsonb := public.iniciar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel' OR r->>'motivo' IS DISTINCT FROM 'rota_nao_esta_preparando' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: estado final — rota do motoboy 0003 em_rota com saiu_em; pedidos dela em em_rota.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_status text;
  v_saiu timestamptz;
  v_pendentes integer;
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
BEGIN
  SELECT status, saiu_em INTO v_status, v_saiu FROM public.rotas_entrega WHERE id = v_rota;
  IF v_status IS DISTINCT FROM 'em_rota' OR v_saiu IS NULL THEN
    RAISE EXCEPTION 'Caso7 falhou: rota status=% saiu=%', v_status, v_saiu;
  END IF;
  SELECT count(*) INTO v_pendentes
    FROM public.pedidos p
   WHERE p.motoboy_id = '10000000-0000-0000-0000-000000000003'
     AND p.id IN (SELECT pedido_id FROM public.rota_pedidos rp WHERE rp.rota_id = v_rota)
     AND p.status <> 'em_rota';
  IF v_pendentes <> 0 THEN RAISE EXCEPTION 'Caso7 falhou: % pedidos nao estao em_rota', v_pendentes; END IF;
  RAISE NOTICE 'Caso7 OK: rota iniciada e pedidos da rota em em_rota';
END $$;
