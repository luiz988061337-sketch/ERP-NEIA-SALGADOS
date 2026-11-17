-- 0115: acerto financeiro por rota do motoboy (Fase F, lote 1).
-- Constrói sobre 0072 (caixa_sessoes, contas), 0083 (acertos_motoboy) e 0106
-- (ledger com idempotência). Não cria financeiro paralelo.
-- Regras: motoboy solicita; caixa confere; responsável diferente aprova.
-- Idempotente (DROP/CREATE). Somente homologação local/isolada.

-- =============================================
-- 1. Status e tipo de acerto por rota
-- =============================================
DO $$ BEGIN
CREATE TYPE public.acerto_rota_status AS ENUM (
  'solicitado',
  'em_conferencia',
  'aprovado',
  'rejeitado',
  'conferido_com_divergencia'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE TYPE public.acerto_rota_tipo AS ENUM (
  'dinheiro_produtos',
  'troco_loja',
  'troco_proprio',
  'taxa_entrega',
  'reembolso_troco',
  'compensacao',
  'divergencia'
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 2. Acerto por rota (prestação de contas do motoboy)
-- =============================================
CREATE TABLE IF NOT EXISTS public.acertos_rota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas_entrega(id) ON DELETE RESTRICT,
  motoboy_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  numero text NOT NULL DEFAULT '',
  pedidos_entregues integer NOT NULL DEFAULT 0 CHECK (pedidos_entregues >= 0),
  dinheiro_produtos numeric(12,2) NOT NULL DEFAULT 0 CHECK (dinheiro_produtos >= 0),
  pix_informativo numeric(12,2) NOT NULL DEFAULT 0 CHECK (pix_informativo >= 0),
  dinheiro_recebido_clientes numeric(12,2) NOT NULL DEFAULT 0 CHECK (dinheiro_recebido_clientes >= 0),
  troco_loja numeric(12,2) NOT NULL DEFAULT 0 CHECK (troco_loja >= 0),
  troco_restante numeric(12,2) NOT NULL DEFAULT 0 CHECK (troco_restante >= 0),
  troco_proprio numeric(12,2) NOT NULL DEFAULT 0 CHECK (troco_proprio >= 0),
  troco_utilizado numeric(12,2) NOT NULL DEFAULT 0 CHECK (troco_utilizado >= 0),
  taxas_entrega numeric(12,2) NOT NULL DEFAULT 0 CHECK (taxas_entrega >= 0),
  valor_caixa numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_caixa >= 0),
  valor_devido_motoboy numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_devido_motoboy >= 0),
  valor_devolver_loja numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_devolver_loja >= 0),
  status public.acerto_rota_status NOT NULL DEFAULT 'solicitado',
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  conferido_em timestamptz,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT '',
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acertos_rota_motoboy_idx ON public.acertos_rota (motoboy_id, status, created_at);
CREATE INDEX IF NOT EXISTS acertos_rota_rota_idx ON public.acertos_rota (rota_id);
CREATE INDEX IF NOT EXISTS acertos_rota_chave_idx ON public.acertos_rota (chave_idempotencia);

ALTER TABLE public.acertos_rota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acertos rota leitura staff" ON public.acertos_rota;
CREATE POLICY "acertos rota leitura staff" ON public.acertos_rota
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "acertos rota leitura motoboy" ON public.acertos_rota;
CREATE POLICY "acertos rota leitura motoboy" ON public.acertos_rota
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "acertos rota inserir motoboy" ON public.acertos_rota;
CREATE POLICY "acertos rota inserir motoboy" ON public.acertos_rota
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.acertos_rota FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.acertos_rota TO authenticated;
GRANT INSERT ON public.acertos_rota TO authenticated;
GRANT ALL ON public.acertos_rota TO service_role;

COMMENT ON TABLE public.acertos_rota IS '0115: acerto financeiro por rota. Motoboy solicita, caixa confere, responsável aprova.';

