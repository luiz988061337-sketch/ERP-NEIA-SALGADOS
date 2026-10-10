-- 0063: Corrigir fluxo de impressão e segurança Pix
-- Corrige problemas identificados nas migrations 0058, 0061, 0062
-- Adiciona campo pagamento_modalidade para distinguir online vs na_entrega
-- Corrige RLS das tabelas Pix
-- Remove triggers/funções duplicadas
-- Corrige sintaxe da função 0061

-- =============================================
-- 1. Adicionar campo pagamento_modalidade em pedidos
-- =============================================
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pagamento_modalidade text NOT NULL DEFAULT 'online';

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_pagamento_modalidade_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pagamento_modalidade_check
  CHECK (pagamento_modalidade IN ('online', 'na_entrega'));

COMMENT ON COLUMN public.pedidos.pagamento_modalidade IS
  'Modalidade de pagamento: online (pix, credito, debito processados online) ou na_entrega (dinheiro, cartao/pix na entrega). Determina quando imprimir cupom.';

-- Atualizar pedidos existentes baseado em regra: entrega + dinheiro = na_entrega, resto = online
UPDATE public.pedidos SET pagamento_modalidade = 'na_entrega'
WHERE tipo_entrega = 'entrega' AND forma_pagamento = 'dinheiro';

UPDATE public.pedidos SET pagamento_modalidade = 'online'
WHERE pagamento_modalidade IS NULL OR pagamento_modalidade = 'online';

-- =============================================
-- 1b. Adicionar campo pagamento_modalidade em pedidos_recorrentes
-- =============================================
ALTER TABLE public.pedidos_recorrentes
  ADD COLUMN IF NOT EXISTS pagamento_modalidade text NOT NULL DEFAULT 'online';

ALTER TABLE public.pedidos_recorrentes DROP CONSTRAINT IF EXISTS recorrentes_pagamento_modalidade_check;
ALTER TABLE public.pedidos_recorrentes ADD CONSTRAINT recorrentes_pagamento_modalidade_check
  CHECK (pagamento_modalidade IN ('online', 'na_entrega'));

COMMENT ON COLUMN public.pedidos_recorrentes.pagamento_modalidade IS
  'Modalidade de pagamento: online (pix, credito, debito processados online) ou na_entrega (dinheiro, cartao/pix na entrega). Determina quando imprimir cupom ao gerar pedido.';

-- Atualizar recorrentes existentes
UPDATE public.pedidos_recorrentes SET pagamento_modalidade = 'na_entrega'
WHERE endereco != 'Retirada' AND forma_pagamento = 'dinheiro';

UPDATE public.pedidos_recorrentes SET pagamento_modalidade = 'online'
WHERE pagamento_modalidade IS NULL OR pagamento_modalidade = 'online';

-- =============================================
-- 2. Remover trigger e função duplicada da 0062 (mantém a da 0058)
-- =============================================
DROP TRIGGER IF EXISTS trigger_pagamento_confirmado ON public.pedidos;
DROP FUNCTION IF EXISTS public.handle_pagamento_confirmado();

-- =============================================
-- 3. Recriar função handle_pagamento_confirmado corrigida (versão única)
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_pagamento_confirmado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Zera a session variable antes
  PERFORM set_config('app.pedido_id', NULL, false);
  
  -- Dispara somente na transição de 'pendente' para 'pago'
  IF (NEW.pagamento_status = 'pago' AND OLD.pagamento_status = 'pendente') THEN
    -- Define o pedido_id em session para a função ler
    PERFORM set_config('app.pedido_id', NEW.id::text, false);
    -- Chama a função de geração de cupom
    PERFORM public.gerar_cupom_pedido();
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 4. Recriar trigger automático em pedidos (versão única)
-- =============================================
CREATE OR REPLACE TRIGGER trigger_pagamento_confirmado
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status
        AND NEW.pagamento_status = 'pago'
        AND OLD.pagamento_status = 'pendente')
  EXECUTE FUNCTION public.handle_pagamento_confirmado;

