\set ON_ERROR_STOP on
-- Reversão local da 0142. Somente cluster descartável; nunca homologação/produção.
-- As colunas adicionadas são anuláveis e ficam preservadas (sem perda de dados).
DO $$
BEGIN
  IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.verificar_recebimento_por_chave(text);
DROP FUNCTION IF EXISTS public.registrar_pagamento_pedido_efetivo(uuid, bigint, text, text, bigint, boolean);

-- Corpo exato da 0139 (mantém a capacidade para todos os papéis autorizados).
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

-- Corpo exato da 0140 (sem a guarda de estágio acrescentada pela 0142).
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

COMMIT;
