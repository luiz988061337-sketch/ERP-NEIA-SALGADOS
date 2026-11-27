-- Reconciliação documentada do histórico de 0139/0140/0141 em homologação.
-- O DDL já foi aplicado por SQL direto com destino declarado e barreira; este SQL
-- apenas registra as versões. Nenhuma migration é reaplicada e 0134-0136 não são tocadas.
BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20261127210000', 'recebimento_balcao_atendente_0139', ARRAY[$mig$-- 0139 — recebimento no balcão pela atendente autorizada.
--
-- A 0106 instalada em homologação (lflzlcqinarrcgncafol) exige a capacidade
-- `receber_pagamento` de TODOS os papéis. Esta migration preserva essa guarda e
-- amplia somente a lista de papéis aceitos, incluindo a atendente. Nenhum Admin
-- ou Financeiro sem a capacidade passa a ser autorizado.
--
-- Substitui apenas as duas regras da 0136/0106 que impediam o fluxo aprovado:
--   * a consulta exigia status 'pronto' + conferido_em e exigia Admin para
--     'pode_receber';
--   * a RPC de pagamento aceitava só Admin/Financeiro, mesmo quando a atendente
--     tinha a capacidade financeira `receber_pagamento`.
--
-- Preserva: ledger `pedido_pagamento_eventos`, idempotência por chave, travamento
-- de linha, limites de valor, gatilho de quitação da 0136 e autorização separada
-- para concluir a retirada. Nenhuma coluna financeira é escrita diretamente.
--
-- Reversão segura (somente com autorização e janela coordenada): executar o
-- corpo anterior de `consultar_recebimento_retirada` da 0136 e o corpo anterior
-- de `registrar_pagamento_pedido` da 0106 exatamente como registrado em
-- homologação. Não apagar o registro de migration nem reaplicar 0135/0136.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.consultar_recebimento_retirada(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ator uuid := auth.uid();
  pedido public.pedidos%ROWTYPE;
  pago bigint;
  total bigint;
BEGIN
  IF ator IS NULL OR NOT (public.has_role(ator, 'admin') OR public.has_role(ator, 'atendente')) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;

  -- Recebimento pode ocorrer durante a produção; a retirada continua exigindo
  -- conferência e quitação nas suas próprias regras.
  SELECT * INTO pedido FROM public.pedidos WHERE id = p_pedido_id
    AND tipo_entrega = 'retirada'
    AND status IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy')
    AND retirado_em IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_indisponivel'); END IF;

  total := round(pedido.total * 100)::bigint;
  SELECT coalesce(sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END), 0)
    INTO pago FROM public.pedido_pagamento_eventos WHERE pedido_id = pedido.id;

  IF pedido.pagamento_status = 'pago' AND pago = total AND total > 0 THEN
    RETURN jsonb_build_object('status', 'quitado');
  END IF;
  IF total IS NULL OR total <= 0 OR pago < 0 OR pago >= total OR pedido.pagamento_status = 'pago' THEN
    RETURN jsonb_build_object('status', 'revisao_necessaria');
  END IF;

  RETURN jsonb_build_object(
    'status', 'pendente',
    'forma', pedido.forma_pagamento,
    'saldo_centavos', total - pago,
    'pago_centavos', pago,
    -- A capacidade financeira é a autoridade; Admin não é pré-requisito.
    'pode_receber', neia_operacao.tem_capacidade(ator, 'receber_pagamento')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_recebimento_retirada(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consultar_recebimento_retirada(uuid) TO authenticated;

-- Mesma RPC financeira da 0106 de homologação, com uma única diferença: a
-- atendente entra na lista de papéis. A guarda de `receber_pagamento` continua
-- obrigatória para Admin, Financeiro e atendente. Todo o resto permanece.
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
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN RETURN jsonb_build_object('status','nao_autorizado'); END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'atendente')
  ) THEN
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

REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) TO authenticated;

COMMIT;$mig$]),
  ('20261127210001', 'edicao_observacoes_auditada_0140', ARRAY[$mig$-- 0140 — edição segura de observações do pedido, com motivo e auditoria.
--
-- Escopo deliberadamente mínimo: apenas `pedidos.observacoes`. Itens, valores,
-- pagamento, entrega, prazos, identidade e status continuam protegidos pelas
-- migrations 0084/0085/0094/0106/0134. A integração comercial posterior não
-- é implementada aqui: o contrato em docs/estoques segue como especificação.
--
-- Reversão segura (somente com autorização e janela coordenada): revogar a RPC
-- e remover a política/table `pedido_edicoes_auditoria` preservando os registros
-- já gravados em documentação de auditoria. Não reaplicar 0135/0136.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.pedido_edicoes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  campo text NOT NULL CHECK (campo = 'observacoes'),
  valor_anterior text,
  valor_novo text,
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_edicoes_auditoria_pedido_idx
  ON public.pedido_edicoes_auditoria (pedido_id, created_at DESC);
ALTER TABLE public.pedido_edicoes_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedido edicoes leitura staff" ON public.pedido_edicoes_auditoria;
CREATE POLICY "pedido edicoes leitura staff" ON public.pedido_edicoes_auditoria
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'producao') OR public.has_role(auth.uid(), 'financeiro')
  );

REVOKE ALL ON public.pedido_edicoes_auditoria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pedido_edicoes_auditoria TO authenticated;
GRANT ALL ON public.pedido_edicoes_auditoria TO service_role;

