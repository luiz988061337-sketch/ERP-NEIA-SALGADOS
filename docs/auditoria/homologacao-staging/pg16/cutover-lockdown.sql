-- ============================================================================
-- CUTOVER LOCKDOWN (ENSAIO) - remover caminhos legados de escrita direta
-- ----------------------------------------------------------------------------
-- Aplicar SOMENTE no cutover, depois que o build de cutover removeu os
-- fallbacks. Complementa a 0098 (que deixou o DML de `authenticated` de
-- proposito para os fallbacks ainda presentes no codigo).
--
-- Efeito: um bundle antigo em cache, mesmo com a flag OFF, NAO consegue mais
-- escrever reserva/movimento direto, nem chamar as RPCs antigas. O fluxo novo
-- (0095/0091/0093, SECURITY DEFINER) continua funcionando.
-- ============================================================================

-- 1. Escrita direta em reservas/movimentos: so via funcao definer ------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reservas_estoque FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.estoque_movimentacoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pedido_item_componentes FROM authenticated;

-- 2. Compensacao por DELETE inseguro de pedido (fallback legado) -------------
REVOKE DELETE ON TABLE public.pedidos FROM authenticated;

-- 3. RPCs legadas de reserva: nao mais executaveis pelo cliente -------------
REVOKE EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) FROM authenticated;
