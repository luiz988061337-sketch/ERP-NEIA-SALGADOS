-- ============================================================================
-- RECONCILIACAO READ-ONLY DAS RESERVAS LEGADAS (SEM PROVENIENCIA)
-- ============================================================================
-- Objetivo: classificar, por evidencia, as reservas historicas que ficaram sem
-- marcador em reserva_proveniencia. Este arquivo NAO altera dados: abre uma
-- transacao READ ONLY e termina com ROLLBACK.
--
-- NAO existe credito automatico de estoque aqui. Qualquer ajuste posterior
-- exige:
--   1) revisao manual das linhas classificadas como legado_sem_evidencia;
--   2) conferencia fisica/ledger;
--   3) autorizacao explicita e registro em estoque_movimentacoes (tipo ajuste);
--   4) segunda aprovacao (admin/financeiro), fora deste arquivo.
--
-- Uso (somente leitura):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f reconciliacao-19-reservas-legado.sql
--
-- O numero 19 e uma referencia do relatorio de auditoria; a query NAO forca
-- 19 linhas. Se a contagem divergir, pare e reconcilie o universo antes de
-- qualquer acao.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

-- ----------------------------------------------------------------------------
-- 1) Universo classificado
-- ----------------------------------------------------------------------------
WITH base AS (
  SELECT
    r.id                         AS reserva_id,
    r.pedido_id,
    r.produto_id,
    r.quantidade,
    r.status                     AS reserva_status,
    r.created_at,
    p.status                     AS pedido_status,
    p.pagamento_status,
    p.tipo_entrega,
    rp.reserva_id                AS prov_reserva_id,
    rp.origem                    AS prov_origem,
    rp.quantidade                AS prov_quantidade,
    rp.produto_id                AS prov_produto_id,
    rp.pedido_id                 AS prov_pedido_id,
    rp.estoque_movimentacao_id,
    em.tipo                      AS mov_tipo,
    em.produto_id                AS mov_produto_id,
    em.quantidade                AS mov_quantidade,
    em.referencia_id             AS mov_referencia_id,
    em.referencia_tipo           AS mov_referencia_tipo,
    (SELECT count(*) FROM public.reserva_proveniencia x
      WHERE x.reserva_id = r.id) AS prov_count,
    (SELECT COALESCE(sum(rc.quantidade), 0) FROM public.reserva_consumos rc
      WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  JOIN public.pedidos p ON p.id = r.pedido_id
  LEFT JOIN public.reserva_proveniencia rp ON rp.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = rp.estoque_movimentacao_id
),
classificado AS (
  SELECT
    b.*,
    CASE
      WHEN b.reserva_status IN ('liberada', 'cancelada')
        THEN 'fora_do_escopo_status'
      WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa'
        THEN 'pedido_cancelado_reserva_ativa'
      WHEN b.prov_count > 1
        THEN 'divergente_multipla_proveniencia'
      WHEN b.prov_count = 1 AND (
             b.prov_quantidade IS DISTINCT FROM b.quantidade
          OR b.prov_produto_id IS DISTINCT FROM b.produto_id
          OR b.prov_pedido_id IS DISTINCT FROM b.pedido_id
          OR b.mov_tipo IS DISTINCT FROM 'reserva'
          OR b.mov_produto_id IS DISTINCT FROM b.produto_id
          OR b.mov_quantidade IS DISTINCT FROM -b.quantidade
          OR b.mov_referencia_id IS DISTINCT FROM b.reserva_id
          OR b.mov_referencia_tipo IS DISTINCT FROM 'reserva_estoque'
      ) THEN 'divergente_proveniencia'
      WHEN b.prov_count = 1 AND b.consumido = b.quantidade
        THEN 'comprovada_por_proveniencia_e_consumo'
      WHEN b.prov_count = 1
        THEN 'comprovada_por_proveniencia'
      WHEN b.consumido > b.quantidade
        THEN 'divergente_consumo_excedente'
      WHEN b.consumido = b.quantidade AND b.reserva_status = 'consumida'
        THEN 'comprovada_por_consumo'
      WHEN b.consumido > 0
        THEN 'parcial_sem_proveniencia'
      ELSE 'legado_sem_evidencia'
    END AS classe
  FROM base b
)
SELECT
  c.reserva_id,
  c.pedido_id,
  c.produto_id,
  c.quantidade,
  c.consumido,
  c.reserva_status,
  c.pedido_status,
  c.pagamento_status,
  c.created_at,
  c.prov_origem,
  c.estoque_movimentacao_id,
  c.classe,
  CASE c.classe
    WHEN 'comprovada_por_proveniencia_e_consumo' THEN 'sem_acao'
    WHEN 'comprovada_por_proveniencia'           THEN 'sem_acao'
    WHEN 'comprovada_por_consumo'                THEN 'sem_acao'
    WHEN 'fora_do_escopo_status'                 THEN 'sem_acao'
    WHEN 'pedido_cancelado_reserva_ativa'        THEN 'revisao_manual'
    WHEN 'divergente_multipla_proveniencia'      THEN 'revisao_manual'
    WHEN 'divergente_proveniencia'               THEN 'revisao_manual'
    WHEN 'divergente_consumo_excedente'          THEN 'revisao_manual'
    WHEN 'parcial_sem_proveniencia'              THEN 'revisao_manual'
    ELSE 'quarentena_sem_credito'
  END AS acao_proposta
FROM classificado c
WHERE c.reserva_status IN ('ativa', 'consumida')
ORDER BY c.classe, c.created_at, c.reserva_id;

-- ----------------------------------------------------------------------------
-- 2) Resumo: use esta contagem para confirmar (ou nao) as 19 reservas
-- ----------------------------------------------------------------------------
WITH base AS (
  SELECT
    r.id, r.pedido_id, r.produto_id, r.quantidade, r.status AS reserva_status,
    p.status AS pedido_status,
    rp.quantidade AS prov_quantidade, rp.produto_id AS prov_produto_id,
    rp.pedido_id AS prov_pedido_id,
    em.tipo AS mov_tipo, em.produto_id AS mov_produto_id,
    em.quantidade AS mov_quantidade,
    em.referencia_id AS mov_ref, em.referencia_tipo AS mov_tipo_ref,
    (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) AS prov_count,
    (SELECT COALESCE(sum(rc.quantidade), 0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  JOIN public.pedidos p ON p.id = r.pedido_id
  LEFT JOIN public.reserva_proveniencia rp ON rp.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = rp.estoque_movimentacao_id
  WHERE r.status IN ('ativa', 'consumida')
),
classificado AS (
  SELECT b.*,
    CASE
      WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa' THEN 'pedido_cancelado_reserva_ativa'
      WHEN b.prov_count > 1 THEN 'divergente_multipla_proveniencia'
      WHEN b.prov_count = 1 AND (
             b.prov_quantidade IS DISTINCT FROM b.quantidade
          OR b.prov_produto_id IS DISTINCT FROM b.produto_id
          OR b.prov_pedido_id IS DISTINCT FROM b.pedido_id
          OR b.mov_tipo IS DISTINCT FROM 'reserva'
          OR b.mov_produto_id IS DISTINCT FROM b.produto_id
          OR b.mov_quantidade IS DISTINCT FROM -b.quantidade
          OR b.mov_ref IS DISTINCT FROM b.id
          OR b.mov_tipo_ref IS DISTINCT FROM 'reserva_estoque'
      ) THEN 'divergente_proveniencia'
      WHEN b.prov_count = 1 AND b.consumido = b.quantidade THEN 'comprovada_por_proveniencia_e_consumo'
      WHEN b.prov_count = 1 THEN 'comprovada_por_proveniencia'
      WHEN b.consumido > b.quantidade THEN 'divergente_consumo_excedente'
      WHEN b.consumido = b.quantidade AND b.reserva_status = 'consumida' THEN 'comprovada_por_consumo'
      WHEN b.consumido > 0 THEN 'parcial_sem_proveniencia'
      ELSE 'legado_sem_evidencia'
    END AS classe
  FROM base b
)
SELECT classe, count(*) AS reservas, sum(quantidade) AS unidades
FROM classificado
GROUP BY classe
ORDER BY classe;

-- ----------------------------------------------------------------------------
-- 3) Checagens de integridade que NAO devem ser "corrigidas" por UPDATE
-- ----------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE produto_id IS NULL)                         AS reservas_sem_produto,
  count(*) FILTER (WHERE pedido_id IS NULL)                          AS reservas_sem_pedido,
  count(*) FILTER (WHERE quantidade <= 0)                            AS reservas_quantidade_invalida,
  count(*) FILTER (WHERE status = 'ativa' AND produto_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp
                                    WHERE rp.reserva_id = reservas_estoque.id))
                                                                     AS ativas_sem_proveniencia
FROM public.reservas_estoque;

ROLLBACK;