-- =============================================
-- 5. Corrigir função gerar_cupom_pedido para considerar pagamento_modalidade
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_cupom_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedido_id_param uuid := NULL;
  v_pedido_id uuid;
  v_pedido_row public.pedidos%ROWTYPE;
  v_existe integer;
  v_payload text;
  v_numero integer;
  v_cliente text;
  v_telefone text;
  v_tipo_entrega text;
  v_forma_pagamento text;
  v_observacoes text;
  v_total numeric;
  v_subtotal numeric;
  v_taxa_entrega numeric;
  v_status text;
  v_total_unidades integer;
  v_item_rec record;
  v_item_count integer := 0;
  v_pagamento_modalidade text;
  v_session_pedido_id text := current_setting('app.pedido_id', true);
BEGIN
  IF v_session_pedido_id IS NOT NULL THEN
    v_pedido_id_param := v_session_pedido_id::uuid;
  END IF;

  LOOP
    IF v_pedido_id_param IS NOT NULL THEN
      SELECT v_pedido_id_param INTO v_pedido_id;
    ELSE
      SELECT DISTINCT pedido_id INTO v_pedido_id FROM new_itens;
    END IF;

    IF v_pedido_id IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';
    IF v_existe > 0 THEN
      RETURN NULL;
    END IF;

    SELECT * INTO v_pedido_row FROM public.pedidos WHERE id = v_pedido_id;
    v_pagamento_modalidade := v_pedido_row.pagamento_modalidade;

    -- LÓGICA DE DECISÃO DE IMPRESSÃO:
    -- 1. Pagamento na entrega (dinheiro, cartao/pix na entrega) -> imprime sempre
    -- 2. Pagamento online (pix, credito, debito) -> só imprime se pagamento_status = 'pago'
    IF v_pagamento_modalidade = 'online' AND v_pedido_row.pagamento_status != 'pago' THEN
      -- Pagamento online pendente -> NÃO imprime
      RETURN NULL;
    END IF;
    -- Se modalidade na_entrega OU pagamento online já pago -> prossegue para imprimir

    SELECT COUNT(*) INTO v_item_count FROM public.pedido_itens WHERE pedido_id = v_pedido_id;
    IF v_item_count = 0 THEN
      RETURN NULL;
    END IF;

    v_numero := v_pedido_row.numero;
    v_cliente := v_pedido_row.cliente_nome;
    v_telefone := v_pedido_row.telefone;
    v_tipo_entrega := v_pedido_row.tipo_entrega;
    v_forma_pagamento := v_pedido_row.forma_pagamento;
    v_observacoes := COALESCE(v_pedido_row.observacoes, '');
    v_subtotal := v_pedido_row.subtotal;
    v_taxa_entrega := v_pedido_row.taxa_entrega;
    v_total := v_pedido_row.total;
    v_status := v_pedido_row.pagamento_status;

    v_total_unidades := 0;
    v_payload := '--- CUPOM FISCAL ---' || chr(10);
    v_payload := v_payload || 'Pedido #:' || v_numero || chr(10);
    v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
    v_payload := v_payload || 'Cliente: ' || v_cliente || chr(10);
    v_payload := v_payload || 'Telefone: ' || v_telefone || chr(10);
    v_payload := v_payload || '----------------------------------------' || chr(10);

    FOR v_item_rec IN
      SELECT nome, preco_unitario, quantidade 
      FROM public.pedido_itens 
      WHERE pedido_id = v_pedido_id
      ORDER BY nome
    LOOP
      v_total_unidades := v_total_unidades + v_item_rec.quantidade;
      v_payload := v_payload || '(' || v_item_rec.quantidade || ') ' || v_item_rec.nome || chr(10);
      v_payload := v_payload || 'Preco: R$ ' || to_char(v_item_rec.preco_unitario, '999G999G990D00') || chr(10);
    END LOOP;

    v_payload := v_payload || '----------------------------------------' || chr(10);
    v_payload := v_payload || 'Total Unidades: ' || v_total_unidades || chr(10);
    v_payload := v_payload || 'Subtotal: R$ ' || to_char(v_subtotal, '999G999G990D00') || chr(10);
    v_payload := v_payload || 'Forma Pagamento: ' || v_forma_pagamento || chr(10);
    v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(v_taxa_entrega, '999G999G990D00') || chr(10);
    v_payload := v_payload || 'Total: R$ ' || to_char(v_total, '999G999G990D00') || chr(10);

    IF v_tipo_entrega = 'entrega' THEN
      v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
      v_payload := v_payload || 'Endereco: ' || COALESCE(v_pedido_row.endereco, '') || chr(10);
      v_payload := v_payload || 'Bairro: ' || COALESCE(v_pedido_row.bairro, '') || chr(10);
      v_payload := v_payload || 'Cidade: ' || COALESCE(v_pedido_row.cidade, '') || chr(10);
      v_payload := v_payload || 'CEP: ' || COALESCE(v_pedido_row.cep, '') || chr(10);
    ELSE
      v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
    END IF;

    v_payload := v_payload || 'Modalidade Pagamento: ' || v_pagamento_modalidade || chr(10);
    v_payload := v_payload || 'Status Pagamento: ' || v_status || chr(10);
    v_payload := v_payload || 'Observacoes: ' || v_observacoes || chr(10);
    v_payload := v_payload || '--- FIM CUPOM ---';

    INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
    VALUES (v_pedido_id, 'pedido', v_payload, 'Tanca TP-550', v_pedido_id || ':pedido', 'pendente', now(), now())
    ON CONFLICT (trabalho_uuid) DO NOTHING;

    EXIT;
  END LOOP;

  RETURN NULL;
