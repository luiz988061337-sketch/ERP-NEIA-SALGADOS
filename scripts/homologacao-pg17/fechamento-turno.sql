-- Teste isolado da operacao 0117: solicitar_fechamento_turno.
-- Executar apos cadeia ate 0109 + rotas-app.sql + 0115/0116.
-- Uso: psql -h 127.0.0.1 -p <porta> -U neia_homologador -d postgres -v ON_ERROR_STOP=1 -f scripts/homologacao-pg17/fechamento-turno.sql

RESET ROLE;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
INSERT INTO public.user_roles (user_id, role)
VALUES ('10000000-0000-0000-0000-000000000001','admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Prepara o valor do pedido e registra pagamento confirmado pelo ERP.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.pedidos SET subtotal = 78.50, taxa_entrega = 7.85, total = 86.35,
  forma_pagamento = 'dinheiro', pagamento_status = 'pago', pagamento_em = now()
 WHERE id = '70000000-0000-0000-0000-000000000001';

DO $$ DECLARE r jsonb; BEGIN
 r:=public.liberar_rota_entrega((SELECT id FROM public.rotas_entrega WHERE motoboy_id='60000000-0000-0000-0000-000000000001' AND status='preparando' LIMIT 1));
 IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Liberação fixture turno: %',r; END IF;
END $$;

-- Setup: motoboy 0003 (cadastro ...0001) com acerto aprovado hoje.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rota uuid := (SELECT id FROM public.rotas_entrega r WHERE r.motoboy_id = '60000000-0000-0000-0000-000000000001' AND r.status = 'preparando' LIMIT 1);
  v_pedido uuid;
  v_result jsonb;
BEGIN
  IF v_rota IS NULL THEN RAISE EXCEPTION 'Fixture: rota preparando ausente'; END IF;
  FOR v_pedido IN SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota ORDER BY pedido_id LOOP
    v_result := public.confirmar_retirada(v_pedido);
    IF v_result->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Fixture: retirada falhou: %', v_result; END IF;
  END LOOP;
  v_result := public.iniciar_rota(v_rota);
  IF v_result->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Fixture: início da rota falhou: %', v_result; END IF;
  UPDATE public.pedidos SET status = 'entregue', entregue_em = now() WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'em_rota';
  UPDATE public.rotas_entrega SET status = 'concluida', chegou_em = now() WHERE id = v_rota AND status = 'em_rota';
  v_result := public.solicitar_acerto_rota(
    v_rota, 'acerto:turno:001', 'R-T', 1,
    78.50, 0, 78.50, 12.00, 2.00, 0, 0, 99.99, 90.35, 99.99, 56.50, 'Setup turno'
  );
  IF v_result->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Fixture: solicitação de acerto falhou: %', v_result; END IF;
END $$;

-- Conferir e aprovar o acerto (status aprovado necessário para contar taxas).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
DO $$
DECLARE v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:turno:001');
  r jsonb;
BEGIN
  -- precisa do usuario financeiro
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '10000000-0000-0000-0000-000000000005' AND role = 'financeiro') THEN
    INSERT INTO auth.users (id,email) VALUES ('10000000-0000-0000-0000-000000000005','fin@example.invalid') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id,role) VALUES ('10000000-0000-0000-0000-000000000005','financeiro') ON CONFLICT DO NOTHING;
  END IF;
  IF v_acerto_id IS NULL THEN RAISE EXCEPTION 'Fixture: acerto solicitado não existe'; END IF;
  r := public.conferir_acerto_rota_independente(v_acerto_id, 'conf:turno:divergente', 1, 0, 'Contagem divergente F1');
  IF r->>'status_acerto' IS DISTINCT FROM 'conferido_com_divergencia' THEN
    RAISE EXCEPTION 'Fixture: não destacou divergência: %',r;
  END IF;
  r := public.conferir_acerto_rota_independente(v_acerto_id, 'conf:turno:001', 8635, 0, 'Contagem do Caixa F1');
  IF r->>'status_acerto' IS DISTINCT FROM 'em_conferencia'
     OR r #>> '{conferencia,base_erp,taxas_centavos}' IS DISTINCT FROM '785'
     OR r #>> '{conferencia,base_erp,produtos_dinheiro_centavos}' IS DISTINCT FROM '7850' THEN
    RAISE EXCEPTION 'Fixture: conferência independente falhou: %',r;
  END IF;
  r := public.aprovar_acerto_rota(v_acerto_id, 'conf:turno:auto', true, 'Autoaprovação');
  IF r->>'motivo' IS DISTINCT FROM 'auto_aprovacao_nao_permitida' THEN
    RAISE EXCEPTION 'Financeiro aprovou a própria conferência: %',r;
  END IF;
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_acerto_id uuid := (SELECT id FROM public.acertos_rota WHERE chave_idempotencia = 'acerto:turno:001');
BEGIN
  IF public.aprovar_acerto_rota(v_acerto_id, 'aprov:turno:001', true, 'Aprovado')->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'Fixture: aprovação não foi aceita';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acertos_rota WHERE id = v_acerto_id AND status = 'aprovado' AND valor_devido_motoboy = 7.85) THEN
    RAISE EXCEPTION 'Fixture: acerto não ficou aprovado em R$7,85';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acertos_rota_eventos WHERE acerto_id = v_acerto_id
    AND chave_idempotencia = 'aprov:turno:001' AND valor_centavos = 8635) THEN
    RAISE EXCEPTION 'Auditoria de aprovação não usou a contagem do Caixa';
  END IF;
