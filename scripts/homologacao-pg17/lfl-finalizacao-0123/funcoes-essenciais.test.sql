-- Somente SQL local com dados sinteticos. Nao comprova Auth/PostgREST hospedados.
DO $local$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN RAISE EXCEPTION 'Teste exclusivamente local'; END IF; END $local$;
RESET ROLE;
DO $$ BEGIN IF to_regclass('neia_operacao.financeiro_capacidades') IS NOT NULL THEN INSERT INTO neia_operacao.financeiro_capacidades(usuario,capacidade,motivo) VALUES('10000000-0000-0000-0000-000000000001','executar_financeiro','Teste local'),('10000000-0000-0000-0000-000000000001','receber_pagamento','Teste local') ON CONFLICT DO NOTHING; END IF; END $$;
CREATE SCHEMA teste_final_b;
CREATE FUNCTION teste_final_b.check_ok(b boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'FINAL11: %',msg; END IF; END $$;
GRANT USAGE ON SCHEMA teste_final_b TO authenticated;
INSERT INTO public.loja_config(id,nome,pix_chave,endereco,bairro,cidade) VALUES(true,'LOJA SINTETICA','SIMULADO','Rua Teste','Bairro','Cidade');
INSERT INTO public.reserva_proveniencia_config(id,controlado,observacao) VALUES(true,true,'APENAS LABORATORIO');
INSERT INTO public.categorias(id,nome,slug) VALUES('b1000000-0000-4000-8000-000000000001','Sintetica','final11');
INSERT INTO public.produtos(id,categoria_id,nome,preco,estoque,tipo_venda,disponivel) VALUES('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Produto ficticio',1,500,'combo_50',true);
INSERT INTO public.lotes(id,produto_id,codigo,quantidade,restante,validade) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','EXPIRADO',10,10,current_date-1),
 ('b1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','FEFO1',80,80,current_date+1),
 ('b1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','FEFO2',420,420,current_date+10);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ DECLARE r jsonb; dados jsonb:='{"cliente_nome":"Cliente ficticio","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}'; itens jsonb:='[{"produto_id":"b1000000-0000-4000-8000-000000000001","quantidade":50}]'; BEGIN
 r:=public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000000','checkout',dados,jsonb_set(itens,'{0,quantidade}','49'));
 PERFORM teste_final_b.check_ok(r->>'status'='regra_combo','minimo 50');
 r:=public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000001','checkout',dados,itens);
 PERFORM teste_final_b.check_ok(r->>'status'='criado','criacao 50: '||r::text);
 PERFORM teste_final_b.check_ok((r->>'taxa_entrega')::numeric=0,'retirada gratuita');
 PERFORM teste_final_b.check_ok(public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000001','checkout',dados,itens)->>'status'='ja_criado','retry criacao');
 PERFORM teste_final_b.check_ok(public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000001','checkout',dados,jsonb_set(itens,'{0,quantidade}','100'))->>'status'='idempotencia_divergente','retry divergente');
 PERFORM teste_final_b.check_ok(public.pedido_cobertura_reserva('b1000000-0000-4000-8000-000000000001')->>'status'='coberto','cobertura integral');
END $$;
RESET ROLE;
SELECT teste_final_b.check_ok((SELECT estoque=450 FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001'),'debito unico da reserva');
SELECT teste_final_b.check_ok((SELECT restante=80 FROM public.lotes WHERE codigo='FEFO1'),'reserva nao retira lote');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; r jsonb; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000001';
 r:=public.registrar_consumo_reserva(rid,25,'b1000000-0000-4000-8000-000000000001');
 PERFORM teste_final_b.check_ok(r->>'status'='consumido','consumo parcial: '||r::text);
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(rid,25,'b1000000-0000-4000-8000-000000000001')->>'status'='ja_registrado','consumo repetido');
END $$;
RESET ROLE;
SELECT teste_final_b.check_ok((SELECT restante=55 FROM public.lotes WHERE codigo='FEFO1'),'FEFO primeiro lote');
SELECT teste_final_b.check_ok((SELECT restante=10 FROM public.lotes WHERE codigo='EXPIRADO'),'lote vencido preservado');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT teste_final_b.check_ok(public.cancelar_pedido_atomico('b1000000-0000-4000-8000-000000000001','teste')->>'status'='cancelado','cancelamento parcial');
SELECT teste_final_b.check_ok(public.cancelar_pedido_atomico('b1000000-0000-4000-8000-000000000001','teste')->>'status'='ja_cancelado','cancelamento repetido');
RESET ROLE;
SELECT teste_final_b.check_ok((SELECT estoque=475 FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001'),'cancelamento devolve apenas nao consumido');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ DECLARE r jsonb; BEGIN
 r:=public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000002','checkout','{"cliente_nome":"Cliente ficticio","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}','[{"produto_id":"b1000000-0000-4000-8000-000000000001","quantidade":100}]');
 PERFORM teste_final_b.check_ok(r->>'status'='criado','combo 100: '||r::text);
END $$;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; a record; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000002';
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(rid,100,'b1000000-0000-4000-8000-000000000002')->>'status'='consumido','consumo total');
 SELECT * INTO a FROM public.aceitar_pedido_atendente('b1000000-0000-4000-8000-000000000002');
 PERFORM teste_final_b.check_ok(a.resultado='ok','aceite atendente: '||a.resultado);
END $$;
RESET ROLE;
INSERT INTO public.config_entrega(id,origem_lat,origem_lng,aceitar_entregas,valor_por_km,taxa_minima_ativa,taxa_minima,distancia_max_ativa,distancia_max_km) VALUES(true,0,0,true,2,true,5,true,3);
DO $$ DECLARE r jsonb; BEGIN
 r:=public.calcular_taxa_entrega(0,0.01,2,100);
 PERFORM teste_final_b.check_ok(r->>'fora_da_area'='false' AND r->>'aceitar_entregas'='true' AND (r->>'taxa')::numeric=5,'taxa e minimo explicitos: '||r::text);
 r:=public.calcular_taxa_entrega(0,1,NULL,100);
 PERFORM teste_final_b.check_ok(r->>'fora_da_area'='true','fora da area');
END $$;
UPDATE public.config_entrega SET gratis_ativa=true,gratis_acima=50;
SELECT teste_final_b.check_ok((public.calcular_taxa_entrega(0,0.01,2,100)->>'taxa')::numeric=0,'frete gratis autorizado');
UPDATE public.config_entrega SET aceitar_entregas=false;
SELECT teste_final_b.check_ok(public.calcular_taxa_entrega(0,0.01,2,100)->>'aceitar_entregas'='false','entrega desativada');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
INSERT INTO public.contas(id,tipo,valor) VALUES('b1000000-0000-4000-8000-000000000001','pagar',100);
SELECT teste_final_b.check_ok(public.registrar_pagamento_conta('b1000000-0000-4000-8000-000000000001',4000,'final-p1')->>'status'='registrado','parcial 40');
SELECT teste_final_b.check_ok(public.registrar_pagamento_conta('b1000000-0000-4000-8000-000000000001',6000,'final-p2')->>'status'='registrado','parcial 60');
SELECT public.estornar_conta('b1000000-0000-4000-8000-000000000001','teste autorizado');
SELECT public.estornar_conta('b1000000-0000-4000-8000-000000000001','teste autorizado');
RESET ROLE;
SELECT teste_final_b.check_ok((SELECT valor_pago=0 FROM public.contas WHERE id='b1000000-0000-4000-8000-000000000001') AND (SELECT count(*)=2 FROM public.conta_pagamento_eventos WHERE conta_id='b1000000-0000-4000-8000-000000000001' AND tipo='estorno'),'estorno ledger idempotente');
SELECT teste_final_b.check_ok(NOT has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE'),'M24 mantida');

-- Falhas nao podem deixar pedido/reserva/debito parcial.
CREATE FUNCTION teste_final_b.falhar_movimento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.referencia_tipo IN ('reserva_estoque','reserva_consumo','liberacao_reserva') THEN RAISE EXCEPTION 'FALHA_SINTETICA' USING ERRCODE='P0999'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER teste_falha_mov BEFORE INSERT ON public.estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION teste_final_b.falhar_movimento();
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ DECLARE n integer; r jsonb; BEGIN
 SELECT estoque INTO n FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001';
 r:=public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000099','checkout','{"cliente_nome":"Teste","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}','[{"produto_id":"b1000000-0000-4000-8000-000000000001","quantidade":50}]');
 PERFORM teste_final_b.check_ok(r->>'status' IS DISTINCT FROM 'criado','erro na reserva nao retorna sucesso');
 PERFORM teste_final_b.check_ok(NOT EXISTS(SELECT 1 FROM public.pedidos WHERE id='b1000000-0000-4000-8000-000000000099'),'rollback pedido');
 PERFORM teste_final_b.check_ok((SELECT estoque=n FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001'),'rollback saldo');
END $$;
RESET ROLE;
DROP TRIGGER teste_falha_mov ON public.estoque_movimentacoes;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT teste_final_b.check_ok(public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000003','checkout','{"cliente_nome":"Teste","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}','[{"produto_id":"b1000000-0000-4000-8000-000000000001","quantidade":50}]')->>'status'='criado','pedido para producao');
RESET ROLE;
SELECT set_config('teste.final.rid',(SELECT id::text FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000003'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r uuid:=current_setting('teste.final.rid')::uuid; BEGIN
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(r,50,'b1000000-0000-4000-8000-000000000003')->>'status'='permissao_negada','cliente nao retira'); END $$;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; blocked boolean:=false; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000003';
 BEGIN UPDATE public.pedidos SET status='em_producao' WHERE id='b1000000-0000-4000-8000-000000000003'; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 PERFORM teste_final_b.check_ok(blocked,'producao sem retirada bloqueada');
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(rid,25,'b1000000-0000-4000-8000-000000000003')->>'status'='consumido','retirada parcial');
 blocked:=false;
 BEGIN UPDATE public.pedidos SET status='em_producao' WHERE id='b1000000-0000-4000-8000-000000000003'; EXCEPTION WHEN raise_exception THEN blocked:=true; END;
 PERFORM teste_final_b.check_ok(blocked,'producao com retirada parcial bloqueada');
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(rid,25,'b1000000-0000-4000-8000-000000000004')->>'status'='consumido','retirada restante');
 UPDATE public.pedidos SET status='em_producao' WHERE id='b1000000-0000-4000-8000-000000000003';
 UPDATE public.pedidos SET status='pronto' WHERE id='b1000000-0000-4000-8000-000000000003';
 UPDATE public.pedidos SET status='entregue' WHERE id='b1000000-0000-4000-8000-000000000003';
 PERFORM teste_final_b.check_ok((SELECT status='entregue' FROM public.pedidos WHERE id='b1000000-0000-4000-8000-000000000003'),'pedido concluido');
END $$;

-- Erro no historico apos UPDATE de lote reverte toda a retirada.
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
SELECT teste_final_b.check_ok(public.criar_pedido_com_reserva('b1000000-0000-4000-8000-000000000004','checkout','{"cliente_nome":"Teste","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}','[{"produto_id":"b1000000-0000-4000-8000-000000000001","quantidade":50}]')->>'status'='criado','pedido para rollback de retirada');
RESET ROLE;
CREATE TRIGGER teste_falha_mov BEFORE INSERT ON public.estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION teste_final_b.falhar_movimento();
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; n bigint; saldo integer; blocked boolean:=false; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000004';
 SELECT sum(restante) INTO n FROM public.lotes WHERE produto_id='b1000000-0000-4000-8000-000000000001';
 SELECT estoque INTO saldo FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001';
 BEGIN PERFORM public.registrar_consumo_reserva(rid,50,'b1000000-0000-4000-8000-000000000005'); EXCEPTION WHEN SQLSTATE 'P0999' THEN blocked:=true; END;
 PERFORM teste_final_b.check_ok(blocked,'falha intermediaria ocorreu');
 PERFORM teste_final_b.check_ok(NOT EXISTS(SELECT 1 FROM public.reserva_consumos WHERE reserva_id=rid),'rollback consumo');
 PERFORM teste_final_b.check_ok((SELECT sum(restante)=n FROM public.lotes WHERE produto_id='b1000000-0000-4000-8000-000000000001') AND (SELECT estoque=saldo FROM public.produtos WHERE id='b1000000-0000-4000-8000-000000000001'),'rollback lotes e saldo');
END $$;
RESET ROLE;
DROP TRIGGER teste_falha_mov ON public.estoque_movimentacoes;
UPDATE public.reserva_proveniencia_config SET controlado=false WHERE id;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; r jsonb; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000004';
 r:=public.registrar_consumo_reserva(rid,50,'b1000000-0000-4000-8000-000000000006');
 PERFORM teste_final_b.check_ok(r->>'status'='reconciliacao_pendente' AND r->>'motivo'='regime_controlado_inativo','regime desligado nao mistura os dois caminhos');
 PERFORM teste_final_b.check_ok(NOT EXISTS(SELECT 1 FROM public.reserva_consumos WHERE reserva_id=rid),'regime desligado nao grava consumo');
END $$;
RESET ROLE;
UPDATE public.reserva_proveniencia_config SET controlado=true WHERE id;
UPDATE public.lotes SET restante=0 WHERE produto_id='b1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
DO $$ DECLARE rid uuid; BEGIN
 SELECT id INTO rid FROM public.reservas_estoque WHERE pedido_id='b1000000-0000-4000-8000-000000000004';
 PERFORM teste_final_b.check_ok(public.registrar_consumo_reserva(rid,50,'b1000000-0000-4000-8000-000000000005')->>'status'='lotes_insuficientes','saldo fisico insuficiente nao e consumido');
 PERFORM teste_final_b.check_ok(NOT EXISTS(SELECT 1 FROM public.reserva_consumos WHERE reserva_id=rid),'insuficiencia nao grava consumo');
END $$;
RESET ROLE;
ROLLBACK;