-- =============================================
-- 3. Eventos de auditoria do acerto
-- =============================================
CREATE TABLE IF NOT EXISTS public.acertos_rota_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acerto_id uuid NOT NULL REFERENCES public.acertos_rota(id) ON DELETE CASCADE,
  tipo public.acerto_rota_tipo NOT NULL,
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  forma_pagamento text NOT NULL DEFAULT 'dinheiro'
    CHECK (forma_pagamento IN ('dinheiro','pix','credito','debito','transferencia','outro')),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT '',
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS acertos_rota_eventos_acerto_idx ON public.acertos_rota_eventos (acerto_id, created_at);

ALTER TABLE public.acertos_rota_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acertos eventos leitura staff" ON public.acertos_rota_eventos;
CREATE POLICY "acertos eventos leitura staff" ON public.acertos_rota_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'atendente'));

DROP POLICY IF EXISTS "acertos eventos inserir" ON public.acertos_rota_eventos;
CREATE POLICY "acertos eventos inserir" ON public.acertos_rota_eventos
  FOR INSERT TO authenticated
  WITH CHECK (true);

REVOKE ALL ON public.acertos_rota_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.acertos_rota_eventos TO authenticated;
GRANT INSERT ON public.acertos_rota_eventos TO authenticated;
GRANT ALL ON public.acertos_rota_eventos TO service_role;

COMMENT ON TABLE public.acertos_rota_eventos IS '0115: eventos de auditoria do acerto por rota (conferência, aprovação, rejeição, divergência).';

