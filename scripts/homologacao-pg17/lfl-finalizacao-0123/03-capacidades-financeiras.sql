-- Separacao adicional, sem atribuir capacidades a usuarios existentes.
-- Rascunho de homologacao LOCAL. Exige plano e autorizacao separados para online.
BEGIN;
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
 OR current_user !~ '^restore_[a-f0-9]{12}$'
 OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Rascunho restrito ao laboratorio local. Online exige revisao e autorizacao separadas.';
 END IF;
END $local$;

CREATE SCHEMA IF NOT EXISTS neia_operacao;
REVOKE ALL ON SCHEMA neia_operacao FROM PUBLIC,anon,authenticated,service_role;
ALTER SCHEMA neia_operacao OWNER TO postgres;
CREATE TABLE IF NOT EXISTS neia_operacao.financeiro_capacidades (
 usuario uuid NOT NULL REFERENCES auth.users(id),
 capacidade text NOT NULL CHECK(capacidade IN ('conferir_caixa','executar_financeiro','receber_pagamento')),
 concedido_por uuid REFERENCES auth.users(id),
 motivo text NOT NULL CHECK(length(btrim(motivo)) BETWEEN 1 AND 240),
 concedido_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(usuario,capacidade)
);
ALTER TABLE neia_operacao.financeiro_capacidades OWNER TO postgres;
ALTER TABLE neia_operacao.financeiro_capacidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON neia_operacao.financeiro_capacidades FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION neia_operacao.tem_capacidade(p_usuario uuid,p_capacidade text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $cap$
 SELECT p_usuario IS NOT NULL AND EXISTS(SELECT 1 FROM neia_operacao.financeiro_capacidades c WHERE c.usuario=p_usuario AND c.capacidade=p_capacidade)
$cap$;
ALTER FUNCTION neia_operacao.tem_capacidade(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION neia_operacao.tem_capacidade(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.conferir_acerto_rota_independente(p_acerto_id uuid, p_chave text, p_contado_centavos bigint, p_troco_loja_centavos bigint, p_referencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_acerto public.acertos_rota%ROWTYPE;
  v_evento public.acertos_rota_eventos%ROWTYPE;
  v_base jsonb;
  v_conferencia jsonb;
  v_esperado bigint;
  v_status public.acerto_rota_status;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'conferir_caixa') THEN RETURN jsonb_build_object('status','negado'); END IF;
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'financeiro') OR public.has_role(v_uid,'admin')) THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF p_chave IS NULL OR length(btrim(p_chave)) NOT BETWEEN 1 AND 160
     OR p_contado_centavos IS NULL OR p_contado_centavos NOT BETWEEN 0 AND 999999999999
     OR p_troco_loja_centavos IS NULL OR p_troco_loja_centavos NOT BETWEEN 0 AND 999999999999
     OR p_referencia IS NULL OR length(btrim(p_referencia)) NOT BETWEEN 1 AND 240 THEN
    RETURN jsonb_build_object('status','dados_invalidos');
  END IF;
  SELECT * INTO v_acerto FROM public.acertos_rota WHERE id = p_acerto_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','inexistente'); END IF;
  IF v_uid = v_acerto.user_id THEN RETURN jsonb_build_object('status','negado'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave,0));
  SELECT * INTO v_evento FROM public.acertos_rota_eventos WHERE chave_idempotencia = p_chave;
  IF FOUND THEN
    IF v_evento.acerto_id = p_acerto_id AND v_evento.tipo = 'divergencia' AND v_evento.actor = v_uid
       AND v_evento.valor_centavos = p_contado_centavos
       AND v_evento.motivo = jsonb_build_object('troco_loja_centavos',p_troco_loja_centavos,'referencia',btrim(p_referencia))::text THEN
      RETURN jsonb_build_object('status','repetido','status_acerto',v_acerto.status);
    END IF;
    RETURN jsonb_build_object('status','chave_idempotencia_conflitante');
  END IF;
  IF v_acerto.status NOT IN ('solicitado','conferido_com_divergencia') THEN
    RETURN jsonb_build_object('status','inelegivel','motivo','acerto_ja_conferido_ou_finalizado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rotas_entrega WHERE id = v_acerto.rota_id
    AND motoboy_id = v_acerto.motoboy_id AND status = 'concluida' AND chegou_em IS NOT NULL) THEN
    RETURN jsonb_build_object('status','inelegivel','motivo','rota_nao_concluida');
  END IF;
  v_base := public.valores_acerto_rota(v_acerto.rota_id,v_acerto.user_id);
  IF v_base IS NULL THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','pedidos_ou_pagamentos_sem_confirmacao');
  END IF;
  -- Todo o dinheiro da rota volta ao caixa; taxas são pagas no turno.
  v_esperado := (v_base->>'produtos_dinheiro_centavos')::bigint
              + (v_base->>'taxas_dinheiro_centavos')::bigint + p_troco_loja_centavos;
  v_conferencia := jsonb_build_object('base_erp',v_base,
    'dinheiro_declarado_centavos',round(v_acerto.valor_caixa * 100)::bigint,
    'troco_proprio_declarado_centavos',round(v_acerto.troco_proprio * 100)::bigint,
    'contado_centavos',p_contado_centavos,'troco_loja_centavos',p_troco_loja_centavos,
    'esperado_centavos',v_esperado,'diferenca_centavos',p_contado_centavos - v_esperado,
    'referencia',btrim(p_referencia));
  IF p_contado_centavos <> v_esperado OR v_acerto.troco_proprio <> 0 THEN
    v_status := 'conferido_com_divergencia';
  ELSE
    v_status := 'em_conferencia';
  END IF;
  UPDATE public.acertos_rota SET conferencia = v_conferencia, status = v_status,
    conferido_por = v_uid, conferido_em = now(), updated_at = now(),
    valor_devolver_loja = v_esperado::numeric / 100,
    valor_devido_motoboy = (v_base->>'taxas_centavos')::numeric / 100
   WHERE id = p_acerto_id;
  INSERT INTO public.acertos_rota_eventos
    (acerto_id,tipo,valor_centavos,actor,motivo,chave_idempotencia)
  VALUES (p_acerto_id,'divergencia',p_contado_centavos,v_uid,
    jsonb_build_object('troco_loja_centavos',p_troco_loja_centavos,'referencia',btrim(p_referencia))::text,p_chave);
  RETURN jsonb_build_object('status','ok','status_acerto',v_status,'conferencia',v_conferencia);
