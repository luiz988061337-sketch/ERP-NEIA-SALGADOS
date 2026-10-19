-- ============================================================================
-- 0098: MATRIZ DE MENOR PRIVILEGIO (0089-0097)
-- ============================================================================
-- Fecha os grants historicos excessivos identificados na auditoria:
--   - `liberar_reserva_atomica` tinha PUBLIC/anon/service_role;
--   - `reservar_pedido_atomico` e `reservar_estoque_atomica` tinham service_role;
--   - as tabelas 0092 tinham service_role ALL;
--   - funcoes de trigger 0094/0095 herdavam PUBLIC.
--
-- NAO revoga o DML de `authenticated` em `reservas_estoque`/
-- `estoque_movimentacoes`: os fallbacks legados de admin/pedido/checkout ainda
-- existem e sao protegidos por RLS staff. A remocao desse DML e feita junto da
-- remocao dos fallbacks (pos-cutover, com os chamadores 100% atomicos).
--
-- `service_role` NAO recebe EXECUTE em nenhuma RPC nova sem chamador provado.
-- O print-agent/app usam `authenticated`; a 0095/0093 chamam 0089/0090 como
-- owner (SECURITY DEFINER), sem precisar de grant ao chamador.
-- ============================================================================

-- 1. Funcoes legadas / atomicas -------------------------------------------------
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(uuid) TO authenticated;

-- 2. Internas / chamadas somente por SECURITY DEFINER ---------------------------
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM service_role;

-- 3. RPCs de app: somente authenticated ----------------------------------------
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(uuid) TO authenticated;

-- 4. Funcoes de trigger: nao sao RPC; trigger nao exige EXECUTE do chamador ----
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM anon;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM authenticated;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM service_role;

-- 5. Tabelas 0092: leitura staff; escrita somente por funcoes definer --------
REVOKE ALL ON TABLE public.reserva_consumos FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_consumos FROM anon;
REVOKE ALL ON TABLE public.reserva_consumos FROM authenticated;
REVOKE ALL ON TABLE public.reserva_consumos FROM service_role;
GRANT SELECT ON TABLE public.reserva_consumos TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia_config TO authenticated;

-- 6. 0097: sem service_role/anon (reforco idempotente) -----------------------
REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

-- 7. Reservas/movimentos: remove apenas os papeis tecnicos externos -----------
REVOKE ALL ON TABLE public.reservas_estoque FROM PUBLIC;
REVOKE ALL ON TABLE public.reservas_estoque FROM anon;
REVOKE ALL ON TABLE public.reservas_estoque FROM service_role;

REVOKE ALL ON TABLE public.estoque_movimentacoes FROM PUBLIC;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM anon;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM service_role;
