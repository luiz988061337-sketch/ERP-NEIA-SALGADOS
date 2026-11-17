-- 0123: fluxo sem aceite, liberação independente, 1–3 pedidos e rollback real.
RESET ROLE;
CREATE SCHEMA teste_liberacao;
CREATE TABLE teste_liberacao.casos(n int PRIMARY KEY, usuario uuid, driver uuid, rota uuid, pedidos uuid[]);
GRANT USAGE ON SCHEMA teste_liberacao TO authenticated;
GRANT SELECT ON teste_liberacao.casos TO authenticated;
DO $$ DECLARE n int; u uuid; d uuid; ids uuid[]; r jsonb; BEGIN
 FOR n IN 1..5 LOOP
  u:=md5('lib usuario '||n)::uuid;d:=md5('lib driver '||n)::uuid;
  INSERT INTO auth.users(id,email) VALUES(u,'lib'||n||'@example.invalid');
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'motoboy');
  INSERT INTO public.motoboys(id,user_id,nome) VALUES(d,u,'Liberação '||n);
  ids:=ARRAY(SELECT md5('lib pedido '||n||'/'||i)::uuid FROM generate_series(1,least(n,3)) i ORDER BY 1);
  INSERT INTO public.pedidos(id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status)
    SELECT id,'Fictício','','Rua','Bairro','Cidade','entrega','pronto' FROM unnest(ids) id;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  r:=public.criar_rota_entrega_atomica(ids,d);
  IF r->>'status' IS DISTINCT FROM 'criada' THEN RAISE EXCEPTION 'Fixture 0123: %',r; END IF;
  INSERT INTO teste_liberacao.casos VALUES(n,u,d,(r->>'rota_id')::uuid,ids);
 END LOOP;
END $$;

SET LOCAL ROLE authenticated;
DO $$ DECLARE c teste_liberacao.casos; p uuid; r jsonb; repetido jsonb; listado jsonb; BEGIN
 FOR c IN SELECT * FROM teste_liberacao.casos ORDER BY n LOOP
  PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
  listado:=public.motoboy_listar_rotas_atribuidas();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(listado) x WHERE x->>'id'=c.rota::text) THEN RAISE EXCEPTION 'Rota não recebida automaticamente'; END IF;
  IF public.liberar_rota_entrega(c.rota)->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Auto liberação'; END IF;
  BEGIN
   UPDATE public.rotas_entrega SET liberada_central_em=now(),liberada_central_por=c.usuario WHERE id=c.rota;
   IF FOUND THEN RAISE EXCEPTION 'Liberação direta permitida'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH p IN ARRAY c.pedidos LOOP
   r:=public.confirmar_retirada(p);
   IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Retirada sem aceite: %',r; END IF;
   IF p=c.pedidos[1] AND cardinality(c.pedidos)>1 THEN
     IF public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'retirada_de_todos_os_pedidos_obrigatoria' THEN RAISE EXCEPTION 'Parcial liberada'; END IF;
   END IF;
  END LOOP;
  r:=public.aceitar_rota(c.rota); -- compatibilidade não libera nem inventa aceite.
  IF r->>'motivo' IS DISTINCT FROM 'aceite_nao_necessario' OR EXISTS(SELECT 1 FROM public.pedidos WHERE id=ANY(c.pedidos) AND aceito_motoboy_em IS NOT NULL) THEN RAISE EXCEPTION 'Aceite legado alterou prova'; END IF;
  IF public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'liberacao_da_central_obrigatoria' THEN RAISE EXCEPTION 'Início sem liberação'; END IF;
  IF public.iniciar_rota((SELECT rota FROM teste_liberacao.casos WHERE n<>c.n LIMIT 1))->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Rota alheia'; END IF;
  IF c.n<=3 THEN
   PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
   r:=public.liberar_rota_entrega(c.rota);repetido:=public.liberar_rota_entrega(c.rota);
   IF r->>'motivo' IS DISTINCT FROM 'rota_liberada' OR repetido->>'motivo' IS DISTINCT FROM 'rota_ja_liberada' OR r->>'liberada_em' IS DISTINCT FROM repetido->>'liberada_em' THEN RAISE EXCEPTION 'Liberação idempotente: % / %',r,repetido; END IF;
   PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
   IF public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'rota_iniciada' OR public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'rota_ja_iniciada' THEN RAISE EXCEPTION 'Início % pedidos',c.n; END IF;
   IF (SELECT count(*) FROM public.pedidos WHERE id=ANY(c.pedidos) AND status='em_rota')<>c.n THEN RAISE EXCEPTION 'Pedidos parciais'; END IF;
  END IF;
 END LOOP;
