RESET ROLE;
DO $$
BEGIN
  IF public.motoboy_corte_rpc_ativo() THEN RAISE EXCEPTION 'Migration ativou corte automaticamente'; END IF;
END $$;
SELECT set_config('teste.gps.usuario',(SELECT usuario::text FROM teste_inicio.casos WHERE n=4),true);
SELECT set_config('teste.gps.outro',(SELECT usuario::text FROM teste_inicio.casos WHERE n=5),true);
SELECT set_config('teste.gps.rota',(SELECT rota::text FROM teste_inicio.casos WHERE n=4),true);
SELECT set_config('teste.gps.outra_rota',(SELECT rota::text FROM teste_inicio.casos WHERE n=5),true);
SELECT set_config('teste.gps.pedido',(SELECT pedidos[1]::text FROM teste_inicio.casos WHERE n=4),true);
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
UPDATE public.pedidos SET user_id = '10000000-0000-0000-0000-000000000002' WHERE id = current_setting('teste.gps.pedido')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('teste.gps.usuario'),true);
DO $$
BEGIN
  UPDATE public.motoboys SET ultima_atualizacao = now() WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Corte desativado quebrou alteração antiga do próprio motoboy'; END IF;
END $$;
RESET ROLE;
UPDATE neia_operacao.motoboy_config SET corte_rpc = true;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  rota uuid := current_setting('teste.gps.rota')::uuid;
  pedido uuid := current_setting('teste.gps.pedido')::uuid;
  r jsonb;
BEGIN
  BEGIN
    UPDATE public.pedidos SET status = 'entregue' WHERE id = pedido;
    RAISE EXCEPTION 'Motoboy conseguiu escrever estado direto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.motoboys SET ultima_atualizacao = now() WHERE user_id = auth.uid();
    RAISE EXCEPTION 'Motoboy conseguiu escrever disponibilidade direta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.notificacoes(tipo,titulo,detalhe) VALUES ('motoboy_retorno','Evento indevido','Teste');
    RAISE EXCEPTION 'Motoboy escreveu aviso da Central diretamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  r := public.informar_retorno_loja(rota);
  IF r->>'motivo' IS DISTINCT FROM 'rota_com_pendentes' THEN
    RAISE EXCEPTION 'Retorno foi aceito com pedidos pendentes: %',r;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  BEGIN
    UPDATE public.rotas_entrega SET status = 'concluida' WHERE id = rota;
    RAISE EXCEPTION 'Equipe alterou rota por escrita direta após corte';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public.encerrar_rota_pela_central(rota)->>'status' IS DISTINCT FROM 'bloqueado' THEN
    RAISE EXCEPTION 'Central encerrou rota com pedidos pendentes';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',current_setting('teste.gps.usuario'),true);
  r := public.registrar_atraso_entrega(pedido,'chuva');
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Atraso válido falhou: %',r; END IF;
  r := public.registrar_atraso_entrega(pedido,'chuva');
  IF r->>'status' IS DISTINCT FROM 'repetido' THEN RAISE EXCEPTION 'Atraso não idempotente: %',r; END IF;
  r := public.registrar_localizacao_rota(current_setting('teste.gps.outra_rota')::uuid,-23,-46,20,clock_timestamp());
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Escrita de GPS em rota alheia: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,-23,-46,20,clock_timestamp() - interval '2 minutes');
  IF r->>'status' IS DISTINCT FROM 'dados_invalidos' THEN RAISE EXCEPTION 'Aceitou posição antiga: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,-23,-46,20,clock_timestamp() + interval '1 minute');
  IF r->>'status' IS DISTINCT FROM 'dados_invalidos' THEN RAISE EXCEPTION 'Aceitou posição futura: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,91,-46,20,clock_timestamp());
  IF r->>'status' IS DISTINCT FROM 'dados_invalidos' THEN RAISE EXCEPTION 'Aceitou latitude inválida: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,-23,-46,1500,clock_timestamp());
  IF r->>'status' IS DISTINCT FROM 'dados_invalidos' THEN RAISE EXCEPTION 'Aceitou precisão acima de 1000 m: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,-23,-46,20,clock_timestamp());
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'GPS válido falhou: %',r; END IF;
  r := public.registrar_localizacao_rota(rota,-24,-47,20,clock_timestamp());
  IF r->>'status' IS DISTINCT FROM 'ignorado' THEN RAISE EXCEPTION 'Frequência do GPS deveria ser limitada: %',r; END IF;

  PERFORM set_config('request.jwt.claim.sub',current_setting('teste.gps.outro'),true);
  IF public.consultar_localizacao_entrega(pedido) IS NOT NULL OR
     public.registrar_atraso_entrega(pedido,'transito')->>'status' IS DISTINCT FROM 'negado' THEN
    RAISE EXCEPTION 'Motoboy alheio conseguiu ler GPS ou alterar atraso';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  IF public.consultar_localizacao_entrega(pedido)->>'latitude' IS DISTINCT FROM '-23' THEN
    RAISE EXCEPTION 'Cliente dono não viu localização válida';
  END IF;
  IF (SELECT count(*) FROM public.consultar_localizacoes_entregas(ARRAY[pedido,pedido,gen_random_uuid()])) <> 1 THEN
    RAISE EXCEPTION 'Consulta em lote retornou registros duplicados/sem autorização';
  END IF;
