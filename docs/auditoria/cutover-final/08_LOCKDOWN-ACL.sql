-- ============================================================================
-- 08_LOCKDOWN-ACL.sql — FECHAMENTO DOS CAMINHOS LEGADOS (ACL)
-- ============================================================================
-- Executar DEPOIS de 03_CONFIGURACAO-CUTOVER.sql e ANTES de
-- 04_ATIVAR-CONTROLADO.sql / da publicação do bundle.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 08_LOCKDOWN-ACL.sql
--
-- O QUE FAZ (e o que NÃO faz):
--   * revoga de `authenticated` o DML direto em `reservas_estoque`,
--     `estoque_movimentacoes` e `pedido_item_componentes`;
--   * revoga de `authenticated` o DELETE compensatório em `pedidos`;
--   * revoga de `authenticated` o EXECUTE das RPCs legadas
--     `reservar_estoque_atomica` e `liberar_reserva_atomica`.
--
--   * NÃO mexe em `produtos.preco`, estoque, pedidos, pagamentos ou reservas;
--   * NÃO mexe em `controlado`;
--   * NÃO revoga o que o fluxo novo usa: as RPCs 0095/0093/0091 e as tabelas
--     `reserva_consumos` / `reserva_proveniencia` / `pedido_item_componentes`
--     continuam acessíveis conforme as policies da 0098/0097.
--
-- POR QUE:
--   O bundle de corte JÁ não contém o caminho legado (0 call sites
--   comprovados). Este lockdown fecha a barreira para um bundle ANTIGO que
--   ainda esteja aberto em um navegador: mesmo com a flag OFF, ele não
--   consegue mais escrever reserva nem chamar as RPCs legadas.
--
-- IRREVERSÍVEL (no sentido de que o caminho legado não volta):
--   Não reverta este lockdown. Se um fluxo novo precisar de escrita direta em
--   `reservas_estoque`, o caminho correto é uma RPC SECURITY DEFINER.
-- ============================================================================

SELECT '=== 08_LOCKDOWN: estado antes ===' AS secao;
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes','pedidos')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: aplicando (cada revoke e independente) ===' AS secao;
DO $revokes$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.reservas_estoque') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.reservas_estoque FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela reservas_estoque ausente');
  END IF;

  IF to_regclass('public.estoque_movimentacoes') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.estoque_movimentacoes FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela estoque_movimentacoes ausente');
  END IF;

  IF to_regclass('public.pedido_item_componentes') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.pedido_item_componentes FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela pedido_item_componentes ausente (0097 nao aplicada)');
  END IF;

  IF to_regclass('public.pedidos') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE ON TABLE public.pedidos FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela pedidos ausente');
  END IF;

  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'RPC reservar_estoque_atomica ausente');
  END IF;

  IF to_regprocedure('public.liberar_reserva_atomica(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'RPC liberar_reserva_atomica ausente');
  END IF;

  IF cardinality(v_falhas) > 0 THEN
    RAISE EXCEPTION 'NO-GO: % — rode este script DEPOIS de 02_MIGRATIONS-CUTOVER.sql', array_to_string(v_falhas, ' | ');
  END IF;
END
$revokes$;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: estado depois ===' AS secao;
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes','pedidos')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;

SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: o fluxo novo continua acessivel? (deve ser TRUE) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: VEREDITO ===' AS secao;
DO $lock$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
BEGIN
  IF has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda executa reservar_estoque_atomica');
  END IF;
  IF has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda executa liberar_reserva_atomica');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema='public' AND table_name='reservas_estoque'
                AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda tem DML em reservas_estoque');
  END IF;
  IF NOT has_function_privilege('authenticated','public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a criar_pedido_com_reserva (ERRO)');
  END IF;
  IF NOT has_function_privilege('authenticated','public.cancelar_pedido_atomico(uuid,text)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a cancelar_pedido_atomico (ERRO)');
  END IF;
  IF NOT has_function_privilege('authenticated','public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a registrar_consumo_reserva (ERRO)');
  END IF;
  IF cardinality(v_falhas) = 0 THEN
        PERFORM set_config('neia.lock', 'LOCKDOWN_OK', false);
    RAISE NOTICE 'LOCKDOWN_OK: caminhos legados fechados e fluxo novo intacto';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$lock$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.lock', true) AS resultado;
