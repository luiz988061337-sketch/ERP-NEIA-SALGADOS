-- ============================================================================
-- PRÉ-FLIGHT: GATE READ-ONLY DAS RESERVAS HISTÓRICAS (rodar no clone e,
-- depois, em produção APENAS como leitura).
--
-- Objetivo: responder em UMA LINHA se o corte pode seguir:
--   - confirma que as reservas legadas continuam sendo as linhas já
--     classificadas (sem proveniência/ledger);
--   - detecta qualquer reserva ATIVA sem proveniência que NÃO esteja na
--     lista histórica esperada;
--   - detecta divergências de consumo (consumido > reservado);
--   - detecta pedido cancelado com reserva ainda ativa.
--
-- NÃO ALTERA NADA: `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`.
-- NÃO CREDITA ESTOQUE. NÃO RECONCILIA.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f preflight-gate-19-reservas.sql
--
-- Interpretação do resultado:
--   go = 'SIM'  => pode seguir o corte (as pendências históricas ficam em
--                   quarentena, como planejado);
--   go = 'NAO'  => NO-GO: apareceu inconsistência crítica nova. Parar e
--                   reportar. NÃO "corrigir" com UPDATE.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

WITH base AS (
  SELECT
    r.id            AS reserva_id,
    r.pedido_id,
    r.produto_id,
    r.quantidade,
    r.status        AS reserva_status,
    r.created_at,
    p.status        AS pedido_status,
    (SELECT count(*) FROM public.reserva_proveniencia x
      WHERE x.reserva_id = r.id) AS prov_count,
    (SELECT COALESCE(sum(rc.quantidade), 0) FROM public.reserva_consumos rc
      WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  WHERE r.status IN ('ativa', 'consumida')
),
classificado AS (
  SELECT b.*,
    CASE
      WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa'
        THEN 'pedido_cancelado_reserva_ativa'
      WHEN b.prov_count > 1
        THEN 'divergente_multipla_proveniencia'
      WHEN b.consumido > b.quantidade
        THEN 'divergente_consumo_excedente'
      WHEN b.consumido > 0 AND b.prov_count = 0
        THEN 'parcial_sem_proveniencia'
      WHEN b.consumido = 0 AND b.prov_count = 0
        THEN 'legado_sem_evidencia'
      ELSE 'comprovada'
    END AS classe
  FROM base b
)
SELECT
  (SELECT count(*) FROM classificado)                                        AS reservas_ativas_ou_consumidas,
  (SELECT count(*) FROM classificado WHERE classe = 'legado_sem_evidencia')  AS legado_sem_evidencia,
  (SELECT COALESCE(sum(quantidade), 0) FROM classificado
     WHERE classe = 'legado_sem_evidencia')                                  AS unidades_em_quarentena,
  (SELECT count(*) FROM classificado WHERE classe = 'pedido_cancelado_reserva_ativa')
                                                                             AS crit_cancelado_com_reserva_ativa,
  (SELECT count(*) FROM classificado WHERE classe = 'divergente_multipla_proveniencia')
                                                                             AS crit_multipla_proveniencia,
  (SELECT count(*) FROM classificado WHERE classe = 'divergente_consumo_excedente')
                                                                             AS crit_consumo_excedente,
  (SELECT count(*) FROM classificado WHERE classe = 'parcial_sem_proveniencia')
                                                                             AS crit_parcial_sem_proveniencia,
  (SELECT count(*) FROM classificado WHERE classe = 'comprovada')            AS com_proveniencia,
  CASE
    -- Crítico: divergência que NÃO pode existir em um corte seguro.
    WHEN (SELECT count(*) FROM classificado
           WHERE classe IN ('divergente_multipla_proveniencia','divergente_consumo_excedente')) > 0
      THEN 'NAO'
    -- Reservas sem proveniência são a QUARENTENA planejada: não bloqueiam.
    ELSE 'SIM'
  END AS go;

-- ----------------------------------------------------------------------------
-- Detalhe por classe (para o relatório da janela)
-- ----------------------------------------------------------------------------
WITH base AS (
  SELECT r.id AS reserva_id, r.pedido_id, r.produto_id, r.quantidade,
         r.status AS reserva_status, r.created_at,
         p.status AS pedido_status,
         (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) AS prov_count,
         (SELECT COALESCE(sum(rc.quantidade),0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  WHERE r.status IN ('ativa', 'consumida')
)
SELECT
  CASE
    WHEN pedido_status = 'cancelado' AND reserva_status = 'ativa' THEN 'pedido_cancelado_reserva_ativa'
    WHEN prov_count > 1 THEN 'divergente_multipla_proveniencia'
    WHEN consumido > quantidade THEN 'divergente_consumo_excedente'
    WHEN consumido > 0 AND prov_count = 0 THEN 'parcial_sem_proveniencia'
    WHEN consumido = 0 AND prov_count = 0 THEN 'legado_sem_evidencia'
    ELSE 'comprovada'
  END AS classe,
  count(*) AS reservas,
  COALESCE(sum(quantidade), 0) AS unidades,
  min(created_at) AS mais_antiga,
  max(created_at) AS mais_recente
FROM base
GROUP BY 1
ORDER BY 1;

-- ----------------------------------------------------------------------------
-- Integridade estrutural (não "corrigir" com UPDATE)
-- ----------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE produto_id IS NULL)   AS reservas_sem_produto,
  count(*) FILTER (WHERE pedido_id IS NULL)    AS reservas_sem_pedido,
  count(*) FILTER (WHERE quantidade <= 0)      AS reservas_quantidade_invalida,
  count(*) FILTER (WHERE status = 'ativa' AND produto_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp
                                    WHERE rp.reserva_id = reservas_estoque.id))
                                              AS ativas_sem_proveniencia
FROM public.reservas_estoque;

ROLLBACK;