END $$;
RESET ROLE;
-- Expiração da leitura: amostra com mais de 90 s não é mais devolvida à Central.
UPDATE neia_operacao.localizacao_rota
   SET capturado_em = now() - interval '5 minutes'
 WHERE rota_id = current_setting('teste.gps.rota')::uuid;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  IF public.consultar_localizacao_entrega(current_setting('teste.gps.pedido')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Amostra expirada (mais de 90 s) ainda é devolvida à Central';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  IF public.consultar_localizacao_entrega(current_setting('teste.gps.pedido')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Central leu posição expirada';
  END IF;
  RAISE NOTICE 'Expiração da leitura de GPS verificada para cliente e Central';
END $$;
RESET ROLE;
UPDATE neia_operacao.localizacao_rota SET capturado_em=clock_timestamp() WHERE rota_id=current_setting('teste.gps.rota')::uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE pedido uuid:=current_setting('teste.gps.pedido')::uuid; BEGIN
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 IF public.consultar_localizacao_entrega(pedido) IS NULL THEN RAISE EXCEPTION 'Central não viu GPS recente'; END IF;
 PERFORM set_config('request.jwt.claim.sub',current_setting('teste.gps.usuario'),true);
 IF public.confirmar_entrega(pedido)->>'status' IS DISTINCT FROM 'ok' THEN RAISE EXCEPTION 'Entrega falhou'; END IF;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
 IF public.consultar_localizacao_entrega(pedido) IS NOT NULL THEN RAISE EXCEPTION 'GPS visível após entrega'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  rota uuid := current_setting('teste.gps.rota')::uuid;
  v_pedido uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',current_setting('teste.gps.usuario'),true);
  FOR v_pedido IN SELECT pedido_id FROM public.rota_pedidos WHERE rota_id = rota LOOP
    IF public.confirmar_entrega(v_pedido)->>'status' IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'Entrega pendente não concluiu';
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
  IF public.encerrar_rota_pela_central(rota)->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'Encerramento pela Central falhou';
  END IF;
END $$;
RESET ROLE;
DO $$
DECLARE rota uuid := current_setting('teste.gps.rota')::uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM neia_operacao.localizacao_rota WHERE rota_id = rota) THEN
    RAISE EXCEPTION 'Coordenada preservada após encerramento';
  END IF;
  RAISE NOTICE '0122: corte opt-in, autorização, limite de GPS e remoção da posição passaram';
END $$;
-- Fixture dedicada. O restante da homologação usa o estado pós-financeiro.
