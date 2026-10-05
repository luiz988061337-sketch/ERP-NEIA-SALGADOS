-- 0057: desativa reserva automática por lotes ao iniciar preparo.
-- O estoque do pedido já foi reservado atomicamente no checkout.
-- Iniciar preparo não deve reservar estoque novamente.
-- Idempotente.

DROP TRIGGER IF EXISTS trigger_reserva_estoque_pedido
ON public.pedidos;
