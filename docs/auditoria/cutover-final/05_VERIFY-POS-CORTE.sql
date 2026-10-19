-- ============================================================================
-- 05_VERIFY-POS-CORTE.sql — VERIFICAÇÃO PÓS-INSTALAÇÃO (somente leitura)
-- ============================================================================
-- Executar DEPOIS de 02_MIGRATIONS-CUTOVER.sql + 03_CONFIGURACAO-CUTOVER.sql
-- e (quando o bundle já estiver publicado) de 04_ATIVAR-CONTROLADO.sql.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 05_VERIFY-POS-CORTE.sql
--
-- Saída: NOTICE VERIFY_POS_CORTE_OK  ou  EXCEPTION NO-GO (exit != 0).
-- Nenhuma escrita.
--
-- EXECUÇÃO EM DUAS FASES (o 'controlado' só é exigido na 2ª):
--   FASE 1 (antes do passo 7): verificação do BANCO. O estado de 'controlado'
--           é apenas reportado (esperado: false).
--   FASE 2 (depois do passo 7): verificação FINAL. Cole PRIMEIRO:
--             SELECT set_config('neia.exigir_controlado','true',false);
--           e o script passa a exigir controlled = true.
-- ============================================================================

SELECT '=== 05_VERIFY: objetos obrigatorios 0087-0098 ===' AS secao;
SELECT * FROM (
  VALUES
    ('0087','tabela','reserva_consumos',            to_regclass('public.reserva_consumos') IS NOT NULL),
    ('0089','funcao','reservar_pedido_atomico',     to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL),
    ('0090','funcao','liberar_pedido_atomico',      to_regprocedure('public.liberar_pedido_atomico(uuid)') IS NOT NULL),
    ('0091','funcao','registrar_consumo_reserva',   to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia',        to_regclass('public.reserva_proveniencia') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia_config', to_regclass('public.reserva_proveniencia_config') IS NOT NULL),
    ('0093','funcao','cancelar_pedido_atomico',     to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL),
    ('0094','funcao','proteger_consistencia_financeira_pedido', to_regprocedure('public.proteger_consistencia_financeira_pedido()') IS NOT NULL),
    ('0095','funcao','criar_pedido_com_reserva',    to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL),
    ('0095','funcao','pedido_cobertura_reserva',    to_regprocedure('public.pedido_cobertura_reserva(uuid)') IS NOT NULL),
    ('0096','policy','RLS de parceiros/estoque',   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public')),
    ('0097','tabela','pedido_item_componentes',     to_regclass('public.pedido_item_componentes') IS NOT NULL),
    ('0097','coluna','categorias.combo_preco_unit',EXISTS (SELECT 1 FROM information_schema.columns
                                                            WHERE table_schema='public' AND table_name='categorias'
                                                              AND column_name='combo_preco_unit'))
) AS t(migration, tipo, objeto, existe)
ORDER BY migration, objeto;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: 0088 (deve continuar NAO APLICADA) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;
-- Expectativa: as duas existem na versao 0030/0086 (base) e NAO sao chamadas
-- pelo bundle de corte (0 call sites comprovados). A 0098 revoga PUBLIC/anon.

SELECT '' AS secao;
SELECT '=== 05_VERIFY: ACL das RPCs novas (0098) ===' AS secao;
SELECT p.proname AS rpc, g.grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                   'reservar_pedido_atomico','liberar_pedido_atomico')
  AND g.grantee IN ('PUBLIC','anon','service_role','authenticated')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: RLS das tabelas novas (0087/0092/0097) ===' AS secao;
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: protecao 0094 (trigger) e 0095 (gatilhos NAO instalados) ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_proteger_consistencia%'
    OR t.tgname LIKE 'trigger_bloquear_pagamento%'
    OR t.tgname LIKE 'trigger_exigir_%')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: combinacoes (0097) ===' AS secao;
