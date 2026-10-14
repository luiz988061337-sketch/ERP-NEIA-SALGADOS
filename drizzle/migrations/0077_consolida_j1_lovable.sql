-- 0077: CONSOLIDADA J.1 p/ o banco Lovable (produção)
-- Contexto: este banco parou na 0058 (bugada) e não recebeu a cadeia
-- 0059-0063; 0073/0074 pressupunham essa cadeia. Esta migration é
-- autossuficiente e idempotente: cria o que falta e corrige tudo de uma vez.
-- NÃO reescreve 0058-0063 nos arquivos (histórico preservado).
--
-- Regra J.1 após aplicar:
--   online (pix/credito/debito, +toda retirada) → imprime SÓ quando pago.
--   na_entrega (dinheiro/cartão na entrega) → imprime na hora (após itens).
--   Idempotente por trabalho_uuid = pedido_id || ':pedido'.

-- =============================================
-- 0. Coluna de modalidade (0063 nunca aplicou aqui)
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
-- Desliga o guard anti-fraude só durante este UPDATE (ele barraria a
-- sessão do editor, sem login staff). Bloco único: vale mesmo que o editor
-- use uma sessão por comando. Religa sempre, até em erro.
DO $$ BEGIN
  ALTER TABLE public.pedidos DISABLE TRIGGER pedidos_guard_update_trg;
  BEGIN
    UPDATE public.pedidos SET pagamento_modalidade = 'na_entrega'
    WHERE tipo_entrega = 'entrega' AND forma_pagamento = 'dinheiro'
      AND pagamento_modalidade <> 'na_entrega';
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.pedidos ENABLE TRIGGER pedidos_guard_update_trg;
    RAISE;
  END;
  ALTER TABLE public.pedidos ENABLE TRIGGER pedidos_guard_update_trg;
END $$;

-- =============================================
-- 1. Tabelas Pix (0059/0060 nunca aplicaram aqui): já nascem hardenadas
-- =============================================
CREATE TABLE IF NOT EXISTS public.pix_reader_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL,
  device_identifier text NOT NULL UNIQUE,
  token_hash text,
  status text NOT NULL DEFAULT 'ACTIVE',
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  app_version text NOT NULL DEFAULT '1.0.0',
  environment text NOT NULL DEFAULT 'TEST',
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS pix_devices_identifier_idx
  ON public.pix_reader_devices (device_identifier);

CREATE TABLE IF NOT EXISTS public.pix_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_hash text NOT NULL UNIQUE,
  source_app text NOT NULL,
  bank_name text,
  notification_title text NOT NULL,
  notification_text text NOT NULL,
  amount numeric(10,2),
  sender_name text,
  reference text,
  detected_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'PENDENTE',
  matched_order_id uuid,
  environment text NOT NULL DEFAULT 'TEST',
  device_id uuid,
  device_identifier text,
  conferencia_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_event_hash
  ON public.pix_notification_events (event_hash);
CREATE INDEX IF NOT EXISTS idx_pix_notification_events_status
  ON public.pix_notification_events (status);
CREATE INDEX IF NOT EXISTS pix_events_device_identifier_idx
  ON public.pix_notification_events (device_identifier);

COMMENT ON COLUMN public.pix_reader_devices.token_hash IS
  'SHA-256 hex do token do aparelho. A API compara; token puro nunca é gravado.';
COMMENT ON COLUMN public.pix_notification_events.conferencia_motivo IS
  'Quando status=CONFERIR: sem_pedido_valor | multiplos_pedidos_mesmo_valor.';

-- RLS restrita desde a criação: leitura só admin/financeiro; insert só
-- servidor (service_role, sem policy p/ authenticated = negado); staff
-- pode UPDATE p/ dar baixa no CONFERIR.
ALTER TABLE public.pix_reader_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pix_reader_devices_staff_read" ON public.pix_reader_devices;
CREATE POLICY "pix_reader_devices_staff_read" ON public.pix_reader_devices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "pix_events_staff_read" ON public.pix_notification_events;
CREATE POLICY "pix_events_staff_read" ON public.pix_notification_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

DROP POLICY IF EXISTS "pix_events_staff_update" ON public.pix_notification_events;
CREATE POLICY "pix_events_staff_update" ON public.pix_notification_events
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