-- =============================================
-- 4. RPC: solicitar_acerto_rota (motoboy)
-- =============================================
CREATE OR REPLACE FUNCTION public.solicitar_acerto_rota(
  p_rota_id uuid,
  p_chave_idempotencia text,
  p_numero text DEFAULT '',
  p_pedidos_entregues integer DEFAULT 0,
  p_dinheiro_produtos numeric(12,2) DEFAULT 0,
  p_pix_informativo numeric(12,2) DEFAULT 0,
  p_dinheiro_recebido_clientes numeric(12,2) DEFAULT 0,
  p_troco_loja numeric(12,2) DEFAULT 0,
  p_troco_restante numeric(12,2) DEFAULT 0,
  p_troco_proprio numeric(12,2) DEFAULT 0,
  p_troco_utilizado numeric(12,2) DEFAULT 0,
  p_taxas_entrega numeric(12,2) DEFAULT 0,
  p_valor_caixa numeric(12,2) DEFAULT 0,
  p_valor_devido_motoboy numeric(12,2) DEFAULT 0,
  p_valor_devolver_loja numeric(12,2) DEFAULT 0,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid := auth.uid();
  v_motoboy_id uuid;
  v_rota_status text;
  v_rota_motoboy uuid;
  v_existente public.acertos_rota%ROWTYPE;
  v_acerto_id uuid;
  v_valor_devido numeric(12,2);
  v_valor_devolver numeric(12,2);
BEGIN
  -- 1. Autenticação e papel motoboy.
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'motoboy') THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'autenticacao_ou_papel_invalido');
  END IF;

  -- 2. Validação de dados obrigatórios.
  IF p_chave_idempotencia IS NULL OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'chave_idempotencia_obrigatoria');
  END IF;
  IF p_pedidos_entregues IS NULL OR p_pedidos_entregues < 0 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'pedidos_entregues_invalido');
  END IF;
  IF p_dinheiro_produtos IS NULL OR p_dinheiro_produtos < 0
     OR p_pix_informativo IS NULL OR p_pix_informativo < 0
     OR p_dinheiro_recebido_clientes IS NULL OR p_dinheiro_recebido_clientes < 0
     OR p_troco_loja IS NULL OR p_troco_loja < 0
     OR p_troco_restante IS NULL OR p_troco_restante < 0
     OR p_troco_proprio IS NULL OR p_troco_proprio < 0
     OR p_troco_utilizado IS NULL OR p_troco_utilizado < 0
     OR p_taxas_entrega IS NULL OR p_taxas_entrega < 0
     OR p_valor_caixa IS NULL OR p_valor_caixa < 0 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'motivo', 'valores_financeiros_invalidos');
  END IF;

  -- 3. Valores do motoboy (ponte user_id).
  SELECT m.id INTO v_motoboy_id FROM public.motoboys m WHERE m.user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'motoboy_sem_cadastro');
  END IF;

  -- 4. Trava a rota: propriedade e status concluída.
  SELECT r.status, r.motoboy_id INTO v_rota_status, v_rota_motoboy
    FROM public.rotas_entrega r
   WHERE r.id = p_rota_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'inexistente', 'motivo', 'rota_nao_encontrada');
  END IF;
  IF v_rota_motoboy IS DISTINCT FROM v_motoboy_id THEN
    RETURN jsonb_build_object('status', 'negado', 'motivo', 'rota_de_outro_motoboy');
  END IF;
  IF v_rota_status <> 'concluida' THEN
    RETURN jsonb_build_object('status', 'inelegivel', 'motivo', 'rota_nao_concluida');
  END IF;

  -- 5. Idempotência por chave (mesma chave = mesma solicitação).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.acertos_rota WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.rota_id IS DISTINCT FROM p_rota_id
       OR v_existente.motoboy_id IS DISTINCT FROM v_motoboy_id
       OR v_existente.valor_caixa IS DISTINCT FROM p_valor_caixa THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante', 'motivo', 'chave_com_dados_diferentes');
    END IF;
    RETURN jsonb_build_object(
      'status', 'repetido', 'acerto_id', v_existente.id,
      'status_acerto', v_existente.status, 'valor_caixa', v_existente.valor_caixa
    );
  END IF;

  -- A trava da rota serializa qualquer nova solicitação. Somente uma rejeição
  -- permite abrir outro acerto para a mesma rota.
  IF EXISTS (
    SELECT 1 FROM public.acertos_rota
     WHERE rota_id = p_rota_id AND status <> 'rejeitado'
  ) THEN
    RETURN jsonb_build_object('status', 'conflito', 'motivo', 'rota_ja_possui_acerto_final');
  END IF;

  -- 7. Cálculo de valores devidos/devolver (regras de negócio no servidor).
  v_valor_devido := GREATEST(p_taxas_entrega, 0);
  v_valor_devolver := GREATEST(p_dinheiro_recebido_clientes - p_troco_loja - p_troco_proprio, 0);

  -- 8. Insere acerto solicitado (mesma transação dos locks).
  INSERT INTO public.acertos_rota (
    rota_id, motoboy_id, user_id, numero, pedidos_entregues,
    dinheiro_produtos, pix_informativo, dinheiro_recebido_clientes,
    troco_loja, troco_restante, troco_proprio, troco_utilizado,
    taxas_entrega, valor_caixa,
    valor_devido_motoboy, valor_devolver_loja,
    status, motivo, chave_idempotencia
  ) VALUES (
    p_rota_id, v_motoboy_id, v_user_id, COALESCE(btrim(p_numero), ''), p_pedidos_entregues,
    p_dinheiro_produtos, p_pix_informativo, p_dinheiro_recebido_clientes,
    p_troco_loja, p_troco_restante, p_troco_proprio, p_troco_utilizado,
    p_taxas_entrega, p_valor_caixa,
    v_valor_devido, v_valor_devolver,
    'solicitado', COALESCE(btrim(p_motivo), ''), p_chave_idempotencia
  ) RETURNING id INTO v_acerto_id;

  -- 9. Evento de auditoria de solicitação.
  INSERT INTO public.acertos_rota_eventos (
    acerto_id, tipo, valor_centavos, forma_pagamento, actor, motivo, chave_idempotencia
  ) VALUES (
    v_acerto_id, 'dinheiro_produtos',
    round(p_dinheiro_produtos * 100)::bigint, 'dinheiro', v_uid,
    'Solicitação de acerto de rota', 'acerto:' || v_acerto_id::text || ':solicitado'
  );

  RETURN jsonb_build_object(
    'status', 'registrado', 'acerto_id', v_acerto_id, 'status_acerto', 'solicitado',
    'valor_devido_motoboy_centavos', round(v_valor_devido * 100)::bigint,
    'valor_devolver_loja_centavos', round(v_valor_devolver * 100)::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_acerto_rota(uuid, text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_acerto_rota(uuid, text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) TO authenticated;
COMMENT ON FUNCTION public.solicitar_acerto_rota IS '0115: motoboy solicita acerto de rota concluída. Idempotente por chave.';
