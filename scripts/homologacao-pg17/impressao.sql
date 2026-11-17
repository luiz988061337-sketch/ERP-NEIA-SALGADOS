INSERT INTO public.pedidos
 (id, cliente_nome, telefone, endereco, tipo_entrega, forma_pagamento, pagamento_modalidade, subtotal, total)
VALUES
 ('80000000-0000-0000-0000-000000000001','Pedido online ficticio','','','retirada','pix','online',100,100),
 ('80000000-0000-0000-0000-000000000002','Pedido dinheiro ficticio','','','retirada','dinheiro','na_entrega',100,100);
INSERT INTO public.pedido_itens (pedido_id, nome, preco_unitario, quantidade)
VALUES ('80000000-0000-0000-0000-000000000001','Salgado ficticio',2,50),
       ('80000000-0000-0000-0000-000000000002','Salgado ficticio',2,50);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = '80000000-0000-0000-0000-000000000001:pedido')
     OR (SELECT count(*) FROM public.fila_impressao WHERE trabalho_uuid = '80000000-0000-0000-0000-000000000002:pedido') <> 1 THEN
    RAISE EXCEPTION 'Fila não diferenciou online pendente e pagamento na entrega';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$
DECLARE
  v_id uuid := '80000000-0000-0000-0000-000000000001';
  v_res jsonb;
BEGIN
  v_res := public.registrar_pagamento_pedido(v_id, 10000, 'teste-impressao');
  IF v_res ->> 'status' IS DISTINCT FROM 'registrado' THEN RAISE EXCEPTION 'Pagamento: %', v_res; END IF;
  PERFORM public.registrar_pagamento_pedido(v_id, 10000, 'teste-impressao');
  IF (SELECT count(*) FROM public.fila_impressao WHERE trabalho_uuid = v_id::text || ':pedido') <> 1
     OR (SELECT count(*) FROM public.pedido_pagamento_eventos WHERE pedido_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'Repetição do pagamento duplicou ou deixou de gravar o evento de impressão';
  END IF;
END $$;