END;
$$;

-- =============================================
-- 6. Corrigir trigger_gerar_cupom_apos_itens para usar a nova lógica
-- =============================================
DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
CREATE TRIGGER trigger_gerar_cupom_apos_itens
  AFTER INSERT ON public.pedido_itens
  REFERENCING NEW TABLE AS new_itens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.gerar_cupom_pedido();

-- =============================================
-- 7. Corrigir função 0061 (gerar_cupons_pedidos_pagos) - sintaxe e lógica
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_cupons_pedidos_pagos()
RETURNS text AS $$
DECLARE
  v_pedido_id uuid;
  v_existe integer;
  v_pedido_row public.pedidos%ROWTYPE;
  v_count integer := 0;
  v_payload text;
  v_total_unidades integer;
  v_item_rec record;
BEGIN
  FOR v_pedido_id IN
    SELECT id FROM public.pedidos 
    WHERE pagamento_status = 'pago' 
    AND impresso = false
  LOOP
    SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';
    
    IF v_existe = 0 THEN
      SELECT * INTO v_pedido_row FROM public.pedidos WHERE id = v_pedido_id;
      
      IF v_pedido_row.pagamento_status = 'pago' THEN
        v_total_unidades := 0;
        v_payload := '--- CUPOM FISCAL ---' || chr(10);
        v_payload := v_payload || 'Pedido #' || v_pedido_row.numero || chr(10);
        v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
        v_payload := v_payload || 'Cliente: ' || v_pedido_row.cliente_nome || chr(10);
        v_payload := v_payload || 'Telefone: ' || v_pedido_row.telefone || chr(10);
        v_payload := v_payload || '----------------------------------------' || chr(10);
        
        FOR v_item_rec IN SELECT nome, preco_unitario, quantidade FROM public.pedido_itens WHERE pedido_id = v_pedido_id LOOP
          v_total_unidades := v_total_unidades + v_item_rec.quantidade;
          v_payload := v_payload || '(' || v_item_rec.quantidade || ') ' || v_item_rec.nome || chr(10);
          v_payload := v_payload || 'Preco: R$ ' || to_char(v_item_rec.preco_unitario, '999G999G990D00') || chr(10);
        END LOOP;
        
        v_payload := v_payload || '----------------------------------------' || chr(10);
        v_payload := v_payload || 'Total Unidades: ' || v_total_unidades || chr(10);
        v_payload := v_payload || 'Subtotal: R$ ' || to_char(v_pedido_row.subtotal, '999G999G990D00') || chr(10);
        v_payload := v_payload || 'Forma Pagamento: ' || v_pedido_row.forma_pagamento || chr(10);
        v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(v_pedido_row.taxa_entrega, '999G999G990D00') || chr(10);
        v_payload := v_payload || 'Total: R$ ' || to_char(v_pedido_row.total, '999G999G990D00') || chr(10);
        v_payload := v_payload || '--- FIM CUPOM ---';
        
        INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
        VALUES (v_pedido_id, 'pedido', v_payload, 'Tanca TP-550', v_pedido_id || ':pedido', 'pendente', now(), now());
        
        UPDATE public.pedidos SET impresso = true WHERE id = v_pedido_id;
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN 'Gerados ' || v_count || ' cupons para pedidos pagos';
END;
$$;

