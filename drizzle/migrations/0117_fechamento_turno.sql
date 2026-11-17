-- 0117: fechamento de turno do motoboy (Fase F, lote 3).
-- Constrói sobre 0072 (caixa_sessoes, contas), 0106 (ledger), 0115/0116 (acerto).
-- Regras: taxas de entrega pagas no fechamento do turno; valor fixo R$ 40
-- (R$ 60 véspera de Natal); pagamento Pix ou dinheiro; responsável confirma.
-- Idempotente. Somente homologação local/isolada.

-- =============================================
-- 1. Status e tipo de fechamento de turno
-- =============================================
DO $$ BEGIN
CREATE TYPE public.turno_fechamento_status AS ENUM (
  'aberto',
  'pagamento_solicitado',
  'pago',
  'encerrado'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE TYPE public.turno_fechamento_tipo AS ENUM (
  'normal',
  'vespera_natal'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Turno de caixa do motoboy
-- =============================================
CREATE TABLE IF NOT EXISTS public.turnos_motoboy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  data_turno date NOT NULL DEFAULT CURRENT_DATE,
  tipo public.turno_fechamento_tipo NOT NULL DEFAULT 'normal',
  valor_fixo_turno numeric(12,2) NOT NULL DEFAULT 40.00 CHECK (valor_fixo_turno >= 0),
  taxas_entrega_acumuladas numeric(12,2) NOT NULL DEFAULT 0 CHECK (taxas_entrega_acumuladas >= 0),
  valor_devido_motoboy numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_devido_motoboy >= 0),
  valor_pago numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0),
  forma_pagamento text NOT NULL DEFAULT 'dinheiro'
    CHECK (forma_pagamento IN ('dinheiro','pix')),
  status public.turno_fechamento_status NOT NULL DEFAULT 'aberto',
  solicitado_em timestamptz,
  pago_em timestamptz,
  encerrado_em timestamptz,
  encerrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  motivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (motoboy_id, data_turno)
);

CREATE INDEX IF NOT EXISTS turnos_motoboy_idx ON public.turnos_motoboy (motoboy_id, data_turno, status);
CREATE INDEX IF NOT EXISTS turnos_motoboy_chave_idx ON public.turnos_motoboy (chave_idempotencia);

ALTER TABLE public.turnos_motoboy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "turnos leitura staff" ON public.turnos_motoboy;
CREATE POLICY "turnos leitura staff" ON public.turnos_motoboy
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "turnos leitura motoboy" ON public.turnos_motoboy;
CREATE POLICY "turnos leitura motoboy" ON public.turnos_motoboy
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "turnos inserir motoboy" ON public.turnos_motoboy;
CREATE POLICY "turnos inserir motoboy" ON public.turnos_motoboy
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.turnos_motoboy FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.turnos_motoboy TO authenticated;
GRANT INSERT ON public.turnos_motoboy TO authenticated;
GRANT ALL ON public.turnos_motoboy TO service_role;

COMMENT ON TABLE public.turnos_motoboy IS '0117: turno de caixa do motoboy. Taxas pagas no fechamento; valor fixo R$ 40 (R$ 60 véspera de Natal).';

