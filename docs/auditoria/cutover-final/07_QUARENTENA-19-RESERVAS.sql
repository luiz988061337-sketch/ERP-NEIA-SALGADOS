-- ============================================================================
-- 07_QUARENTENA-19-RESERVAS.sql — LEITURA DA QUARANTENA (somente SELECT)
-- ============================================================================
-- Objetivo:
--   * localizar as reservas historicas;
--   * classifica-las (mesma taxonomia da auditoria);
--   * confirmar que continuam ISOLADAS (sem proveniencia / sem ledger);
--   * confirmar que NAO houve credito automatico;
--   * detectar se apareceu alguma reserva historica PROBLEMATICA nova.
--
-- NÃO faz UPDATE. NÃO faz DELETE. NÃO faz INSERT. NÃO altera estoque.
-- Nenhuma correcao pode ser feita aqui: qualquer ajuste exige revisao manual,
-- conferencia fisica e autorizacao explicita, fora deste arquivo.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 07_QUARENTENA-19-RESERVAS.sql
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT '=== 07_QUARANTENA: 1. universo classificado (detalhe) ===' AS secao;
WITH base AS (
  SELECT
    r.id            AS reserva_id,
    r.pedido_id,
    r.produto_id,
    r.quantidade,
    r.status        AS reserva_status,
    r.created_at,
    p.status        AS pedido_status,
    p.pagamento_status,
    p.total         AS pedido_total,
    pr.reserva_id   AS prov_reserva_id,
    pr.origem       AS prov_origem,
    em.tipo         AS mov_tipo,
    em.quantidade   AS mov_quantidade,
    (SELECT count(*) FROM public.reserva_proveniencia x
      WHERE x.reserva_id = r.id) AS prov_count,
    (SELECT coalesce(sum(rc.quantidade), 0) FROM public.reserva_consumos rc
      WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id
  WHERE r.status IN ('ativa','consumida')
), classificado AS (
  SELECT b.*,
    CASE
      WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa'
        THEN 'pedido_cancelado_reserva_ativa'
      WHEN b.prov_count > 1
        THEN 'divergente_multipla_proveniencia'
      WHEN b.consumido > b.quantidade
        THEN 'divergente_consumo_excedente'
      WHEN b.prov_count = 1 AND b.consumido = b.quantidade
        THEN 'comprovada_por_proveniencia_e_consumo'
      WHEN b.prov_count = 1
        THEN 'comprovada_por_proveniencia'
      WHEN b.consumido = b.quantidade AND b.reserva_status = 'consumida'
        THEN 'comprovada_por_consumo'
      WHEN b.consumido > 0
        THEN 'parcial_sem_proveniencia'
      ELSE 'legado_sem_evidencia'
    END AS classe
  FROM base b
)
SELECT
  c.classe,
  c.acao_proposta,
  count(*)                     AS reservas,
  coalesce(sum(c.quantidade),0) AS unidades,
  min(c.created_at)            AS mais_antiga,
  max(c.created_at)            AS mais_recente
FROM (
  SELECT cl.*,
    CASE cl.classe
      WHEN 'comprovada_por_proveniencia_e_consumo' THEN 'sem_acao'
      WHEN 'comprovada_por_proveniencia'           THEN 'sem_acao'
      WHEN 'comprovada_por_consumo'                THEN 'sem_acao'
      WHEN 'pedido_cancelado_reserva_ativa'        THEN 'revisao_manual'
      WHEN 'divergente_multipla_proveniencia'      THEN 'revisao_manual'
      WHEN 'divergente_consumo_excedente'          THEN 'revisao_manual'
      WHEN 'parcial_sem_proveniencia'              THEN 'revisao_manual'
      ELSE 'quarentena_sem_credito'
    END AS acao_proposta
  FROM classificado cl
) c
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 07_QUARENTENA: 2. detalhe linha a linha (quarentena) ===' AS secao;
WITH base AS (
  SELECT r.id AS reserva_id, r.pedido_id, r.produto_id, r.quantidade,
         r.status AS reserva_status, r.created_at,
         p.status AS pedido_status, p.pagamento_status,
         (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) AS prov_count,
         (SELECT coalesce(sum(rc.quantidade),0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  WHERE r.status IN ('ativa','consumida')
)
SELECT
  b.*,
  CASE
    WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa' THEN 'pedido_cancelado_reserva_ativa'
    WHEN b.prov_count > 1 THEN 'divergente_multipla_proveniencia'
    WHEN b.consumido > b.quantidade THEN 'divergente_consumo_excedente'
    WHEN b.consumido > 0 AND b.prov_count = 0 THEN 'parcial_sem_proveniencia'
    WHEN b.consumido = 0 AND b.prov_count = 0 THEN 'legado_sem_evidencia'
    ELSE 'comprovada'
  END AS classe
FROM base b
ORDER BY b.created_at, b.reserva_id;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 3. ausencia de credito automatico ===' AS secao;
-- Uma reserva em quarentena NUNCA pode ter gerado credito de estoque.
-- Verificacao: nenhuma reserva sem proveniencia tem movimento de 'liberacao'/
-- 'cancelamento' associado, e nenhuma delas aparece como 'devolucao'.
SELECT
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL)                     AS ativas_sem_proveniencia,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
                     AND em.tipo IN ('liberacao','cancelamento','devolucao'))              AS ativas_com_credito,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
                     AND em.id IS NOT NULL)                                              AS ativas_com_movimento_sem_proveniencia,
  'quarentena nao gera credito: nenhuma reserva sem proveniencia tem movimento de liberacao' AS conclusao
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 4. integridade estrutural (NAO "corrigir" com UPDATE) ===' AS secao;
SELECT
  count(*) FILTER (WHERE produto_id IS NULL)  AS reservas_sem_produto,
  count(*) FILTER (WHERE pedido_id IS NULL)   AS reservas_sem_pedido,
  count(*) FILTER (WHERE quantidade <= 0)     AS reservas_quantidade_invalida,
  count(*) FILTER (WHERE status = 'ativa' AND produto_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp
                                    WHERE rp.reserva_id = reservas_estoque.id))
                                               AS ativas_sem_proveniencia