CREATE OR REPLACE FUNCTION public.editar_observacoes_pedido(
  p_pedido_id uuid, p_observacoes text, p_motivo text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  ator uuid := auth.uid();
  v_anterior text;
  v_novo text;
BEGIN
  IF ator IS NULL OR NOT (
    public.has_role(ator, 'admin') OR public.has_role(ator, 'atendente')
  ) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF p_pedido_id IS NULL OR p_motivo IS NULL OR length(btrim(p_motivo)) < 3
     OR length(COALESCE(p_observacoes, '')) > 1000 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;

  SELECT observacoes INTO v_anterior FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;

  -- `pedidos.observacoes` é NOT NULL DEFAULT ''. Texto vazio é representado por ''.
  v_novo := CASE WHEN length(btrim(COALESCE(p_observacoes, ''))) = 0 THEN '' ELSE p_observacoes END;
  IF v_anterior IS NOT DISTINCT FROM v_novo THEN
    RETURN jsonb_build_object('status', 'sem_alteracao');
  END IF;

  UPDATE public.pedidos SET observacoes = v_novo WHERE id = p_pedido_id;
  INSERT INTO public.pedido_edicoes_auditoria
    (pedido_id, campo, valor_anterior, valor_novo, motivo, actor)
  VALUES (p_pedido_id, 'observacoes', v_anterior, v_novo, btrim(p_motivo), ator);

  RETURN jsonb_build_object('status', 'editado', 'observacoes', v_novo);
END;
$$;
REVOKE ALL ON FUNCTION public.editar_observacoes_pedido(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.editar_observacoes_pedido(uuid, text, text) TO authenticated;

COMMIT;$mig$]),
  ('20261127210002', 'guard_recebimento_com_capacidade_0141', ARRAY[$mig$-- 0141 — exceção estrita ao congelamento financeiro para recebimento no balcão.
--
-- A 0084 congela pagamento_status/pagamento_em para todos exceto service_role,
-- admin e financeiro. Isso impedia a atendente com `receber_pagamento` de
-- concluir o registro feito pela RPC 0139, mesmo com o ledger já gravado.
--
-- Esta migration NÃO afrouxa o guard para escrita direta: a exceção exige
--   (a) capacidade financeira explícita;
--   (b) nenhuma outra coluna congelada alterada;
--   (c) transição apenas para 'pendente' ou 'pago';
--   (d) para 'pago', ledger já quitado integralmente no momento do UPDATE.
-- O bloqueio da 0094 (pago -> pendente/falhou) e a quitação da retirada (0136)
-- permanecem intactos. Reversão: restaurar o corpo exato de 0084.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.congelar_colunas_protegidas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pago bigint;
  v_total bigint;
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'financeiro') THEN
    RETURN NEW;
  END IF;

  -- Exceção estrita: somente o fechamento do recebimento já registrado no
  -- ledger pela RPC de pagamento. Nenhum outro campo financeiro é liberado.
  IF neia_operacao.tem_capacidade(v_uid, 'receber_pagamento')
     AND (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status
          OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em) THEN
    IF NEW.pagamento_modalidade IS DISTINCT FROM OLD.pagamento_modalidade
       OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
       OR NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.cupom IS DISTINCT FROM OLD.cupom
       OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
       OR NEW.agendado_para IS DISTINCT FROM OLD.agendado_para
       OR NEW.agendamento_obs IS DISTINCT FROM OLD.agendamento_obs
       OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
    END IF;
    IF NEW.pagamento_status NOT IN ('pendente', 'pago') THEN
      RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
    END IF;
    IF NEW.pagamento_status = 'pago' THEN
      v_total := round(NEW.total * 100)::bigint;
      SELECT coalesce(sum(CASE WHEN tipo = 'pagamento' THEN valor_centavos ELSE -valor_centavos END), 0)
        INTO v_pago FROM public.pedido_pagamento_eventos WHERE pedido_id = NEW.id;
      IF v_total <= 0 OR v_pago <> v_total THEN
        RAISE EXCEPTION 'pagamento_sem_ledger_integro';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Corpo integral da 0084, inalterado para todos os demais casos.
  IF (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status
    OR NEW.pagamento_modalidade IS DISTINCT FROM OLD.pagamento_modalidade
    OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
    OR NEW.desconto IS DISTINCT FROM OLD.desconto
    OR NEW.total IS DISTINCT FROM OLD.total
    OR NEW.cupom IS DISTINCT FROM OLD.cupom
    OR NEW.pago_em IS DISTINCT FROM OLD.pago_em
    OR NEW.pagamento_em IS DISTINCT FROM OLD.pagamento_em
    OR NEW.agendado_para IS DISTINCT FROM OLD.agendado_para
    OR NEW.agendamento_obs IS DISTINCT FROM OLD.agendamento_obs
    OR NEW.tipo_entrega IS DISTINCT FROM OLD.tipo_entrega
    OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Coluna protegida: alteração apenas via fluxo financeiro/RPC';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.congelar_colunas_protegidas() IS
  'E9.1 + 0141: congela financeiro/promessa/identidade; operador com receber_pagamento pode fechar pagamento já presente no ledger.';

COMMIT;$mig$])
ON CONFLICT (version) DO NOTHING;

COMMIT;
