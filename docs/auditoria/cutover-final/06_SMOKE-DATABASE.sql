-- ============================================================================
-- 06_SMOKE-DATABASE.sql — SMOKE ESTRUTURAL (somente leitura)
-- ============================================================================
-- Executar depois das migrations (e depois do deploy, para checar o regime).
-- NÃO cria pedidos: os testes FUNCIONAIS (checkout, PDV, combo, consumo,
-- cancelamento) são feitos no aplicativo, depois do deploy.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 06_SMOKE-DATABASE.sql
--
-- Valida: funções chamáveis, tipos de retorno, constraints, triggers, policies,
-- configurações, combo_preco_unit, controlled e os objetos de
-- proveniência/consumo/cancelamento.
-- ============================================================================

SELECT '=== 06_SMOKE: 1. funcoes e assinatura ===' AS secao;
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid)               AS retorno,
       p.prosecdef                               AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                    'reservar_pedido_atomico','liberar_pedido_atomico','pedido_cobertura_reserva',
                    'exigir_reserva_producao','exigir_consumo_producao',
                    'proteger_consistencia_financeira_pedido')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 2. tabelas e policies ===' AS secao;
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 3. constraints das tabelas novas ===' AS secao;
SELECT conrelid::regclass AS tabela, conname, contype,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid IN ('public.reserva_consumos'::regclass,
                   'public.reserva_proveniencia'::regclass,
                   'public.pedido_item_componentes'::regclass)
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 4. indices das tabelas novas ===' AS secao;
SELECT tablename AS tabela, indexname AS indice
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('reserva_consumos','reserva_proveniencia','pedido_item_componentes')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 5. triggers do regime novo ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela, p.proname AS funcao,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('pedidos','pedido_itens','reservas_estoque','reserva_consumos','reserva_proveniencia','pedido_item_componentes')
ORDER BY 2, 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 6. policies (RLS) do regime novo ===' AS secao;
SELECT tablename AS tabela, policyname AS policy, permissive, roles::text, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 7. configuracoes (controlado + combo) ===' AS secao;
SELECT 'controlado' AS item, (SELECT controlado::text FROM public.reserva_proveniencia_config WHERE id = true) AS valor
UNION ALL
SELECT 'combo_preco_unit:' || c.slug, c.combo_preco_unit::text
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
UNION ALL
SELECT 'combos_ativos_sem_preco',
       (SELECT count(*)::text FROM public.categorias c
         WHERE c.ativo AND c.combo_preco_unit IS NULL
           AND EXISTS (SELECT 1 FROM public.produtos p
                        WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50'))
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 8. objetos de proveniencia / consumo / cancelamento ===' AS secao;
DO $contagens$
DECLARE
  v_n integer;
  v_prv integer; v_con integer; v_res integer; v_comp integer;
BEGIN
  EXECUTE 'SELECT count(*)::int FROM public.reserva_proveniencia'   INTO v_prv;
  EXECUTE 'SELECT count(*)::int FROM public.reserva_consumos'      INTO v_con;
  EXECUTE 'SELECT count(*)::int FROM public.reservas_estoque'      INTO v_res;
  EXECUTE 'SELECT count(*)::int FROM public.pedido_item_componentes' INTO v_comp;
  RAISE NOTICE 'reserva_proveniencia=%, reserva_consumos=%, reservas_estoque=%, pedido_item_componentes=%',
    v_prv, v_con, v_res, v_comp;
END
$contagens$;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 9. cobertura de proveniencia (as legadas ficam em quarentena) ===' AS secao;
SELECT
  count(*) FILTER (WHERE r.status = 'ativa')                              AS reservas_ativas,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL)     AS ativas_sem_proveniencia,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NOT NULL) AS ativas_com_proveniencia
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id;
-- Nota: as 19 reservas historicas aparecem como `ativas_sem_proveniencia` — e
-- isso e ESPERADO (quarentena). O smoke funcional valida o regime novo.

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 10. grants effective das RPCs novas ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_executa,
       (SELECT count(*) FROM information_schema.routine_privileges g
         WHERE g.specific_name = p.proname AND g.specific_schema = 'public'
           AND g.grantee = 'PUBLIC') > 0 AS public_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                    'reservar_pedido_atomico','liberar_pedido_atomico')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 11. legadas: nao executaveis pelo cliente apos o lockdown ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;
-- Expectativa: `false` para ambas APOS o lockdown de ACL do cutover.

SELECT '' AS secao;
SELECT '=== 06_SMOKE: VEREDITO ===' AS secao;
DO $smoke$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
BEGIN
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0095 ausente');
  END IF;
  IF to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0093 ausente');
  END IF;
  IF to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0091 ausente');
  END IF;
  IF to_regclass('public.reserva_consumos') IS NULL THEN
    v_falhas := array_append(v_falhas, 'tabela reserva_consumos ausente');
  END IF;
  IF to_regclass('public.pedido_item_componentes') IS NULL THEN
    v_falhas := array_append(v_falhas, 'tabela pedido_item_componentes ausente');
  END IF;
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias' AND column_name='combo_preco_unit') THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'combos ativos sem preco: ' || v_n::text);
    END IF;
  END IF;
  IF cardinality(v_falhas) = 0 THEN
        PERFORM set_config('neia.smoke', 'SMOKE_DATABASE_OK', false);
    RAISE NOTICE 'SMOKE_DATABASE_OK: estrutura do regime novo conforme';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$smoke$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.smoke', true) AS resultado;
