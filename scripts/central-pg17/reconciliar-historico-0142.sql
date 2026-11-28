-- Reconciliação documentada do histórico da 0142 em homologação.
-- O DDL foi aplicado por SQL direto com destino declarado e barreira; este SQL
-- apenas registra a versão com o conteúdo integral da migration.
-- Nenhuma migration é reaplicada e nenhuma versão anterior é alterada.
BEGIN;
SET LOCAL lock_timeout = '5s';

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20261128071000', 'forma_efetiva_pagamentos_0142', ARRAY[$mig$-- 0142 — forma efetiva de pagamento, troco registrado e guarda de edição.
--
-- PREPARADA, NÃO APLICADA. Destino autorizado (somente com autorização expressa):
-- lflzlcqinarrcgncafol. Produção ruioyioynwwwiqbjznoa é proibida.
--
-- Regra aprovada: a forma escolhida na criação é apenas a preferência inicial.
-- Cada recebimento informa a forma REALMENTE usada (dinheiro, pix, crédito ou
-- débito). Pix/cartão exigem confirmação efetiva: selecionar a modalidade não
-- basta. Dinheiro informa o valor entregue; o excedente é troco, nunca receita.
--
-- Preserva integralmente: ledger `pedido_pagamento_eventos`, capacidade
-- `receber_pagamento` para TODOS os papéis (inclusive Admin), papéis
-- admin/financeiro/atendente, idempotência, travamento de linha, limites de
-- valor, quitação da 0136, guardas da 0094/0106/0141 e a auditoria da 0140.
-- NENHUM evento anterior é alterado: as novas colunas são anuláveis e a
-- apresentação trata NULL como "não registrado", sem inventar valores.
--
-- A RPC antiga (3 argumentos) permanece com a MESMA assinatura, mas deixa de
-- gravar: todo registro passa a exigir a RPC nova, com forma efetiva. Assim não
-- existe sobrecarga de função (evitando ambiguidade no PostgREST) nem caminho
-- paralelo de gravação sem validação.
--
-- Reversão segura: scripts/central-pg17/reverter-0142.sql (restaura 0139/0140,
-- remove as duas RPCs novas e mantém as colunas anuláveis, sem perda de dados).
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.pedido_pagamento_eventos
  ADD COLUMN IF NOT EXISTS forma_pagamento_efetiva text,
  ADD COLUMN IF NOT EXISTS valor_entregue_centavos bigint,
  ADD COLUMN IF NOT EXISTS troco_centavos bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_pagamento_eventos_forma_efetiva_check') THEN
    ALTER TABLE public.pedido_pagamento_eventos ADD CONSTRAINT pedido_pagamento_eventos_forma_efetiva_check
      CHECK (forma_pagamento_efetiva IS NULL
        OR btrim(forma_pagamento_efetiva) IN ('dinheiro', 'pix', 'credito', 'debito'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_pagamento_eventos_troco_check') THEN
    ALTER TABLE public.pedido_pagamento_eventos ADD CONSTRAINT pedido_pagamento_eventos_troco_check
      CHECK (
        (valor_entregue_centavos IS NULL AND troco_centavos IS NULL)
        OR (
          valor_entregue_centavos IS NOT NULL
          AND troco_centavos IS NOT NULL
          AND valor_entregue_centavos >= valor_centavos
          AND troco_centavos = valor_entregue_centavos - valor_centavos
        )
      );
  END IF;
END $$;

-- A assinatura antiga continua existindo para compatibilidade de introspecção,
-- mas não grava: exige a RPC com forma efetiva informada pelo operador.
CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido(
  p_pedido_id uuid, p_valor_centavos bigint, p_chave_idempotencia text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN
    RETURN jsonb_build_object('status','nao_autorizado');
  END IF;
  RETURN jsonb_build_object('status','dados_invalidos',
    'detalhe','Informe a forma efetiva de pagamento na RPC da migration 0142');
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_pedido_efetivo(
  p_pedido_id uuid,
  p_valor_centavos bigint,
  p_chave_idempotencia text,
  p_forma_efetiva text,
  p_valor_entregue_centavos bigint DEFAULT NULL,
  p_confirmado boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_existente public.pedido_pagamento_eventos%ROWTYPE;
  v_total bigint;
  v_pago bigint;
  v_saldo bigint;
  v_valor bigint;
  v_forma text;
  v_entregue bigint;
  v_troco bigint;
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
  v_forma := CASE WHEN p_forma_efetiva IS NULL THEN NULL ELSE btrim(p_forma_efetiva) END;
  IF v_forma IS NULL OR v_forma NOT IN ('dinheiro', 'pix', 'credito', 'debito') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'detalhe', 'forma efetiva inválida');
  END IF;
  IF v_forma = 'dinheiro' THEN
    IF p_valor_entregue_centavos IS NULL OR p_valor_entregue_centavos <= 0 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'detalhe', 'informe o valor entregue em dinheiro');
    END IF;
    v_entregue := p_valor_entregue_centavos;
  ELSE
    -- Pix/cartão: marcar a modalidade não comprova recebimento.
    IF p_confirmado IS NOT TRUE OR p_valor_entregue_centavos IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'confirmacao_efetiva_requerida');
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave_idempotencia, 0));
  SELECT * INTO v_existente FROM public.pedido_pagamento_eventos
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF FOUND THEN
    IF v_existente.tipo <> 'pagamento' OR v_existente.pedido_id <> p_pedido_id
       OR (p_valor_centavos IS NOT NULL AND v_existente.valor_centavos <> p_valor_centavos)
       OR v_existente.forma_pagamento_efetiva IS DISTINCT FROM v_forma
       OR v_existente.valor_entregue_centavos IS DISTINCT FROM v_entregue THEN
      RETURN jsonb_build_object('status', 'chave_idempotencia_conflitante');
    END IF;
    RETURN jsonb_build_object('status', 'repetido', 'evento_id', v_existente.id,
      'valor_centavos', v_existente.valor_centavos, 'saldo_centavos', NULL,
      'forma_efetiva', v_existente.forma_pagamento_efetiva,
      'valor_entregue_centavos', v_existente.valor_entregue_centavos,
      'troco_centavos', v_existente.troco_centavos);
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
  IF v_forma = 'dinheiro' THEN
    IF v_entregue < v_valor THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'detalhe', 'valor entregue menor que o devido');
    END IF;
    v_troco := v_entregue - v_valor;
  END IF;

  -- `forma_pagamento` permanece com a preferência original da criação;
  -- `forma_pagamento_efetiva` registra o que foi realmente usado.
  INSERT INTO public.pedido_pagamento_eventos
    (pedido_id, tipo, valor_centavos, forma_pagamento, forma_pagamento_efetiva,
     valor_entregue_centavos, troco_centavos, chave_idempotencia, actor)
  VALUES (p_pedido_id, 'pagamento', v_valor,
    COALESCE(v_pedido.forma_pagamento::text, 'outro'), v_forma,
    v_entregue, v_troco, p_chave_idempotencia, auth.uid()) RETURNING * INTO v_evento;
  v_pago := v_pago + v_valor;
  v_saldo := v_total - v_pago;
  UPDATE public.pedidos SET
    pagamento_status = CASE WHEN v_saldo = 0 THEN 'pago' ELSE 'pendente' END,
    pagamento_em = CASE WHEN v_saldo = 0 THEN now() ELSE NULL END
  WHERE id = p_pedido_id;
  RETURN jsonb_build_object('status', 'registrado', 'evento_id', v_evento.id,
    'valor_centavos', v_valor, 'valor_pago_centavos', v_pago, 'saldo_centavos', v_saldo,
    'forma_efetiva', v_forma, 'valor_entregue_centavos', v_entregue, 'troco_centavos', v_troco);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_pedido_efetivo(uuid, bigint, text, text, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_pedido_efetivo(uuid, bigint, text, text, bigint, boolean) TO authenticated;

-- Consulta da chave após resposta inconclusiva: nunca informa sucesso sem
-- confirmação no ledger e nunca cria uma nova cobrança.
CREATE OR REPLACE FUNCTION public.verificar_recebimento_por_chave(p_chave_idempotencia text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_evento public.pedido_pagamento_eventos%ROWTYPE;
BEGIN
  IF p_chave_idempotencia IS NULL
     OR length(btrim(p_chave_idempotencia)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT neia_operacao.tem_capacidade(auth.uid(),'receber_pagamento') THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'atendente')
  ) THEN
    RETURN jsonb_build_object('status', 'nao_autorizado');
  END IF;
  SELECT * INTO v_evento FROM public.pedido_pagamento_eventos
   WHERE chave_idempotencia = p_chave_idempotencia;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'nao_registrado'); END IF;
  RETURN jsonb_build_object('status', 'registrado', 'evento_id', v_evento.id,
    'pedido_id', v_evento.pedido_id, 'tipo', v_evento.tipo,
    'valor_centavos', v_evento.valor_centavos,
    'forma_efetiva', COALESCE(v_evento.forma_pagamento_efetiva, v_evento.forma_pagamento),
    'valor_entregue_centavos', v_evento.valor_entregue_centavos,
    'troco_centavos', v_evento.troco_centavos,
    'created_at', v_evento.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.verificar_recebimento_por_chave(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.verificar_recebimento_por_chave(text) TO authenticated;

-- A 0140 não verificava estágio: um pedido entregue/cancelado ainda podia ser
-- editado via chamada direta à RPC. Guarda espelhada em podeEditarPedido().
CREATE OR REPLACE FUNCTION public.editar_observacoes_pedido(
  p_pedido_id uuid, p_observacoes text, p_motivo text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  ator uuid := auth.uid();
  v_anterior text;
  v_novo text;
  v_status text;
  v_retirado timestamptz;
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

  SELECT observacoes, status, retirado_em INTO v_anterior, v_status, v_retirado
    FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pedido_inexistente'); END IF;

  IF v_retirado IS NOT NULL
     OR v_status IN ('cancelado', 'entregue', 'retirado', 'em_rota')
     OR v_status NOT IN ('recebido', 'em_producao', 'pronto', 'aguardando_motoboy')
     OR ((v_status = 'pronto' OR v_status = 'aguardando_motoboy')
         AND NOT public.has_role(ator, 'admin')) THEN
    RETURN jsonb_build_object('status', 'pedido_nao_editavel');
  END IF;

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

COMMIT;$mig$])
ON CONFLICT (version) DO NOTHING;

COMMIT;
