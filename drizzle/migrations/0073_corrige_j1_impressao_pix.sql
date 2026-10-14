-- 0073: CORRETIVA J.1 — impressão após pagamento + Pix hardening
-- Corrige 0058/0061/0062/0063 sem reescrever história (aditiva, idempotente).
-- O que estava quebrado:
--   0058: "PERFORM PERFORM", "CREATE OR REPLACE TRIGGER" (sintaxe inválida),
--          "EXECUTE FUNCTION" sem parênteses, chamada de função RETURNS trigger
--          via PERFORM fora de contexto (new_itens inexistente), hack de session
--          app.pedido_id frágil entre triggers.
--   0061: variáveis v_payload/v_item_rec não declaradas, falta um END IF,
--          payload zerado (Total Unidades 0, Subtotal 0), sem SECURITY DEFINER.
--   0062: mesmo hack de session + "CREATE OR REPLACE TRIGGER" inválido.
--   0063: repetiu "CREATE OR REPLACE TRIGGER" e manteve o hack de session
--          em vez da função normal pedida em J.1.
--   0059/0060: RLS aberta (USING true p/ qualquer authenticated), sem token,
--          device_id uuid em eventos vs identificador text do aparelho.
-- Regra J.1 (vale após aplicar):
--   online (pix/credito/debito, +toda retirada) → imprime SÓ quando pago.
--   na_entrega (dinheiro/cartão na entrega) → imprime na hora (após itens).
--   Idempotente por trabalho_uuid = pedido_id || ':pedido'.

-- =============================================
-- 0. Colunas de modalidade (caso 0063 não tenha aplicado)
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pagamento_modalidade text NOT NULL DEFAULT 'online';
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pagamento_modalidade_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pagamento_modalidade_check
  CHECK (pagamento_modalidade IN ('online', 'na_entrega'));

ALTER TABLE public.pedidos_recorrentes
  ADD COLUMN IF NOT EXISTS pagamento_modalidade text NOT NULL DEFAULT 'online';
ALTER TABLE public.pedidos_recorrentes DROP CONSTRAINT IF EXISTS recorrentes_pagamento_modalidade_check;
ALTER TABLE public.pedidos_recorrentes ADD CONSTRAINT recorrentes_pagamento_modalidade_check
  CHECK (pagamento_modalidade IN ('online', 'na_entrega'));

-- Backfill conservador: só o que é certamente na_entrega.
UPDATE public.pedidos SET pagamento_modalidade = 'na_entrega'
WHERE tipo_entrega = 'entrega' AND forma_pagamento = 'dinheiro'
  AND pagamento_modalidade <> 'na_entrega';

-- =============================================
-- 1. Limpa triggers/funções bugadas (ordem importa)
-- =============================================
DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
DROP TRIGGER IF EXISTS trigger_pagamento_confirmado ON public.pedidos;
DROP FUNCTION IF EXISTS public.handle_pagamento_confirmado();
DROP FUNCTION IF EXISTS public.gerar_cupom_pedido();
DROP FUNCTION IF EXISTS public.trg_gerar_cupom_apos_itens();
DROP FUNCTION IF EXISTS public.trg_pagamento_confirmado();

-- =============================================
-- 2. Função NORMAL (não-trigger): enfileirar_cupom(p_pedido_id)
-- Única dona da decisão de impressão. Chamada pelos dois gatilhos
-- e pelo backfill 0061 reescrito abaixo.
-- =============================================
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

  -- Idempotente: já existe cupom para este pedido?
  IF EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = p_pedido_id::text || ':pedido') THEN
    RETURN;
  END IF;

  v_modalidade := COALESCE(v_p.pagamento_modalidade, 'online');

  -- Regra J.1: online só imprime pago; na_entrega imprime na hora.
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
  'J.1: decide e enfileira cupom. online imprime só se pago; na_entrega imprime na hora. Idempotente por trabalho_uuid.';

-- =============================================
-- 3. Gatilho 1: após inserir itens → enfileira cada pedido distinto
-- =============================================
CREATE OR REPLACE FUNCTION public.trg_gerar_cupom_apos_itens()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid;
BEGIN
  FOR v_pid IN SELECT DISTINCT pedido_id FROM new_itens LOOP
    PERFORM public.enfileirar_cupom(v_pid);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
CREATE TRIGGER trigger_gerar_cupom_apos_itens
  AFTER INSERT ON public.pedido_itens
  REFERENCING NEW TABLE AS new_itens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_gerar_cupom_apos_itens();

COMMENT ON TRIGGER trigger_gerar_cupom_apos_itens ON public.pedido_itens IS
  'J.1: após itens, chama enfileirar_cupom por pedido. na_entrega imprime na hora; online espera pagamento.';

