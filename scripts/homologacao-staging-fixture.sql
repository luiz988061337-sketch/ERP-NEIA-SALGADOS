-- psql --single-transaction, exclusivamente em projeto staging confirmado.
-- Recebe a referência autorizada como variável psql, após criar as oito contas Auth do roteiro.
\set ON_ERROR_STOP on
SELECT set_config('neia_staging.ref', :'staging_ref', true) IS NOT NULL;
CREATE SCHEMA IF NOT EXISTS neia_homologacao;
REVOKE ALL ON SCHEMA neia_homologacao FROM PUBLIC,anon,authenticated;

CREATE TABLE neia_homologacao.fixture (
  protocolo uuid PRIMARY KEY, staging text NOT NULL, dados jsonb NOT NULL
);
CREATE TABLE neia_homologacao.atores (
  usuario uuid PRIMARY KEY, conta text UNIQUE NOT NULL, papel public.app_role NOT NULL
);

DO $$
DECLARE
  v_ref text := current_setting('neia_staging.ref');
  v_protocolo uuid := gen_random_uuid();
  v_livre uuid := gen_random_uuid();
  v_pedido_a uuid := gen_random_uuid();
  v_pedido_b uuid := gen_random_uuid();
  v_entregador_a uuid := gen_random_uuid();
  v_entregador_b uuid := gen_random_uuid();
  v_user_a uuid;
  v_user_b uuid;
  v_cliente uuid;
  v_rota_a uuid;
  v_rota_b uuid;
  r jsonb;
BEGIN
  IF v_ref !~ '^[a-z0-9]{20}$' OR v_ref IN ('ruioyioynwwwiqbjznoa','iqirsunzgavsuhgyjjsi') THEN
    RAISE EXCEPTION 'Referência de staging inválida';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 8 OR EXISTS (SELECT 1 FROM public.pedidos)
     OR EXISTS (SELECT 1 FROM public.motoboys) OR EXISTS (SELECT 1 FROM public.rotas_entrega)
     OR EXISTS (SELECT 1 FROM public.contas c WHERE NOT coalesce(
       c.created_by IS NULL AND c.pedido_id IS NULL AND c.valor_pago = 0 AND c.status = 'pendente' AND c.meio = 'pix'
       AND ((c.descricao = 'DEMO Energia elétrica' AND c.tipo = 'pagar' AND c.categoria = 'fixo' AND c.valor = 350)
         OR (c.descricao = 'DEMO Evento corporativo' AND c.tipo = 'receber' AND c.categoria = 'evento' AND c.valor = 1200)),false
       )) THEN
    RAISE EXCEPTION 'Fixture exige projeto sem operação preexistente e somente oito usuários sintéticos';
  END IF;
  INSERT INTO neia_homologacao.atores (usuario,conta,papel)
  SELECT u.id,v.conta,v.papel::public.app_role
  FROM (VALUES ('cliente','cliente','cliente'),('atendente','atendente','atendente'),
    ('producao','producao','producao'),('caixa','caixa','financeiro'),('financeiro','financeiro','financeiro'),
    ('responsavel','responsavel','admin'),('motoboy-a','motoboyA','motoboy'),('motoboy-b','motoboyB','motoboy')
  ) AS v(email,conta,papel)
  JOIN auth.users u ON u.email = 'neia-qa+' || v.email || '@example.invalid' AND u.email_confirmed_at IS NOT NULL;
  IF (SELECT count(*) FROM neia_homologacao.atores) <> 8 THEN
    RAISE EXCEPTION 'As oito contas fictícias esperadas devem estar confirmadas no Auth';
  END IF;
  DELETE FROM public.user_roles ur USING neia_homologacao.atores a WHERE ur.user_id = a.usuario;
  INSERT INTO public.user_roles(user_id,role) SELECT usuario,papel FROM neia_homologacao.atores;
  SELECT usuario INTO v_user_a FROM neia_homologacao.atores WHERE conta = 'motoboyA';
  SELECT usuario INTO v_user_b FROM neia_homologacao.atores WHERE conta = 'motoboyB';
  SELECT usuario INTO v_cliente FROM neia_homologacao.atores WHERE conta = 'cliente';
  INSERT INTO public.motoboys(id,user_id,nome) VALUES
    (v_entregador_a,v_user_a,'Entregador fictício A'), (v_entregador_b,v_user_b,'Entregador fictício B');
  INSERT INTO public.pedidos(id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status,
    subtotal,taxa_entrega,total,forma_pagamento,pagamento_status,pagamento_em)
  VALUES
    (v_pedido_a,v_cliente,'NEIA QA A','','Rua Teste A','Teste','Teste','entrega','pronto',50,5,55,'dinheiro','pago',now()),
    (v_pedido_b,NULL,'NEIA QA B','','Rua Teste B','Teste','Teste','entrega','pronto',50,5,55,'dinheiro','pendente',NULL),
    (v_livre,NULL,'NEIA QA Livre','','Rua Teste C','Teste','Teste','entrega','pronto',50,5,55,'dinheiro','pendente',NULL);
  PERFORM set_config('request.jwt.claim.sub',(SELECT usuario::text FROM neia_homologacao.atores WHERE conta='responsavel'),true);
  r := public.criar_rota_entrega_atomica(ARRAY[v_pedido_a],v_entregador_a);
  IF r->>'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Fixture da rota A falhou'; END IF;
  v_rota_a := (r->>'rota_id')::uuid;
  r := public.criar_rota_entrega_atomica(ARRAY[v_pedido_b],v_entregador_b);
  IF r->>'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Fixture da rota B falhou'; END IF;
  v_rota_b := (r->>'rota_id')::uuid;
  INSERT INTO neia_homologacao.fixture VALUES (v_protocolo,v_ref,jsonb_build_object(
    'protocolo',v_protocolo,'livre',v_livre,'pedidoA',v_pedido_a,'pedidoB',v_pedido_b,
    'rotaA',v_rota_a,'rotaB',v_rota_b,'motoboyA',v_entregador_a,'motoboyB',v_entregador_b));
END $$;

CREATE FUNCTION public.neia_staging_identidade(p_protocolo uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('staging',f.staging,'usuario',a.usuario,'conta',a.conta,'papel',a.papel,
    'fixture',f.dados,'cutover',public.motoboy_corte_rpc_ativo())
  FROM neia_homologacao.fixture f JOIN neia_homologacao.atores a ON a.usuario = auth.uid()
  WHERE f.protocolo = p_protocolo AND (
    SELECT array_agg(ur.role) = ARRAY[a.papel] FROM public.user_roles ur WHERE ur.user_id = a.usuario
  )
$$;
REVOKE ALL ON FUNCTION public.neia_staging_identidade(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.neia_staging_identidade(uuid) TO authenticated;
SELECT dados AS fixture FROM neia_homologacao.fixture;
SELECT conta,usuario FROM neia_homologacao.atores ORDER BY conta;