SELECT c.slug, c.combo_preco_unit,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.ativo
  AND (c.combo_preco_unit IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50'))
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: estado do controlled ===' AS secao;
SELECT id, controlado FROM public.reserva_proveniencia_config WHERE id = true;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: VEREDITO (fail-closed) ===' AS secao;
DO $verify$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
  v_txt text;
BEGIN
  -- objetos obrigatorios
  FOREACH v_txt IN ARRAY ARRAY[
    'public.reserva_consumos',
    'public.reserva_proveniencia',
    'public.reserva_proveniencia_config',
    'public.pedido_item_componentes']
  LOOP
    IF to_regclass(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'objeto ausente: ' || v_txt);
    END IF;
  END LOOP;

  FOREACH v_txt IN ARRAY ARRAY[
    'public.reservar_pedido_atomico(uuid)',
    'public.liberar_pedido_atomico(uuid)',
    'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)',
    'public.cancelar_pedido_atomico(uuid,text)',
    'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)',
    'public.pedido_cobertura_reserva(uuid)',
    'public.proteger_consistencia_financeira_pedido()']
  LOOP
    IF to_regprocedure(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'RPC ausente: ' || v_txt);
    END IF;
  END LOOP;

  -- coluna de combo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias'
                    AND column_name='combo_preco_unit') THEN
    v_falhas := array_append(v_falhas, 'coluna categorias.combo_preco_unit ausente (0097)');
  END IF;

  -- ACL: nenhuma RPC nova com EXECUTE para PUBLIC/anon/service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN information_schema.routine_privileges g
      ON g.specific_name = p.proname AND g.specific_schema = 'public'
    WHERE n.nspname = 'public'
      AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                        'reservar_pedido_atomico','liberar_pedido_atomico')
      AND g.grantee IN ('PUBLIC','anon','service_role')
  ) THEN
    v_falhas := array_append(v_falhas, 'ACL: RPC nova com EXECUTE para PUBLIC/anon/service_role (0098 nao aplicada ou incompleta)');
  END IF;

  -- RLS ligado nas tabelas novas
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('reserva_consumos','reserva_proveniencia','pedido_item_componentes')
       AND NOT c.relrowsecurity
  ) THEN
    v_falhas := array_append(v_falhas, 'RLS desligada em tabela nova (0087/0092/0097)');
  END IF;

  -- protecao 0094 presente
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                   JOIN pg_class c ON c.oid = t.tgrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND NOT t.tgisinternal
                    AND t.tgname = 'trigger_proteger_consistencia_financeira') THEN
    v_falhas := array_append(v_falhas, 'protecao 0094 (trigger_proteger_consistencia_financeira) ausente');
  END IF;

  -- os gates de producao (0095) nao podem estar instalados ainda
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND NOT t.tgisinternal
                AND t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')) THEN
    v_falhas := array_append(v_falhas, 'gate de producao instalado — so apos a reconciliacao das 19 reservas');
  END IF;

  -- categorias de combo ativas com preco
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias' AND column_name='combo_preco_unit') THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'categorias de combo ativas sem preco: ' || v_n::text);
    END IF;
  END IF;

  -- controlled: so e EXIGIDO na verificacao ESTRITA (depois do passo 7).
  -- Antes disso o valor esperado e ainda false.
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    EXECUTE 'SELECT (controlado)::text FROM public.reserva_proveniencia_config WHERE id = true' INTO v_txt;
    IF current_setting('neia.exigir_controlado', true) = 'true' AND v_txt IS DISTINCT FROM 'true' THEN
      v_falhas := array_append(v_falhas, 'controlado = ' || coalesce(v_txt,'null') || ' (esperado true apos o passo 7)');
    END IF;
  END IF;

  -- caminho legado nao pode estar acessivel ao cliente
  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL
     AND has_function_privilege('authenticated', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda pode executar reservar_estoque_atomica (aplicar o lockdown da ACL)');
  END IF;

  IF cardinality(v_falhas) = 0 THEN
    PERFORM set_config('neia.verify', 'VERIFY_POS_CORTE_OK', false);
    RAISE NOTICE 'VERIFY_POS_CORTE_OK';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$verify$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.verify', true) AS resultado,
       (SELECT controlado::text FROM public.reserva_proveniencia_config WHERE id = true) AS controlado,
       current_setting('neia.exigir_controlado', true) AS verificacao_estrita;