-- =============================================
-- 3. Eventos de fechamento de turno
-- =============================================
CREATE TABLE IF NOT EXISTS public.turnos_motoboy_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id uuid NOT NULL REFERENCES public.turnos_motoboy(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('abertura','solicitacao_pagamento','pagamento','encerramento')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  forma_pagamento text NOT NULL DEFAULT 'dinheiro'
    CHECK (forma_pagamento IN ('dinheiro','pix')),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT '',
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turnos_eventos_turno_idx ON public.turnos_motoboy_eventos (turno_id, created_at);

ALTER TABLE public.turnos_motoboy_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "turnos eventos leitura staff" ON public.turnos_motoboy_eventos;
CREATE POLICY "turnos eventos leitura staff" ON public.turnos_motoboy_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "turnos eventos inserir" ON public.turnos_motoboy_eventos;
CREATE POLICY "turnos eventos inserir" ON public.turnos_motoboy_eventos
  FOR INSERT TO authenticated
  WITH CHECK (true);

REVOKE ALL ON public.turnos_motoboy_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.turnos_motoboy_eventos TO authenticated;
GRANT INSERT ON public.turnos_motoboy_eventos TO authenticated;
GRANT ALL ON public.turnos_motoboy_eventos TO service_role;

COMMENT ON TABLE public.turnos_motoboy_eventos IS '0117: eventos de auditoria do fechamento de turno.';

-- =============================================
-- 4. RPC: solicitar_fechamento_turno (motoboy)
-- =============================================
CREATE OR REPLACE FUNCTION public.solicitar_fechamento_turno(
  p_data_turno date,
  p_tipo public.turno_fechamento_tipo,
  p_chave_idempotencia text,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid := auth.uid();
  v_motoboy_id uuid;
  v_existente public.turnos_motoboy%ROWTYPE;
  v_turno_id uuid;
  v_valor_fixo numeric(12,2);
  v_taxas_acumuladas numeric(12,2);
  v_valor_devido numeric(12,2);
BEGIN
  -- 1. Autenticação e papel motoboy.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Validação de dados.
  IF p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'chave_idempotencia_obrigatoria');
  END IF;
  IF p_data_turno IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'data_turno_obrigatoria');
  END IF;

  -- 3. Ponte user_id -> motoboy.
  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- 4. Valor fixo conforme tipo de turno.
  IF p_tipo = 'vespera_natal' THEN
    v_valor_fixo := 60.00;
  ELSE
    v_valor_fixo := 40.00;
  END IF;

  -- 5. Taxas acumuladas de rotas concluídas do motoboy no dia (somente aprovadas).
  SELECT COALESCE(sum(a.valor_devido_motoboy), 0) INTO v_taxas_acumuladas
    FROM public.acertos_rota a
    JOIN public.rotas_entrega r ON r.id = a.rota_id AND r.motoboy_id = a.motoboy_id
   WHERE a.motoboy_id = v_motoboy_id
     AND a.status = 'aprovado'
     AND r.status = 'concluida'
     AND (r.chegou_em AT TIME ZONE 'America/Sao_Paulo')::date = p_data_turno;

  v_valor_devido := v_valor_fixo + v_taxas_acumuladas;

  -- 6. Idempotência por chave (mesmo motoboy, mesma data, mesma chave).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.turnos_motoboy WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.motoboy_id IS DISTINCT FROM v_motoboy_id
       OR v_existente.data_turno IS DISTINCT FROM p_data_turno THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante', 'motivo', 'chave_com_dados_diferentes');
    END IF;
    RETURN jsonb_build_object(
      'status', 'repetido', 'turno_id', v_existente.id,
      'status_turno', v_existente.status, 'valor_devido_centavos', round(v_existente.valor_devido_motoboy * 100)::bigint
    );
  END IF;

  -- 7. Não permite abertura de turno duplicado para o mesmo dia.
  IF EXISTS (
    SELECT 1 FROM public.turnos_motoboy
     WHERE motoboy_id = v_motoboy_id AND data_turno = p_data_turno
  ) THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'turno_ja_existe_para_o_dia');
  END IF;

  -- 8. Insere turno aberto.
  INSERT INTO public.turnos_motoboy (
    motoboy_id, user_id, data_turno, tipo, valor_fixo_turno,
    taxas_entrega_acumuladas, valor_devido_motoboy, valor_pago,
    status, chave_idempotencia, motivo
  ) VALUES (
    v_motoboy_id, v_user_id, p_data_turno, p_tipo, v_valor_fixo,
    v_taxas_acumuladas, v_valor_devido, 0,
    'aberto', p_chave_idempotencia, COALESCE(btrim(p_motivo), '')
  ) RETURNING id INTO v_turno_id;

  -- 9. Evento de abertura.
  INSERT INTO public.turnos_motoboy_eventos (
    turno_id, tipo, valor_centavos, forma_pagamento, actor, motivo, chave_idempotencia
  ) VALUES (
    v_turno_id, 'abertura',
    round(v_valor_devido * 100)::bigint, 'dinheiro', v_uid,
    'Abertura de turno', 'turno:' || v_turno_id::text || ':abertura'
  );

  RETURN jsonb_build_object(
    'status', 'registrado', 'turno_id', v_turno_id, 'status_turno', 'aberto',
    'valor_fixo_turno_centavos', round(v_valor_fixo * 100)::bigint,
    'taxas_entrega_acumuladas_centavos', round(v_taxas_acumuladas * 100)::bigint,
    'valor_devido_centavos', round(v_valor_devido * 100)::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_fechamento_turno(date, public.turno_fechamento_tipo, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fechamento_turno(date, public.turno_fechamento_tipo, text, text) TO authenticated;
COMMENT ON FUNCTION public.solicitar_fechamento_turno IS '0117: motoboy solicita abertura/fechamento de turno. Valor fixo R$ 40 (R$ 60 vespera de Natal) + taxas acumuladas. Idempotente.';

-- =============================================
-- 5. RPC: pagar_fechamento_turno (motoboy paga; responsável confirma)
-- =============================================
CREATE OR REPLACE FUNCTION public.pagar_fechamento_turno(
  p_turno_id uuid,
  p_valor_centavos bigint,
  p_chave_idempotencia text,
  p_forma_pagamento text DEFAULT 'dinheiro',
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid := auth.uid();
  v_motoboy_id uuid;
  v_turno public.turnos_motoboy%ROWTYPE;
  v_existente public.turnos_motoboy_eventos%ROWTYPE;
  v_conta_id uuid;
  v_resultado jsonb;
BEGIN
  -- 1. Autenticação e papel motoboy.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Validação de dados.
  IF p_turno_id IS NULL OR p_valor_centavos IS NULL OR p_valor_centavos <= 0
     OR p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160
     OR p_forma_pagamento NOT IN ('dinheiro','pix') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'dados_obrigatorios');
  END IF;

  -- 3. Ponte user_id -> motoboy.
  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- 4. Trava o turno e verifica existência e propriedade.
  SELECT * INTO v_turno FROM public.turnos_motoboy WHERE id = p_turno_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'turno_nao_encontrado');
  END IF;
  IF v_turno.motoboy_id IS DISTINCT FROM v_motoboy_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'turno_de_outro_motoboy');
  END IF;

  -- 5. Idempotência do pagamento (antes da validação de estado/valor).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.turnos_motoboy_eventos WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'repetido', 'turno_id', p_turno_id, 'status_turno', v_turno.status);
  END IF;

  -- 6. Estado deve estar aberto para pagamento.
  IF v_turno.status <> 'aberto' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'turno_nao_esta_aberto');
  END IF;
  IF p_valor_centavos > round(v_turno.valor_devido_motoboy * 100)::bigint THEN
    RETURN jsonb_build_object('status', 'valor_superior_ao_devido', 'devido_centavos', round(v_turno.valor_devido_motoboy * 100)::bigint);
  END IF;

  -- 6. Cria conta a pagar no ledger financeiro (0072/0106) para rastrear o pagamento.
  INSERT INTO public.contas (tipo, descricao, categoria, valor, valor_pago, meio, status, pago_em, created_by)
  VALUES ('pagar', 'Fechamento de turno motoboy', 'turno', p_valor_centavos::numeric / 100,
    0, p_forma_pagamento, 'pendente', NULL, v_uid) RETURNING id INTO v_conta_id;

  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  UPDATE public.contas SET valor_pago = p_valor_centavos::numeric / 100,
    status = 'paga', pago_em = now(), updated_at = now() WHERE id = v_conta_id;

  -- 7. Atualiza turno com o pagamento.
  IF p_valor_centavos >= round(v_turno.valor_devido_motoboy * 100)::bigint THEN
    UPDATE public.turnos_motoboy
       SET valor_pago = v_turno.valor_devido_motoboy,
           forma_pagamento = p_forma_pagamento,
           pago_em = now(),
           status = 'pago',
           updated_at = now()
     WHERE id = p_turno_id;
  ELSE
    UPDATE public.turnos_motoboy
       SET valor_pago = p_valor_centavos::numeric / 100,
           forma_pagamento = p_forma_pagamento,
           pago_em = now(),
           status = 'pagamento_solicitado',
           updated_at = now()
     WHERE id = p_turno_id;
  END IF;

  -- 8. Evento de auditoria do pagamento.
  INSERT INTO public.turnos_motoboy_eventos (
    turno_id, tipo, valor_centavos, forma_pagamento, actor, motivo, chave_idempotencia
  ) VALUES (
    p_turno_id, 'pagamento', p_valor_centavos, p_forma_pagamento, v_uid,
    COALESCE(btrim(p_motivo), 'Pagamento de fechamento de turno'), p_chave_idempotencia
  );

  RETURN jsonb_build_object(
    'status', 'ok', 'turno_id', p_turno_id, 'conta_id', v_conta_id,
    'valor_pago_centavos', p_valor_centavos,
    'valor_devido_centavos', round(v_turno.valor_devido_motoboy * 100)::bigint,
    'saldo_centavos', round(v_turno.valor_devido_motoboy * 100)::bigint - p_valor_centavos
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pagar_fechamento_turno(uuid, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagar_fechamento_turno(uuid, bigint, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.pagar_fechamento_turno IS '0117: motoboy registra pagamento do fechamento de turno. Ledger via contas (0072/0106). Idempotente.';
