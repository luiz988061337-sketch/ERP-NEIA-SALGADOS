-- ============================================================================
-- 04_ATIVAR-CONTROLADO.sql — ATIVAÇÃO DE `reserva_proveniencia_config.controlado`
-- ============================================================================
-- Executar **SOMENTE** no ponto definido pelo plano homologado:
--
--     migrations (02)  ->  configuração (03)  ->  VERIFY (05)
--                       ->  deploy do bundle de corte
--                       ->  >>> ESTE SCRIPT <<<  ->  smoke
--                       ->  reabertura da loja
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 04_ATIVAR-CONTROLADO.sql
--
-- O script é MÍNIMO e **falha fechado**:
--   * valida que a tabela/config existe e tem exatamente 1 registro (id = true);
--   * valida que o estado atual é o esperado (controlado = false);
--   * altera SOMENTE o registro correto;
--   * confirma o resultado e aborta se algo divergir.
--
-- Não executado hoje. Executar amanhã, com autorização expressa.
-- ============================================================================

SELECT '=== 04_CONTROLADO: estado antes ===' AS secao;
SELECT id, controlado, now() AS momento
FROM public.reserva_proveniencia_config
WHERE id = true;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: validacao + ativacao (fail-closed) ===' AS secao;
DO $ativar$
DECLARE
  v_total integer;
  v_ativas integer;
  v_antes boolean;
  v_depois boolean;
  v_ret integer;
BEGIN
  -- -------------------------------------------------------------------
  -- 1) A tabela/config tem que existir (migration 0092 aplicada)
  -- -------------------------------------------------------------------
  IF to_regclass('public.reserva_proveniencia_config') IS NULL THEN
    RAISE EXCEPTION 'NO-GO: reserva_proveniencia_config nao existe (0092 nao aplicada)';
  END IF;

  -- -------------------------------------------------------------------
  -- 2) Exatamente 1 registro de configuracao, com id = true
  -- -------------------------------------------------------------------
  SELECT count(*)::int INTO v_total FROM public.reserva_proveniencia_config;
  SELECT count(*)::int INTO v_ativas FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_total <> 1 OR v_ativas <> 1 THEN
    RAISE EXCEPTION 'NO-GO: reserva_proveniencia_config deveria ter exatamente 1 registro com id=true (total=%, id_true=%)', v_total, v_ativas;
  END IF;

  -- -------------------------------------------------------------------
  -- 3) Estado anterior inesperado -> abortar (idempotencia explicita)
  -- -------------------------------------------------------------------
  SELECT controlado INTO v_antes FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'NO-GO: controlled esta NULL (valor inesperado)';
  END IF;
  IF v_antes = true THEN
    RAISE EXCEPTION 'NO-GO: controlled ja estava true antes deste passo (estado inesperado) — revisar a sequencia do cutover';
  END IF;

  -- -------------------------------------------------------------------
  -- 4) Ativar SOMENTE o registro correto
  -- -------------------------------------------------------------------
  UPDATE public.reserva_proveniencia_config
     SET controlado = true
   WHERE id = true;
  GET DIAGNOSTICS v_ret = ROW_COUNT;
  IF v_ret <> 1 THEN
    RAISE EXCEPTION 'NO-GO: update afetou % linha(s) (esperado 1) — nada foi alterado', v_ret;
  END IF;

  -- -------------------------------------------------------------------
  -- 5) Confirmar o resultado
  -- -------------------------------------------------------------------
  SELECT controlado INTO v_depois FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_depois IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'NO-GO: controlled nao ficou true apos o update (valor atual: %)', coalesce(v_depois::text, 'null');
  END IF;

    PERFORM set_config('neia.controlado', 'CONTROLADO_OK', false);
  RAISE NOTICE 'CONTROLADO_OK: reserva_proveniencia_config.controlado = true';
END
$ativar$;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: estado depois ===' AS secao;
SELECT id, controlado, now() AS momento
FROM public.reserva_proveniencia_config
WHERE id = true;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: coerencia do regime (somente leitura) ===' AS secao;
SELECT
  (SELECT controlado FROM public.reserva_proveniencia_config WHERE id = true) AS controlado,
  to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL AS rpc_0095_ok,
  to_regprocedure('public.cancelar_pedido_atomico(uuid,text)')           IS NOT NULL AS rpc_0093_ok,
  to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL AS rpc_0091_ok,
  'PROXIMO PASSO: 05_VERIFY-POS-CORTE.sql e o smoke funcional'::text AS proximo_passo;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.controlado', true) AS resultado;
