-- Somente SQL local com dados sinteticos. Nao comprova Auth/PostgREST hospedados.
DO $local$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN RAISE EXCEPTION 'Teste exclusivamente local'; END IF; END $local$;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('10000000-0000-0000-0000-000000000009','caixa-final@example.invalid'),('10000000-0000-0000-0000-000000000007','financeiro-final@example.invalid');
UPDATE public.user_roles SET role='financeiro' WHERE user_id IN ('10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000007');
INSERT INTO neia_operacao.financeiro_capacidades(usuario,capacidade,motivo) VALUES
('10000000-0000-0000-0000-000000000001','receber_pagamento','Teste sintetico'),
('10000000-0000-0000-0000-000000000009','conferir_caixa','Teste sintetico'),
('10000000-0000-0000-0000-000000000009','receber_pagamento','Teste sintetico'),
('10000000-0000-0000-0000-000000000007','executar_financeiro','Teste sintetico'),
('10000000-0000-0000-0000-000000000007','receber_pagamento','Teste sintetico');
-- Fluxo completo integrado (Fase 2): Central -> App Motoboy -> acerto -> Financeiro.
-- Fixture própria e independente: motoboy ...0006 e pedidos 72000000-... Sem
-- interferência nas fixtures dos demais testes. Executar após financeiro-motoboy-concorrencia.sql.
RESET ROLE;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

INSERT INTO auth.users (id,email) VALUES
 ('10000000-0000-0000-0000-000000000008','motoboy-fluxocaps-caps@example.invalid') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id,role)
 VALUES ('10000000-0000-0000-0000-000000000008','motoboy') ON CONFLICT (user_id,role) DO NOTHING;
INSERT INTO public.motoboys (id,user_id,nome)
 VALUES ('60000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000008','Fluxo Completo')
 ON CONFLICT (id) DO NOTHING;
INSERT INTO public.pedidos (id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status,subtotal,taxa_entrega,total,forma_pagamento,pagamento_status)
VALUES
 ('72000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Cliente Fluxo 1','','Rua F1','Bairro teste','Cidade teste','entrega','pronto',78.50,7.85,86.35,'dinheiro','pendente'),
 ('72000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Cliente Fluxo 2','','Rua F2','Bairro teste','Cidade teste','entrega','pronto',78.50,7.85,86.35,'dinheiro','pendente'),
 ('72000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Cliente Fluxo 3','','Rua F3','Bairro teste','Cidade teste','entrega','pronto',78.50,7.85,86.35,'dinheiro','pendente');

SET LOCAL ROLE authenticated;

-- 1. Central atribui rota de 3 pedidos ao motoboy novo (máximo permitido).
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_rota uuid; r jsonb;
BEGIN
  r := public.criar_rota_entrega_atomica(
    ARRAY['72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',
          '72000000-0000-0000-0000-000000000003']::uuid[],
    '60000000-0000-0000-0000-000000000008');
  IF r->>'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'F1: Central não atribuiu: %',r; END IF;
  SELECT id INTO v_rota FROM public.rotas_entrega WHERE motoboy_id = '60000000-0000-0000-0000-000000000008';
  PERFORM set_config('teste.fluxocaps.rota',v_rota::text,true);
END $$;

-- 2. ERP confirma os recebimentos (ledger por pedido).
DO $$
BEGIN
  UPDATE public.pedidos SET pagamento_status = 'pago', pagamento_em = now()
   WHERE id IN ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',
                '72000000-0000-0000-0000-000000000003');
  IF (SELECT count(DISTINCT l.pedido_id) FROM public.pedido_pagamento_eventos l
       WHERE l.pedido_id IN ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000002',
                             '72000000-0000-0000-0000-000000000003')
         AND l.forma_pagamento = 'dinheiro'
         AND l.tipo = 'pagamento') <> 3 THEN
    RAISE EXCEPTION 'F2: ledger de pagamento ausente após confirmação';
  END IF;
END $$;

-- 3. Central libera; o motoboy recebe a rota automaticamente sem aceitar.
DO $$ DECLARE r jsonb; BEGIN
 r:=public.liberar_rota_entrega(current_setting('teste.fluxocaps.rota')::uuid);
 IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'F3: liberação %',r; END IF;
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';

-- 4. Retirada individual de cada pedido.
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid; v_pedido uuid;
BEGIN
  FOR v_pedido IN SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota ORDER BY pedido_id LOOP
    IF public.confirmar_retirada(v_pedido)->>'status' IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'F4: retirada de % falhou', v_pedido;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.pedidos WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota)
        AND retirada_rota_id = v_rota AND retirada_em IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'F4: prova de retirada incompleta';
  END IF;
END $$;

-- 5. Início do deslocamento.
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid;
BEGIN
  IF public.iniciar_rota(v_rota)->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F5: início da rota falhou';
  END IF;
  IF (SELECT count(*) FROM public.pedidos WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota)
        AND status = 'em_rota') <> 3 THEN
    RAISE EXCEPTION 'F5: pedidos não foram para em_rota';
  END IF;
