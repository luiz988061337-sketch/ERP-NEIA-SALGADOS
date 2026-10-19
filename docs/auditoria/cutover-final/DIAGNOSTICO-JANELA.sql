-- ============================================================================
-- DIAGNOSTICO DE JANELA — pedidos criados entre as migrations e a publicacao
-- ============================================================================
-- SOMENTE SELECT. Sem escrita.
--
-- Objetivo: saber se algum pedido foi criado enquanto o bundle ANTIGO ainda
-- estava publicado (antes do bundle de corte). Esses pedidos teriam
-- reserva SEM proveniencia e, sob `controlado = true`, o cancelamento via
-- 0093 falharia fechado (sem credito) — precisam de reconciliacao manual.
--
-- Cole e leia. Nao altera nada.
-- ============================================================================

SELECT '=== 1. pedidos por janela ===' AS secao;
SELECT
  (SELECT count(*) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours')                    AS pedidos_ultimas_6h,
  (SELECT count(*) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours'
      AND status = 'cancelado')                                       AS cancelados_6h,
  (SELECT min(created_at) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours')                    AS mais_antigo_6h,
  (SELECT max(created_at) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours')                    AS mais_recente_6h;

SELECT '' AS secao;
SELECT '=== 2. reservas ativas por procedencia (o que importa) ===' AS secao;
SELECT
  CASE
    WHEN r.status = 'ativa' AND pr.reserva_id IS NULL THEN 'legada_sem_proveniencia (QUARENTENA)'
    WHEN r.status = 'ativa' AND pr.reserva_id IS NOT NULL THEN 'regime_novo (com proveniencia)'
    WHEN r.status IN ('liberada','cancelada') THEN 'encerrada'
    ELSE r.status
  END AS classe,
  count(*)                     AS reservas,
  COALESCE(sum(r.quantidade),0) AS unidades,
  min(r.created_at)            AS mais_antiga,
  max(r.created_at)            AS mais_recente
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
GROUP BY 1
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 3. reservas ativas SEM proveniencia (detalhe) ===' AS secao;
SELECT r.id AS reserva_id, r.pedido_id, r.produto_id, r.quantidade,
       r.status, r.created_at,
       p.status AS pedido_status, p.pagamento_status,
       (SELECT count(*) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) AS consumos
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
LEFT JOIN public.pedidos p ON p.id = r.pedido_id
WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
ORDER BY r.created_at;

SELECT '' AS secao;
SELECT '=== 4. inventario do regime novo (deve estar vazio antes do smoke) ===' AS secao;
SELECT
  (SELECT count(*) FROM public.reserva_proveniencia)    AS marcadores,
  (SELECT count(*) FROM public.reserva_consumos)       AS consumos,
  (SELECT count(*) FROM public.pedido_item_componentes) AS componentes,
  (SELECT count(*) FROM public.pedidos
    WHERE created_at > now() - interval '6 hours')       AS pedidos_na_janela;

SELECT '' AS secao;
SELECT '=== 5. estado do regime ===' AS secao;
SELECT id, controlado, ativado_em, observacao
FROM public.reserva_proveniencia_config
WHERE id = true;

SELECT '' AS secao;
SELECT '=== 6. legs do caminho legado (devem estar fechados) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;

SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes','pedidos')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;