END $function$
;
CREATE OR REPLACE FUNCTION public.confirmar_pagamento_turno_motoboy(p_turno uuid, p_valor bigint, p_meio text, p_efetivo_em timestamp with time zone, p_referencia text, p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_turno public.turnos_motoboy%ROWTYPE;
  v_conta uuid;
  v_ledger jsonb;
  v_evento public.turnos_motoboy_eventos%ROWTYPE;
  v_comp text;
  v_acerto public.acertos_rota%ROWTYPE;
  v_taxas numeric := 0;
  v_ref text := nullif(btrim(p_referencia),'');
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','negado'); END IF;
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'financeiro') THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_meio IS NULL OR p_meio NOT IN ('pix','dinheiro')
     OR p_efetivo_em IS NULL OR NOT isfinite(p_efetivo_em) OR p_efetivo_em > now()
     OR p_chave IS NULL OR length(btrim(p_chave)) NOT BETWEEN 1 AND 120
     OR length(v_ref) > 240 OR (p_meio = 'pix' AND v_ref IS NULL) THEN
    RETURN jsonb_build_object('status','dados_invalidos');
  END IF;
  SELECT * INTO v_turno FROM public.turnos_motoboy WHERE id = p_turno FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','inexistente'); END IF;
  IF v_uid = v_turno.user_id OR v_uid = v_turno.pagamento_autorizado_por THEN
    RETURN jsonb_build_object('status','negado');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave,1));
  SELECT * INTO v_evento FROM public.turnos_motoboy_eventos WHERE chave_idempotencia = 'pagamento:' || p_chave;
  IF FOUND THEN
    IF v_evento.turno_id = p_turno AND v_evento.tipo = 'pagamento' AND v_evento.actor = v_uid
       AND v_evento.valor_centavos = p_valor AND v_evento.forma_pagamento = p_meio
       AND v_turno.pago_em = p_efetivo_em AND v_turno.pagamento_referencia IS NOT DISTINCT FROM v_ref THEN
      RETURN jsonb_build_object('status','repetido','conta_id',v_turno.conta_pagamento_id);
    END IF;
    RETURN jsonb_build_object('status','chave_idempotencia_conflitante');
  END IF;
  IF v_turno.status = 'pago' OR v_turno.valor_pago <> 0 OR v_turno.conta_pagamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','ja_pago');
  END IF;
  IF v_turno.status <> 'pagamento_solicitado' OR v_turno.pagamento_autorizado_por IS NULL
     OR v_turno.pagamento_autorizado_em IS NULL OR p_valor <> round(v_turno.valor_devido_motoboy * 100)::bigint
     OR (p_efetivo_em AT TIME ZONE 'America/Sao_Paulo')::date < v_turno.data_turno THEN
    RETURN jsonb_build_object('status','inelegivel');
  END IF;
  FOR v_acerto IN
    SELECT a.* FROM public.acertos_rota a
    JOIN public.rotas_entrega r ON r.id = a.rota_id AND r.motoboy_id = a.motoboy_id
    WHERE r.motoboy_id = v_turno.motoboy_id AND r.status = 'concluida'
      AND (r.chegou_em AT TIME ZONE 'America/Sao_Paulo')::date = v_turno.data_turno
      AND a.status = 'aprovado'
    ORDER BY a.rota_id FOR UPDATE OF a
  LOOP
    IF v_acerto.conferencia IS NULL OR (v_acerto.conferencia->'base_erp')
        IS DISTINCT FROM public.valores_acerto_rota(v_acerto.rota_id,v_acerto.user_id) THEN
      RETURN jsonb_build_object('status','bloqueado','motivo','acerto_alterado_apos_autorizacao');
    END IF;
    v_taxas := v_taxas + v_acerto.valor_devido_motoboy;
  END LOOP;
  IF v_taxas IS DISTINCT FROM v_turno.taxas_entrega_acumuladas OR EXISTS (
    SELECT 1 FROM public.rotas_entrega r WHERE r.motoboy_id = v_turno.motoboy_id
      AND r.status = 'concluida' AND (r.chegou_em AT TIME ZONE 'America/Sao_Paulo')::date = v_turno.data_turno
      AND NOT EXISTS (SELECT 1 FROM public.acertos_rota a WHERE a.rota_id = r.id
        AND a.motoboy_id = r.motoboy_id AND a.status = 'aprovado' AND a.conferencia IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','taxas_ou_rotas_alteradas_apos_autorizacao');
  END IF;
  v_comp := to_char(p_efetivo_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM');
  IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE competencia = v_comp AND status = 'fechado') THEN
    RETURN jsonb_build_object('status','periodo_fechado');
  END IF;
  IF p_meio = 'pix' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(v_ref),2));
    IF EXISTS (SELECT 1 FROM public.turnos_motoboy WHERE forma_pagamento = 'pix' AND lower(pagamento_referencia) = lower(v_ref)) THEN
      RETURN jsonb_build_object('status','referencia_ja_utilizada');
    END IF;
  END IF;

  INSERT INTO public.contas (tipo,descricao,categoria,valor,meio,status,vencimento,created_by)
  VALUES ('pagar','Fechamento de turno motoboy','turno',p_valor::numeric/100,p_meio,'pendente',
          (p_efetivo_em AT TIME ZONE 'America/Sao_Paulo')::date,v_uid)
  RETURNING id INTO v_conta;
  v_ledger := public.registrar_pagamento_conta(v_conta,p_valor,'turno-efetivo:' || p_turno);
  IF v_ledger->>'status' IS DISTINCT FROM 'registrado' THEN
    RAISE EXCEPTION 'Falha na baixa do ledger de turno: %',v_ledger->>'status';
  END IF;
  -- Ajuste antes do commit para que o caixa use a data efetiva do pagamento.
  UPDATE public.conta_pagamento_eventos SET created_at = p_efetivo_em WHERE id = (v_ledger->>'pagamento_id')::uuid;
  UPDATE public.contas SET pago_em = p_efetivo_em WHERE id = v_conta;
  PERFORM set_config('app.financeiro_atomic_write','off',true);
  UPDATE public.turnos_motoboy SET status = 'pago', valor_pago = p_valor::numeric/100,
    pago_em = p_efetivo_em, forma_pagamento = p_meio, pagamento_referencia = v_ref,
    conta_pagamento_id = v_conta, updated_at = now() WHERE id = p_turno;
  INSERT INTO public.turnos_motoboy_eventos(turno_id,tipo,valor_centavos,forma_pagamento,actor,motivo,chave_idempotencia)
  VALUES (p_turno,'pagamento',p_valor,p_meio,v_uid,coalesce(v_ref,''),'pagamento:' || p_chave);
  RETURN jsonb_build_object('status','registrado','turno_id',p_turno,'conta_id',v_conta,'pago_em',p_efetivo_em);
