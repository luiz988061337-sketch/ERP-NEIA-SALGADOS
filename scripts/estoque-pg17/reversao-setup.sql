-- Marcadores locais para o ensaio das reversões 0129/0133.
-- Somente cluster PostgreSQL 17 descartável. Nunca aplicar em homologação.
-- Cria dados por meio das próprias RPCs, preservados pelas reversões.
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);

DO $$
DECLARE
  v jsonb;
  v_texto text;
BEGIN
  v := public.configurar_salgado_estoque('coxinha-frango', 100, 0, true, NULL);
  IF v->>'status' IS DISTINCT FROM 'ok' THEN
    RAISE EXCEPTION 'setup reversão: configurar_salgado_estoque falhou: %', v;
  END IF;

  v_texto := public.movimentar_lote_salgado(
    p_sabor => 'coxinha-frango',
    p_produto => NULL,
    p_tipo => 'entrada',
    p_quantidade => 200,
    p_chave => md5('reversao:lote:coxinha')::uuid,
    p_codigo => 'REV-TESTE-COXINHA',
    p_fabricacao => DATE '2026-11-20',
    p_validade => DATE '2027-01-15',
    p_observacao => 'Marcador local da reversão não destrutiva'
  );
  IF v_texto NOT IN ('registrado', 'ja_registrado') THEN
    RAISE EXCEPTION 'setup reversão: movimentar_lote_salgado falhou: %', v_texto;
  END IF;

  v := public.reservar_sabor_estoque(
    'coxinha-frango', 5,
    md5('pedido-estoque:coxinha')::uuid,
    md5('reversao:reserva:coxinha')::uuid,
    current_date
  );
  IF v->>'status' NOT IN ('ok', 'ja_registrado') THEN
    RAISE EXCEPTION 'setup reversão: reservar_sabor_estoque falhou: %', v;
  END IF;

  v := public.registrar_compromisso_salgado(
    'pizza-queijo', 5, current_date + 2,
    md5('pedido-estoque:pizza')::uuid,
    md5('reversao:compromisso:pizza')::uuid
  );
  IF v->>'status' NOT IN ('ok', 'ja_registrado') THEN
    RAISE EXCEPTION 'setup reversão: registrar_compromisso_salgado falhou: %', v;
  END IF;

  v := public.solicitar_salgado(
    'conferencia', 'trouxinha-calabresa', 3,
    'Marcador local da reversão não destrutiva',
    md5('reversao:solicitacao:trouxinha')::uuid,
    current_date,
    md5('pedido-estoque:esfirra')::uuid
  );
  IF v->>'status' NOT IN ('ok', 'ja_registrado') THEN
    RAISE EXCEPTION 'setup reversão: solicitar_salgado falhou: %', v;
  END IF;

  v := public.bloquear_sabor_salgados(
    'kibe', current_date + 5, current_date + 6,
    'Marcador local da reversão não destrutiva'
  );
  IF v->>'status' NOT IN ('ok', 'periodo_sobreposto') THEN
    RAISE EXCEPTION 'setup reversão: bloquear_sabor_salgados falhou: %', v;
  END IF;
END $$;

RESET ROLE;
COMMIT;
