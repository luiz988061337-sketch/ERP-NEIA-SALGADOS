-- Fechamento autorizado e baixa auditada de pagamento já realizado pelo Financeiro.
ALTER TABLE public.turnos_motoboy
  ADD COLUMN IF NOT EXISTS pagamento_autorizado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS pagamento_autorizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS autorizacao_turno_referencia text,
  ADD COLUMN IF NOT EXISTS pagamento_referencia text,
  ADD COLUMN IF NOT EXISTS conta_pagamento_id uuid REFERENCES public.contas(id);

CREATE UNIQUE INDEX IF NOT EXISTS turnos_motoboy_conta_unica_idx
ON public.turnos_motoboy(conta_pagamento_id) WHERE conta_pagamento_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS turnos_motoboy_referencia_pix_idx
ON public.turnos_motoboy(lower(pagamento_referencia))
WHERE forma_pagamento = 'pix' AND pagamento_referencia IS NOT NULL;

CREATE OR REPLACE FUNCTION public.autorizar_pagamento_turno_motoboy(
  p_turno uuid, p_valor_conferido bigint, p_referencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_turno public.turnos_motoboy%ROWTYPE;
  v_taxas numeric;
  v_fixo numeric;
  v_pendencias integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin') THEN
    RETURN jsonb_build_object('status','negado');
  END IF;
  IF p_valor_conferido IS NULL OR p_referencia IS NULL OR length(btrim(p_referencia)) NOT BETWEEN 1 AND 240 THEN
    RETURN jsonb_build_object('status','dados_invalidos');
  END IF;
  SELECT * INTO v_turno FROM public.turnos_motoboy WHERE id = p_turno FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','inexistente'); END IF;
  IF v_uid = v_turno.user_id THEN RETURN jsonb_build_object('status','negado'); END IF;
  IF v_turno.status = 'pagamento_solicitado' AND v_turno.pagamento_autorizado_por = v_uid
     AND v_turno.autorizacao_turno_referencia = btrim(p_referencia)
     AND round(v_turno.valor_devido_motoboy * 100)::bigint = p_valor_conferido THEN
    RETURN jsonb_build_object('status','repetido');
  END IF;
  IF v_turno.status <> 'aberto' OR v_turno.valor_pago <> 0
     OR v_turno.data_turno > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object('status','inelegivel');
  END IF;
  IF (v_turno.tipo = 'vespera_natal') IS DISTINCT FROM
     (extract(month FROM v_turno.data_turno) = 12 AND extract(day FROM v_turno.data_turno) = 24) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','tipo_turno_invalido');
  END IF;
  IF EXISTS (SELECT 1 FROM public.rotas_entrega r WHERE r.motoboy_id = v_turno.motoboy_id
       AND r.status IN ('preparando','em_rota')) THEN
    RETURN jsonb_build_object('status','bloqueado','motivo','rota_em_aberto');
  END IF;

  SELECT count(*) FILTER (WHERE a.id IS NULL OR a.conferido_por = v_uid),
         coalesce(sum(a.valor_devido_motoboy),0)
    INTO v_pendencias,v_taxas
    FROM public.rotas_entrega r
    LEFT JOIN public.acertos_rota a ON a.rota_id = r.id AND a.motoboy_id = r.motoboy_id
      AND a.status = 'aprovado' AND a.conferencia IS NOT NULL
    WHERE r.motoboy_id = v_turno.motoboy_id AND r.status = 'concluida'
      AND (r.chegou_em AT TIME ZONE 'America/Sao_Paulo')::date = v_turno.data_turno;
  IF v_pendencias > 0 THEN RETURN jsonb_build_object('status','bloqueado','motivo','rotas_sem_acerto_independente'); END IF;

  v_fixo := CASE WHEN v_turno.tipo = 'vespera_natal' THEN 60 ELSE 40 END;
  IF round((v_fixo + v_taxas) * 100)::bigint <> p_valor_conferido THEN
    RETURN jsonb_build_object('status','valor_incompativel','valor_centavos',round((v_fixo + v_taxas) * 100)::bigint);
  END IF;
  UPDATE public.turnos_motoboy SET status = 'pagamento_solicitado', solicitado_em = now(),
    pagamento_autorizado_por = v_uid, pagamento_autorizado_em = now(), autorizacao_turno_referencia = btrim(p_referencia),
    valor_fixo_turno = v_fixo, taxas_entrega_acumuladas = v_taxas, valor_devido_motoboy = v_fixo + v_taxas,
    updated_at = now() WHERE id = p_turno;
  INSERT INTO public.turnos_motoboy_eventos (turno_id,tipo,valor_centavos,actor,motivo,chave_idempotencia)
  VALUES (p_turno,'solicitacao_pagamento',p_valor_conferido,v_uid,btrim(p_referencia),'autorizacao:' || p_turno);
  RETURN jsonb_build_object('status','autorizado','turno_id',p_turno);
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_pagamento_turno_motoboy(
  p_turno uuid, p_valor bigint, p_meio text, p_efetivo_em timestamptz, p_referencia text, p_chave text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.autorizar_pagamento_turno_motoboy(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.autorizar_pagamento_turno_motoboy(uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_pagamento_turno_motoboy(uuid,bigint,text,timestamptz,text,text) TO authenticated;

-- Identificação do beneficiário na conferência, sem expor dados bancários.
CREATE OR REPLACE FUNCTION public.identificar_motoboys_acerto(p_ids uuid[])
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')) THEN
    RAISE EXCEPTION 'Identificação disponível somente para o Financeiro' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) > 40 THEN
    RAISE EXCEPTION 'Selecione até 40 motoboys' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT m.id,m.nome FROM public.motoboys m WHERE m.id = ANY(p_ids);
END $$;
REVOKE ALL ON FUNCTION public.identificar_motoboys_acerto(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.identificar_motoboys_acerto(uuid[]) TO authenticated;