END $function$
;
CREATE OR REPLACE FUNCTION public.registrar_pagamento_conta(p_conta_id uuid, p_valor_centavos bigint, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_conta public.contas%ROWTYPE;
  v_evento public.conta_pagamento_eventos%ROWTYPE;
  v_total bigint;
  v_pago bigint;
  v_saldo bigint;
  v_valor bigint;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_conta_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160
     OR (p_valor_centavos IS NOT NULL AND p_valor_centavos <= 0) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_evento FROM public.conta_pagamento_eventos
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_evento.tipo <> 'pagamento' OR v_evento.conta_id <> p_conta_id
       OR (p_valor_centavos IS NOT NULL AND v_evento.valor_centavos <> p_valor_centavos) THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    SELECT * INTO v_conta FROM public.contas WHERE id = p_conta_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conta_inexistente'); END IF;
    v_pago := v_conta.pagamento_abertura_centavos + COALESCE((
      SELECT sum(CASE WHEN e.tipo = 'pagamento' THEN e.valor_centavos ELSE -e.valor_centavos END)
        FROM public.conta_pagamento_eventos e WHERE e.conta_id = p_conta_id
    ), 0);
    RETURN jsonb_build_object('status', 'repetido', 'conta_id', p_conta_id,
      'valor_pago_centavos', v_pago, 'saldo_centavos', round(v_conta.valor * 100)::bigint - v_pago);
  END IF;

  SELECT * INTO v_conta FROM public.contas WHERE id = p_conta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conta_inexistente'); END IF;
  IF v_conta.status = 'cancelada' THEN RETURN jsonb_build_object('status', 'conta_cancelada'); END IF;
  v_total := round(v_conta.valor * 100)::bigint;
  v_pago := v_conta.pagamento_abertura_centavos + COALESCE((
    SELECT sum(CASE WHEN e.tipo = 'pagamento' THEN e.valor_centavos ELSE -e.valor_centavos END)
      FROM public.conta_pagamento_eventos e WHERE e.conta_id = p_conta_id
  ), 0);
  IF v_total <= 0 OR v_pago < 0 OR v_pago > v_total
     OR (v_conta.status = 'paga' AND v_pago <> v_total) THEN
    RETURN jsonb_build_object('status', 'revisao_necessaria');
  END IF;
  IF v_conta.tipo = 'receber' AND v_conta.pedido_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = v_conta.pedido_id AND p.pagamento_status = 'pago'
  ) THEN
    RETURN jsonb_build_object('status', 'pedido_ja_pago');
  END IF;
  v_saldo := v_total - v_pago;
  IF v_saldo = 0 THEN RETURN jsonb_build_object('status', 'sem_saldo'); END IF;
  v_valor := COALESCE(p_valor_centavos, v_saldo);
  IF v_valor <= 0 OR v_valor > v_saldo THEN
    RETURN jsonb_build_object('status', 'valor_superior_ao_saldo', 'saldo_centavos', v_saldo);
  END IF;

  INSERT INTO public.conta_pagamento_eventos (conta_id, tipo, valor_centavos, chave_idempotencia, actor)
  VALUES (p_conta_id, 'pagamento', v_valor, p_chave_idempotencia, auth.uid()) RETURNING * INTO v_evento;
  v_pago := v_pago + v_valor;
  v_saldo := v_total - v_pago;
  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  UPDATE public.contas SET valor_pago = v_pago::numeric / 100,
    status = CASE WHEN v_saldo = 0 THEN 'paga' WHEN v_conta.status = 'vencida' THEN 'vencida' ELSE 'pendente' END,
    pago_em = CASE WHEN v_saldo = 0 THEN now() ELSE NULL END, updated_at = now()
  WHERE id = p_conta_id;
  RETURN jsonb_build_object('status', 'registrado', 'conta_id', p_conta_id,
    'pagamento_id', v_evento.id, 'valor_centavos', v_valor,
    'valor_pago_centavos', v_pago, 'saldo_centavos', v_saldo);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.estornar_pagamento_conta(p_pagamento_id uuid, p_valor_centavos bigint, p_motivo text, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_pagamento public.conta_pagamento_eventos%ROWTYPE;
  v_existente public.conta_pagamento_eventos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_estornado bigint;
  v_pago bigint;
  v_total bigint;
  v_saldo bigint;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_pagamento_id IS NULL OR p_valor_centavos IS NULL OR p_valor_centavos <= 0
     OR p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160
     OR p_motivo IS NULL OR length(btrim(p_motivo)) = 0 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.conta_pagamento_eventos WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.tipo <> 'estorno' OR v_existente.pagamento_id <> p_pagamento_id
       OR v_existente.valor_centavos <> p_valor_centavos OR v_existente.motivo <> btrim(p_motivo) THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'estorno_id', v_existente.id);
  END IF;
  SELECT * INTO v_pagamento FROM public.conta_pagamento_eventos WHERE id = p_pagamento_id AND tipo = 'pagamento';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pagamento_inexistente'); END IF;
  SELECT * INTO v_conta FROM public.contas WHERE id = v_pagamento.conta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conta_inexistente'); END IF;
  v_estornado := COALESCE((SELECT sum(valor_centavos) FROM public.conta_pagamento_eventos
    WHERE tipo = 'estorno' AND pagamento_id = p_pagamento_id), 0);
  IF v_estornado + p_valor_centavos > v_pagamento.valor_centavos THEN
    RETURN jsonb_build_object('status', 'estorno_superior_ao_pagamento');
  END IF;
  INSERT INTO public.conta_pagamento_eventos
    (conta_id, tipo, valor_centavos, chave_idempotencia, pagamento_id, motivo, actor)
  VALUES (v_conta.id, 'estorno', p_valor_centavos, p_chave_idempotencia,
    p_pagamento_id, btrim(p_motivo), auth.uid()) RETURNING id INTO v_existente.id;
  v_total := round(v_conta.valor * 100)::bigint;
  v_pago := v_conta.pagamento_abertura_centavos + COALESCE((
    SELECT sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END)
      FROM public.conta_pagamento_eventos WHERE conta_id = v_conta.id
  ), 0);
  IF v_pago < 0 OR v_pago > v_total THEN
    RAISE EXCEPTION 'saldo_financeiro_inconsistente' USING ERRCODE = '22000';
  END IF;
  v_saldo := v_total - v_pago;
  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  UPDATE public.contas SET valor_pago = v_pago::numeric / 100,
    status = CASE WHEN v_saldo = 0 THEN 'paga' WHEN status = 'vencida' THEN 'vencida' ELSE 'pendente' END,
    pago_em = CASE WHEN v_saldo = 0 THEN COALESCE(pago_em, now()) ELSE NULL END,
    updated_at = now()
  WHERE id = v_conta.id;
  RETURN jsonb_build_object('status', 'estornado', 'estorno_id', v_existente.id,
    'valor_pago_centavos', v_pago, 'saldo_centavos', v_saldo);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cancelar_conta_financeira(p_conta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_conta public.contas%ROWTYPE; v_pago bigint;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  SELECT * INTO v_conta FROM public.contas WHERE id = p_conta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conta_inexistente'); END IF;
  IF v_conta.status = 'cancelada' THEN RETURN jsonb_build_object('status', 'repetido'); END IF;
  v_pago := v_conta.pagamento_abertura_centavos + COALESCE((
    SELECT sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END)
      FROM public.conta_pagamento_eventos WHERE conta_id = p_conta_id
  ), 0);
  IF v_pago <> 0 THEN RETURN jsonb_build_object('status', 'historico_pago_exige_estorno'); END IF;
  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  UPDATE public.contas SET status = 'cancelada', pago_em = NULL, updated_at = now() WHERE id = p_conta_id;
  RETURN jsonb_build_object('status', 'cancelada', 'conta_id', p_conta_id);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.conciliar_extrato_atomico(p_extrato_id uuid, p_vinculo_tipo text, p_vinculo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_extrato public.extratos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE;
  v_resultado jsonb;
  v_centavos bigint;
  v_confirmado uuid;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_extrato_id IS NULL OR p_vinculo_id IS NULL OR p_vinculo_tipo IS NULL
     OR p_vinculo_tipo NOT IN ('conta', 'pedido') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  SELECT * INTO v_extrato FROM public.extratos WHERE id = p_extrato_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'extrato_inexistente'); END IF;
  IF v_extrato.status = 'conciliado' AND v_extrato.vinculo_tipo = p_vinculo_tipo
     AND v_extrato.vinculo_id = p_vinculo_id THEN
    RETURN jsonb_build_object('status', 'repetido', 'extrato_id', p_extrato_id);
  END IF;
  IF v_extrato.status <> 'pendente' THEN
    RETURN jsonb_build_object('status', 'extrato_indisponivel');
  END IF;
  IF v_extrato.valor = 0 THEN RETURN jsonb_build_object('status', 'valor_extrato_invalido'); END IF;
  v_centavos := abs(round(v_extrato.valor * 100)::bigint);
  -- Usa a mesma ordem (chave antes da conta) que o RPC de pagamento, evitando
  -- ciclos de locks entre uma baixa manual e a conciliação do mesmo extrato.
  IF p_vinculo_tipo = 'conta' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('extrato:' || p_extrato_id::text, 0));
  END IF;

  IF p_vinculo_tipo = 'conta' THEN
    SELECT * INTO v_conta FROM public.contas WHERE id = p_vinculo_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conta_inexistente'); END IF;
    IF (v_conta.tipo = 'receber' AND v_extrato.valor < 0)
       OR (v_conta.tipo = 'pagar' AND v_extrato.valor > 0) THEN
      RETURN jsonb_build_object('status', 'sinal_incompativel');
    END IF;
    v_resultado := public.registrar_pagamento_conta(p_vinculo_id, v_centavos,
      'extrato:' || p_extrato_id::text);
    IF v_resultado->>'status' NOT IN ('registrado', 'repetido') THEN RETURN v_resultado; END IF;
  ELSE
    SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_vinculo_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;
    IF v_extrato.valor < 0 OR v_pedido.pagamento_status <> 'pendente'
       OR v_centavos <> round(v_pedido.total * 100)::bigint THEN
      RETURN jsonb_build_object('status', 'pedido_nao_conciliavel');
    END IF;
    UPDATE public.pedidos SET pagamento_status = 'pago', pagamento_em = now()
      WHERE id = p_vinculo_id AND pagamento_status = 'pendente' RETURNING id INTO v_confirmado;
    IF v_confirmado IS NULL THEN RETURN jsonb_build_object('status', 'pedido_alterado'); END IF;
  END IF;
  UPDATE public.extratos SET status = 'conciliado', vinculo_tipo = p_vinculo_tipo,
    vinculo_id = p_vinculo_id WHERE id = p_extrato_id AND status = 'pendente';
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato_alterado_durante_conciliacao' USING ERRCODE = '40001'; END IF;
  RETURN jsonb_build_object('status', 'conciliado', 'extrato_id', p_extrato_id,
    'vinculo_tipo', p_vinculo_tipo, 'vinculo_id', p_vinculo_id, 'pagamento', v_resultado);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(p_tipo text, p_valor_centavos bigint, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_existente public.conta_pagamento_eventos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_categoria text;
  v_descricao text;
  v_tipo_conta text;
  v_evento public.conta_pagamento_eventos%ROWTYPE;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('sangria', 'suprimento')
     OR p_valor_centavos IS NULL OR p_valor_centavos <= 0
     OR p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.conta_pagamento_eventos WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    SELECT * INTO v_conta FROM public.contas WHERE id = v_existente.conta_id;
    IF v_existente.tipo <> 'pagamento' OR v_existente.valor_centavos <> p_valor_centavos
       OR v_conta.categoria <> p_tipo THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'conta_id', v_conta.id);
  END IF;
  v_categoria := p_tipo;
  v_descricao := CASE WHEN p_tipo = 'sangria' THEN 'Sangria de caixa' ELSE 'Suprimento de caixa' END;
  v_tipo_conta := CASE WHEN p_tipo = 'sangria' THEN 'pagar' ELSE 'receber' END;
  INSERT INTO public.contas (tipo, descricao, categoria, valor, valor_pago, meio, status, pago_em, created_by)
  VALUES (v_tipo_conta, v_descricao, v_categoria, p_valor_centavos::numeric / 100,
    0, 'dinheiro', 'pendente', NULL, auth.uid()) RETURNING * INTO v_conta;
  INSERT INTO public.conta_pagamento_eventos (conta_id, tipo, valor_centavos, chave_idempotencia, actor)
  VALUES (v_conta.id, 'pagamento', p_valor_centavos, p_chave_idempotencia, auth.uid()) RETURNING * INTO v_evento;
  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  UPDATE public.contas SET valor_pago = p_valor_centavos::numeric / 100,
    status = 'paga', pago_em = now(), updated_at = now() WHERE id = v_conta.id;
  RETURN jsonb_build_object('status', 'registrado', 'conta_id', v_conta.id,
    'pagamento_id', v_evento.id, 'valor_pago_centavos', p_valor_centavos, 'saldo_centavos', 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido(p_pedido_id uuid, p_valor_centavos bigint, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_existente public.pedido_pagamento_eventos%ROWTYPE;
  v_total bigint;
  v_pago bigint;
  v_saldo bigint;
  v_valor bigint;
  v_evento public.pedido_pagamento_eventos%ROWTYPE;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_pedido_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160
     OR (p_valor_centavos IS NOT NULL AND p_valor_centavos <= 0) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.pedido_pagamento_eventos
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.tipo <> 'pagamento' OR v_existente.pedido_id <> p_pedido_id
       OR (p_valor_centavos IS NOT NULL AND v_existente.valor_centavos <> p_valor_centavos) THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'evento_id', v_existente.id,
      'valor_centavos', v_existente.valor_centavos);
  END IF;
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;
  IF v_pedido.status = 'cancelado' OR v_pedido.pagamento_status = 'reembolsado' THEN
    RETURN jsonb_build_object('status', 'pedido_indisponivel');
  END IF;
  v_total := round(v_pedido.total * 100)::bigint;
  v_pago := COALESCE((SELECT sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END)
    FROM public.pedido_pagamento_eventos WHERE pedido_id = p_pedido_id), 0);
  IF v_total <= 0 OR v_pago < 0 OR v_pago > v_total THEN
    RETURN jsonb_build_object('status', 'revisao_necessaria');
  END IF;
  v_saldo := v_total - v_pago;
  IF v_saldo = 0 THEN RETURN jsonb_build_object('status', 'sem_saldo'); END IF;
  v_valor := COALESCE(p_valor_centavos, v_saldo);
  IF v_valor <= 0 OR v_valor > v_saldo THEN
    RETURN jsonb_build_object('status', 'valor_superior_ao_saldo', 'saldo_centavos', v_saldo);
  END IF;
  INSERT INTO public.pedido_pagamento_eventos
    (pedido_id, tipo, valor_centavos, forma_pagamento, chave_idempotencia, actor)
  VALUES (p_pedido_id, 'pagamento', v_valor, COALESCE(v_pedido.forma_pagamento::text, 'outro'),
    p_chave_idempotencia, auth.uid()) RETURNING * INTO v_evento;
  v_pago := v_pago + v_valor;
  v_saldo := v_total - v_pago;
  UPDATE public.pedidos SET
    pagamento_status = CASE WHEN v_saldo = 0 THEN 'pago' ELSE 'pendente' END,
    pagamento_em = CASE WHEN v_saldo = 0 THEN now() ELSE NULL END
  WHERE id = p_pedido_id;
  RETURN jsonb_build_object('status', 'registrado', 'evento_id', v_evento.id,
    'valor_centavos', v_valor, 'valor_pago_centavos', v_pago, 'saldo_centavos', v_saldo);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.estornar_pagamento_pedido(p_pagamento_id uuid, p_valor_centavos bigint, p_motivo text, p_chave_idempotencia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_pagamento public.pedido_pagamento_eventos%ROWTYPE;
  v_existente public.pedido_pagamento_eventos%ROWTYPE;
  v_estornado bigint;
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_pagamento_id IS NULL OR p_valor_centavos IS NULL OR p_valor_centavos <= 0
     OR p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160
     OR p_motivo IS NULL OR length(btrim(p_motivo)) = 0 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.pedido_pagamento_eventos
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.tipo <> 'estorno' OR v_existente.pagamento_id <> p_pagamento_id
       OR v_existente.valor_centavos <> p_valor_centavos OR v_existente.motivo <> btrim(p_motivo) THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'estorno_id', v_existente.id);
  END IF;
  SELECT * INTO v_pagamento FROM public.pedido_pagamento_eventos
   WHERE id = p_pagamento_id AND tipo = 'pagamento';
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pagamento_inexistente'); END IF;
  PERFORM 1 FROM public.pedidos WHERE id = v_pagamento.pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;
  PERFORM 1 FROM public.pedido_pagamento_eventos WHERE id = p_pagamento_id FOR UPDATE;
  v_estornado := COALESCE((SELECT sum(valor_centavos) FROM public.pedido_pagamento_eventos
    WHERE tipo = 'estorno' AND pagamento_id = p_pagamento_id), 0);
  IF v_estornado + p_valor_centavos > v_pagamento.valor_centavos THEN
    RETURN jsonb_build_object('status', 'estorno_superior_ao_pagamento');
  END IF;
  INSERT INTO public.pedido_pagamento_eventos
    (pedido_id, tipo, valor_centavos, forma_pagamento, chave_idempotencia,
     pagamento_id, motivo, actor)
  VALUES (v_pagamento.pedido_id, 'estorno', p_valor_centavos, v_pagamento.forma_pagamento,
    p_chave_idempotencia, p_pagamento_id, btrim(p_motivo), auth.uid())
  RETURNING * INTO v_existente;
  RETURN jsonb_build_object('status', 'estornado', 'estorno_id', v_existente.id,
    'pedido_id', v_pagamento.pedido_id, 'valor_centavos', p_valor_centavos,
    'created_at', v_existente.created_at);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.estornar_conta(p_conta_id uuid,p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contas%ROWTYPE; p record; r jsonb; q bigint; n integer:=0; ids uuid[]; pid uuid;
BEGIN
 IF NOT neia_operacao.tem_capacidade(auth.uid(),'executar_financeiro') THEN RAISE EXCEPTION 'sem_permissao_estorno' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')) THEN
  RAISE EXCEPTION 'sem_permissao_estorno' USING ERRCODE='42501'; END IF;
 IF p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
 -- Mesma ordem da RPC financeira: chaves de idempotencia antes da conta.
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.conta_pagamento_eventos WHERE conta_id=p_conta_id AND tipo='pagamento';
 FOREACH pid IN ARRAY coalesce(ids,'{}'::uuid[]) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('compat-estorno:'||p_conta_id||':'||pid,0));
 END LOOP;
 SELECT * INTO c FROM public.contas WHERE id=p_conta_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conta_nao_encontrada'; END IF;
 IF c.pagamento_abertura_centavos IS NULL OR c.pagamento_abertura_centavos<>0 THEN
  RAISE EXCEPTION 'historico_sem_parcelas_comprovadas'; END IF;
 IF EXISTS(SELECT 1 FROM public.conta_pagamento_eventos WHERE conta_id=c.id AND tipo='pagamento' AND NOT(id=ANY(coalesce(ids,'{}'::uuid[])))) THEN
  RAISE EXCEPTION 'pagamento_concorrente_repetir_operacao' USING ERRCODE='40001'; END IF;
 FOR p IN SELECT e.id,e.valor_centavos FROM public.conta_pagamento_eventos e WHERE e.conta_id=c.id AND e.tipo='pagamento' ORDER BY e.id LOOP
  SELECT p.valor_centavos-coalesce(sum(valor_centavos),0) INTO q FROM public.conta_pagamento_eventos WHERE tipo='estorno' AND pagamento_id=p.id;
  IF q>0 THEN
   r:=public.estornar_pagamento_conta(p.id,q,btrim(p_motivo),'compat-estorno:'||c.id||':'||p.id);
   IF r->>'status' NOT IN ('estornado','repetido') THEN RAISE EXCEPTION 'estorno_nao_confirmado'; END IF;
   n:=n+1;
  END IF;
 END LOOP;
 IF n>0 THEN INSERT INTO public.admin_logs(actor,acao,detalhe) VALUES(auth.uid(),'conta_estornada','ledger:'||c.id); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido_status_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_pago bigint;
  v_total bigint;
  v_saldo bigint;
