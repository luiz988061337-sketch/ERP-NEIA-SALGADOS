-- 0062: trigger pagamento confirmado
-- Trigger que dispara gera��o autom�tica de cupom quando pagamento � confirmado.
-- Executa quando pagamento_status muda de para 'pago'.
-- Define a session app.pedido_id para a fun��o gerar_cupom_pedido().
-- Chama gerar_cupom_pedido() para criar job na fila de impress�o.
-- Idempotente: ON CONFLICT (trabalho_uuid) DO N�HING.
--
-- N��o adiciona coluna environment em pedidos.
-- N��o modifica print-agent nem Tanca.
--
-- Como funciona:
--   1. Trigger detecta cambio de pagamento_status pending -> pago
--   2. Define session app.pedido_id = NEW.id
--   3. Chama gerar_cupom_pedido() que l� a session e gera o cupom
--   4. Ocupa o job na fila_impressao
--
-- Execucao manual (opcional):
--   SELECT set_config('app.pedido_id', NULL, false);
--   SELECT gerar_cupons_pedidos_pagos();
--
-- Trigger autom�tico ja criado ap�s a migration.

-- =============================================
-- Fun��o que dispara a gera��o de cupom no pagamento confirmado
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_pagamento_confirmado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Zera a session variable antes
  PERFORM set_config('app.pedido_id', NULL, false);
  
  -- Dispara somente na transi��o de para 'pago'
  IF (NEW.pagamento_status = 'pago' AND OLD.pagamento_status != 'pago') THEN
    -- Define o pedido_id em session para a fun��o ler
    PERFORM set_config('app.pedido_id', NEW.id::text, false);
    -- Chama a fun��o de gera��o de cupom
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
COMMENT ON TRIGGER trigger_pagamento_confirmado ON public.pedidos IS 'Dispara gera��o autom�tica de cupom quando pagamento confirma�o (pending -> pago). Define session app.pedido_id para a fun��o gerar_cupom_pedido(). Chama gerar_cupom_pedido(). Idempotente via ON CONFLICT DO NOTHING na fila_impressao. N��o adiciona coluna environment em pedidos. N��o modifica print-agent nem Tanca.';

COMMENT ON FUNCTION public.handle_pagamento_confirmado() IS 'Dispara gera��o de cupom quando pagamento confirma�o (pending -> pago). Define session app.pedido_id para a fun��o gerar_cupom_pedido(). Chama gerar_cupom_pedido(). Idempotente via ON CONFLICT DO NOTHING na fila_impressao.';