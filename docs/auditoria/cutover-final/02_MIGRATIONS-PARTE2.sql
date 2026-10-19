-- ============================================================================
-- PASSO 2 (parte 2/3) — MIGRATIONS 0092..0094
-- Cole esta parte DEPOIS da parte anterior e ANTES da próxima.
-- Conteudo verbatim das migrations homologadas (sem os comentarios de
-- documentacao; a versao anotada esta em 02_MIGRATIONS-CUTOVER.sql).
-- NAO APLIQUE A 0088. A 0094 e 0096 sao ATIVAS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reserva_proveniencia (
  reserva_id              uuid PRIMARY KEY,
  pedido_id               uuid NOT NULL,
  produto_id              uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade              integer NOT NULL CHECK (quantidade > 0),
  origem                  text NOT NULL CHECK (origem IN ('0088', '0089')),
  estoque_movimentacao_id uuid NOT NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  criado_por              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT reserva_proveniencia_mov_uk
    UNIQUE (estoque_movimentacao_id),
  CONSTRAINT reserva_proveniencia_reserva_fk
    FOREIGN KEY (reserva_id, pedido_id, produto_id, quantidade)
    REFERENCES public.reservas_estoque (id, pedido_id, produto_id, quantidade)
    ON DELETE RESTRICT
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_proveniencia_mov_fk'
      AND conrelid = 'public.reserva_proveniencia'::regclass
  ) THEN
    ALTER TABLE public.reserva_proveniencia
      ADD CONSTRAINT reserva_proveniencia_mov_fk
      FOREIGN KEY (estoque_movimentacao_id)
      REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reserva_proveniencia_pedido_idx
  ON public.reserva_proveniencia (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_proveniencia_produto_idx
  ON public.reserva_proveniencia (produto_id);

CREATE TABLE IF NOT EXISTS public.reserva_proveniencia_config (
  id          boolean PRIMARY KEY DEFAULT true,
  controlado  boolean NOT NULL DEFAULT false,
  ativado_em  timestamptz,
  ativado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao  text,
  CONSTRAINT reserva_proveniencia_config_single CHECK (id = true)
);
INSERT INTO public.reserva_proveniencia_config (id, controlado)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.reserva_proveniencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia leitura staff" ON public.reserva_proveniencia;
CREATE POLICY "reserva_proveniencia leitura staff" ON public.reserva_proveniencia
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

ALTER TABLE public.reserva_proveniencia_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config;
CREATE POLICY "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.reserva_proveniencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia TO authenticated;   -- RLS filtra por perfil
GRANT ALL ON public.reserva_proveniencia TO service_role;

REVOKE ALL ON public.reserva_proveniencia_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia_config TO authenticated;  -- RLS filtra (admin)
GRANT ALL ON public.reserva_proveniencia_config TO service_role;

COMMENT ON TABLE public.reserva_proveniencia IS
  '0092: marcador de proveniência confiável (Modelo 2). Existência = reserva '
  'criada por caminho transacional confiável (0088/0089) sob controle de retirada. '
  'Ausência = reserva NÃO confiável (antiga ou sem garantia de registro) e NÃO '
  'liberável. Escrita apenas por função SECURITY DEFINER; nenhum backfill.';
COMMENT ON COLUMN public.reserva_proveniencia.estoque_movimentacao_id IS
  '0092: id do movimento de débito (estoque_movimentacoes) que comprova a baixa. '
  'Único por marcador; amarra o marcador ao débito real.';
COMMENT ON COLUMN public.reserva_proveniencia.origem IS
  '0092: caminho técnico que criou a reserva (0088 individual / 0089 por pedido).';
COMMENT ON TABLE public.reserva_proveniencia_config IS
  '0092: configuração de ativação do controle de proveniência. Inicia DESATIVADO '
  '(controlado=false). Não é ligada por migration; exige garantias operacionais.';
COMMENT ON COLUMN public.reserva_proveniencia_config.controlado IS
  '0092: false = 0088/0089 NÃO inserem marcador (sistema conservador; 0090 não '
  'libera). true = regime controlado ativo (só após autorização e comprovação).';

CREATE OR REPLACE FUNCTION public.cancelar_pedido_atomico(
  p_pedido_id uuid,
  p_motivo    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_dono        uuid;   -- pedidos.user_id
  v_status      public.order_status;
  v_pag         text;   -- pedidos.pagamento_status
  v_eh_staff    boolean;
  v_n_itens     integer;
  v_reserv_total integer;
  v_reserv_retem integer;
  v_reservaveis integer;
  v_lib         jsonb;
  v_lib_status  text;
  v_de          text;
BEGIN
  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  SELECT user_id, status, pagamento_status
    INTO v_dono, v_status, v_pag
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF NOT v_eh_staff AND (v_dono IS NULL OR v_dono IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  IF v_status = 'entregue' THEN
    RETURN jsonb_build_object('status', 'status_invalido', 'atual', v_status);
  END IF;
  IF v_status = 'cancelado' THEN
    RETURN jsonb_build_object('status', 'ja_cancelado');
  END IF;
  IF v_status <> 'recebido' THEN
    RETURN jsonb_build_object('status', 'requer_analise', 'atual', v_status);
  END IF;

  IF v_pag IS DISTINCT FROM 'pendente' THEN
    RETURN jsonb_build_object('status', 'pagamento_nao_elegivel', 'pagamento_status', v_pag);
  END IF;

  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  SELECT COUNT(*) INTO v_reservaveis
  FROM (
    SELECT i.id
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
    UNION
    SELECT i.id
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  SELECT COUNT(*) INTO v_reserv_total
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF v_reservaveis > 0 AND v_reserv_total = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva');
  END IF;

  SELECT COUNT(*) INTO v_reserv_retem
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND status IN ('ativa', 'consumida');
  IF v_reservaveis > 0 AND v_reserv_retem = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva_ativa');
  END IF;

  v_de := v_status::text;
  UPDATE public.pedidos
     SET status = 'cancelado'
   WHERE id = p_pedido_id
     AND status = 'recebido';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: status do pedido % mudou durante o cancelamento', p_pedido_id;
  END IF;

  v_lib := public.liberar_pedido_atomico(p_pedido_id);

  IF v_lib IS NULL OR jsonb_typeof(v_lib) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno invalido da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  IF NOT (v_lib ? 'status')
     OR jsonb_typeof(v_lib -> 'status') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno sem status textual da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  v_lib_status := v_lib ->> 'status';

  IF v_lib_status IS NULL OR v_lib_status NOT IN ('liberado', 'ja_liberado') THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: liberacao nao concluida (%, pedido %) — rollback',
      COALESCE(v_lib_status, 'null'), p_pedido_id;
  END IF;

  IF v_lib_status = 'ja_liberado'
     AND v_reservaveis > 0
     AND v_reserv_total = 0 THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: ja_liberado sem reserva comprovada (pedido %) — rollback',
      p_pedido_id;
  END IF;

  INSERT INTO public.pedido_status_historico (pedido_id, de_status, para_status, actor, motivo)
  VALUES (
    p_pedido_id,
    v_de,
    'cancelado',
    v_uid,
    COALESCE(NULLIF(btrim(p_motivo), ''), 'cancelamento transacional (Modelo 2)')
  );

  RETURN jsonb_build_object(
    'status',    'cancelado',
    'pedido_id', p_pedido_id,
    'liberacao', v_lib
  );
END;
$$;

COMMENT ON FUNCTION public.cancelar_pedido_atomico(uuid, text) IS
  '0093 (ORQUESTRADOR transacional, INERTE até migração dos chamadores). Cancela '
  'um pedido e libera o restante das reservas (0090) NA MESMA transação. Exige '
  'auth.uid(); autoriza dono do pedido OU staff operacional (admin/producao/'
  'atendente); nega terceiros. Caminho funcional da 1ª versão: status=recebido E '
  'pagamento_status=pendente. Bloqueia entregue (status_invalido) e estados em '
  'andamento (requer_analise); bloqueia pagamento não-pendente (pagamento_nao_'
  'elegivel); idempotente em cancelado (ja_cancelado); exige itens e reserva para '
  'itens reserváveis (pedido_invalido/reconciliacao_pendente). NÃO é estorno '
  'financeiro (nunca toca pagamento). Trava o pedido (L1) e VALIDA ESTRITAMENTE '
  'o retorno da 0090 (rejeita SQL NULL, JSON null, status ausente/não textual, '
  'reconciliacao_pendente, status_invalido, pedido_invalido e valores inesperados), '
  'convertendo QUALQUER não-sucesso em EXCEPTION (rollback integral); ja_liberado '
  'exige reserva comprovada (não mascara ausência de reserva). Grava '
  'pedido_status_historico. Locks compatíveis com 0090 (pedidos -> produtos -> '
  'reservas). EXECUTE só para authenticated. Sem EXCEPTION WHEN OTHERS.';

REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(uuid, text)
  TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.pedidos')          IS NULL
     OR to_regclass('public.fila_impressao') IS NULL THEN
    RAISE EXCEPTION '0094: pré-requisito ausente (pedidos/fila_impressao).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pedidos'
      AND column_name='pagamento_status'
  ) THEN
    RAISE EXCEPTION '0094: coluna pedidos.pagamento_status inexistente.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enfileirar_cupom(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.pedidos%ROWTYPE;
  v_modalidade text;
  v_n_itens integer := 0;
  v_total_un integer := 0;
  v_payload text;
  r record;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_p.status = 'cancelado' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = p_pedido_id::text || ':pedido') THEN
    RETURN;
  END IF;

  v_modalidade := COALESCE(v_p.pagamento_modalidade, 'online');

  IF v_modalidade = 'online' AND COALESCE(v_p.pagamento_status, 'pendente') <> 'pago' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_n_itens FROM public.pedido_itens WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN;
  END IF;

  v_total_un := 0;
  v_payload := '--- CUPOM FISCAL ---' || chr(10);
  v_payload := v_payload || 'Pedido #:' || COALESCE(v_p.numero::text, '?') || chr(10);
  v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
  v_payload := v_payload || 'Cliente: ' || COALESCE(v_p.cliente_nome, '-') || chr(10);
  v_payload := v_payload || 'Telefone: ' || COALESCE(v_p.telefone, '-') || chr(10);
  v_payload := v_payload || '----------------------------------------' || chr(10);

  FOR r IN
    SELECT nome, preco_unitario, quantidade
    FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
    ORDER BY nome
  LOOP
    v_total_un := v_total_un + COALESCE(r.quantidade, 0);
    v_payload := v_payload || '(' || COALESCE(r.quantidade, 0)::text || ') ' || COALESCE(r.nome, 'item') || chr(10);
    v_payload := v_payload || 'Preco: R$ ' || to_char(COALESCE(r.preco_unitario, 0), '999G999G990D00') || chr(10);
  END LOOP;

  v_payload := v_payload || '----------------------------------------' || chr(10);
  v_payload := v_payload || 'Total Unidades: ' || v_total_un::text || chr(10);
  v_payload := v_payload || 'Subtotal: R$ ' || to_char(COALESCE(v_p.subtotal, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(COALESCE(v_p.taxa_entrega, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Total: R$ ' || to_char(COALESCE(v_p.total, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Forma Pagamento: ' || COALESCE(v_p.forma_pagamento::text, '-') || chr(10);

  IF COALESCE(v_p.tipo_entrega, 'entrega') = 'entrega' THEN
    v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
    v_payload := v_payload || 'Endereco: ' || COALESCE(v_p.endereco, '') || chr(10);
    v_payload := v_payload || 'Bairro: ' || COALESCE(v_p.bairro, '') || chr(10);
    v_payload := v_payload || 'Cidade: ' || COALESCE(v_p.cidade, '') || chr(10);
    v_payload := v_payload || 'CEP: ' || COALESCE(v_p.cep, '') || chr(10);
  ELSE
    v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
  END IF;

  v_payload := v_payload || 'Modalidade: ' || v_modalidade || chr(10);
  v_payload := v_payload || 'Status Pagamento: ' || COALESCE(v_p.pagamento_status, 'pendente') || chr(10);
  v_payload := v_payload || 'Observacoes: ' || COALESCE(v_p.observacoes, '') || chr(10);
  v_payload := v_payload || '--- FIM CUPOM ---';

  INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
  VALUES (p_pedido_id, 'pedido', v_payload, 'Tanca TP-550', p_pedido_id::text || ':pedido', 'pendente', now(), now())
  ON CONFLICT (trabalho_uuid) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enfileirar_cupom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_cupom(uuid) TO service_role;

COMMENT ON FUNCTION public.enfileirar_cupom(uuid) IS
  'Fila cupom (0077). 1.43/D: pedido cancelado NÃO gera novo cupom (guard no início). Idempotente por trabalho_uuid. Não remove jobs já enfileirados.';

DROP TRIGGER  IF EXISTS trigger_bloquear_pagamento_cancelado ON public.pedidos;
DROP FUNCTION IF EXISTS public.bloquear_pagamento_pedido_cancelado();

CREATE OR REPLACE FUNCTION public.proteger_consistencia_financeira_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_mudou_status    boolean := (NEW.status           IS DISTINCT FROM OLD.status);
  v_mudou_pagamento boolean := (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status);
  v_confirmou       boolean := (NEW.pagamento_status = 'pago'
                                AND OLD.pagamento_status IS DISTINCT FROM 'pago');
BEGIN
  IF NOT v_mudou_status AND NOT v_mudou_pagamento THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelado' AND NEW.pagamento_status = 'pago' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % ficaria cancelado e pago; use o fluxo de cancelamento (0093) ou registre reembolso antes de cancelar.',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  IF v_confirmou AND OLD.status = 'cancelado' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % estava cancelado; pagamento recebido deve ir para conciliacao financeira (nao confirmar no pedido).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'cancelado' AND NEW.status IS DISTINCT FROM 'cancelado' THEN
    RAISE EXCEPTION
      'reabertura_nao_permitida: pedido % cancelado nao pode ser reaberto por UPDATE direto; exige fluxo autorizado (inexistente hoje).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  IF OLD.pagamento_status = 'pago'
     AND NEW.pagamento_status IN ('pendente', 'falhou') THEN
    RAISE EXCEPTION
      'pagamento_confirmado_nao_rebaixavel: pedido % tinha pagamento confirmado e nao pode voltar para ''%''; registre reembolso (reembolsado) ou use fluxo de correcao auditado (inexistente hoje).',
      NEW.id, NEW.pagamento_status USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_consistencia_financeira ON public.pedidos;
CREATE TRIGGER trigger_proteger_consistencia_financeira
  BEFORE UPDATE OF status, pagamento_status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_consistencia_financeira_pedido();

COMMENT ON FUNCTION public.proteger_consistencia_financeira_pedido() IS
  '1.44+1.45+1.46/B,C: impede (I) cancelado+pago, (II) confirmar pagamento de pedido cancelado, (III) reabrir pedido cancelado por UPDATE direto e (IV) rebaixar pagamento confirmado (pago->pendente/falhou); para TODO papel (inclui service_role). Coluna-especifico (status, pagamento_status); nao altera guard 0085 nem 0093.';