BEGIN
 IF auth.uid() IS NOT NULL AND NEW.pagamento_status='pago' AND (TG_OP='INSERT' OR OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status) AND NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN RAISE EXCEPTION 'confirmacao_recebimento_nao_autorizada' USING ERRCODE='42501'; END IF;
  IF NEW.pagamento_status <> 'pago' OR
     (TG_OP = 'UPDATE' AND OLD.pagamento_status = 'pago') THEN
    RETURN NEW;
  END IF;
  v_total := round(NEW.total * 100)::bigint;
  IF v_total <= 0 THEN RAISE EXCEPTION 'valor_pedido_invalido_para_pagamento'; END IF;
  SELECT COALESCE(sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END), 0)
    INTO v_pago FROM public.pedido_pagamento_eventos WHERE pedido_id = NEW.id;
  IF v_pago < 0 OR v_pago > v_total THEN RAISE EXCEPTION 'ledger_pedido_inconsistente'; END IF;
  v_saldo := v_total - v_pago;
  IF v_saldo > 0 THEN
    INSERT INTO public.pedido_pagamento_eventos
      (pedido_id, tipo, valor_centavos, forma_pagamento, chave_idempotencia, actor, created_at)
    VALUES (NEW.id, 'pagamento', v_saldo, COALESCE(NEW.forma_pagamento::text, 'outro'),
      'pedido:confirmacao:' || NEW.id::text, auth.uid(), COALESCE(NEW.pagamento_em, now()))
    ON CONFLICT (chave_idempotencia) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;
COMMIT;
