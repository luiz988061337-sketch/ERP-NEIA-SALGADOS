RESET ROLE;
INSERT INTO auth.users (id,email) VALUES
 ('10000000-0000-0000-0000-000000000003','motoboy1@example.invalid'),
 ('10000000-0000-0000-0000-000000000004','motoboy2@example.invalid');
INSERT INTO public.user_roles (user_id,role) VALUES
 ('10000000-0000-0000-0000-000000000003','motoboy'),
 ('10000000-0000-0000-0000-000000000004','motoboy');
INSERT INTO public.motoboys (id,user_id,nome) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Teste 1'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','Teste 2');
INSERT INTO public.pedidos (id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status) VALUES
 ('70000000-0000-0000-0000-000000000001','Cliente ficticio 1','','Rua 1','Bairro teste','Cidade teste','entrega','pronto'),
 ('70000000-0000-0000-0000-000000000002','Cliente ficticio 2','','Rua 2','Bairro teste','Cidade teste','entrega','pronto'),
 ('70000000-0000-0000-0000-000000000003','Cliente ficticio 3','','Rua 3','Bairro teste','Cidade teste','entrega','pronto');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.criar_rota_entrega_atomica(ARRAY['70000000-0000-0000-0000-000000000001']::uuid[],
    '60000000-0000-0000-0000-000000000001');
  IF v_resultado ->> 'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Central nao atribuiu rota 1: %', v_resultado; END IF;
  v_resultado := public.criar_rota_entrega_atomica(ARRAY['70000000-0000-0000-0000-000000000002']::uuid[],
    '60000000-0000-0000-0000-000000000002');
  IF v_resultado ->> 'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Central nao atribuiu rota 2: %', v_resultado; END IF;
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_rotas jsonb := public.motoboy_listar_rotas_atribuidas();
  v_atualizados integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'Motoboy pode ler pedido ainda não atribuído pela Central';
  END IF;
  UPDATE public.pedidos
     SET motoboy_id = auth.uid(), status = 'aguardando_motoboy'
   WHERE id = '70000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  IF v_atualizados <> 0 THEN
    RAISE EXCEPTION 'Motoboy reivindicou pedido sem atribuição da Central';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = '70000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Motoboy não pode ler seu pedido atribuído';
  END IF;

  IF jsonb_array_length(v_rotas) <> 1
     OR jsonb_array_length(v_rotas #> '{0,pedidos}') IS DISTINCT FROM 1
     OR v_rotas #>> '{0,pedidos,0,id}' IS DISTINCT FROM '70000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'Contrato de leitura Central-App incorreto: %', v_rotas;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rotas_entrega WHERE motoboy_id = '60000000-0000-0000-0000-000000000002')
     OR EXISTS (SELECT 1 FROM public.rota_pedidos WHERE pedido_id = '70000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'Acesso direto a rota de outro motoboy';
  END IF;
  UPDATE public.rotas_entrega SET status = 'concluida' WHERE id = (v_rotas #>> '{0,id}')::uuid;
  IF FOUND THEN RAISE EXCEPTION 'Motoboy conseguiu finalizar rota por UPDATE direto'; END IF;
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  BEGIN
    PERFORM public.motoboy_listar_rotas_atribuidas();
    RAISE EXCEPTION 'Cliente pode ler rotas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