REVOKE INSERT ON public.pix_notification_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pix_reader_devices FROM authenticated;
GRANT SELECT, UPDATE ON public.pix_notification_events TO authenticated;
GRANT SELECT ON public.pix_reader_devices TO authenticated;
GRANT ALL ON public.pix_notification_events TO service_role;
GRANT ALL ON public.pix_reader_devices TO service_role;

-- =============================================
-- 2. Remove a 0058 bugada (trigger + função)
-- =============================================
DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
DROP TRIGGER IF EXISTS trigger_pagamento_confirmado ON public.pedidos;
DROP FUNCTION IF EXISTS public.handle_pagamento_confirmado();
DROP FUNCTION IF EXISTS public.gerar_cupom_pedido();
DROP FUNCTION IF EXISTS public.trg_gerar_cupom_apos_itens();
DROP FUNCTION IF EXISTS public.trg_pagamento_confirmado();

-- =============================================
-- 3. Função NORMAL (não-trigger): enfileirar_cupom(p_pedido_id)
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

-- =============================================
-- 4. Gatilhos (sintaxe válida: sem OR REPLACE, com parênteses)
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

-- =============================================
-- 5. Backfill: pagos sem cupom (era 0061, nunca aplicou aqui)
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

-- =============================================
-- 6. Guard: mantém o corpo vigente NESTE banco (0005) + bypass service_role
-- (sem as regras de motoboy que nunca existiram aqui; sem mudar comportamento)
-- =============================================
CREATE OR REPLACE FUNCTION public.pedidos_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Servidor (API Pix, jobs): trusted. RLS já não se aplica a service_role.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'producao')
     OR public.has_role(auth.uid(),'atendente')
     OR public.has_role(auth.uid(),'financeiro') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(),'motoboy') THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega
       OR NEW.desconto IS DISTINCT FROM OLD.desconto
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.cupom IS DISTINCT FROM OLD.cupom
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
       OR NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      RAISE EXCEPTION 'motoboy_nao_pode_alterar_valores';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.user_id = auth.uid() AND OLD.status = 'recebido' AND NEW.status = 'cancelado'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.numero IS NOT DISTINCT FROM OLD.numero
     AND NEW.cliente_nome IS NOT DISTINCT FROM OLD.cliente_nome
     AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
     AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco
     AND NEW.bairro IS NOT DISTINCT FROM OLD.bairro
     AND NEW.complemento IS NOT DISTINCT FROM OLD.complemento
     AND NEW.referencia IS NOT DISTINCT FROM OLD.referencia
     AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
     AND NEW.forma_pagamento IS NOT DISTINCT FROM OLD.forma_pagamento
     AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.taxa_entrega IS NOT DISTINCT FROM OLD.taxa_entrega
     AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto
     AND NEW.total IS NOT DISTINCT FROM OLD.total
     AND NEW.cupom IS NOT DISTINCT FROM OLD.cupom
     AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
     AND NEW.producao_status IS NOT DISTINCT FROM OLD.producao_status
     AND NEW.motoboy_id IS NOT DISTINCT FROM OLD.motoboy_id
     AND NEW.taxa_motoboy IS NOT DISTINCT FROM OLD.taxa_motoboy
     AND NEW.agendado_para IS NOT DISTINCT FROM OLD.agendado_para
     AND NEW.agendamento_obs IS NOT DISTINCT FROM OLD.agendamento_obs
     AND NEW.tipo_evento IS NOT DISTINCT FROM OLD.tipo_evento
     AND NEW.campanha_origem IS NOT DISTINCT FROM OLD.campanha_origem
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.destino_lat IS NOT DISTINCT FROM OLD.destino_lat
     AND NEW.destino_lng IS NOT DISTINCT FROM OLD.destino_lng
     AND NEW.motoboy_lat IS NOT DISTINCT FROM OLD.motoboy_lat
     AND NEW.motoboy_lng IS NOT DISTINCT FROM OLD.motoboy_lng
     AND NEW.motoboy_atualizado_em IS NOT DISTINCT FROM OLD.motoboy_atualizado_em
     AND NEW.aceito_em IS NOT DISTINCT FROM OLD.aceito_em
     AND NEW.entregue_em IS NOT DISTINCT FROM OLD.entregue_em THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'operacao_nao_permitida';
END;
$$;

-- =============================================
-- 7. Índices
-- =============================================
CREATE INDEX IF NOT EXISTS pedidos_pagamento_modalidade_idx ON public.pedidos (pagamento_modalidade);
