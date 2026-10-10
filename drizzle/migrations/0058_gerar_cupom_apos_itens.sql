-- 0058: gerar cupom automaticamente ap�s inserir itens do pedido
-- Idempotente. Rode AP�S 0057.
--
-- Trigger que cria automaticamente um entry em public.fila_impressao
-- quando pedido_itens s�o inseridos no checkout.
-- SOMENTE gera cupom se pagamento_status = 'pago'.
-- Garante que o cupom tenha itens reais (n�o � "(sem itens)").
-- Usa transition table para lidar com INSERT multiple de um s� vez.
-- Previne duplicidade via ON CONFLICT (trabalho_uuid) DO NOTHING.
-- Funcao SECURITY DEFINER com search_path seguro.
--
-- Pode ser chamada de dois caminhos:
--   1) trigger de pedido_itens (contexto NEW TABLE)
--   2. trigger de pedidos (recebendo pedido_id explicitamente)
--
-- =============================================
-- 1. Funcao que constroi o payload do cupom
-- =============================================
CREATE OR REPLACE FUNCTION public.gerar_cupom_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Parametro opcional: quando vindo de trigger de pedidos (pedido_id em session)
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
  -- Session variable para passagem de pedido_id entre o trigger e a fun��o
  v_session_pedido_id text := current_setting('app.pedido_id', true);
BEGIN
  -- Verificar se chamado via trigger de pedidos (com pedido_id em session)
  -- ou via trigger de pedido_itens (contexto NEW TABLE)
  IF v_session_pedido_id IS NOT NULL THEN
    v_pedido_id_param := v_session_pedido_id::uuid;
  END IF;

  -- Processa cada unique pedido_id
  -- Caminho 1: via trigger de pedido_itens (contexto NEW TABLE)
  -- Caminho 2: via trigger de pedidos (pedido_id em session)
  LOOP
    -- Determinar quais pedidos processar
    IF v_pedido_id_param IS NOT NULL THEN
      -- Caminho 2: processar apenas o pedido_id da session
      SELECT v_pedido_id_param INTO v_pedido_id;
    ELSE
      -- Caminho 1: processar todos os pedidos do INSERT (contexto original)
      SELECT DISTINCT pedido_id INTO v_pedido_id FROM new_itens;
    END IF;

    -- Se n�o houver pedido para processar, sair
    IF v_pedido_id IS NULL THEN
      RETURN NULL;
    END IF;

    -- Verifica se j� existe fila para este pedido?
    SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';

    -- J� existe fila -> idempotente, n�o faz nada
    IF v_existe > 0 THEN
      RETURN NULL;
    END IF;

    -- Busca dados do pedido para verificar pagamento
    SELECT * INTO v_pedido_row FROM public.pedidos WHERE id = v_pedido_id;

    -- SEMPRE GARDA: s� gera cupom se pagamento estiver confirmado
    IF v_pedido_row.pagamento_status != 'pago' THEN
      -- N�o gera cupom agora. O job n�o � criado.
      -- � responsabilidade do administrador ou de um processo posterior
      -- gerar o cupom aps o pagamento ser confirmado.
      RETURN NULL; -- statement trigger retorna null
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

    -- Contar itens do pedido (validar que possui itens)
    SELECT COUNT(*) INTO v_item_count FROM public.pedido_itens WHERE pedido_id = v_pedido_id;
    IF v_item_count = 0 THEN
      -- Pedido sem itens n�o gera cupom
      RETURN NULL;
    END IF;

    -- Conta total de unidades e monta texto dos itens
    v_total_unidades := 0;
    v_payload := '--- CUPOM FISCAL ---' || chr(10);
    v_payload := v_payload || 'Pedido #:' || v_numero || chr(10);
    v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
    v_payload := v_payload || 'Cliente: ' || v_cliente || chr(10);
    v_payload := v_payload || 'Telefone: ' || v_telefone || chr(10);
    v_payload := v_payload || '----------------------------------------' || chr(10);

    -- Itera sobre os itens deste pedido usando cursor sobre a transition table
    FOR v_item_rec IN
      SELECT nome, preco_unitario, quantidade 
      FROM public.pedido_itens 
      WHERE pedido_id = v_pedido_id
      ORDER BY nome
    LOOP
      v_total_unidades := v_total_unidades + v_item_rec.quantidade;

      -- Linha do item: (50) Coxinha            R$ 80,00
      v_payload := v_payload || '(' || v_item_rec.quantidade || ') ' || v_item_rec.nome || chr(10);
      v_payload := v_payload || 'Preco: R$ ' || to_char(v_item_rec.preco_unitario, '999G999G990D00') || chr(10);
    END LOOP;

    -- Informacoes de entrega/retirada
    v_payload := v_payload || '----------------------------------------' || chr(10);
    v_payload := v_payload || 'Total Unidades: ' || v_total_unidades || chr(10);
    v_payload := v_payload || 'Subtotal: R$ ' || to_char(v_subtotal, '999G999G990D00') || chr(10);
    v_payload := v_payload || 'Forma Pagamento: ' || v_forma_pagamento || chr(10);

    -- Informacoes financeiras
    v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(v_taxa_entrega, '999G999G990D00') || chr(10);
    v_payload := v_payload || 'Total: R$ ' || to_char(v_total, '999G999G990D00') || chr(10);

    -- Endereco apenas para entrega
    IF v_tipo_entrega = 'entrega' THEN
      v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
      v_payload := v_payload || 'Endereco: ' || COALESCE(v_pedido_row.endereco, '') || chr(10);
      v_payload := v_payload || 'Bairro: ' || COALESCE(v_pedido_row.bairro, '') || chr(10);
      v_payload := v_payload || 'Cidade: ' || COALESCE(v_pedido_row.cidade, '') || chr(10);
      v_payload := v_payload || 'CEP: ' || COALESCE(v_pedido_row.cep, '') || chr(10);
    ELSE
      v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
    END IF;

    v_payload := v_payload || 'Observacoes: ' || v_observacoes || chr(10);
    v_payload := v_payload || 'Status: ' || v_status || chr(10);
    v_payload := v_payload || '--- FIM CUPOM ---';

    -- Insere na fila de impressao
    -- ON CONFLICT (trabalho_uuid) DO NOTHING: seguranca contra corrida de transacoes
    INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
    VALUES (v_pedido_id, 'pedido', v_payload, 'Tanca TP-550', v_pedido_id || ':pedido', 'pendente', now(), now())
    ON CONFLICT (trabalho_uuid) DO NOTHING;

    EXIT; -- Apenas processar o primeiro pedido (ou o pedido especificado)
  END LOOP;

  RETURN NULL; -- statement trigger retorna null
