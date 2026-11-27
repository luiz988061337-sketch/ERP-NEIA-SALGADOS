-- 0139 — recebimento no balcão pela atendente autorizada.
--
-- Substitui apenas as duas regras da 0136/0106 que impediam o fluxo aprovado:
--   * a consulta exigia status 'pronto' + conferido_em e exigia Admin para
--     'pode_receber';
--   * a RPC de pagamento só aceitava Admin/Financeiro, mesmo quando a atendente
--     tinha a capacidade financeira `receber_pagamento`.
--
-- Preserva: ledger `pedido_pagamento_eventos`, idempotência por chave, travamento
-- de linha, limites de valor, gatilho de quitação da 0136 e autorização separada
-- para concluir a retirada. Nenhuma coluna financeira é escrita diretamente.
--
-- Reversão segura (somente com autorização e janela coordenada): executar o
-- corpo anterior de `consultar_recebimento_retirada` da 0136 e o corpo anterior
-- de `registrar_pagamento_pedido` da 0106. Não apagar o registro de migration
-- nem reaplicar 0135/0136.
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

-- Mesma RPC financeira da 0106, com uma única diferença: a atendente portadora
-- da capacidade `receber_pagamento` passa na guarda. Todo o resto permanece.
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
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR (public.has_role(auth.uid(), 'atendente') AND neia_operacao.tem_capacidade(auth.uid(), 'receber_pagamento'))
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

COMMIT;
