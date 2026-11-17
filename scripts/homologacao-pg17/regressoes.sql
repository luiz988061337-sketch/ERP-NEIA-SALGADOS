-- Executado somente pelo runner local após o manifesto.
INSERT INTO auth.users (id, email) VALUES
 ('10000000-0000-0000-0000-000000000001', 'admin@example.invalid'),
 ('10000000-0000-0000-0000-000000000002', 'cliente@example.invalid');
INSERT INTO public.user_roles (user_id, role)
 VALUES ('10000000-0000-0000-0000-000000000001', 'admin');
INSERT INTO public.contas (id, tipo, valor)
 VALUES ('20000000-0000-0000-0000-000000000001', 'pagar', 500);
INSERT INTO public.categorias (id, nome, slug)
 VALUES ('30000000-0000-0000-0000-000000000001', 'Teste', 'homologacao-local');
INSERT INTO public.produtos (id, categoria_id, nome, preco, estoque)
 VALUES ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Teste', 10, 10);

DO $$
BEGIN
  IF to_regprocedure('public.enfileirar_cupom(uuid)') IS NULL
     OR to_regprocedure('public.handle_pagamento_confirmado()') IS NOT NULL
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.pedidos'::regclass
          AND tgname = 'trigger_pagamento_confirmado' AND tgenabled <> 'D') <> 1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.pedido_itens'::regclass
          AND tgname = 'trigger_gerar_cupom_apos_itens' AND tgenabled <> 'D') <> 1 THEN
    RAISE EXCEPTION 'Pipeline de impressao consolidado ausente ou inesperado';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_conta uuid := '20000000-0000-0000-0000-000000000001';
  v_produto uuid := '40000000-0000-0000-0000-000000000001';
  v_chave uuid := '50000000-0000-0000-0000-000000000001';
  v_resultado jsonb;
  v_pagamento uuid;
  v_bloqueado boolean := false;
BEGIN
  PERFORM set_config('app.financeiro_atomic_write', 'on', true);
  BEGIN
    UPDATE public.contas SET valor_pago = 500 WHERE id = v_conta;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%baixa%' THEN RAISE; END IF;
    v_bloqueado := true;
  END;
  IF NOT v_bloqueado THEN RAISE EXCEPTION 'Baixa direta com GUC indevidamente aceita'; END IF;

  v_resultado := public.registrar_pagamento_conta(v_conta, 20000, 'teste-pagamento');
  IF v_resultado ->> 'saldo_centavos' IS DISTINCT FROM '30000' THEN RAISE EXCEPTION 'Saldo incorreto: %', v_resultado; END IF;
  v_pagamento := (v_resultado ->> 'pagamento_id')::uuid;
  IF public.registrar_pagamento_conta(v_conta, 20000, 'teste-pagamento') ->> 'status' IS DISTINCT FROM 'repetido' THEN
    RAISE EXCEPTION 'Pagamento duplicado';
  END IF;
  v_resultado := public.estornar_pagamento_conta(v_pagamento, 5000, 'teste', 'teste-estorno');
  IF v_resultado ->> 'saldo_centavos' IS DISTINCT FROM '35000' THEN RAISE EXCEPTION 'Saldo apos estorno incorreto: %', v_resultado; END IF;

  v_resultado := public.movimentar_estoque_manual_atomico(v_produto, 'saida', 4, 'teste', v_chave, 10);
  IF v_resultado ->> 'status' IS DISTINCT FROM 'registrado' OR
     (SELECT estoque FROM public.produtos WHERE id = v_produto) <> 6 THEN
    RAISE EXCEPTION 'Saida de estoque falhou: %', v_resultado;
  END IF;
  IF public.movimentar_estoque_manual_atomico(v_produto, 'saida', 4, 'teste', v_chave, 10) ->> 'status'
     IS DISTINCT FROM 'ja_registrado' THEN RAISE EXCEPTION 'Idempotencia de estoque falhou'; END IF;
  IF public.movimentar_estoque_manual_atomico(v_produto, 'saida', 7, 'teste', gen_random_uuid(), 6) ->> 'status'
     IS DISTINCT FROM 'estoque_insuficiente' THEN RAISE EXCEPTION 'Estoque insuficiente foi aceito'; END IF;
END $$;

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$
BEGIN
  IF public.registrar_pagamento_conta('20000000-0000-0000-0000-000000000001', 100, 'indevido') ->> 'status'
     IS DISTINCT FROM 'nao_autorizado' THEN RAISE EXCEPTION 'Cliente conseguiu registrar pagamento'; END IF;
  IF public.movimentar_estoque_manual_atomico('40000000-0000-0000-0000-000000000001', 'saida', 1, 'teste', gen_random_uuid()) ->> 'status'
     IS DISTINCT FROM 'permissao_negada' THEN RAISE EXCEPTION 'Cliente conseguiu alterar estoque'; END IF;
END $$;
