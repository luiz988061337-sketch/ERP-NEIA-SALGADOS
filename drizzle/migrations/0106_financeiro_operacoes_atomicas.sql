-- 0106 — operações financeiras atômicas. Incremental; ainda não aplicada.
-- Homologar em banco isolado/staging antes de qualquer cutover.
-- Saldos antigos permanecem como abertura, sem inventar eventos de pagamento.

ALTER TABLE public.contas
  ADD COLUMN IF NOT EXISTS pagamento_abertura_centavos bigint;

-- Migração histórica: a guarda 0083 bloqueia alterações em competências
-- fechadas. Permite exclusivamente preencher a nova coluna com o valor
-- derivado de valor_pago, sem alterar qualquer outro campo da conta. A
-- condição deixa de ser possível após o backfill e o NOT NULL abaixo.
CREATE OR REPLACE FUNCTION public.contas_fechamento_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_comp text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.pagamento_abertura_centavos IS NULL
     AND NEW.pagamento_abertura_centavos = round(COALESCE(OLD.valor_pago, 0) * 100)::bigint
     AND (to_jsonb(NEW) - 'pagamento_abertura_centavos')
         IS NOT DISTINCT FROM (to_jsonb(OLD) - 'pagamento_abertura_centavos') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_comp := COALESCE(to_char(OLD.vencimento, 'YYYY-MM'), to_char(OLD.created_at, 'YYYY-MM'));
  ELSE
    v_comp := COALESCE(to_char(NEW.vencimento, 'YYYY-MM'), to_char(NEW.created_at, 'YYYY-MM'));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fechamentos_mensais
     WHERE competencia = v_comp AND status = 'fechado'
  ) THEN
    RAISE EXCEPTION 'mes_fechado:%', v_comp;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

UPDATE public.contas
   SET pagamento_abertura_centavos = round(COALESCE(valor_pago, 0) * 100)::bigint
 WHERE pagamento_abertura_centavos IS NULL;
