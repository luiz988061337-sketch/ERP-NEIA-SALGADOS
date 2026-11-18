-- Dados sinteticos, roles PostgreSQL reais e claims simuladas. Nao prova Auth hospedado.
-- O ROLLBACK final elimina TODAS as fixtures desta suite.
DO $$ BEGIN
  IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
    THEN RAISE EXCEPTION 'Testes 06 exclusivamente locais'; END IF;
END $$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
INSERT INTO auth.users(id,email) VALUES
 ('60000000-0000-0000-0000-000000000001','lote06-cliente@example.invalid'),
 ('60000000-0000-0000-0000-000000000002','lote06-atendente@example.invalid'),
 ('60000000-0000-0000-0000-000000000003','lote06-producao@example.invalid'),
 ('60000000-0000-0000-0000-000000000004','lote06-financeiro@example.invalid'),
 ('60000000-0000-0000-0000-000000000005','lote06-admin@example.invalid'),
 ('60000000-0000-0000-0000-000000000006','lote06-outro@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('60000000-0000-0000-0000-000000000002','atendente'),
 ('60000000-0000-0000-0000-000000000003','producao'),
 ('60000000-0000-0000-0000-000000000004','financeiro'),
 ('60000000-0000-0000-0000-000000000005','admin');
INSERT INTO public.categorias(id,nome,slug) VALUES
 ('61000000-0000-0000-0000-000000000001','Lote06','lote06-isolado');
INSERT INTO public.produtos(id,categoria_id,nome,preco) VALUES
 ('61000000-0000-0000-0000-000000000002','61000000-0000-0000-0000-000000000001','Salgado sintetico 06',1);
INSERT INTO public.insumos(id,nome,unidade_base,estoque_atual,custo_medio) VALUES
 ('61000000-0000-0000-0000-000000000003','Massa sintetica 06','kg',100,2);
INSERT INTO public.insumo_lotes(id,insumo_id,quantidade,restante,custo_unitario,validade) VALUES
 ('61000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000000003',100,100,2,current_date+30);
INSERT INTO public.compras(id) VALUES ('61000000-0000-0000-0000-000000000005');
INSERT INTO public.compra_itens(id,compra_id,insumo_id,quantidade,unidade,custo_unitario) VALUES
 ('61000000-0000-0000-0000-000000000006','61000000-0000-0000-0000-000000000005',
  '61000000-0000-0000-0000-000000000003',100,'kg',2);
INSERT INTO public.fichas_tecnicas(id,produto_id) VALUES
 ('61000000-0000-0000-0000-000000000007','61000000-0000-0000-0000-000000000002');
INSERT INTO public.ficha_itens(ficha_id,insumo_id,quantidade,unidade) VALUES
 ('61000000-0000-0000-0000-000000000007','61000000-0000-0000-0000-000000000003',0.1,'kg');
INSERT INTO public.pedidos(id,user_id,cliente_nome,telefone,endereco,tipo_entrega,forma_pagamento,
 pagamento_modalidade,subtotal,total,aceito_em_atendente,liberado_em) VALUES
 ('62000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  'Cliente sintetico 06','','','retirada','dinheiro','na_entrega',50,50,now(),now()),
 ('62000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000006',
  'Outro sintetico 06','','','retirada','dinheiro','na_entrega',50,50,now(),now()),
 ('62000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001',
  'Producao sintetica 06','','','retirada','dinheiro','na_entrega',50,50,now(),NULL);
INSERT INTO public.pedido_itens(pedido_id,produto_id,nome,quantidade,preco_unitario)
SELECT id,'61000000-0000-0000-0000-000000000002','Salgado sintetico 06',50,1
FROM public.pedidos WHERE id::text LIKE '62000000-%';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.fila_impressao WHERE pedido_id::text LIKE '62000000-%')<>3
   THEN RAISE EXCEPTION 'Trigger de impressao automatico do dono falhou'; END IF;
END $$;
DELETE FROM public.fila_impressao WHERE pedido_id='62000000-0000-0000-0000-000000000001';

CREATE SCHEMA lote06_teste;
GRANT USAGE ON SCHEMA lote06_teste TO anon,authenticated,service_role;
CREATE TABLE lote06_teste.resultados(papel text,funcao text,permitido boolean);
GRANT INSERT ON lote06_teste.resultados TO anon,authenticated,service_role;
CREATE FUNCTION lote06_teste.caso(p_papel text,p_func text,p_permite boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_negado boolean:=false;
BEGIN
 BEGIN
  CASE p_func
   WHEN 'compra' THEN PERFORM public.receber_compra_item('61000000-0000-0000-0000-000000000006',1,'kg',current_date+30);
   WHEN 'consumo' THEN PERFORM public.consumir_insumos_pedido('62000000-0000-0000-0000-000000000001');
   WHEN 'impressao' THEN PERFORM public.enfileirar_cupom('62000000-0000-0000-0000-000000000002');
   WHEN 'global' THEN PERFORM public.gerar_cupons_pedidos_pagos();
   WHEN 'privado' THEN PERFORM neia_operacao.consumir_insumos_pedido_interno('62000000-0000-0000-0000-000000000001');
   ELSE RAISE EXCEPTION 'Caso desconhecido';
  END CASE;
 EXCEPTION WHEN insufficient_privilege THEN v_negado:=true;
 END;
 IF v_negado=p_permite THEN RAISE EXCEPTION 'Matriz incorreta: % / % / permite %',p_papel,p_func,p_permite; END IF;
 INSERT INTO lote06_teste.resultados VALUES(p_papel,p_func,NOT v_negado);
END $$;
REVOKE ALL ON FUNCTION lote06_teste.caso(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lote06_teste.caso(text,text,boolean) TO anon,authenticated,service_role;

SET LOCAL ROLE anon;
SELECT lote06_teste.caso('anon',f,false) FROM unnest(ARRAY['compra','consumo','impressao','global','privado']) f;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT lote06_teste.caso('cliente',f,false) FROM unnest(ARRAY['compra','consumo','impressao','global','privado']) f;
SELECT public.enfileirar_cupom('62000000-0000-0000-0000-000000000001');
SELECT public.enfileirar_cupom('62000000-0000-0000-0000-000000000001');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT lote06_teste.caso('atendente',f,false) FROM unnest(ARRAY['compra','consumo','global','privado']) f;
SELECT lote06_teste.caso('atendente','impressao',true);
-- Atendente libera pela RPC existente; a RLS nao autoriza seu UPDATE direto.
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.liberar_pedido_cozinha('62000000-0000-0000-0000-000000000003',60);
 IF r.resultado<>'ok' THEN RAISE EXCEPTION 'Liberacao legitima da atendente falhou'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}';
-- A producao inicia; o trigger real deve executar o worker privado exatamente uma vez.
DO $$ DECLARE n integer; BEGIN
 UPDATE public.pedidos SET status='em_producao' WHERE id='62000000-0000-0000-0000-000000000003';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Transicao da producao nao atingiu o pedido'; END IF;
END $$;
SELECT lote06_teste.caso('producao',f,false) FROM unnest(ARRAY['compra','global','privado']) f;
SELECT lote06_teste.caso('producao',f,true) FROM unnest(ARRAY['consumo','impressao']) f;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT lote06_teste.caso('financeiro',f,true) FROM unnest(ARRAY['compra','consumo','impressao']) f;
SELECT lote06_teste.caso('financeiro',f,false) FROM unnest(ARRAY['global','privado']) f;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000005';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000005","role":"authenticated"}';
SELECT lote06_teste.caso('admin',f,true) FROM unnest(ARRAY['compra','consumo','impressao','global']) f;
SELECT lote06_teste.caso('admin','privado',false);
RESET ROLE;
-- O servico deve efetivamente recriar um trabalho, nao apenas retornar por retry.
DELETE FROM public.fila_impressao WHERE trabalho_uuid='62000000-0000-0000-0000-000000000002:pedido';
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{"role":"service_role"}';
SELECT lote06_teste.caso('servico',f,false) FROM unnest(ARRAY['compra','consumo','global','privado']) f;
SELECT lote06_teste.caso('servico','impressao',true);
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{}';
SELECT lote06_teste.caso('claims_ausentes',f,false) FROM unnest(ARRAY['compra','consumo','impressao','global','privado']) f;
RESET ROLE;

DO $$ BEGIN
 IF (SELECT count(*) FROM lote06_teste.resultados)<>40 THEN RAISE EXCEPTION 'Matriz incompleta'; END IF;
 IF (SELECT quantidade_recebida FROM public.compra_itens WHERE id='61000000-0000-0000-0000-000000000006')<>2
   THEN RAISE EXCEPTION 'Compras: quantidade incorreta ou escrita nao autorizada'; END IF;
 IF (SELECT count(*) FROM public.insumo_movimentacoes WHERE referencia='62000000-0000-0000-0000-000000000003')<>1
   THEN RAISE EXCEPTION 'Consumo pelo trigger legitimo falhou'; END IF;
 IF (SELECT count(*) FROM public.insumo_movimentacoes WHERE referencia='62000000-0000-0000-0000-000000000001')<>1
   THEN RAISE EXCEPTION 'Consumo autorizado/repetido nao foi idempotente'; END IF;
 IF (SELECT estoque_atual FROM public.insumos WHERE id='61000000-0000-0000-0000-000000000003')<>92
   THEN RAISE EXCEPTION 'Saldo de insumos inesperado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE pagamento_status='pago')
   OR EXISTS (SELECT 1 FROM public.pedidos WHERE pagamento_status='pago' AND NOT COALESCE(impresso,false))
   THEN RAISE EXCEPTION 'Reprocessamento global autorizado nao foi exercitado'; END IF;
 IF (SELECT count(*) FROM public.fila_impressao WHERE trabalho_uuid='62000000-0000-0000-0000-000000000002:pedido')<>1
   THEN RAISE EXCEPTION 'Servico de impressao nao recriou o trabalho'; END IF;
 IF (SELECT count(*) FROM public.fila_impressao WHERE trabalho_uuid='62000000-0000-0000-0000-000000000001:pedido')<>1
   THEN RAISE EXCEPTION 'Impressao do proprio pedido duplicou ou nao funcionou'; END IF;
 IF has_function_privilege('authenticated','public.consumir_insumos_pedido_trigger()','EXECUTE')
   OR has_function_privilege('authenticated','neia_operacao.consumir_insumos_pedido_interno(uuid)','EXECUTE')
   THEN RAISE EXCEPTION 'Bypass privado executavel'; END IF;
END $$;

-- Falha de negocio desfaz os efeitos da chamada sem alterar a guarda.
DO $$ DECLARE v_antes numeric; v_depois numeric; v_falhou boolean:=false; BEGIN
 SELECT estoque_atual INTO v_antes FROM public.insumos WHERE id='61000000-0000-0000-0000-000000000003';
 BEGIN
   PERFORM public.receber_compra_item('61000000-0000-0000-0000-000000000006',-1,'kg',NULL);
 EXCEPTION WHEN OTHERS THEN v_falhou:=true;
 END;
 SELECT estoque_atual INTO v_depois FROM public.insumos WHERE id='61000000-0000-0000-0000-000000000003';
 IF NOT v_falhou OR v_antes<>v_depois THEN RAISE EXCEPTION 'Compra invalida deixou efeitos'; END IF;
END $$;
-- Reimpressao autorizada permanece na RPC existente, sem ampliar permissoes.
UPDATE public.fila_impressao SET status='impresso' WHERE trabalho_uuid='62000000-0000-0000-0000-000000000002:pedido';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='60000000-0000-0000-0000-000000000002';
SET LOCAL request.jwt.claims='{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}';
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.solicitar_reimpressao('62000000-0000-0000-0000-000000000002','teste lote06','pedido','lote06-retry');
 IF r.resultado<>'ok' THEN RAISE EXCEPTION 'Reimpressao autorizada falhou: %',r; END IF;
 SELECT * INTO r FROM public.solicitar_reimpressao('62000000-0000-0000-0000-000000000002','teste lote06','pedido','lote06-retry');
 IF r.resultado<>'conflito' THEN RAISE EXCEPTION 'Reimpressao repetida nao protege idempotencia'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'LOTE 06: matriz e fluxos aprovados (40 casos, compras, consumo, trigger, impressao e reimpressao)'
