-- 0061: gerar cupons para pedidos pagos sem cupom
-- Funcao para administrar geracao de cupons para pedidos ja pagos
-- que nao tiveram cupom gerado automaticamente no checkout.
--
-- Use-after: 0058, 0060
-- Execucao: psql -U postgres -d neia_db -f 0061_gerar_cupons_pagos.sql
-- ou via RPC/Supabase dashboard.
--
-- O que faz:
--   - Para cada pedido com pagamento_status = 'pago' AND impresso = false
--   - Se nao existir job na fila_impressao, cria um
--   - Se j� existir job, ignora (idempotente)
--
-- Observacao: Apos a execucao, o administrador deve verificar a fila
-- e o status dos pedidos. A impressao propriamente dita ficara a cargo
-- do print-agent.

CREATE OR REPLACE FUNCTION public.gerar_cupons_pedidos_pagos()
RETURNS text AS $$
DECLARE
  v_pedido_id uuid;
  v_existe integer;
  v_pedido_row public.pedidos%ROWTYPE;
  v_count integer := 0;
BEGIN
  -- Para cada pedido pago que ainda nao foi impresso
  FOR v_pedido_id IN
    SELECT id FROM public.pedidos WHERE pagamento_status = 'pago' AND impresso = false
  LOOP
    -- Verifica se j� existe job na fila para este pedido
    SELECT COUNT(*) INTO v_existe FROM public.fila_impressao WHERE trabalho_uuid = v_pedido_id || ':pedido';
    
    IF v_existe = 0 THEN
      -- Busca dados do pedido
      SELECT * INTO v_pedido_row FROM public.pedidos WHERE id = v_pedido_id;
      
      -- So gera se pagamento estiver confirmado (ja deveria estar, mas verifica)
      IF v_pedido_row.pagamento_status = 'pago' THEN
        -- Construe o payload basico
        v_payload := '--- CUPOM FISCAL ---' || chr(10);
        v_payload := v_payload || 'Pedido #' || v_pedido_row.numero || chr(10);
        v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
        v_payload := v_payload || 'Cliente: ' || v_pedido_row.cliente_nome || chr(10);
        v_payload := v_payload || 'Telefone: ' || v_pedido_row.telefone || chr(10);
        v_payload := v_payload || '----------------------------------------' || chr(10);
        
        -- Itens do pedido
        FOR v_item_rec IN SELECT nome, preco_unitario, quantidade FROM public.pedido_itens WHERE pedido_id = v_pedido_id LOOP
          v_payload := v_payload || '(' || v_item_rec.quantidade || ') ' || v_item_rec.nome || chr(10);
          v_payload := v_payload || 'Preco: R$ ' || to_char(v_item_rec.preco_unitario, '999G999G990D00') || chr(10);
        END LOOP;
        
        v_payload := v_payload || '----------------------------------------' || chr(10);
        v_payload := v_payload || 'Total Unidades: ' || 0 || chr(10); -- simplificado
        v_payload := v_payload || 'Subtotal: R$ 0' || chr(10);
        v_payload := v_payload || 'Forma Pagamento: ' || v_pedido_row.forma_pagamento || chr(10);
        v_payload := v_payload || 'Taxa de Entrega: R$ 0' || chr(10);
        v_payload := v_payload || 'Total: R$ ' || to_char(v_pedido_row.total, '999G999G990D00') || chr(10);
        v_payload := v_payload || '--- FIM CUPOM ---';
        
        -- Insere na fila de impressao
        INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
        VALUES (v_pedido_id, 'pedido', v_payload, 'Tanca TP-550', v_pedido_id || ':pedido', 'pendente', now(), now());
        
        -- Marca pedido como impresso para evitar loop
        UPDATE public.pedidos SET impresso = true WHERE id = v_pedido_id;
        
        v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN 'Gerados ' || v_count || ' cupons para pedidos pagos';
END;
$$;

-- Grant para que administradores possam executar
GRANT EXECUTE ON public.gerar_cupons_pedidos_pagos TO authenticated;