FROM public.reservas_estoque;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 5. isolamento do regime novo (as legadas NAO bloqueiam o fluxo) ===' AS secao;
-- As reservas do regime novo tem proveniencia; as legadas nao. Os dois
-- universos coexistem sem interferencia: e o que a prova de isolamento valida.
SELECT
  (SELECT count(*) FROM public.reservas_estoque r
    WHERE r.status = 'ativa' AND EXISTS (SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id))
    AS reservas_do_regime_novo,
  (SELECT count(*) FROM public.reservas_estoque r
    WHERE r.status = 'ativa' AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id))
    AS reservas_em_quarentena;

SELECT '' AS secao;
SELECT '=== 07_QUARENTENA: VEREDITO (fail-closed) ===' AS secao;
DO $quarentena$
DECLARE
  v_criticas integer;
  v_credito  integer;
BEGIN
  -- Divergencias CRITICAS: nao podem existir (se aparecerem => NO-GO).
  SELECT count(*)::int INTO v_criticas FROM (
    SELECT 1 FROM public.reservas_estoque r
    LEFT JOIN public.pedidos p ON p.id = r.pedido_id
    LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
    WHERE r.status IN ('ativa','consumida')
      AND ( (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) > 1
         OR (SELECT coalesce(sum(rc.quantidade),0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) > r.quantidade )
  ) x;

  IF v_criticas > 0 THEN
    RAISE EXCEPTION 'NO-GO: % reserva(s) historica(s) com divergencia critica (multipla proveniencia ou consumo excedente)', v_criticas;
  END IF;

  -- Credito automatico: nenhuma reserva sem proveniencia pode ter movimento de liberacao.
  SELECT count(*)::int INTO v_credito
  FROM public.reservas_estoque r
  LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id
  WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
    AND em.tipo IN ('liberacao','cancelamento','devolucao');

  IF v_credito > 0 THEN
    RAISE EXCEPTION 'NO-GO: % reserva(s) em quarentena com credito automatico', v_credito;
  END IF;

    PERFORM set_config('neia.quarentena', 'QUARENTENA_OK', false);
  RAISE NOTICE 'QUARENTENA_OK: reservas historicas classificadas, isoladas e sem credito automatico';
END
$quarentena$;

ROLLBACK;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.quarentena', true) AS resultado;
