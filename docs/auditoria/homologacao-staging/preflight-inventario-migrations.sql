-- ============================================================================
-- PRÉ-FLIGHT: INVENTÁRIO DE OBJETOS 0087–0098 (READ-ONLY)
-- ============================================================================
-- Rodar em produção (ou no clone) ANTES de qualquer migration, para decidir
-- migration por migration o que ainda precisa ser instalado.
--
-- NÃO ALTERA NADA: `BEGIN TRANSACTION READ ONLY` + `ROLLBACK`.
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f preflight-inventario-migrations.sql
--
-- Interpretação:
--   * "presente"  => objeto já existe => a migration correspondente PODE ser
--                     dispensada (ver a tabela de decisão do relatório).
--   * "ausente"   => precisa instalar.
--   * "ATIVO"/"DESATIVADO" (trigger) => atenção: trigger de 0095/0094.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

-- ----------------------------------------------------------------------------
-- 1. Funções
-- ----------------------------------------------------------------------------
SELECT 'funcao' AS tipo, p.proname AS objeto,
       CASE WHEN p.proname = 'exigir_reserva_producao' OR p.proname = 'exigir_consumo_producao'
            THEN 'ATENCAO: gate de producao (nao instalar trigger antes da reconciliacao)'
            ELSE 'ok' END AS nota
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'reservar_estoque_atomica',        -- 0030/0086 (0088 substitui) - NAO USAR NO CORTE
    'reservar_pedido_atomico',         -- 0089
    'liberar_pedido_atomico',          -- 0090
    'registrar_consumo_reserva',       -- 0091
    'cancelar_pedido_atomico',         -- 0093
    'criar_pedido_com_reserva',        -- 0095
    'pedido_cobertura_reserva',        -- 0095
    'exigir_reserva_producao',         -- 0095 (funcao; trigger NAO deve ser instalado)
    'exigir_consumo_producao',         -- 0095 (funcao; trigger NAO deve ser instalado)
    'proteger_consistencia_financeira_pedido' -- 0094
  )
ORDER BY 1, 2;

-- ----------------------------------------------------------------------------
-- 2. Tabelas
-- ----------------------------------------------------------------------------
SELECT 'tabela' AS tipo, c.relname AS objeto,
       CASE c.relname
         WHEN 'reserva_consumos'        THEN '0087'
         WHEN 'reserva_proveniencia'     THEN '0092'
         WHEN 'reserva_proveniencia_config' THEN '0092 (controlado)'
         WHEN 'pedido_item_componentes'  THEN '0097'
       END AS migration
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1, 2;

-- ----------------------------------------------------------------------------
-- 3. Colunas adicionadas
-- ----------------------------------------------------------------------------
SELECT 'coluna' AS tipo,
       table_name || '.' || column_name AS objeto,
       data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('categorias','combo_preco_unit')   -- 0097
  );

-- ----------------------------------------------------------------------------
-- 4. Triggers (atenção especial aos de 0094/0095)
-- ----------------------------------------------------------------------------
SELECT 'trigger' AS tipo, t.tgname AS objeto, c.relname AS tabela,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' WHEN 'D' THEN 'DESATIVADO' ELSE t.tgenabled END AS estado,
       CASE
         WHEN t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')
           THEN 'ATENCAO: nao deve existir antes da reconciliacao das 19 reservas'
         WHEN t.tgname = 'trigger_proteger_consistencia_financeira'
           THEN '0094 (ATIVA no corte)'
         ELSE 'ok'
       END AS nota
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_exigir_%'
    OR t.tgname = 'trigger_proteger_consistencia_financeira'
    OR t.tgname = 'trigger_bloquear_pagamento_cancelado')
ORDER BY 3, 2;

-- ----------------------------------------------------------------------------
-- 5. Estado do "controlado" (0092) e preços de combo (0097)
-- ----------------------------------------------------------------------------
SELECT 'config' AS tipo, id::text AS objeto, controlado::text AS valor,
       '0092 - ativar somente DEPOIS das migrations e ANTES de abrir vendas' AS nota
FROM public.reserva_proveniencia_config WHERE id = true;

-- Categorias de COMBO (com produtos tipo_venda='combo_50') => PRECISAM de preço.
-- Categorias ativas SEM produtos de combo => não precisam de preço (ok).
SELECT 'config' AS tipo, c.slug AS objeto,
       COALESCE(c.combo_preco_unit::text, 'SEM PRECO') AS valor,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') AS prods_combo,
       CASE
         WHEN (SELECT count(*) FROM public.produtos p
                WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') > 0
              AND c.combo_preco_unit IS NULL
           THEN '*** BLOQUEIO: categoria de combo SEM preco ***'
         WHEN (SELECT count(*) FROM public.produtos p
                WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') > 0
           THEN 'ok (preco configurado)'
         ELSE 'ok (categoria nao e de combo)'
       END AS nota
FROM public.categorias c
WHERE c.ativo
ORDER BY ((SELECT count(*) FROM public.produtos p
            WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') > 0) DESC,
         c.combo_preco_unit IS NULL DESC,
         c.slug;

-- ----------------------------------------------------------------------------
-- 6. Grants ativos nas RPCs do corte (0098)
-- ----------------------------------------------------------------------------
SELECT 'grant' AS tipo, p.proname AS objeto, g.grantee,
       CASE g.grantee WHEN 'PUBLIC' THEN '*** ATENCAO: EXECUTE PUBLIC ***' ELSE 'ok' END AS nota
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN (
    'criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
    'reservar_pedido_atomico','liberar_pedido_atomico',
    'reservar_estoque_atomica','liberar_reserva_atomica')
  AND g.grantee IN ('PUBLIC','anon','service_role')
ORDER BY 2, 3;

ROLLBACK;
