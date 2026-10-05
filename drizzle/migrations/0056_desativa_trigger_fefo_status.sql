-- 0056: desativar trigger FEFO na transição de status de pedidos.
-- A reserva de pedidos continua sendo a da 0030 (produtos.estoque/reservas_estoque).
-- Idempotente.

DROP TRIGGER IF EXISTS trigger_reserva_estoque_pedido ON public.pedidos;

COMMENT ON FUNCTION public.reservar_estoque_pedido IS
'Mantida para uso futuro/manual; não é mais disparada automaticamente ao iniciar produção.';
