-- ============================================================================
-- 01_PRECHECK.sql — PRÉ-CHECAGEM READ-ONLY DO BANCO DE PRODUÇÃO
-- ============================================================================
-- Executar ANTES de qualquer alteração, com a loja fechada.
-- NÃO ESCREVE NADA. Somente SELECT.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 01_PRECHECK.sql
--
-- Saída: a última instrução devolve
--     NOTICE PRECHECK_OK
-- ou
--     EXCEPTION NO-GO: <lista de condições bloqueantes>   (exit != 0, o script para)
--
-- Se sair NO-GO: PARAR. Não aplicar 02_MIGRATIONS-CUTOVER.sql.
-- ============================================================================

SELECT '=== 01_PRECHECK: identificacao ===' AS secao;
SELECT
  current_database()                AS banco,
  current_user                      AS usuario,
  current_setting('server_version') AS postgres,
  inet_server_addr()::text         AS servidor,
  inet_server_port()                AS porta,
  now()                              AS momento;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: tabelas base do ERP ===' AS secao;
SELECT c.relname AS tabela,
       c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('pedidos','pedido_itens','produtos','categorias','reservas_estoque',
                    'estoque_movimentacoes','cupons','user_roles','fila_impressao',
                    'pedido_status_historico')
ORDER BY c.relname;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: estado das migrations 0087-0098 (esperado: AUSENTES antes do corte) ===' AS secao;
SELECT * FROM (
  VALUES
    ('0087', 'tabela', 'reserva_consumos',            to_regclass('public.reserva_consumos') IS NOT NULL),
    ('0088', 'funcao', 'reservar_estoque_atomica',    to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL),
    ('0088', 'funcao', 'liberar_reserva_atomica',     to_regprocedure('public.liberar_reserva_atomica(uuid)') IS NOT NULL),
    ('0089', 'funcao', 'reservar_pedido_atomico',     to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL),
    ('0090', 'funcao', 'liberar_pedido_atomico',      to_regprocedure('public.liberar_pedido_atomico(uuid)') IS NOT NULL),
    ('0091', 'funcao', 'registrar_consumo_reserva',   to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL),
    ('0092', 'tabela', 'reserva_proveniencia',        to_regclass('public.reserva_proveniencia') IS NOT NULL),
    ('0092', 'tabela', 'reserva_proveniencia_config', to_regclass('public.reserva_proveniencia_config') IS NOT NULL),
    ('0093', 'funcao', 'cancelar_pedido_atomico',     to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL),
    ('0094', 'funcao', 'proteger_consistencia_financeira_pedido', to_regprocedure('public.proteger_consistencia_financeira_pedido()') IS NOT NULL),
    ('0095', 'funcao', 'criar_pedido_com_reserva',    to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL),
    ('0095', 'funcao', 'pedido_cobertura_reserva',    to_regprocedure('public.pedido_cobertura_reserva(uuid)') IS NOT NULL),
    ('0095', 'funcao', 'exigir_reserva_producao',     to_regprocedure('public.exigir_reserva_producao()') IS NOT NULL),
    ('0095', 'funcao', 'exigir_consumo_producao',     to_regprocedure('public.exigir_consumo_producao()') IS NOT NULL),
    ('0097', 'tabela', 'pedido_item_componentes',     to_regclass('public.pedido_item_componentes') IS NOT NULL)
) AS t(migration, tipo, objeto, existe)
ORDER BY migration, objeto;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: coluna combo_preco_unit (0097) ===' AS secao;
SELECT count(*) AS colunas_combo_preco_unit
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'categorias' AND column_name = 'combo_preco_unit';

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: triggers relevantes (read-only) ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela, p.proname AS funcao,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_reserva%' OR t.tgname LIKE 'trigger_exigir_%'
    OR t.tgname LIKE 'trigger_proteger_consistencia%' OR t.tgname LIKE 'trigger_bloquear_pagamento%')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: grants das RPCs (0098) ===' AS secao;
SELECT p.proname AS rpc, g.grantee, g.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                   'reservar_pedido_atomico','liberar_pedido_atomico',
                   'reservar_estoque_atomica','liberar_reserva_atomica')
  AND g.grantee IN ('PUBLIC','anon','service_role','authenticated')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: categorias de combo previstas na 0097 ===' AS secao;