END $$;

-- Caso 1: motoboy 0003 solicita fechamento de turno normal (valor fixo R$ 40 + taxas R$ 7.85 = R$ 47.85).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE r jsonb := public.solicitar_fechamento_turno(CURRENT_DATE, 'normal', 'turno:normal:001', 'Turno normal');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Caso1 falhou: %', r; END IF;
  IF (r->>'valor_fixo_turno_centavos')::bigint <> 4000 THEN RAISE EXCEPTION 'Caso1 falhou: fixo=%', r->>'valor_fixo_turno_centavos'; END IF;
  IF (r->>'valor_devido_centavos')::bigint <> 4785 THEN RAISE EXCEPTION 'Caso1 falhou: devido=%', r->>'valor_devido_centavos'; END IF;
  RAISE NOTICE 'Caso1 OK: %', r;
END $$;

-- Caso 2: repetição com mesma chave é idempotente.
DO $$
DECLARE r jsonb := public.solicitar_fechamento_turno(CURRENT_DATE, 'normal', 'turno:normal:001', 'Turno normal');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'repetido' THEN RAISE EXCEPTION 'Caso2 falhou: %', r; END IF;
  RAISE NOTICE 'Caso2 OK: %', r;
END $$;

-- Caso 3: turno de véspera de Natal (valor fixo R$ 60; sem acerto nessa data => devido = 60).
DO $$
DECLARE r jsonb := public.solicitar_fechamento_turno(DATE '2026-12-24', 'vespera_natal', 'turno:natal:001', 'Véspera Natal');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Caso3 falhou: %', r; END IF;
  IF (r->>'valor_fixo_turno_centavos')::bigint <> 6000 THEN RAISE EXCEPTION 'Caso3 falhou: fixo=%', r->>'valor_fixo_turno_centavos'; END IF;
  IF (r->>'valor_devido_centavos')::bigint <> 6000 THEN RAISE EXCEPTION 'Caso3 falhou: devido=%', r->>'valor_devido_centavos'; END IF;
  RAISE NOTICE 'Caso3 OK: %', r;
END $$;