ALTER TABLE public.contas
  ALTER COLUMN pagamento_abertura_centavos SET DEFAULT 0,
  ALTER COLUMN pagamento_abertura_centavos SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.conta_pagamento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES public.contas(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('pagamento', 'estorno')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  pagamento_id uuid REFERENCES public.conta_pagamento_eventos(id) ON DELETE RESTRICT,
  motivo text NOT NULL DEFAULT '',
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conta_pagamento_evento_origem_ck CHECK (
    (tipo = 'pagamento' AND pagamento_id IS NULL AND motivo = '') OR
    (tipo = 'estorno' AND pagamento_id IS NOT NULL AND length(btrim(motivo)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS conta_pagamento_eventos_conta_idx
  ON public.conta_pagamento_eventos (conta_id, created_at, id);
CREATE INDEX IF NOT EXISTS conta_pagamento_eventos_estorno_idx
  ON public.conta_pagamento_eventos (pagamento_id) WHERE tipo = 'estorno';

ALTER TABLE public.conta_pagamento_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conta pagamentos leitura financeiro" ON public.conta_pagamento_eventos;
CREATE POLICY "conta pagamentos leitura financeiro" ON public.conta_pagamento_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
REVOKE ALL ON public.conta_pagamento_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conta_pagamento_eventos TO authenticated;
GRANT ALL ON public.conta_pagamento_eventos TO service_role;

-- Ledger de recebimentos dos pedidos. Pagamentos antigos só entram no ledger
-- quando pagamento_em fornece um instante confiável; os demais ficam sem data.
CREATE TABLE IF NOT EXISTS public.pedido_pagamento_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('pagamento', 'estorno')),
  valor_centavos bigint NOT NULL CHECK (valor_centavos > 0),
  forma_pagamento text NOT NULL DEFAULT 'outro',
  chave_idempotencia text NOT NULL UNIQUE CHECK (length(btrim(chave_idempotencia)) BETWEEN 1 AND 160),
  pagamento_id uuid REFERENCES public.pedido_pagamento_eventos(id) ON DELETE RESTRICT,
  motivo text NOT NULL DEFAULT '',
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_pagamento_evento_origem_ck CHECK (
    (tipo = 'pagamento' AND pagamento_id IS NULL AND motivo = '') OR
    (tipo = 'estorno' AND pagamento_id IS NOT NULL AND length(btrim(motivo)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS pedido_pagamento_eventos_data_idx
  ON public.pedido_pagamento_eventos (created_at, pedido_id);
ALTER TABLE public.pedido_pagamento_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pedido pagamentos leitura financeiro" ON public.pedido_pagamento_eventos;
CREATE POLICY "pedido pagamentos leitura financeiro" ON public.pedido_pagamento_eventos
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
REVOKE ALL ON public.pedido_pagamento_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedido_pagamento_eventos TO authenticated;
GRANT ALL ON public.pedido_pagamento_eventos TO service_role;

INSERT INTO public.pedido_pagamento_eventos
  (pedido_id, tipo, valor_centavos, forma_pagamento, chave_idempotencia, created_at)
SELECT id, 'pagamento', round(total * 100)::bigint, COALESCE(forma_pagamento::text, 'outro'),
  'pedido:legacy:' || id::text, pagamento_em
FROM public.pedidos
WHERE pagamento_status = 'pago' AND pagamento_em IS NOT NULL AND total > 0
ON CONFLICT (chave_idempotencia) DO NOTHING;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido(
  p_pedido_id uuid, p_valor_centavos bigint, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_existente public.pedido_pagamento_eventos%ROWTYPE;
  v_total bigint;
  v_pago bigint;
  v_saldo bigint;
  v_valor bigint;
  v_evento public.pedido_pagamento_eventos%ROWTYPE;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido_status_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pago bigint;
  v_total bigint;
  v_saldo bigint;
BEGIN
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
$$;
DROP TRIGGER IF EXISTS pedidos_pagamento_ledger_trg ON public.pedidos;
CREATE TRIGGER pedidos_pagamento_ledger_trg
  AFTER INSERT OR UPDATE OF pagamento_status, pagamento_em, total, forma_pagamento ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_pagamento_pedido_status_ledger();

-- Registra devoluções efetivamente realizadas no ledger do pedido. A chamada
-- não movimenta gateways nem altera o estado comercial do pedido.
CREATE OR REPLACE FUNCTION public.estornar_pagamento_pedido(
  p_pagamento_id uuid, p_valor_centavos bigint, p_motivo text, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pagamento public.pedido_pagamento_eventos%ROWTYPE;
  v_existente public.pedido_pagamento_eventos%ROWTYPE;
  v_estornado bigint;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.estornar_pagamento_pedido(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_pedido(uuid, bigint, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) TO authenticated;

-- Rejeita escritas diretas pelo cliente nos campos de baixa. Os RPCs abaixo
-- definem esta marca transacional apenas enquanto atualizam ledger + conta.
CREATE OR REPLACE FUNCTION public.proteger_baixa_direta_conta()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_rpc_owner name;
BEGIN
  SELECT r.rolname INTO v_rpc_owner
    FROM pg_proc f JOIN pg_roles r ON r.oid = f.proowner
   WHERE f.oid = 'public.registrar_pagamento_conta(uuid,bigint,text)'::regprocedure;
  -- A GUC é transacional, mas pode ser definida pelo próprio chamador. Só a
  -- aceitamos enquanto executa sob o mesmo owner da RPC financeira confiável.
  IF current_setting('app.financeiro_atomic_write', true) IS DISTINCT FROM 'on'
     OR v_rpc_owner IS NULL OR current_user IS DISTINCT FROM v_rpc_owner THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.valor_pago, 0) <> 0 OR COALESCE(NEW.pagamento_abertura_centavos, 0) <> 0
         OR NEW.status = 'paga' OR NEW.pago_em IS NOT NULL THEN
        RAISE EXCEPTION 'baixa_financeira_exige_rpc' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.valor_pago IS DISTINCT FROM OLD.valor_pago
       OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
       OR NEW.pagamento_abertura_centavos IS DISTINCT FROM OLD.pagamento_abertura_centavos
       OR ((NEW.valor IS DISTINCT FROM OLD.valor OR NEW.tipo IS DISTINCT FROM OLD.tipo
            OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id)
           AND (OLD.pagamento_abertura_centavos > 0 OR EXISTS (
             SELECT 1 FROM public.conta_pagamento_eventos e WHERE e.conta_id = OLD.id
           ))) THEN
      RAISE EXCEPTION 'baixa_financeira_exige_rpc' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contas_proteger_baixa_insert ON public.contas;
CREATE TRIGGER contas_proteger_baixa_insert BEFORE INSERT ON public.contas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_baixa_direta_conta();
DROP TRIGGER IF EXISTS contas_proteger_baixa_update ON public.contas;
CREATE TRIGGER contas_proteger_baixa_update BEFORE UPDATE OF status, valor_pago, pago_em,
  pagamento_abertura_centavos, valor, tipo, pedido_id ON public.contas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_baixa_direta_conta();

CREATE OR REPLACE FUNCTION public.registrar_pagamento_conta(
  p_conta_id uuid, p_valor_centavos bigint, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_conta public.contas%ROWTYPE;
  v_evento public.conta_pagamento_eventos%ROWTYPE;
  v_total bigint;
  v_pago bigint;
  v_saldo bigint;
  v_valor bigint;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.estornar_pagamento_conta(
  p_pagamento_id uuid, p_valor_centavos bigint, p_motivo text, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pagamento public.conta_pagamento_eventos%ROWTYPE;
  v_existente public.conta_pagamento_eventos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_estornado bigint;
  v_pago bigint;
  v_total bigint;
  v_saldo bigint;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.cancelar_conta_financeira(p_conta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conta public.contas%ROWTYPE; v_pago bigint;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(
  p_tipo text, p_valor_centavos bigint, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_existente public.conta_pagamento_eventos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_categoria text;
  v_descricao text;
  v_tipo_conta text;
  v_evento public.conta_pagamento_eventos%ROWTYPE;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.conciliar_extrato_atomico(
  p_extrato_id uuid, p_vinculo_tipo text, p_vinculo_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_extrato public.extratos%ROWTYPE;
  v_conta public.contas%ROWTYPE;
  v_pedido public.pedidos%ROWTYPE;
  v_resultado jsonb;
  v_centavos bigint;
  v_confirmado uuid;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_conta(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estornar_pagamento_conta(uuid, bigint, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_conta_financeira(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_movimento_caixa(text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conciliar_extrato_atomico(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_conta(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_conta(uuid, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_conta_financeira(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimento_caixa(text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_extrato_atomico(uuid, text, uuid) TO authenticated;
