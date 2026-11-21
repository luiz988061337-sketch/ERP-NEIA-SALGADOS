-- Teste isolado da operacao 0111: aceitar_rota.
-- Executar apos cadeia ate 0109 + rotas-app.sql.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/aceitar-rota.sql

RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Motoboy 0003 = usuario ...0003, cadastro ...0001, rota 'preparando' com pedido 0001.
-- Motoboy 0004 = usuario ...0004, cadastro ...0002, rota 'preparando' com pedido 0002.

-- Caso 1: motoboy 0003 aceita a propria rota preparando.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.aceitar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'rota_aceita' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  IF (r->>'pedidos_aceitos')::int < 1 THEN RAISE EXCEPTION 'Caso1 falhou: nenhum pedido aceito'; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repeticao e idempotente.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.aceitar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' OR r->>'motivo' IS DISTINCT FROM 'rota_ja_aceita' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: motoboy 0004 tenta aceitar rota do motoboy 0003.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.aceitar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' OR r->>'motivo' IS DISTINCT FROM 'rota_de_outro_motoboy' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: rota ja em_rota nao aceita aceite (apenas preparando).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.rotas_entrega
   SET status = 'em_rota'
 WHERE motoboy_id = '60000000-0000-0000-0000-000000000001' AND status = 'preparando';
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.aceitar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel' OR r->>'motivo' IS DISTINCT FROM 'rota_nao_esta_preparando' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: rota inexistente.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.aceitar_rota('00000000-0000-0000-0000-000000000000');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inexistente' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: cliente (sem papel motoboy) chama a RPC.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1);
  r jsonb := public.aceitar_rota(v_rota);
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: estado final — pedidos da rota do motoboy 0003 aceitos + historico.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_pendentes integer;
  v_hist integer;
BEGIN
  SELECT count(*) INTO v_pendentes
    FROM public.rota_pedidos rp
    JOIN public.pedidos p ON p.id = rp.pedido_id
   WHERE rp.rota_id = (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' LIMIT 1)
     AND p.aceito_motoboy_em IS NULL;
  IF v_pendentes <> 0 THEN RAISE EXCEPTION 'Caso7 falhou: % pedidos ainda sem aceite', v_pendentes; END IF;
  SELECT count(*) INTO v_hist FROM public.motoboy_historico WHERE evento = 'inicio_preparacao_saida';
  IF v_hist < 1 THEN RAISE EXCEPTION 'Caso7 falhou: nenhum evento de aceite no historico'; END IF;
  RAISE NOTICE 'Caso7 OK: todos pedidos aceitos, % eventos de historico', v_hist;
END $$;
