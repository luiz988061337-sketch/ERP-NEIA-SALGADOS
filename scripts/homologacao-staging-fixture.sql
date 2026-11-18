-- Transacao propria. Nao reaplicar em banco com operacao ou fixture existente.
-- Exige autorizacao de escrita, protocolo e oito UUIDs explicitamente atestados
-- por raw_app_meta_data (somente Auth Admin), preservando todos os outros usuarios.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('neia_staging.ref', :'staging_ref', true) IS NOT NULL
 AND set_config('neia_staging.autorizacao', :'escritas_autorizadas_ref', true) IS NOT NULL
 AND set_config('neia_staging.protocolo', :'fixture_protocolo', true) IS NOT NULL
 AND set_config('neia_staging.atores', :'fixture_atores', true) IS NOT NULL AS entradas_recebidas;
CREATE SCHEMA neia_homologacao;
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
  v_protocolo uuid := current_setting('neia_staging.protocolo')::uuid;
  v_atores jsonb := current_setting('neia_staging.atores')::jsonb;
  v_usuarios uuid[];
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
  IF v_ref !~ '^[a-z0-9]{20}$' OR v_ref IN ('ruioyioynwwwiqbjznoa','iqirsunzgavsuhgyjjsi')
     OR current_setting('neia_staging.autorizacao') IS DISTINCT FROM v_ref THEN
    RAISE EXCEPTION 'Referência de staging inválida';
  END IF;
  IF jsonb_typeof(v_atores) IS DISTINCT FROM 'object'
     OR NOT (v_atores ?& ARRAY['cliente','atendente','producao','caixa','financeiro','responsavel','motoboyA','motoboyB'])
     OR (SELECT count(*) FROM jsonb_object_keys(v_atores)) <> 8
     OR EXISTS (SELECT 1 FROM jsonb_each(v_atores) WHERE jsonb_typeof(value) IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'Informe os oito UUIDs sintéticos explicitamente por conta';
  END IF;
  v_usuarios := ARRAY(SELECT (value #>> '{}')::uuid FROM jsonb_each(v_atores));
  IF (SELECT count(DISTINCT u) FROM unnest(v_usuarios) u) <> 8 THEN
    RAISE EXCEPTION 'Os oito usuários sintéticos devem ser distintos';
  END IF;
  PERFORM u.id FROM auth.users u WHERE u.id=ANY(v_usuarios) ORDER BY u.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.pedidos)
     OR EXISTS (SELECT 1 FROM public.motoboys) OR EXISTS (SELECT 1 FROM public.rotas_entrega)
     OR EXISTS (SELECT 1 FROM public.contas c WHERE NOT coalesce(
       c.created_by IS NULL AND c.pedido_id IS NULL AND c.valor_pago = 0 AND c.status = 'pendente' AND c.meio = 'pix'
       AND ((c.descricao = 'DEMO Energia elétrica' AND c.tipo = 'pagar' AND c.categoria = 'fixo' AND c.valor = 350)
         OR (c.descricao = 'DEMO Evento corporativo' AND c.tipo = 'receber' AND c.categoria = 'evento' AND c.valor = 1200)),false
       )) THEN
    RAISE EXCEPTION 'Fixture exige ausência de operação preexistente; não apagar dados para satisfazer este requisito';
  END IF;
  INSERT INTO neia_homologacao.atores (usuario,conta,papel)
  SELECT u.id,v.conta,v.papel::public.app_role
  FROM (VALUES ('cliente','cliente','cliente'),('atendente','atendente','atendente'),
    ('producao','producao','producao'),('caixa','caixa','financeiro'),('financeiro','financeiro','financeiro'),
    ('responsavel','responsavel','admin'),('motoboy-a','motoboyA','motoboy'),('motoboy-b','motoboyB','motoboy')
  ) AS v(email,conta,papel)
  JOIN auth.users u ON u.id=(v_atores->>v.conta)::uuid
    AND u.email = 'neia-qa+' || v.email || '-' || replace(v_protocolo::text,'-','') || '@example.invalid'
    AND u.email_confirmed_at IS NOT NULL
    AND u.raw_app_meta_data @> jsonb_build_object('neia_homologacao',jsonb_build_object(
      'protocolo',v_protocolo::text,'conta',v.conta,'staging_ref',v_ref));
  IF (SELECT count(*) FROM neia_homologacao.atores) <> 8 THEN
    RAISE EXCEPTION 'As oito contas devem ser sintéticas, confirmadas e atestadas pelo Auth Admin para este protocolo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur JOIN neia_homologacao.atores a ON a.usuario=ur.user_id
             GROUP BY ur.user_id,a.papel HAVING count(*)>1 OR NOT bool_and(ur.role IN ('cliente',a.papel))) THEN
    RAISE EXCEPTION 'Papeis inesperados nas contas de teste; nenhuma permissao sera descartada silenciosamente';
  END IF;
  -- Converte apenas o papel cliente gerado pelo trigger de criacao dessas contas
  -- novas e atestadas. Nunca exclui papeis nem modifica usuarios fora dos UUIDs.
  UPDATE public.user_roles ur SET role=a.papel FROM neia_homologacao.atores a
   WHERE ur.user_id=a.usuario AND ur.role='cliente' AND a.papel<>'cliente';
  INSERT INTO public.user_roles(user_id,role)
    SELECT a.usuario,a.papel FROM neia_homologacao.atores a
    WHERE NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=a.usuario);
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
COMMIT;
SELECT dados AS fixture FROM neia_homologacao.fixture;
SELECT conta,usuario FROM neia_homologacao.atores ORDER BY conta;
