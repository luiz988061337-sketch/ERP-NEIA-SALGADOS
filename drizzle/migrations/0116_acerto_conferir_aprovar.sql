-- 0116: acerto financeiro por rota — conferência e aprovação (Fase F, lote 2).
-- Constrói sobre 0115 (acertos_rota, acertos_rota_eventos).
-- Regras de separação de funções:
--   - Somente caixa/financeiro confere.
--   - Responsável aprova, e deve ser diferente de quem conferiu.
--   - Motoboy nunca aprova o próprio acerto.
-- Idempotente (DROP/CREATE OR REPLACE). Somente homologação local/isolada.

-- =============================================
-- 1. RPC: conferir_acerto_rota (caixa / financeiro)
-- =============================================
CREATE OR REPLACE FUNCTION public.conferir_acerto_rota(
  p_acerto_id uuid,
  p_chave_idempotencia text,
  p_conferido boolean,
  p_divergencia boolean DEFAULT false,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acerto public.acertos_rota%ROWTYPE;
  v_existente public.acertos_rota_eventos%ROWTYPE;
  v_novo_status public.acerto_rota_status;
  v_evento_id uuid;
BEGIN
  -- 1. Autenticação e papel conferente (admin/financeiro; atendente lê mas não confere).
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'financeiro') OR public.has_role(v_uid, 'admin')) THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Validação de dados.
  IF p_acerto_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'dados_obrigatorios');
  END IF;

  -- 3. Trava o acerto e verifica existência.
  SELECT * INTO v_acerto FROM public.acertos_rota WHERE id = p_acerto_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'acerto_nao_encontrado');
  END IF;

  -- 4. Idempotência da conferência (antes da validação de status, para que
  --    repetição com mesma chave sempre retorne 'repetido').
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.acertos_rota_eventos WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'repetido', 'acerto_id', v_acerto.id, 'status_acerto', v_acerto.status);
  END IF;

  -- 5. Estado deve ser 'solicitado' para conferir.
  IF v_acerto.status <> 'solicitado' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'acerto_ja_conferido_ou_finalizado');
  END IF;

  -- 5. Determina novo status.
  IF p_divergencia THEN
    v_novo_status := 'conferido_com_divergencia';
  ELSIF p_conferido THEN
    v_novo_status := 'em_conferencia';
  ELSE
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'conferencia_nao_definida');
  END IF;

  -- 6. Atualiza acerto.
  UPDATE public.acertos_rota
     SET status = v_novo_status,
         conferido_em = now(),
         conferido_por = v_uid,
         motivo = COALESCE(btrim(p_motivo), ''),
         updated_at = now()
   WHERE id = p_acerto_id;

  -- 7. Evento de auditoria da conferência.
  INSERT INTO public.acertos_rota_eventos (
    acerto_id, tipo, valor_centavos, forma_pagamento, actor, motivo, chave_idempotencia
  ) VALUES (
    p_acerto_id, 'divergencia',
    round(COALESCE(v_acerto.valor_caixa, 0) * 100)::bigint, 'dinheiro', v_uid,
    CASE WHEN p_divergencia THEN 'Conferência com divergência' ELSE 'Conferência realizada' END,
    p_chave_idempotencia
  ) RETURNING id INTO v_evento_id;

  RETURN jsonb_build_object(
    'status', 'ok', 'acerto_id', p_acerto_id, 'status_acerto', v_novo_status,
    'conferido_por', v_uid, 'conferido_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.conferir_acerto_rota(uuid, text, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferir_acerto_rota(uuid, text, boolean, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.conferir_acerto_rota IS '0116: caixa confere acerto de rota. Idempotente.';

-- =============================================
-- 2. RPC: aprovar_acerto_rota (responsável, diferente do conferente)
-- =============================================
CREATE OR REPLACE FUNCTION public.aprovar_acerto_rota(
  p_acerto_id uuid,
  p_chave_idempotencia text,
  p_aprovado boolean,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acerto public.acertos_rota%ROWTYPE;
  v_existente public.acertos_rota_eventos%ROWTYPE;
  v_novo_status public.acerto_rota_status;
BEGIN
  -- 1. Autenticação e papel responsável (admin/financeiro).
  IF v_uid IS NULL OR NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'financeiro')) THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Validação de dados.
  IF p_acerto_id IS NULL OR p_chave_idempotencia IS NULL
     OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'dados_obrigatorios');
  END IF;

  -- 3. Trava o acerto e verifica estado.
  SELECT * INTO v_acerto FROM public.acertos_rota WHERE id = p_acerto_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'acerto_nao_encontrado');
  END IF;

  -- 4. Separation of duties: aprovador não pode ser o conferente.
  IF v_uid = v_acerto.user_id OR v_uid = v_acerto.conferido_por THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'auto_aprovacao_nao_permitida');
  END IF;

  -- 5. Idempotência da aprovação/rejeição (antes da validação de status).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.acertos_rota_eventos WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.acerto_id <> p_acerto_id OR v_existente.tipo <> 'compensacao'
       OR v_existente.actor IS DISTINCT FROM v_uid
       OR p_aprovado IS DISTINCT FROM (v_acerto.status = 'aprovado') THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'acerto_id', v_acerto.id, 'status_acerto', v_acerto.status);
  END IF;

  -- 6. Estado deve ser conferido (com ou sem divergência).
  IF v_acerto.status NOT IN ('em_conferencia', 'conferido_com_divergencia') THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'acerto_nao_conferido');
  END IF;

  -- 7. Determina novo status.
  IF p_aprovado IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'decisao_obrigatoria');
  ELSIF NOT p_aprovado THEN
    v_novo_status := 'rejeitado';
  ELSIF v_acerto.status = 'conferido_com_divergencia' THEN
    RETURN jsonb_build_object('status', 'bloqueado', 'motivo', 'divergencia_nao_resolvida');
  ELSE
    v_novo_status := 'aprovado';
  END IF;

  -- 8. Atualiza acerto.
  UPDATE public.acertos_rota
     SET status = v_novo_status,
         aprovado_em = now(),
         aprovado_por = v_uid,
         motivo = COALESCE(btrim(p_motivo), ''),
         updated_at = now()
   WHERE id = p_acerto_id;

  -- 9. Evento de auditoria da aprovação/rejeição.
  INSERT INTO public.acertos_rota_eventos (
    acerto_id, tipo, valor_centavos, forma_pagamento, actor, motivo, chave_idempotencia
  ) VALUES (
    p_acerto_id, 'compensacao',
    COALESCE((to_jsonb(v_acerto)->'conferencia'->>'contado_centavos')::bigint,
             round(v_acerto.valor_caixa * 100)::bigint), 'dinheiro', v_uid,
    CASE WHEN NOT p_aprovado THEN 'Acerto rejeitado'
         ELSE 'Acerto aprovado pelo responsável' END,
    p_chave_idempotencia
  );

  RETURN jsonb_build_object(
    'status', 'ok', 'acerto_id', p_acerto_id, 'status_acerto', v_novo_status,
    'aprovado_por', v_uid, 'aprovado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.aprovar_acerto_rota(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_acerto_rota(uuid, text, boolean, text) TO authenticated;
COMMENT ON FUNCTION public.aprovar_acerto_rota IS '0116: responsável aprova ou rejeita acerto conferido. Não pode auto-aprovar. Idempotente.';

-- Nota: o papel 'caixa' não existe no enum app_role (admin, producao, motoboy,
-- cliente, contador). A conferência usa admin/financeiro até que 'caixa' seja
-- adicionado ao enum e às policies de acertos_rota.
