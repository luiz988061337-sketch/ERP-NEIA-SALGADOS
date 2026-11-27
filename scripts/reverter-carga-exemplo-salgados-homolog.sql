-- REVERSÃO DA CARGA EXEMPLIFICATIVA — SOMENTE HOMOLOGAÇÃO — NÃO APLICADA.
-- Preparada em 27/11/2026. Nunca transferir para produção.
--
-- Usa a MESMA RPC da carga, com tipo 'retirada', lote explicitado e saldo
-- esperado conferido. Não há DELETE, não apaga ledger/histórico e não reaproveita
-- reservas. Chave idempotente distinta garante que a reversão não seja confundida
-- com a entrada original e permite reexecução sem segunda baixa.
--
-- Se qualquer lote tiver saldo diferente do esperado, toda a reversão aborta:
-- isso protege unidades reais que tenham sido adicionadas ao lote de teste.

DO $reversao$
DECLARE
  v_ator     uuid := auth.uid();
  r          record;
  v_lote_id  uuid;
  v_key      uuid;
  v_res      text;
  v_existe   boolean;
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Reversão exige sessão autenticada de administrador';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('coxinha-frango', 5000),
      ('bolinha-queijo', 4000),
      ('risoles-presunto-queijo', 2000),
      ('croquete', 2500),
      ('bolinho-calabresa', 1500),
      ('bolinho-milho-queijo', 1200),
      ('bolinho-azeitona', 800),
      ('trouxinha-milho-catupiry', 1500),
      ('kibe', 3000),
      ('pastel-carne', 2500),
      ('pastel-queijo', 2000),
      ('pastel-pizza', 1500),
      ('pastel-palmito', 800),
      ('esfirra-carne', 2500),
      ('esfirra-frango', 2000),
      ('esfirra-brocolis', 600),
      ('enroladinho-presunto-queijo', 1800),
      ('hamburguinho', 1200),
      ('ricota-zaatar', 100),
      ('empada-palmito', 800),
      ('empada-frango', 1500),
      ('pizza-calabresa', 1500),
      ('pizza-queijo', 1200),
      ('pizza-presunto-queijo', 1200),
      ('trouxinha-calabresa', 80),
      ('enroladinho-salsicha', 1500)
    ) t(chave, quantidade)
  LOOP
    v_key := md5('carga-exemplo-homologacao:' || r.chave || ':reversao')::uuid;
    SELECT EXISTS (
      SELECT 1 FROM public.estoque_mov_operacoes WHERE chave_idempotencia = v_key
    ) INTO v_existe;
    IF v_existe THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_lote_id
    FROM public.lotes
    WHERE sabor_chave = r.chave
      AND codigo = 'HOMOLOGAÇÃO-TESTE-' || upper(replace(r.chave, '-', '_'));

    IF v_lote_id IS NULL THEN
      RAISE EXCEPTION 'Lote de teste não encontrado para o sabor %', r.chave;
    END IF;

    v_res := public.movimentar_lote_salgado(
      p_sabor => r.chave,
      p_produto => NULL,
      p_tipo => 'retirada',
      p_quantidade => r.quantidade,
      p_chave => v_key,
      p_lote => v_lote_id,
      p_saldo_esperado => r.quantidade,
      p_observacao => 'Reversão da carga exemplificativa de homologação'
    );
    IF v_res NOT IN ('registrado', 'ja_registrado') THEN
      RAISE EXCEPTION 'Falha na reversão do sabor %: %', r.chave, v_res;
    END IF;
  END LOOP;
END
$reversao$;
