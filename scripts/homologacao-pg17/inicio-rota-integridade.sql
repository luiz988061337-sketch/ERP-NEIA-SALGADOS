-- Fixtures próprias para testar a 0112 sem alterar a rota do fechamento.
RESET ROLE;
CREATE SCHEMA teste_inicio;
CREATE TABLE teste_inicio.casos (n integer PRIMARY KEY, usuario uuid NOT NULL, motoboy uuid NOT NULL, rota uuid NOT NULL, pedidos uuid[] NOT NULL);
GRANT USAGE ON SCHEMA teste_inicio TO authenticated;
GRANT SELECT ON teste_inicio.casos TO authenticated;

DO $$
DECLARE
  n integer;
  v_user uuid;
  v_driver uuid;
  v_rota uuid;
  v_ids uuid[];
  r jsonb;
BEGIN
  FOR n IN 0..5 LOOP
    v_user := md5('teste inicio usuario ' || n)::uuid;
    v_driver := md5('teste inicio motoboy ' || n)::uuid;
    INSERT INTO auth.users (id,email) VALUES (v_user, 'inicio' || n || '@example.invalid');
    INSERT INTO public.user_roles (user_id,role) VALUES (v_user,'motoboy');
    INSERT INTO public.motoboys (id,user_id,nome) VALUES (v_driver,v_user,'Início de rota ' || n);
    v_ids := ARRAY(SELECT md5('teste inicio pedido ' || n || '/' || i)::uuid
                   FROM generate_series(1, least(n,3)) AS i ORDER BY i);
    PERFORM set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
    IF n = 0 THEN
      INSERT INTO public.rotas_entrega (motoboy_id,status) VALUES (v_driver,'preparando') RETURNING id INTO v_rota;
    ELSE
      INSERT INTO public.pedidos (id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status)
      SELECT id,'Teste 0112','','Rua fictícia','Bairro','Cidade','entrega','pronto' FROM unnest(v_ids) AS id;
      r := public.criar_rota_entrega_atomica(v_ids,v_driver);
      IF r->>'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Fixture 0112 %: %',n,r; END IF;
      v_rota := (r->>'rota_id')::uuid;
    END IF;
    INSERT INTO teste_inicio.casos VALUES (n,v_user,v_driver,v_rota,v_ids);
  END LOOP;
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  c teste_inicio.casos;
  outro teste_inicio.casos;
  pedido uuid;
  r jsonb;
  saida text;
BEGIN
  SELECT * INTO outro FROM teste_inicio.casos WHERE n = 4;
  FOR c IN SELECT * FROM teste_inicio.casos WHERE n < 4 ORDER BY n LOOP
    PERFORM set_config('request.jwt.claim.sub', c.usuario::text, true);
    r := public.iniciar_rota(c.rota);
    IF c.n = 0 THEN
      IF r->>'motivo' IS DISTINCT FROM 'rota_sem_pedidos' THEN RAISE EXCEPTION 'Rota vazia: %',r; END IF;
      CONTINUE;
    END IF;
    IF r->>'status' IS DISTINCT FROM 'bloqueado' OR (r->>'pendentes_retirada')::integer IS DISTINCT FROM c.n THEN
      RAISE EXCEPTION 'Início sem retirada (%): %',c.n,r;
    END IF;
    r := public.confirmar_retirada(outro.pedidos[1]);
    IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Pedido de outra rota: %',r; END IF;
    r := public.iniciar_rota(outro.rota);
    IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Rota de outro motoboy: %',r; END IF;
    BEGIN
      UPDATE public.pedidos SET retirada_em = now(), retirada_por = c.usuario, retirada_rota_id = c.rota
       WHERE id = c.pedidos[1];
      IF FOUND THEN RAISE EXCEPTION 'Prova de retirada forjada diretamente'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    FOREACH pedido IN ARRAY c.pedidos LOOP
      r := public.confirmar_retirada(pedido);
      IF r->>'motivo' IS DISTINCT FROM 'retirada_confirmada' THEN RAISE EXCEPTION 'Retirada: %',r; END IF;
      IF c.n > 1 AND pedido = c.pedidos[1] THEN
        r := public.iniciar_rota(c.rota);
        IF r->>'status' IS DISTINCT FROM 'bloqueado' OR (r->>'pendentes_retirada')::integer IS DISTINCT FROM c.n - 1 THEN
          RAISE EXCEPTION 'Retirada parcial (%): %',c.n,r;
        END IF;
        IF EXISTS (SELECT 1 FROM public.pedidos WHERE id = ANY(c.pedidos) AND status <> 'aguardando_motoboy') THEN
          RAISE EXCEPTION 'Retirada parcial alterou pedidos';
        END IF;
      END IF;
    END LOOP;
    r := public.iniciar_rota(c.rota);
    IF r->>'motivo' IS DISTINCT FROM 'rota_iniciada' OR r->>'saiu_em' IS NULL THEN RAISE EXCEPTION 'Início com %: %',c.n,r; END IF;
    saida := r->>'saiu_em';
    r := public.iniciar_rota(c.rota);
    IF r->>'motivo' IS DISTINCT FROM 'rota_ja_iniciada' OR r->>'saiu_em' IS DISTINCT FROM saida THEN
      RAISE EXCEPTION 'Repetição com %: %',c.n,r;
    END IF;
    IF (SELECT count(*) FROM public.pedidos WHERE id = ANY(c.pedidos) AND status = 'em_rota') <> c.n THEN
      RAISE EXCEPTION 'Rota de % pedidos não transitou integralmente',c.n;
    END IF;
    RAISE NOTICE '0112: % pedido(s), bloqueios, retirada válida e repetição OK', c.n;
    IF c.n = 3 THEN
      r := public.confirmar_chegada_loja(c.rota);
      IF r->>'motivo' IS DISTINCT FROM 'rota_com_pendentes' THEN RAISE EXCEPTION 'Chegada prematura: %',r; END IF;
      r := public.confirmar_entrega(c.pedidos[1]);
      IF r->>'motivo' IS DISTINCT FROM 'entrega_confirmada'
         OR (SELECT count(*) FROM public.pedidos WHERE id = ANY(c.pedidos) AND status = 'em_rota') <> 2 THEN
        RAISE EXCEPTION 'Entrega individual avançou pedido indevido: %',r;
      END IF;
      FOREACH pedido IN ARRAY c.pedidos[2:3] LOOP
        r := public.confirmar_entrega(pedido);
        IF r->>'motivo' IS DISTINCT FROM 'entrega_confirmada' THEN RAISE EXCEPTION 'Entrega: %',r; END IF;
      END LOOP;
      r := public.informar_retorno_loja(c.rota);
      IF r->>'motivo' IS DISTINCT FROM 'retorno_informado' THEN RAISE EXCEPTION 'Retorno: %',r; END IF;
      r := public.confirmar_chegada_loja(c.rota);
      IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Chegada à loja: %',r; END IF;
    END IF;
  END LOOP;