GRANT EXECUTE ON public.gerar_cupons_pedidos_pagos TO authenticated;

-- =============================================
-- 8. Corrigir RLS das tabelas Pix - restringir acesso
-- =============================================
-- pix_notification_events: apenas admin/service_role podem ler/escrever
DROP POLICY IF EXISTS "pix_notification_events_select_own" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_insert" ON public.pix_notification_events;
DROP POLICY IF EXISTS "pix_notification_events_update" ON public.pix_notification_events;

-- Apenas admin e service_role podem gerenciar eventos Pix
CREATE POLICY "pix_notification_events_admin_all" ON public.pix_notification_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT ALL ON public.pix_notification_events TO service_role;

-- pix_reader_devices: apenas admin pode gerenciar dispositivos
DROP POLICY IF EXISTS "pix_reader_devices_select_own" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_insert" ON public.pix_reader_devices;
DROP POLICY IF EXISTS "pix_reader_devices_update" ON public.pix_reader_devices;

CREATE POLICY "pix_reader_devices_admin_all" ON public.pix_reader_devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT ALL ON public.pix_reader_devices TO service_role;

-- =============================================
-- 9. Atualizar comentários das funções/triggers
-- =============================================
COMMENT ON TRIGGER trigger_gerar_cupom_apos_itens ON public.pedido_itens IS 
  'Gera cupom considerando pagamento_modalidade: na_entrega imprime sempre; online só imprime se pagamento_status = pago.';

COMMENT ON FUNCTION public.gerar_cupom_pedido() IS 
  'Gera cupom considerando pagamento_modalidade: na_entrega (dinheiro/cartao na entrega) imprime sempre; online (pix/credito/debito) só se pagamento_status = pago. Idempotente via trabalho_uuid.';

COMMENT ON FUNCTION public.handle_pagamento_confirmado() IS 
  'Dispara geração de cupom quando pagamento muda de pendente para pago. Define session app.pedido_id e chama gerar_cupom_pedido().';

COMMENT ON TRIGGER trigger_pagamento_confirmado ON public.pedidos IS 
  'Dispara geração automática de cupom quando pagamento confirma (pendente -> pago).';

COMMENT ON FUNCTION public.gerar_cupons_pedidos_pagos() IS 
  'Gera cupons para pedidos pagos sem impressão (pagamento_status = pago AND impresso = false). Idempotente via trabalho_uuid.';

-- =============================================
-- 10. Índices para performance
-- =============================================
CREATE INDEX IF NOT EXISTS pedidos_pagamento_modalidade_idx ON public.pedidos (pagamento_modalidade);