-- Caso 3b: o tipo especial não pode ser usado fora de 24/12.
DO $$
BEGIN
  BEGIN
    PERFORM public.solicitar_fechamento_turno(DATE '2026-12-23', 'vespera_natal', 'turno:natal-invalido:001', 'Data inválida');
    RAISE EXCEPTION 'Caso3b falhou: aceitou véspera de Natal fora de 24/12';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'Caso3b OK: restrição bloqueou data incompatível';
  END;
END $$;

-- Caso 4: mesmo motoboy, mesmo dia, turno normal já existe -> conflito.
DO $$
DECLARE r jsonb := public.solicitar_fechamento_turno(CURRENT_DATE, 'normal', 'turno:normal:002', 'Duplicado');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'conflito' THEN RAISE EXCEPTION 'Caso4 falhou: %', r; END IF;
  RAISE NOTICE 'Caso4 OK: %', r;
END $$;

-- Caso 5: cliente (sem papel motoboy) não pode solicitar fechamento.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
DECLARE r jsonb := public.solicitar_fechamento_turno(CURRENT_DATE, 'normal', 'turno:cliente:001', 'Cliente');
BEGIN
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caso5 falhou: %', r; END IF;
  RAISE NOTICE 'Caso5 OK: %', r;
END $$;

-- Caso 6: estado final — turno aberto com valores corretos.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_status text; v_valor_devido numeric; v_taxas numeric; v_eventos integer;
BEGIN
  SELECT status, valor_devido_motoboy, taxas_entrega_acumuladas INTO v_status, v_valor_devido, v_taxas
    FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001';
  IF v_status IS DISTINCT FROM 'aberto' THEN RAISE EXCEPTION 'Caso6 falhou: status=%', v_status; END IF;
  IF v_valor_devido IS DISTINCT FROM 47.85 THEN RAISE EXCEPTION 'Caso6 falhou: devido=%', v_valor_devido; END IF;
  IF v_taxas IS DISTINCT FROM 7.85 THEN RAISE EXCEPTION 'Caso6 falhou: taxas=%', v_taxas; END IF;
  SELECT count(*) INTO v_eventos FROM public.turnos_motoboy_eventos WHERE turno_id = (
    SELECT id FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001'
  );
  IF v_eventos <> 1 THEN RAISE EXCEPTION 'Caso6 falhou: % eventos, esperado 1', v_eventos; END IF;
  RAISE NOTICE 'Caso6 OK: status=% devido=% taxas=% eventos=%', v_status, v_valor_devido, v_taxas, v_eventos;
END $$;

-- Caso 7: motoboy não pode confirmar que a loja pagou o fechamento.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_turno_id uuid := (SELECT id FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001');
BEGIN
  BEGIN
    EXECUTE format('SELECT public.pagar_fechamento_turno(%L::uuid, 4785, %L, %L, %L)', v_turno_id, 'pag:turno:001', 'dinheiro', 'Pagamento turno normal');
    RAISE EXCEPTION 'Caso7 falhou: motoboy conseguiu confirmar pagamento feito pela loja';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Caso7 OK: pagamento requer autorização do Financeiro';
  END;
END $$;
RESET ROLE;

-- Caso 8: a solicitação continua aberta e nenhuma conta foi marcada paga.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_status text; v_valor_pago numeric; v_conta_paga integer;
BEGIN
  SELECT status, valor_pago INTO v_status, v_valor_pago
    FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001';
  IF v_status IS DISTINCT FROM 'aberto' THEN RAISE EXCEPTION 'Caso8 falhou: status=%', v_status; END IF;
  IF v_valor_pago IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Caso8 falhou: valor pago=%', v_valor_pago; END IF;
  SELECT count(*) INTO v_conta_paga FROM public.contas
   WHERE descricao = 'Fechamento de turno motoboy' AND status = 'paga';
  IF v_conta_paga <> 0 THEN RAISE EXCEPTION 'Caso8 falhou: % contas pagas inesperadamente', v_conta_paga; END IF;
  RAISE NOTICE 'Caso8 OK: status=% pago=% contas_pagas=%', v_status, v_valor_pago, v_conta_paga;
END $$;