END $$;
RESET ROLE;

-- Simula uma reatribuição na base e uma falha no segundo UPDATE da rota.
CREATE FUNCTION teste_inicio.falhar_no_segundo_pedido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = md5('teste inicio pedido 4/2')::uuid AND NEW.status = 'em_rota' THEN
    RAISE EXCEPTION 'Falha sintética em pedido' USING ERRCODE = 'P0402';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teste_inicio_rollback AFTER UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION teste_inicio.falhar_no_segundo_pedido();

DO $$
DECLARE
  c teste_inicio.casos;
  outro teste_inicio.casos;
  v_pedido uuid;
  r jsonb;
BEGIN
  SELECT * INTO c FROM teste_inicio.casos WHERE n = 4;
  SELECT * INTO outro FROM teste_inicio.casos WHERE n = 3;
  PERFORM set_config('request.jwt.claim.sub', c.usuario::text, true);
  FOREACH v_pedido IN ARRAY c.pedidos LOOP
    r := public.confirmar_retirada(v_pedido);
    IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Retirada da fixture de rollback: %',r; END IF;
  END LOOP;
  UPDATE public.pedidos SET retirada_rota_id = outro.rota WHERE id = c.pedidos[1];
  r := public.iniciar_rota(c.rota);
  IF r->>'status' IS DISTINCT FROM 'bloqueado' THEN RAISE EXCEPTION 'Retirada de outra rota liberou início: %',r; END IF;
  UPDATE public.pedidos SET retirada_rota_id = c.rota, retirada_por = outro.usuario WHERE id = c.pedidos[1];
  r := public.iniciar_rota(c.rota);
  IF r->>'status' IS DISTINCT FROM 'bloqueado' THEN RAISE EXCEPTION 'Retirada de outro motoboy liberou início: %',r; END IF;
  r := public.confirmar_retirada(c.pedidos[1]);
  IF r->>'motivo' IS DISTINCT FROM 'retirada_confirmada' THEN RAISE EXCEPTION 'Nova retirada válida: %',r; END IF;
  BEGIN
    PERFORM public.iniciar_rota(c.rota);
    RAISE EXCEPTION 'Teste não acionou falha no UPDATE';
  EXCEPTION WHEN SQLSTATE 'P0402' THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.rotas_entrega WHERE id = c.rota AND status = 'preparando' AND saiu_em IS NULL)
     OR EXISTS (SELECT 1 FROM public.pedidos WHERE id = ANY(c.pedidos) AND status <> 'aguardando_motoboy') THEN
    RAISE EXCEPTION 'Rollback deixou alterações parciais';
  END IF;
  RAISE NOTICE '0112: prova de outro motoboy/rota recusada e rollback integral';
END $$;
DROP TRIGGER teste_inicio_rollback ON public.pedidos;

SET LOCAL ROLE authenticated;
DO $$
DECLARE c teste_inicio.casos;
  r jsonb;
BEGIN
  SELECT * INTO c FROM teste_inicio.casos WHERE n = 5;
  PERFORM set_config('request.jwt.claim.sub', c.usuario::text, true);
  r := public.aceitar_rota(c.rota);
  IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Aceite da Central: %',r; END IF;
  IF public.confirmar_retirada(c.pedidos[1])->>'status' IS DISTINCT FROM 'ok'
     OR public.confirmar_retirada(c.pedidos[2])->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'Não foi possível preparar as primeiras duas retiradas concorrentes';
  END IF;
END $$;
RESET ROLE;
