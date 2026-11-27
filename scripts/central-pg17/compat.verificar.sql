\set ON_ERROR_STOP on
-- Compatibilidade estrutural: cadeia limpa até 0123 + 0136 + 0139/0140/0141.
-- Nenhuma conexão remota; executado somente no cluster descartável do runner.
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
  to_regprocedure('public.consultar_recebimento_retirada(uuid)') IS NOT NULL
  AND to_regprocedure('public.registrar_pagamento_pedido(uuid,bigint,text)') IS NOT NULL
  AND to_regprocedure('public.editar_observacoes_pedido(uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.congelar_colunas_protegidas()') IS NOT NULL,
  'funções da cadeia anterior e das novas migrations coexistem');

SELECT pg_temp.ok(
  position('''pode_receber'', neia_operacao.tem_capacidade(ator' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.consultar_recebimento_retirada(uuid)'::regprocedure)) > 0
  AND position('''pode_receber'',public.has_role(ator' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.consultar_recebimento_retirada(uuid)'::regprocedure)) = 0,
  '0139 trocou a guarda Admin pela capacidade financeira na consulta');

SELECT pg_temp.ok(
  position('public.has_role(auth.uid(), ''atendente'') AND neia_operacao.tem_capacidade' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.registrar_pagamento_pedido(uuid,bigint,text)'::regprocedure)) > 0
  AND position('INSERT INTO public.pedido_pagamento_eventos' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.registrar_pagamento_pedido(uuid,bigint,text)'::regprocedure)) > 0,
  '0139 preservou a gravação no ledger e ampliou apenas a autorização');

SELECT pg_temp.ok(
  position('pagamento_sem_ledger_integro' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.congelar_colunas_protegidas()'::regprocedure)) > 0
  AND position('Coluna protegida: alteração apenas via fluxo financeiro/RPC' in
    (SELECT prosrc FROM pg_proc WHERE oid = 'public.congelar_colunas_protegidas()'::regprocedure)) > 0,
  '0141 mantém o corpo da 0084 e acrescenta a exceção com ledger íntegro');

SELECT pg_temp.ok(
  has_function_privilege('authenticated', 'public.consultar_recebimento_retirada(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.registrar_pagamento_pedido(uuid,bigint,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.editar_observacoes_pedido(uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.consultar_recebimento_retirada(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.registrar_pagamento_pedido(uuid,bigint,text)', 'EXECUTE'),
  'ACL das RPCs permanece restrita a authenticated');

SELECT pg_temp.ok(
  EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.pedido_edicoes_auditoria'::regclass AND relrowsecurity)
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pedidos'::regclass
      AND tgname = 'exigir_quitacao_para_retirada' AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pedidos'::regclass
      AND tgname = 'trigger_congelar_colunas' AND NOT tgisinternal
  )
  AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pedidos'::regclass
      AND tgname = 'pedidos_pagamento_ledger_trg' AND NOT tgisinternal
  ),
  'RLS da auditoria e gatilhos 0106/0136/0084 permanecem instalados');

SELECT pg_temp.ok(
  (SELECT indices = (SELECT count(*) FROM pg_index WHERE NOT indisvalid)
          AND restricoes = (SELECT count(*) FROM pg_constraint WHERE NOT convalidated)
   FROM public.neia_teste_invalidos_base),
  '0136/0139/0140/0141 não introduziram índice ou constraint inválido');