END $$;

-- 6. Retorno é recusado antes de todas as entregas (sequência obrigatória).
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid; r jsonb;
BEGIN
  r := public.informar_retorno_loja(v_rota);
  IF r->>'motivo' IS DISTINCT FROM 'rota_com_pendentes' THEN RAISE EXCEPTION 'F6: retorno aceito com pendentes: %',r; END IF;
END $$;

-- 7. Entregas individuais; uma entrega NÃO conclui as demais.
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid; r jsonb; v_restam integer;
BEGIN
  r := public.confirmar_entrega('72000000-0000-0000-0000-000000000001');
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'F7: entrega 1 falhou: %',r; END IF;
  SELECT count(*) INTO v_restam FROM public.pedidos
   WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'em_rota';
  IF v_restam <> 2 THEN RAISE EXCEPTION 'F7: entrega concluiu os demais (restam %)', v_restam;
  END IF;
  -- repetição da mesma entrega não altera os outros
  r := public.confirmar_entrega('72000000-0000-0000-0000-000000000001');
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'F7: entrega repetida falhou: %',r; END IF;
  SELECT count(*) INTO v_restam FROM public.pedidos
   WHERE id IN (SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = v_rota) AND status = 'entregue';
  IF v_restam <> 1 THEN RAISE EXCEPTION 'F7: repetição alterou estado (entregues %)', v_restam; END IF;
  IF public.confirmar_entrega('72000000-0000-0000-0000-000000000002')->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F7: entrega 2 falhou';
  END IF;
  IF public.confirmar_entrega('72000000-0000-0000-0000-000000000003')->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F7: entrega 3 falhou';
  END IF;
END $$;

-- 8. Retorno à loja e chegada; rota concluída.
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid;
BEGIN
  IF public.informar_retorno_loja(v_rota)->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F8: retorno com entregas concluídas falhou';
  END IF;
  IF public.confirmar_chegada_loja(v_rota)->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F8: chegada à loja falhou';
  END IF;
  IF (SELECT status FROM public.rotas_entrega WHERE id = v_rota) IS DISTINCT FROM 'concluida' THEN
    RAISE EXCEPTION 'F8: rota não ficou concluída';
  END IF;
END $$;

-- 9. Motoboy solicita acerto (declaração dele; validação fica no servidor).
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid; r jsonb;
BEGIN
  r := public.solicitar_acerto_rota(v_rota,'acerto:fluxocaps-completo','R-FC',3,
    235.50,0,235.50,0,0,0,0,23.55,259.05,23.55,235.50,'Prestação do motoboy');
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'F9: acerto não solicitado: %',r; END IF;
  PERFORM set_config('teste.fluxocaps.acerto',r->>'acerto_id',true);
END $$;

-- 10. Caixa (Financeiro ...0005) confere de forma independente.
--     Divergência primeiro, depois contagem correta: esperado 23550 + 2355 = 25905.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000009';
DO $$
DECLARE v_acerto uuid := current_setting('teste.fluxocaps.acerto')::uuid; r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '10000000-0000-0000-0000-000000000009' AND role = 'financeiro') THEN
    INSERT INTO auth.users (id,email) VALUES ('10000000-0000-0000-0000-000000000009','fin@example.invalid') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id,role) VALUES ('10000000-0000-0000-0000-000000000009','financeiro') ON CONFLICT DO NOTHING;
  END IF;
  r := public.conferir_acerto_rota_independente(v_acerto,'conf:fluxocaps-divergente',1000,0,'Contagem divergente');
  IF r->>'status_acerto' IS DISTINCT FROM 'conferido_com_divergencia' THEN
    RAISE EXCEPTION 'F10: divergência não destacada: %',r;
  END IF;
  r := public.conferir_acerto_rota_independente(v_acerto,'conf:fluxocaps-completo',25905,0,'Contagem do Caixa');
  IF r->>'status_acerto' IS DISTINCT FROM 'em_conferencia'
     OR r #>> '{conferencia,base_erp,produtos_dinheiro_centavos}' IS DISTINCT FROM '23550'
     OR r #>> '{conferencia,base_erp,taxas_centavos}' IS DISTINCT FROM '2355' THEN
    RAISE EXCEPTION 'F10: conferência independente incorreta: %',r;
  END IF;
END $$;

-- 11. Autoaprovação do conferente é negada; responsável distinto aprova.
DO $$
DECLARE v_acerto uuid := current_setting('teste.fluxocaps.acerto')::uuid; r jsonb;
BEGIN
  r := public.aprovar_acerto_rota(v_acerto,'aprov:fluxocaps-auto',true,'Autoaprovação');
  IF r->>'motivo' IS DISTINCT FROM 'auto_aprovacao_nao_permitida' THEN
    RAISE EXCEPTION 'F11: autoaprovação aceita: %',r;
  END IF;
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_acerto uuid := current_setting('teste.fluxocaps.acerto')::uuid; v_devido numeric;
BEGIN
  IF public.aprovar_acerto_rota(v_acerto,'aprov:fluxocaps-completo',true,'Aprovado pelo responsável')->>'status'
     IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'F11: aprovação legítima falhou';
  END IF;
  SELECT valor_devido_motoboy INTO v_devido FROM public.acertos_rota WHERE id = v_acerto;
  IF v_devido IS DISTINCT FROM 23.55 THEN RAISE EXCEPTION 'F11: taxas devidas %', v_devido; END IF;
