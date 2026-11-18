-- Somente SQL local com dados sinteticos. Nao comprova Auth/PostgREST hospedados.
DO $local$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial' THEN RAISE EXCEPTION 'Teste exclusivamente local'; END IF; END $local$;
-- Somente laboratorio sintetico, executado em transacao pelo runner.
INSERT INTO public.pedidos(id,user_id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status,subtotal,total)
SELECT ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000002','Ficticio','','Rua','Bairro','Cidade','retirada','recebido',10,10
FROM generate_series(81,83) n;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
DO $$ DECLARE blocked boolean; BEGIN
 blocked:=false;
 BEGIN UPDATE public.pedidos SET status='cancelado',total=1000 WHERE id='88000000-0000-4000-8000-000000000081';
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Cliente alterou total no cancelamento'; END IF;
 blocked:=false;
 BEGIN UPDATE public.pedidos SET status='cancelado',entrega_ajuste='{"alterado":true}' WHERE id='88000000-0000-4000-8000-000000000082';
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Cliente alterou coluna nova no cancelamento'; END IF;
 UPDATE public.pedidos SET status='cancelado' WHERE id='88000000-0000-4000-8000-000000000083';
 IF NOT FOUND THEN RAISE EXCEPTION 'Cancelamento legitimo nao ocorreu'; END IF;
 IF (SELECT count(*) FROM public.pedidos WHERE id IN ('88000000-0000-4000-8000-000000000081','88000000-0000-4000-8000-000000000082') AND status='recebido' AND total=10)<>2 THEN RAISE EXCEPTION 'Falha nao reverteu alteracao'; END IF;
END $$;
