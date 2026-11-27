BEGIN;
SET LOCAL lock_timeout = '5s';

-- Apenas o saldo do pedido elegível fica disponível ao operador de balcão.
-- A gravação continua na RPC de recebimentos e no ledger financeiro existentes.
CREATE FUNCTION public.consultar_recebimento_retirada(p_pedido_id uuid)
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

-- Revalida na mesma transação da retirada, inclusive quando chamada fora da UI.
CREATE FUNCTION public.exigir_quitacao_para_retirada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pago bigint;
  total bigint := round(NEW.total * 100)::bigint;
BEGIN
  SELECT coalesce(sum(CASE WHEN tipo='pagamento' THEN valor_centavos ELSE -valor_centavos END),0)
    INTO pago FROM public.pedido_pagamento_eventos WHERE pedido_id = NEW.id;
  IF NEW.pagamento_status IS DISTINCT FROM 'pago' OR total IS NULL OR total <= 0 OR pago <> total THEN
    RAISE EXCEPTION 'retirada_recebimento_pendente' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.exigir_quitacao_para_retirada() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER exigir_quitacao_para_retirada
  BEFORE UPDATE OF retirado_em, status ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.tipo_entrega = 'retirada' AND (
    (OLD.retirado_em IS NULL AND NEW.retirado_em IS NOT NULL) OR
    (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'entregue')
  ))
  EXECUTE FUNCTION public.exigir_quitacao_para_retirada();

COMMIT;