END $$;

-- 12. Turno: fixo R$ 40 + taxas das rotas aprovadas do dia = R$ 63,55.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';
DO $$
DECLARE r jsonb;
BEGIN
  r := public.solicitar_fechamento_turno(CURRENT_DATE,'normal','turno:fluxocaps-completo','Fechamento do fluxocaps');
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'F12: turno não solicitado: %',r; END IF;
  IF (r->>'valor_devido_centavos')::bigint <> 6355 THEN RAISE EXCEPTION 'F12: devido %', r->>'valor_devido_centavos'; END IF;
  PERFORM set_config('teste.fluxocaps.turno',r->>'turno_id',true);
END $$;

-- 13. Responsável autoriza; Financeiro registra o pagamento efetuado; repetição é idempotente.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE v_turno uuid := current_setting('teste.fluxocaps.turno')::uuid;
BEGIN
  IF public.autorizar_pagamento_turno_motoboy(v_turno,6355,'Autorização do fluxocaps completo')->>'status'
     IS DISTINCT FROM 'autorizado' THEN
    RAISE EXCEPTION 'F13: autorização do pagamento falhou';
  END IF;
END $$;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000007';
DO $$
DECLARE v_turno uuid := current_setting('teste.fluxocaps.turno')::uuid; r jsonb; v_status text; v_contas integer;
BEGIN
  r := public.confirmar_pagamento_turno_motoboy(v_turno,6355,'dinheiro',now(),NULL,'turno:fluxocaps-completo');
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'F13: pagamento não confirmado: %',r; END IF;
  IF public.confirmar_pagamento_turno_motoboy(v_turno,6355,'dinheiro',now(),NULL,'turno:fluxocaps-completo')->>'status'
     IS DISTINCT FROM 'repetido' THEN
    RAISE EXCEPTION 'F13: pagamento não idempotente';
  END IF;
  SELECT status INTO v_status FROM public.turnos_motoboy WHERE id = v_turno;
  IF v_status IS DISTINCT FROM 'pago' THEN RAISE EXCEPTION 'F13: turno não pago (%),', v_status; END IF;
  SELECT count(*) INTO v_contas FROM public.contas
   WHERE id=(SELECT conta_pagamento_id FROM public.turnos_motoboy WHERE id=v_turno) AND descricao = 'Fechamento de turno motoboy' AND valor_pago = 63.55 AND status = 'paga';
  IF v_contas <> 1 THEN RAISE EXCEPTION 'F13: contas do pagamento: %', v_contas; END IF;
  RAISE NOTICE 'Fluxo completo OK: rota, acerto, conferência, aprovação, turno e pagamento validados';
END $$;

-- 14. GPS da rota encerrada é inelegível.
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000008';
DO $$
DECLARE v_rota uuid := current_setting('teste.fluxocaps.rota')::uuid;
BEGIN
  IF public.registrar_localizacao_rota(v_rota,-23,-46,20,clock_timestamp())->>'status'
     IS DISTINCT FROM 'inelegivel' THEN
    RAISE EXCEPTION 'F14: GPS aceito em rota concluída';
  END IF;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000009';
DO $$ DECLARE r jsonb; denied boolean:=false; BEGIN
 r:=public.confirmar_pagamento_turno_motoboy(current_setting('teste.fluxocaps.turno')::uuid,6355,'dinheiro',now(),NULL,'tentativa-caixa');
 IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Caixa confirmou pagamento'; END IF;
 r:=public.registrar_pagamento_conta('20000000-0000-0000-0000-000000000001',1,'tentativa-caixa-conta');
 IF r->>'status' IS DISTINCT FROM 'nao_autorizado' THEN RAISE EXCEPTION 'Caixa pagou conta'; END IF;
 BEGIN INSERT INTO neia_operacao.financeiro_capacidades(usuario,capacidade,motivo) VALUES(auth.uid(),'executar_financeiro','autoatribuicao'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Caixa se autoatribuiu capacidade'; END IF;
END $$;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000007';
DO $$ BEGIN
 IF public.conferir_acerto_rota_independente(current_setting('teste.fluxocaps.acerto')::uuid,'tentativa-fin',25905,0,'teste')->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Financeiro conferiu acerto sem capacidade'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM neia_operacao.financeiro_capacidades WHERE usuario NOT IN('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000007')) THEN RAISE EXCEPTION 'Usuario fora da fixture alterado'; END IF;
END $$;
ROLLBACK;
