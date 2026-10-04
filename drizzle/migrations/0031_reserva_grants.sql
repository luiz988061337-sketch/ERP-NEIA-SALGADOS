-- 0031: grants das funções de reserva atômica (checkout chama via RPC).
-- Idempotente. Rode no SQL Editor APÓS 0030.

GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO service_role;