SELECT c.slug, c.nome, c.ativo,
       (SELECT count(*) FROM public.produtos p WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: reservas historicas (universo, sem alterar nada) ===' AS secao;
SELECT count(*) FILTER (WHERE r.status = 'ativa')             AS ativas,
       count(*) FILTER (WHERE r.status = 'consumida')          AS consumidas,
       count(*) FILTER (WHERE r.status IN ('liberada','cancelada')) AS encerradas,
       count(*) FILTER (WHERE p.id IS NULL)                     AS orfas_sem_pedido,
       count(*) FILTER (WHERE pr.id IS NULL)                    AS orfas_sem_produto
FROM public.reservas_estoque r
LEFT JOIN public.pedidos p ON p.id = r.pedido_id
LEFT JOIN public.produtos pr ON pr.id = r.produto_id;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: VEREDITO (fail-closed) ===' AS secao;
SELECT '   Sem falhas: NOTICE PRECHECK_OK.  Com falhas: EXCEPTION NO-GO (exit != 0, script para).' AS secao;
DO $precheck$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
  v_txt text;
BEGIN
  -- 1) Tabelas base do ERP
  FOREACH v_txt IN ARRAY ARRAY[
    'pedidos','pedido_itens','produtos','categorias','reservas_estoque',
    'estoque_movimentacoes','cupons','user_roles','fila_impressao',
    'pedido_status_historico']
  LOOP
    IF to_regclass('public.' || v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'tabela base ausente: ' || v_txt);
    END IF;
  END LOOP;

  -- 2) Trigger legado de reserva (0042): nao pode existir (reserva dupla)
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND NOT t.tgisinternal
                AND t.tgname = 'trigger_reserva_estoque_pedido') THEN
    v_falhas := array_append(v_falhas, 'trigger legado trigger_reserva_estoque_pedido presente (reserva dupla)');
  END IF;

  -- 3) Gates de producao (0095) nao podem estar instalados antes da reconciliacao
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND NOT t.tgisinternal
                AND t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')) THEN
    v_falhas := array_append(v_falhas, 'gate de producao instalado antes da reconciliacao das 19 reservas');
  END IF;

  -- 4) controlled ja ativo antes do corte = estado inesperado
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    EXECUTE 'SELECT (controlado)::text FROM public.reserva_proveniencia_config WHERE id = true' INTO v_txt;
    IF coalesce(v_txt, 'false') = 'true' THEN
      v_falhas := array_append(v_falhas, 'controlado ja esta true antes do corte (estado inesperado)');
    END IF;
  END IF;

  -- 5) Regime novo ja aplicado (re-execucao) -> revisar
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL
     AND to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL
     AND to_regclass('public.pedido_item_componentes') IS NOT NULL THEN
    v_falhas := array_append(v_falhas, 'regime novo (0095/0093/0097) ja aplicado — revisar se e re-execucao');
  END IF;

  -- 6) Reservas orfas (estado incompativel)
  IF to_regclass('public.reservas_estoque') IS NOT NULL AND to_regclass('public.pedidos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.reservas_estoque r
              LEFT JOIN public.pedidos p ON p.id = r.pedido_id
             WHERE p.id IS NULL' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'reservas orfas (sem pedido): ' || v_n::text);
    END IF;
  END IF;

  -- 7) Categorias de combo previstas na 0097
  IF to_regclass('public.categorias') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias
              WHERE slug IN (''mini-fritos'',''mini-assados'',''mini-pasteis'',''mini-pizzas'',''mini-empadinhas'')
                AND ativo' INTO v_n;
    IF v_n = 0 THEN
      v_falhas := array_append(v_falhas, 'nenhuma das 5 categorias de combo previstas esta ativa');
    END IF;
  END IF;

  -- 8) Categoria de combo ativa sem preco (so relevante se a coluna existir)
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias'
                    AND column_name='combo_preco_unit')
     AND to_regclass('public.produtos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'categorias de combo ativas sem combo_preco_unit: ' || v_n::text);
    END IF;
  END IF;

  -- 9) Nenhuma RPC nova pode estar com EXECUTE para PUBLIC/anon
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN information_schema.routine_privileges g
      ON g.specific_name = p.proname AND g.specific_schema = 'public'
    WHERE n.nspname = 'public'
      AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva')
      AND g.grantee IN ('PUBLIC','anon')
  ) THEN
    v_falhas := array_append(v_falhas, 'RPC nova com EXECUTE para PUBLIC/anon (a 0098 deve corrigir)');
  END IF;

  -- VEREDITO
  IF cardinality(v_falhas) = 0 THEN
    PERFORM set_config('neia.precheck', 'PRECHECK_OK', false);
    RAISE NOTICE 'PRECHECK_OK';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$precheck$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.precheck', true) AS resultado;
