-- Consulta SOMENTE LEITURA pós-aplicação da 0129: compromissos futuros X
-- reservas ativas X pedidos confirmados, e links das notificações de resposta.
-- Destino obrigatório e explícito: --project-ref lflzlcqinarrcgncafol.
-- Pré-requisito: 0129 aplicada (as tabelas abaixo existem). Nenhum
-- INSERT/UPDATE/DELETE/DDL/GRANT. Um único SELECT final para o CLI devolver o
-- resultado completo. Nenhuma conexão foi aberta ao preparar este arquivo.
BEGIN TRANSACTION READ ONLY;

WITH coberturas AS (
  SELECT compromisso_id, sum(quantidade)::integer AS coberto
  FROM public.salgados_compromisso_coberturas
  GROUP BY compromisso_id
),
reservas AS (
  SELECT pedido_id, sabor_chave, sum(quantidade)::integer AS reserva_ativa
  FROM public.reservas_estoque
  WHERE status = 'ativa'
  GROUP BY pedido_id, sabor_chave
),
compromissos AS (
  SELECT
    c.id,
    c.chave,
    c.quantidade,
    c.data_compromisso,
    c.status AS status_compromisso,
    c.pedido_id,
    p.status AS status_pedido,
    coalesce(k.coberto, 0) AS coberto,
    coalesce(r.reserva_ativa, 0) AS reserva_ativa_pedido,
    CASE
      WHEN c.status = 'cancelado' THEN 'compromisso_cancelado'
      WHEN p.id IS NULL THEN 'sem_pedido_vinculado'
      WHEN p.status = 'cancelado' THEN 'pedido_cancelado'
      WHEN coalesce(k.coberto, 0) < c.quantidade
       AND p.status IN ('recebido', 'em_producao', 'pronto',
                        'aguardando_motoboy', 'em_rota', 'entregue')
        THEN 'atencao_confirmado_sem_cobertura'
      ELSE 'aderente'
    END AS avaliacao
  FROM public.salgados_compromissos c
  LEFT JOIN public.pedidos p ON p.id = c.pedido_id
  LEFT JOIN coberturas k ON k.compromisso_id = c.id
  LEFT JOIN reservas r ON r.pedido_id = c.pedido_id AND r.sabor_chave = c.chave
  WHERE c.status = 'pendente'
     OR c.data_compromisso >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY c.data_compromisso, c.criado_em, c.id
),
resumo_compromissos AS (
  SELECT
    count(*)::integer AS total,
    (count(*) FILTER (WHERE avaliacao = 'atencao_confirmado_sem_cobertura'))::integer
      AS confirmados_sem_cobertura,
    (count(*) FILTER (WHERE avaliacao = 'sem_pedido_vinculado'))::integer
      AS sem_pedido_vinculado,
    (count(*) FILTER (WHERE avaliacao = 'pedido_cancelado'))::integer
      AS pedido_cancelado
  FROM compromissos
),
notificacoes AS (
  SELECT n.id, n.tipo, n.link, n.titulo, n.created_at
  FROM public.notificacoes n
  WHERE n.tipo = 'salgados_resposta'
  ORDER BY n.created_at DESC
  LIMIT 50
),
resumo_notificacoes AS (
  SELECT
    count(*)::integer AS total,
    count(DISTINCT link)::integer AS links_distintos,
    bool_and(link = '/atendente') AS todos_link_atendente,
    max(created_at) AS ultima_em
  FROM notificacoes
)
SELECT jsonb_pretty(jsonb_build_object(
  'resumo_compromissos', (SELECT to_jsonb(r) FROM resumo_compromissos r),
  'compromissos', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM compromissos c),
  'resumo_notificacoes', (SELECT to_jsonb(n) FROM resumo_notificacoes n),
  'notificacoes', (SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) FROM notificacoes n),
  'observacao', 'Link /atendente corresponde a src/routes/atendente.tsx; conferir disponibilidade da rota no bundle.'
)) AS relatorio;

ROLLBACK;