-- =============================================
-- 4. Gatilho 2: pagamento virou pago → enfileira (vale p/ online)
-- =============================================
CREATE OR REPLACE FUNCTION public.trg_pagamento_confirmado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pagamento_status = 'pago' AND OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status THEN
    PERFORM public.enfileirar_cupom(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_pagamento_confirmado ON public.pedidos;
CREATE TRIGGER trigger_pagamento_confirmado
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status AND NEW.pagamento_status = 'pago')
  EXECUTE FUNCTION public.trg_pagamento_confirmado();

COMMENT ON TRIGGER trigger_pagamento_confirmado ON public.pedidos IS
  'J.1: pagamento pendente->pago enfileira cupom (cobre PIX online). Idempotente.';

-- =============================================
-- 5. Backfill reescrito (era 0061): gera cupons de pagos sem fila
-- =============================================
DROP FUNCTION IF EXISTS public.gerar_cupons_pedidos_pagos();

CREATE OR REPLACE FUNCTION public.gerar_cupons_pedidos_pagos()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pid uuid;
  v_count integer := 0;
BEGIN
  FOR v_pid IN
    SELECT id FROM public.pedidos
    WHERE pagamento_status = 'pago'
      AND COALESCE(impresso, false) = false
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = v_pid::text || ':pedido') THEN
      PERFORM public.enfileirar_cupom(v_pid);
      v_count := v_count + 1;
    END IF;
    UPDATE public.pedidos SET impresso = true WHERE id = v_pid;
  END LOOP;
  RETURN 'Gerados ' || v_count::text || ' cupons para pedidos pagos';
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_cupons_pedidos_pagos() TO authenticated;

COMMENT ON FUNCTION public.gerar_cupons_pedidos_pagos() IS
  'J.1 backfill: enfileira pagos sem cupom via enfileirar_cupom. Idempotente.';

-- =============================================
-- 6. Pix hardening: colunas que faltavam
-- =============================================
-- Aparelhos: hash do token (o token puro nunca fica no banco).
ALTER TABLE public.pix_reader_devices
  ADD COLUMN IF NOT EXISTS token_hash text;
-- Eventos: identificador text do aparelho (device_id uuid legado fica p/ compat).
ALTER TABLE public.pix_notification_events
  ADD COLUMN IF NOT EXISTS device_identifier text;
ALTER TABLE public.pix_notification_events
  ADD COLUMN IF NOT EXISTS conferencia_motivo text;

COMMENT ON COLUMN public.pix_reader_devices.token_hash IS
  'SHA-256 hex do token do aparelho. A API compara; token puro nunca é gravado.';
COMMENT ON COLUMN public.pix_notification_events.device_identifier IS
  'Identificador text do aparelho (igual a pix_reader_devices.device_identifier). device_id uuid legado mantido p/ compat.';
COMMENT ON COLUMN public.pix_notification_events.conferencia_motivo IS
  'Quando status=CONFERIR: sem_pedido_valor | multiplos_pedidos_mesmo_valor | divergencia.';

CREATE INDEX IF NOT EXISTS pix_events_device_identifier_idx
  ON public.pix_notification_events (device_identifier);
CREATE INDEX IF NOT EXISTS pix_devices_identifier_idx
  ON public.pix_reader_devices (device_identifier);

-- =============================================
-- 7. Pix RLS restrita (era USING true p/ qualquer authenticated)
-- Leitura: só admin/financeiro. Insert: só servidor (service_role, sem
-- policy p/ authenticated = negado). Update: staff p/ dar baixa no CONFERIR.
-- =============================================
ALTER TABLE public.pix_reader_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_reader_devices_select_own" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_insert" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_update" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_admin_all" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_staff_read" ON public.pix_reader_devices;

CREATE POLICY "pix_reader_devices_staff_read" ON public.pix_reader_devices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "pix_notification_events_select_own" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_insert" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_update" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_admin_all" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_events_staff_read" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_events_staff_update" ON public.pix_notification_events;

-- Staff lê (conferência no admin/financeiro).
CREATE POLICY "pix_events_staff_read" ON public.pix_notification_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- Staff resolve CONFERIR (marca processado / vincula pedido manualmente).
CREATE POLICY "pix_events_staff_update" ON public.pix_notification_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- Sem policy de INSERT p/ authenticated: insert direto pelo app é negado;
-- só a API com service_role grava (server-side, após validar token).
REVOKE INSERT ON public.pix_notification_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pix_reader_devices FROM authenticated;
GRANT SELECT, UPDATE ON public.pix_notification_events TO authenticated;
GRANT SELECT ON public.pix_reader_devices TO authenticated;
GRANT ALL ON public.pix_notification_events TO service_role;
GRANT ALL ON public.pix_reader_devices TO service_role;

-- =============================================
-- 8. Índices
-- =============================================
CREATE INDEX IF NOT EXISTS pedidos_pagamento_modalidade_idx ON public.pedidos (pagamento_modalidade);