END $$;
RESET ROLE;

CREATE FUNCTION teste_liberacao.falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='rotas_entrega' AND NEW.id=(SELECT rota FROM teste_liberacao.casos WHERE n=4) AND NEW.liberada_central_em IS NOT NULL THEN RAISE EXCEPTION 'Falha liberacao' USING ERRCODE='P0423'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER falhar_liberacao AFTER UPDATE ON public.rotas_entrega FOR EACH ROW EXECUTE FUNCTION teste_liberacao.falha();
DO $$ DECLARE c teste_liberacao.casos; BEGIN
 SELECT * INTO c FROM teste_liberacao.casos WHERE n=4;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 BEGIN PERFORM public.liberar_rota_entrega(c.rota);RAISE EXCEPTION 'Falha não injetada';EXCEPTION WHEN SQLSTATE 'P0423' THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.rotas_entrega WHERE id=c.rota AND liberada_central_em IS NOT NULL) THEN RAISE EXCEPTION 'Liberação parcial após erro';END IF;
END $$;
DROP TRIGGER falhar_liberacao ON public.rotas_entrega;
-- Rollback do início com liberação válida continua coberto por inicio-rota-integridade.sql.
DO $$ BEGIN RAISE NOTICE '0123: 1–3 pedidos sem aceite, negações, repetição, liberação independente e rollback OK';END $$;

-- Registros antigos de aceite não são tratados como liberação nem reescritos.
INSERT INTO auth.users(id,email) VALUES('12300000-0000-0000-0000-000000000001','central123@example.invalid'),('12300000-0000-0000-0000-000000000002','financeiro123@example.invalid');
INSERT INTO public.user_roles(user_id,role) VALUES('12300000-0000-0000-0000-000000000001','producao'),('12300000-0000-0000-0000-000000000002','financeiro');
UPDATE public.pedidos SET aceito_motoboy_em='2026-01-01T12:00:00Z',aceito_motoboy_por=motoboy_id
 WHERE id=ANY((SELECT pedidos FROM teste_liberacao.casos WHERE n=4)::uuid[]);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c teste_liberacao.casos; r jsonb; BEGIN
 SELECT * INTO c FROM teste_liberacao.casos WHERE n=4;
 PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
 IF public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'liberacao_da_central_obrigatoria' THEN RAISE EXCEPTION 'Aceite histórico virou liberação'; END IF;
 PERFORM public.aceitar_rota(c.rota);
 IF EXISTS(SELECT 1 FROM public.pedidos WHERE id=ANY(c.pedidos) AND aceito_motoboy_em IS DISTINCT FROM '2026-01-01T12:00:00Z'::timestamptz) THEN RAISE EXCEPTION 'Histórico de aceite alterado';END IF;
 PERFORM set_config('request.jwt.claim.sub','12300000-0000-0000-0000-000000000002',true);
 IF public.liberar_rota_entrega(c.rota)->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Financeiro liberou saída'; END IF;
 PERFORM set_config('request.jwt.claim.sub','12300000-0000-0000-0000-000000000001',true);
 r:=public.liberar_rota_entrega(c.rota);
 IF r->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Central produção sem permissão: %',r; END IF;
END $$;
RESET ROLE;
-- Simula alteração por integração legada: a liberação não vale para outra composição.
DELETE FROM public.rota_pedidos WHERE rota_id=(SELECT rota FROM teste_liberacao.casos WHERE n=4)
 AND pedido_id=(SELECT pedidos[1] FROM teste_liberacao.casos WHERE n=4);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c teste_liberacao.casos; BEGIN
 SELECT * INTO c FROM teste_liberacao.casos WHERE n=4;
 PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
 IF public.iniciar_rota(c.rota)->>'motivo' IS DISTINCT FROM 'liberacao_da_central_obrigatoria' THEN RAISE EXCEPTION 'Liberação valeu para composição alterada'; END IF;
 IF EXISTS(SELECT 1 FROM public.rotas_entrega WHERE id=c.rota AND status<>'preparando') THEN RAISE EXCEPTION 'Alteração de composição iniciou a rota';END IF;
 RAISE NOTICE '0123: histórico preservado, Financeiro negado, Central produção autorizada e composição alterada bloqueada';
END $$;
RESET ROLE;
