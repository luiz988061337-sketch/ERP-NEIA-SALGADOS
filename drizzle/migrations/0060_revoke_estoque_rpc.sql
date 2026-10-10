-- 0060: restringir EXECUTE direto nas funções internas de estoque (K5 Fase 2).
-- CONTEXTO (auditoria K3/K4, somente código local):
--   - registrar_mov_estoque (2 assinaturas), reservar_estoque_pedido,
--     liberar_reserva_pedido e calcular_tempo_fritura são SECURITY DEFINER
--     SEM nenhum REVOKE/GRANT restritivo em 0042/0043/0048/0050 -> caem no
--     default (EXECUTE aberto), ficando chamáveis pelo navegador via PostgREST.
--   - NENHUM fluxo do app chama essas funções diretamente: só triggers
--     (trigger_criar_fritura_fila, trigger_reserva_estoque_pedido) e chamadas
--     internas entre funções (0042/0048/0050). Logo, revogar do navegador
--     não interrompe nenhum fluxo legítimo.
-- POR QUE TRIGGERS E CHAMADAS INTERNAS CONTINUAM FUNCIONANDO:
--   - O disparo de trigger NÃO exige EXECUTE da função pelo usuário que fez
--     o UPDATE (a checagem de permissão ocorre sobre a TABELA, via RLS);
--     chamadas internas partem de funções DEFINER (dono), também sem checagem.
--   - NENHUM fluxo de servidor (Edge/agent) chama essas funções (verificado
--     por grep em supabase/, print-agent/ e scripts/): portanto SEM GRANT a
--     service_role — privilégio mínimo, sem conveniência preventiva.
-- FORA DO ESCOPO (não tocar): reservar/liberar_estoque_atomica (0030, usadas
--   pelo checkout — grants 0031 mantidos; autorização interna vem na 0061),
--   creditar_pontos_pedido / resgatar_fidelidade (0002, já restritas e com
--   checagem de dono), funções de trigger e pedidos_guard_update (não
--   expostas por API; RLS/guard inalterados aqui).
-- Idempotente. SEM nenhum GRANT (só REVOKE). NÃO aplicar sem autorização. Staging + backup antes.

-- registrar_mov_estoque (0042: 8 args)
REVOKE ALL ON FUNCTION public.registrar_mov_estoque(
  uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated;

-- registrar_mov_estoque (0050: 9 args, +p_atualizar_estoque)
REVOKE ALL ON FUNCTION public.registrar_mov_estoque(
  uuid, public.tipo_mov_estoque, integer, uuid, uuid, text, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;

-- reservar_estoque_pedido (0042/0048/0050)
REVOKE ALL ON FUNCTION public.reservar_estoque_pedido(uuid)
  FROM PUBLIC, anon, authenticated;

-- liberar_reserva_pedido (0042/0050)
REVOKE ALL ON FUNCTION public.liberar_reserva_pedido(uuid)
  FROM PUBLIC, anon, authenticated;

-- calcular_tempo_fritura (0043, só leitura, só usada pelo trigger)
REVOKE ALL ON FUNCTION public.calcular_tempo_fritura(uuid, integer)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.reservar_estoque_pedido(uuid) IS
  '0060: EXECUTE direto revogado (PUBLIC/anon/authenticated, sem GRANT residual); só trigger/interno. Autorização de dono/staff vem na 0061.';
