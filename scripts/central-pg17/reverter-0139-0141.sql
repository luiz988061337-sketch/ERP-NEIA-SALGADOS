-- Compensação local das migrations 0139/0140/0141.
-- Restaura exatamente os corpos anteriores (0136, 0106 da homologação e 0084) e
-- desativa a RPC de edição. A tabela de auditoria e todos os eventos do ledger são preservados:
-- reversão não apaga histórico. Não altera supabase_migrations nem reaplica
-- 0134/0135/0136. Somente execução em cluster descartável ou janela autorizada.
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
  IF ator IS NULL OR NOT (public.has_role(ator,'admin') OR public.has_role(ator,'atendente')) THEN
    RETURN jsonb_build_object('status','nao_autorizado');
  END IF;
  SELECT * INTO pedido FROM public.pedidos WHERE id = p_pedido_id
    AND tipo_entrega = 'retirada' AND status = 'pronto'
    AND conferido_em IS NOT NULL AND retirado_em IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','pedido_indisponivel'); END IF;
  total := round(pedido.total * 100)::bigint;
  SELECT coalesce(sum(CASE WHEN tipo='pagamento' THEN valor_centavos ELSE -valor_centavos END),0)
    INTO pago FROM public.pedido_pagamento_eventos WHERE pedido_id = pedido.id;
  IF pedido.pagamento_status = 'pago' AND pago = total AND total > 0 THEN
    RETURN jsonb_build_object('status','quitado');
  END IF;
  IF total IS NULL OR total <= 0 OR pago < 0 OR pago >= total OR pedido.pagamento_status = 'pago' THEN
    RETURN jsonb_build_object('status','revisao_necessaria');
  END IF;
  RETURN jsonb_build_object(
    'status','pendente',
    'forma',pedido.forma_pagamento,
    'saldo_centavos',total-pago,
    'pago_centavos',pago,
    'pode_receber',public.has_role(ator,'admin') AND neia_operacao.tem_capacidade(ator,'receber_pagamento')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_recebimento_retirada(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consultar_recebimento_retirada(uuid) TO authenticated;

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
REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido(uuid, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.congelar_colunas_protegidas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'financeiro') THEN
    RETURN NEW;
  END IF;
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
REVOKE ALL ON FUNCTION public.congelar_colunas_protegidas() FROM PUBLIC;
COMMENT ON FUNCTION public.congelar_colunas_protegidas() IS
  'E9.1: congela financeiro/promessa/identidade p/ não-admin+financeiro. RPCs isentas via GUC.';

-- A RPC de edição é desativada, mas a auditoria permanece para consulta/histórico.
DROP FUNCTION IF EXISTS public.editar_observacoes_pedido(uuid, text, text);

COMMIT;
