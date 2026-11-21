-- Teste isolado da operacao 0115: solicitar_acerto_rota.
-- Executar apos cadeia ate 0109 + rotas-app.sql.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/acerto-solicitar.sql

RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin'),
       ('10000000-0000-0000-0000-000000000002','cliente'),
       ('10000000-0000-0000-0000-000000000003','motoboy'),
       ('10000000-0000-0000-0000-000000000004','motoboy')
ON CONFLICT (user_id, role) DO NOTHING;

-- Motoboy 0003 = cadastro ...0001; rota concluída com pedido 0001.
-- Motoboy 0004 = cadastro ...0002; rota concluída com pedido 0002.

-- Setup: motoboy 0003 inicia e conclui a própria rota (preparando -> em_rota -> concluida).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
BEGIN
  PERFORM public.iniciar_rota(v_rota);
  UPDATE public.pedidos SET status = 'em_rota' WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'aguardando_motoboy';
  UPDATE public.pedidos SET status = 'entregue', entregue_em = now() WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'em_rota';
  UPDATE public.rotas_entrega SET status = 'concluida', chegou_em = now() WHERE id = v_rota AND status = 'em_rota';
END $$;

-- Caso 1: motoboy 0003 solicita acerto de rota própria concluída.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'concluida' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:001', 'R-001', 1,
    78.50, 0, 78.50, 12.00, 2.00, 10.00, 0, 7.85, 90.35, 7.85, 80.50, 'Primeira entrega'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  IF (r->>'acerto_id') IS NULL THEN RAISE EXCEPTION 'Caso1 falhou: sem acerto_id'; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repetição com mesma chave é idempotente.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'concluida' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:001', 'R-001', 1,
    78.50, 0, 78.50, 12.00, 2.00, 10.00, 0, 7.85, 90.35, 7.85, 80.50, 'Primeira entrega'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'repetido' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: mesmo valor de chave com dados diferentes gera conflito.
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'concluida' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:001', 'R-001', 1,
    78.50, 0, 78.50, 12.00, 2.00, 10.00, 0, 7.85, 99.99, 7.85, 80.50, 'Valor caixa diferente'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'chave_idempotencia_conflitante' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: motoboy 0004 não solicita acerto de rota do motoboy 0003.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'concluida' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:004', 'R-004', 1,
    50.00, 0, 50.00, 5.00, 0, 0, 0, 6.00, 56.00, 6.00, 50.00, 'Rota alheia'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  IF r->>'motivo' IS DISTINCT FROM 'rota_de_outro_motoboy' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: rota não concluída não permite solicitar acerto.
-- (Usar rota do motoboy 0004 que está em_rota/concluida dependendo do estado anterior;
--  forçar uma rota preparando para este teste.)
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
BEGIN
  -- garante uma rota preparando do motoboy 0003
  INSERT INTO public.rotas_entrega (motoboy_id, status)
  SELECT '60000000-0000-0000-0000-000000000001', 'preparando'
  WHERE NOT EXISTS (SELECT 1 FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando');
END $$;
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:005', 'R-005', 1,
    50.00, 0, 50.00, 5.00, 0, 0, 0, 6.00, 56.00, 6.00, 50.00, 'Rota não concluída'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'inelegivel' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  IF r->>'motivo' IS DISTINCT FROM 'rota_nao_concluida' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: cliente (sem papel motoboy) chama a RPC.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'concluida' LIMIT 1);
  r jsonb := public.solicitar_acerto_rota(
    v_rota, 'acerto:teste:006', 'R-006', 1,
    50.00, 0, 50.00, 5.00, 0, 0, 0, 6.00, 56.00, 6.00, 50.00, 'Cliente'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: estado final — acerto solicitado persisted com valores.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_status text; v_valor_devido numeric; v_valor_devolver numeric; v_eventos integer;
BEGIN
  SELECT status, valor_devido_motoboy, valor_devolver_loja INTO v_status, v_valor_devido, v_valor_devolver
    FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:teste:001';
  IF v_status IS DISTINCT FROM 'solicitado' THEN RAISE EXCEPTION 'Caso7 falhou: status=%', v_status; END IF;
  IF v_valor_devido IS DISTINCT FROM 7.85 THEN RAISE EXCEPTION 'Caso7 falhou: devido=%', v_valor_devido; END IF;
  IF v_valor_devolver IS DISTINCT FROM 56.50 THEN RAISE EXCEPTION 'Caso7 falhou: devolver=%', v_valor_devolver; END IF;
  SELECT count(*) INTO v_eventos FROM public.acertos_rota_eventos WHERE acerto_id = (
    SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:teste:001'
  );
  IF v_eventos <> 1 THEN RAISE EXCEPTION 'Caso7 falhou: % eventos, esperado 1', v_eventos; END IF;
  RAISE NOTICE 'Caso7 OK: status=% devido=% devolver=% eventos=%', v_status, v_valor_devido, v_valor_devolver, v_eventos;
END $$;
