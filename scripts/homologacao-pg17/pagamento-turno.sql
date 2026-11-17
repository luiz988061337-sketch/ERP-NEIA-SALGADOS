-- Preparação do acerto concorrente e autorização do turno já aprovado pelo Caixa.
RESET ROLE;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  c teste_inicio.casos;
  v_turno uuid;
  r jsonb;
BEGIN
  SELECT id INTO v_turno FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001';
  r := public.autorizar_pagamento_turno_motoboy(v_turno,4000,'Comprovante de trabalho F1');
  IF r->>'status' IS DISTINCT FROM 'valor_incompativel' THEN RAISE EXCEPTION 'Autorizou sem as taxas: %',r; END IF;
  r := public.autorizar_pagamento_turno_motoboy(v_turno,4785,'Comprovante de trabalho F1');
  IF r->>'status' IS DISTINCT FROM 'autorizado' THEN RAISE EXCEPTION 'Autorização legítima: %',r; END IF;
  SELECT * INTO c FROM teste_inicio.casos WHERE n = 3;
  UPDATE public.pedidos SET subtotal = 10, taxa_entrega = 2, total = 12,
    forma_pagamento = 'pix', pagamento_status = 'pago', pagamento_em = now()
    WHERE id = ANY(c.pedidos);
  PERFORM set_config('request.jwt.claim.sub',c.usuario::text,true);
  r := public.motoboy_listar_rotas_atribuidas();
  IF r #>> '{0,id}' IS DISTINCT FROM c.rota::text OR r #>> '{0,status}' IS DISTINCT FROM 'concluida'
     OR r #> '{0,pedidos}' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Rota concluída não está disponível ou expôs dados de cliente: %',r;
  END IF;
  r := public.solicitar_acerto_rota(c.rota,'acerto:pix-concorrente');
  IF r->>'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Acerto Pix: %',r; END IF;
  IF public.motoboy_listar_rotas_atribuidas() IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Rota com acerto solicitado permaneceu elegível para solicitar';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
  r := public.conferir_acerto_rota_independente((r->>'acerto_id')::uuid,'conf:pix-concorrente',1000,1000,'Caixa conferiu o troco devolvido');
  IF r->>'status_acerto' IS DISTINCT FROM 'em_conferencia'
     OR r #>> '{conferencia,base_erp,pix_loja_centavos}' IS DISTINCT FROM '3600'
     OR r #>> '{conferencia,base_erp,produtos_dinheiro_centavos}' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'Dados do Pix e do troco não separados: %',r;
  END IF;
END $$;

-- A falha ocorre após as escritas no ledger e no turno, antes do COMMIT.
CREATE FUNCTION teste_inicio.falhar_auditoria_turno() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo = 'pagamento' THEN RAISE EXCEPTION 'Falha sintética de auditoria' USING ERRCODE = 'P0403'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teste_turno_rollback BEFORE INSERT ON public.turnos_motoboy_eventos
FOR EACH ROW EXECUTE FUNCTION teste_inicio.falhar_auditoria_turno();

DO $$
DECLARE
  v_turno uuid := (SELECT id FROM public.turnos_motoboy WHERE chave_idempotencia = 'turno:normal:001');
  r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
  BEGIN
    PERFORM public.identificar_motoboys_acerto(ARRAY['60000000-0000-0000-0000-000000000001']::uuid[]);
    RAISE EXCEPTION 'Motoboy consultou identificação financeira indevidamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  r := public.confirmar_pagamento_turno_motoboy(v_turno,4785,'dinheiro',now(),NULL,'turno:nao-autorizado');
  IF r->>'status' IS DISTINCT FROM 'negado' THEN RAISE EXCEPTION 'Motoboy confirmou pagamento: %',r; END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
  IF (SELECT nome FROM public.identificar_motoboys_acerto(
    ARRAY['60000000-0000-0000-0000-000000000001']::uuid[])) IS DISTINCT FROM 'Teste 1' THEN
    RAISE EXCEPTION 'Financeiro não conseguiu identificar o beneficiário';
  END IF;
  UPDATE public.pedido_pagamento_eventos SET forma_pagamento = 'pix'
   WHERE pedido_id = '70000000-0000-0000-0000-000000000001';
  r := public.confirmar_pagamento_turno_motoboy(v_turno,4785,'dinheiro',now(),NULL,'turno:saldo-alterado');
  IF r->>'motivo' IS DISTINCT FROM 'acerto_alterado_apos_autorizacao' THEN
    RAISE EXCEPTION 'Pagamento ignorou alteração no ledger depois da aprovação: %',r;
  END IF;
  UPDATE public.pedido_pagamento_eventos SET forma_pagamento = 'dinheiro'
   WHERE pedido_id = '70000000-0000-0000-0000-000000000001';
  BEGIN
    r := public.confirmar_pagamento_turno_motoboy(v_turno,4785,'dinheiro',now(),NULL,'turno:rollback');
    RAISE EXCEPTION 'Falha de auditoria não ocorreu: %',r;
  EXCEPTION WHEN SQLSTATE 'P0403' THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.turnos_motoboy WHERE id=v_turno AND status='pagamento_solicitado' AND conta_pagamento_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.contas WHERE descricao = 'Fechamento de turno motoboy')
    OR EXISTS (SELECT 1 FROM public.conta_pagamento_eventos WHERE chave_idempotencia = 'turno-efetivo:' || v_turno) THEN
    RAISE EXCEPTION 'Rollback não restaurou turno, contas e ledger';
  END IF;
END $$;
DROP TRIGGER teste_turno_rollback ON public.turnos_motoboy_eventos;