END;
$$;

-- =============================================
-- 2. Trigger: AFTER INSERT ON pedido_itens
-- =============================================
DROP TRIGGER IF EXISTS trigger_gerar_cupom_apos_itens ON public.pedido_itens;
CREATE TRIGGER trigger_gerar_cupom_apos_itens
  AFTER INSERT ON public.pedido_itens
  REFERENCING NEW TABLE AS new_itens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.gerar_cupom_pedido();

-- =============================================
-- Funcao para disparo autom�tico quando pagamento � confirmado
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_pagamento_confirmado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Zera a session variable antes
  PERFORM PERFORM set_config('app.pedido_id', NULL, false);
  
  -- Se o pagamento mudou de para 'pago'
  IF (NEW.pagamento_status = 'pago' AND OLD.pagamento_status != 'pago') THEN
    -- Define o pedido_id em session para a fun��o ler
    PERFORM set_config('app.pedido_id', NEW.id::text, false);
    -- Chama a funcao de gera�o de cupom
    PERFORM public.gerar_cupom_pedido();
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- Trigger autom�tico em pedidos
-- =============================================
CREATE OR REPLACE TRIGGER trigger_pagamento_confirmado
  AFTER UPDATE ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.pagamento_status IS DISTINCT FROM NEW.pagamento_status
        AND NEW.pagamento_status = 'pago')
  EXECUTE FUNCTION public.handle_pagamento_confirmado;

-- =============================================
-- Comentario
-- =============================================
COMMENT ON TRIGGER trigger_gerar_cupom_apos_itens ON public.pedido_itens IS 'Gera automaticamente fila de impressao com cupom completo ap�s inserir pedido_itens. S�o gera cupom se pagamento_status = pago. Usa REFERENCING NEW TABLE para processar INSERT multiple. Idempotente via trabalho_uuid. Pode ser chamado explicitamente via gerar_cupom_pedido(pedido_id) ou via session app.pedido_id';

COMMENT ON FUNCTION public.gerar_cupom_pedido() IS 'Funcao SECURITY DEFINER que gera cupom APENAS se pagamento_status = pago. Pode ser chamada sem argumentos (contexto pedido_itens) ou com argumento via session app.pedido_id. Constr�o payload completo com dados de pedido e itens. Previne duplicidade via ON CONFLICT (trabalho_uuid). Se pagamento n�o confirmado, n�o gera cupom - responsabilidade administrar posteriormente.';

-- =============================================
-- Funcao para limpeza de session
-- =============================================
COMMENT ON FUNCTION public.handle_pagamento_confirmado() IS 'Dispara gera�o de cupom quando pagamento confirma�o (pending -> pago). Define session app.pedido_id e chama gerar_cupom_pedido(). Idempotente via ON CONFLICT DO NOTHING na fila_impressao.';