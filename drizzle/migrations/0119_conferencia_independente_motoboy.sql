-- Conferência independente de acerto de rota e revalidação do ledger na aprovação.
ALTER TABLE public.acertos_rota ADD COLUMN IF NOT EXISTS conferencia jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS acertos_rota_unico_ativo_idx ON public.acertos_rota(rota_id)
WHERE status <> 'rejeitado';

-- Helper interno. Pedidos e lançamentos são lidos pelo servidor, não pelo motoboy.
CREATE OR REPLACE FUNCTION public.valores_acerto_rota(p_rota uuid, p_usuario uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_valores jsonb;
BEGIN
  PERFORM p.id FROM public.pedidos p JOIN public.rota_pedidos rp ON rp.pedido_id = p.id
   WHERE rp.rota_id = p_rota ORDER BY p.id FOR UPDATE OF p;
  WITH pedidos AS (
    SELECT p.*, round(p.total * 100)::bigint AS total_centavos,
      round(p.taxa_entrega * 100)::bigint AS taxa_centavos,
      e.total_ledger, e.meio, e.meios
    FROM public.rota_pedidos rp JOIN public.pedidos p ON p.id = rp.pedido_id
    CROSS JOIN LATERAL (
      SELECT sum(CASE WHEN l.tipo = 'pagamento' THEN l.valor_centavos ELSE -l.valor_centavos END) AS total_ledger,
        min(l.forma_pagamento) AS meio, count(DISTINCT l.forma_pagamento) AS meios
      FROM public.pedido_pagamento_eventos l WHERE l.pedido_id = p.id
    ) e
    WHERE rp.rota_id = p_rota
  )
  SELECT jsonb_build_object(
    'pedidos', count(*),
    'produtos_dinheiro_centavos', coalesce(sum(total_centavos - taxa_centavos) FILTER (WHERE meio = 'dinheiro'),0),
    'taxas_dinheiro_centavos', coalesce(sum(taxa_centavos) FILTER (WHERE meio = 'dinheiro'),0),
    'pix_loja_centavos', coalesce(sum(total_centavos) FILTER (WHERE meio = 'pix'),0),
    'taxas_centavos', sum(taxa_centavos),
    'pedidos_confirmados', jsonb_agg(jsonb_build_object('id',id,'total_centavos',total_centavos,
      'taxa_centavos',taxa_centavos,'meio',meio) ORDER BY id))
  INTO v_valores FROM pedidos
  HAVING count(*) > 0 AND bool_and(
    (status = 'entregue' AND tipo_entrega = 'entrega' AND motoboy_id = p_usuario
      AND retirada_rota_id = p_rota AND retirada_por = p_usuario AND retirada_em IS NOT NULL
      AND pagamento_status = 'pago' AND total_centavos > 0
      AND taxa_centavos BETWEEN 0 AND total_centavos AND total_centavos = total_ledger
      AND meios = 1 AND meio IN ('dinheiro','pix','credito','debito','cartao')) IS TRUE
  );
  RETURN v_valores;
END $$;
REVOKE ALL ON FUNCTION public.valores_acerto_rota(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.conferir_acerto_rota_independente(
  p_acerto_id uuid, p_chave text, p_contado_centavos bigint,
  p_troco_loja_centavos bigint, p_referencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acerto public.acertos_rota%ROWTYPE;
  v_evento public.acertos_rota_eventos%ROWTYPE;
  v_base jsonb;
  v_conferencia jsonb;
  v_esperado bigint;
  v_status public.acerto_rota_status;
BEGIN
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
END $$;

REVOKE ALL ON FUNCTION public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferir_acerto_rota_independente(uuid,text,bigint,bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION public.conferir_acerto_rota(uuid,text,boolean,boolean,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_aprovacao_acerto_verificado()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.conferencia IS NULL OR OLD.conferido_por IS NULL OR NEW.aprovado_por IS NULL
       OR NEW.aprovado_por IN (OLD.conferido_por,OLD.user_id)
       OR (OLD.conferencia->'base_erp') IS DISTINCT FROM public.valores_acerto_rota(OLD.rota_id,OLD.user_id) THEN
      RAISE EXCEPTION 'Acerto exige conferência independente válida e responsável distinto' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validar_aprovacao_acerto_verificado
BEFORE UPDATE OF status ON public.acertos_rota
FOR EACH ROW EXECUTE FUNCTION public.validar_aprovacao_acerto_verificado();
