\set ON_ERROR_STOP on
-- Verificação estrutural da 0142 em cluster local descartável (Fase 1).
DO $$
BEGIN
  IF current_database() <> 'postgres' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Somente PostgreSQL local descartável';
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.ok(condicao boolean, caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condicao IS DISTINCT FROM true THEN RAISE EXCEPTION 'Falhou: %', caso; END IF;
  RAISE NOTICE 'OK: %', caso;
END;
$$;

SELECT pg_temp.ok(
  to_regprocedure('public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)') IS NOT NULL
  AND to_regprocedure('public.verificar_recebimento_por_chave(text)') IS NOT NULL
  AND to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)') IS NOT NULL,
  '0142 preserva a assinatura antiga e acrescenta as novas RPCs (sem sobrecarga)');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pedido_pagamento_eventos'
      AND column_name IN ('forma_pagamento_efetiva','valor_entregue_centavos','troco_centavos')
    GROUP BY table_name HAVING count(*)=3)
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_pagamento_eventos_forma_efetiva_check')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_pagamento_eventos_troco_check'),
  'colunas e restrições da forma efetiva/troco estão presentes');

SELECT pg_temp.ok(
  position('IF NOT neia_operacao.tem_capacidade(auth.uid(),''receber_pagamento'') THEN' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0
  AND position('public.has_role(auth.uid(), ''atendente'')' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0
  AND position('pg_advisory_xact_lock' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0,
  'nova RPC mantém capacidade, papéis e travamento por idempotência');

SELECT pg_temp.ok(
  position('confirmacao_efetiva_requerida' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0
  AND position('troco_centavos' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0
  AND position('forma_pagamento_efetiva' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)'::regprocedure)) > 0,
  'forma efetiva, confirmação de Pix/cartão e troco são exigidos no banco');

SELECT pg_temp.ok(
  position('INSERT INTO public.pedido_pagamento_eventos' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido(uuid,bigint,text)'::regprocedure)) = 0
  AND position('dados_invalidos' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.registrar_pagamento_pedido(uuid,bigint,text)'::regprocedure)) > 0,
  'assinatura antiga não grava sem forma efetiva (sem caminho paralelo)');

SELECT pg_temp.ok(
  position('pedido_nao_editavel' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.editar_observacoes_pedido(uuid,text,text)'::regprocedure)) > 0
  AND position('retirado_em' in
    (SELECT prosrc FROM pg_proc WHERE oid =
      'public.editar_observacoes_pedido(uuid,text,text)'::regprocedure)) > 0,
  'edição auditada passou a validar estágio no backend');

SELECT pg_temp.ok(
  has_function_privilege('authenticated',
    'public.registrar_pagamento_pedido_efetivo(uuid,bigint,text,text,bigint,boolean)', 'EXECUTE')
  AND has_function_privilege('authenticated',
    'public.verificar_recebimento_por_chave(text)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.verificar_recebimento_por_chave(text)', 'EXECUTE'),
  'ACL das novas RPCs continua restrita a authenticated');
