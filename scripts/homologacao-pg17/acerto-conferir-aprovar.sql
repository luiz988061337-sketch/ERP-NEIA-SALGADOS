-- Teste isolado das operacoes 0116: conferir_acerto_rota / aprovar_acerto_rota.
-- Executar apos cadeia ate 0109 + rotas-app.sql + 0115.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/acerto-conferir-aprovar.sql

RESET ROLE;
INSERT INTO auth.users (id,email) VALUES
 ('10000000-0000-0000-0000-000000000001','admin@example.invalid'),
 ('10000000-0000-0000-0000-000000000005','financeiro@example.invalid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin'),
       ('10000000-0000-0000-0000-000000000005','financeiro')
ON CONFLICT (user_id, role) DO NOTHING;

-- Setup: motoboy 0003 (cadastro ...0001) tem acerto solicitado na rota concluída.
-- Usa a mesma rota da cadeia anterior (preparando com pedido 0001).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
BEGIN
  PERFORM public.iniciar_rota(v_rota);
  UPDATE public.pedidos SET status = 'em_rota' WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'aguardando_motoboy';
  UPDATE public.pedidos SET status = 'entregue', entregue_em = now() WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'em_rota';
  UPDATE public.rotas_entrega SET status = 'concluida', chegou_em = now() WHERE id = v_rota AND status = 'em_rota';
  PERFORM public.solicitar_acerto_rota(
    v_rota, 'acerto:conf:001', 'R-CONF', 1,
    78.50, 0, 78.50, 12.00, 2.00, 10.00, 0, 7.85, 90.35, 7.85, 56.50, 'Setup conferencia'
  );
END $$;

-- Obtem o id do acerto criado para uso nos próximos casos.
DO $$
DECLARE v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
BEGIN
  IF v_acerto_id IS NULL THEN RAISE EXCEPTION 'Setup: acerto nao encontrado'; END IF;
END $$;

-- Caso 1: financeiro confere o acerto (solicitado -> em_conferencia).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.conferir_acerto_rota(
    v_acerto_id, 'conf:conf:001', true, false, 'Conferência OK'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  IF r->>'status_acerto' IS DISTINCT FROM 'em_conferencia' THEN RAISE EXCEPTION 'Caso1 falhou: status=%', r->>'status_acerto'; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repetição da mesma chave de conferência é idempotente.
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.conferir_acerto_rota(
    v_acerto_id, 'conf:conf:001', true, false, 'Conferência OK repetida'
  );
BEGIN
  IF r->>'status' IS DISTINCT FROM 'repetido' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: o conferente (financeiro ...0005) não pode aprovar o próprio acerto.
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.aprovar_acerto_rota(v_acerto_id, 'aprov:conf:001', true, 'Auto-aprovação');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  IF r->>'motivo' IS DISTINCT FROM 'auto_aprovacao_nao_permitida' THEN RAISE EXCEPTION 'Caso3 falhou: motivo=%', r->>'motivo'; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 4: admin (responsável diferente do conferente) aprova o acerto.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.aprovar_acerto_rota(v_acerto_id, 'aprov:conf:002', true, 'Aprovado pelo responsável');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  IF r->>'status_acerto' IS DISTINCT FROM 'aprovado' THEN RAISE EXCEPTION 'Caso4 falhou: status=%', r->>'status_acerto'; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: aprovação repetida com mesma chave é idempotente.
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.aprovar_acerto_rota(v_acerto_id, 'aprov:conf:002', true, 'Repetição');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'repetido' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: cliente não pode conferir acerto.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE
  v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001');
  r jsonb := public.conferir_acerto_rota(v_acerto_id, 'conf:conf:003', true, false, 'Cliente confere');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso6 falhou: %', r; END IF;
  RAISE NOTICE 'Caso6 OK: %', r;
END $$;

-- Caso 7: estado final — acerto aprovado, eventos de auditoria presentes.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_status text; v_conferido_por uuid; v_aprovado_por uuid; v_eventos integer;
BEGIN
  SELECT status, conferido_por, aprovado_por INTO v_status, v_conferido_por, v_aprovado_por
    FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001';
  IF v_status IS DISTINCT FROM 'aprovado' THEN RAISE EXCEPTION 'Caso7 falhou: status=%', v_status; END IF;
  IF v_conferido_por IS DISTINCT FROM '10000000-0000-0000-0000-000000000005'::uuid THEN
    RAISE EXCEPTION 'Caso7 falhou: conferido_por=%', v_conferido_por;
  END IF;
  IF v_aprovado_por IS DISTINCT FROM '10000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Caso7 falhou: aprovado_por=%', v_aprovado_por;
  END IF;
  SELECT count(*) INTO v_eventos FROM public.acertos_rota_eventos WHERE acerto_id = (
    SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:conf:001'
  );
  IF v_eventos < 2 THEN RAISE EXCEPTION 'Caso7 falhou: % eventos, esperado >= 2', v_eventos; END IF;
  RAISE NOTICE 'Caso7 OK: status=% conferido_por=% aprovado_por=% eventos=%', v_status, v_conferido_por, v_aprovado_por, v_eventos;
END $$;
