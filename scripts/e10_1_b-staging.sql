-- E10.1-B — Bateria PG em staging (neia-teste). NUNCA em produção.
-- Pré-requisito: 0084 + 0085 aplicadas (ver E10.1-B roteiro §2).
-- §A = verificação pós-apply (somente leitura). §B = testes com dados
-- sintéticos de teste (prefixo E10B-). Executar blocos em ordem.

-- ============ §A1 — 0084 presente ============
SELECT count(*) AS colunas_0084 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='pedidos' AND column_name IN
  ('aceito_em_atendente','aceito_por','liberado_em','liberado_por',
   'conferido_em','conferido_por','conferencia_obs','retirado_em','retirado_por',
   'reserva_motoboy_em','aceito_motoboy_em','aceito_motoboy_por');
-- esperado: 12

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN
  ('aceitar_pedido_atendente','liberar_pedido_cozinha','conferir_pedido_cozinha',
   'atribuir_pedido_motoboy','aceitar_entrega_motoboy','retirar_pedido_cliente',
   'enfileirar_evento_cozinha','solicitar_reimpressao','adiar_cupom_agendado',
   'impedir_parada_duplicada','congelar_colunas_protegidas','exigir_conferencia_para_pronto');
-- esperado: 12 linhas

-- ============ §A2 — guard 0085 vigente (sem bug 0074) ============
SELECT
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure)
    LIKE '%motoboy_nao_pode_alterar_valores%' AS ainda_bug_0074,
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure)
    LIKE '%motoboy_sem_atribuicao%' AS tem_allowlist_0070,
  pg_get_functiondef('public.pedidos_guard_update()'::regprocedure)
    LIKE '%service_role%' AS tem_bypass_servidor;
-- esperado: false, true, true

-- ============ §A3 — triggers e índices 0084 ============
SELECT tgname FROM pg_trigger WHERE tgname IN
  ('trigger_impedir_parada_duplicada','trigger_congelar_colunas',
   'trigger_exigir_conferencia','trigger_adiar_cupom_agendado');
-- esperado: 4 linhas
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
  ('pedidos_aceite_pendente_idx','pedidos_liberacao_pendente_idx','rotas_preparando_motoboy_uniq');
-- esperado: 3 linhas

-- ============ §B — massa sintética (STAGING ONLY, prefixo E10B-) ============
-- Pedido base de teste (status recebido, tipo entrega):
-- (ajuste user_id para um UUID de teste; todos os textos levam E10B-)
-- INSERT INTO public.pedidos (cliente_nome, telefone, tipo_entrega, status,
--   pagamento_status, pagamento_modalidade, forma_pagamento, observacoes)
-- VALUES ('E10B-TESTE','(00) 00000-0000','entrega','recebido',
--   'pendente','na_entrega','dinheiro','E10B-TESTE descartável')
-- RETURNING id;
-- Guarde o id em <PID> e o motoboy de teste em <MID> (tabela motoboys, com user_id).

-- ============ §B1 — aceite duplo (2ª chamada = conflito) ============
-- SELECT resultado, detalhe FROM public.aceitar_pedido_atendente('<PID>');
-- (rodar 2×; esperado: ok, depois conflito)

-- ============ §B2 — liberação (janela + duplicata) ============
-- SELECT resultado FROM public.liberar_pedido_cozinha('<PID>', 60);
-- (esperado: ok; 2ª vez: conflito)

-- ============ §B3 — conferência exige preparo + confirmação ============
-- SELECT resultado FROM public.conferir_pedido_cozinha('<PID>', true, 'E10B');
-- (com status recebido → inelegivel; após UPDATE status='em_producao' via
--  fluxo legado → ok; 2ª vez → conflito)

-- ============ §B4 — atribuição concorrente (2 abas do editor) ============
-- Aba 1: BEGIN; SELECT resultado FROM public.atribuir_pedido_motoboy('<PID>','<MID>',false,false);
--   (segure a transação aberta sem COMMIT)
-- Aba 2: SELECT resultado FROM public.atribuir_pedido_motoboy('<PID>','<MID>',false,false);
--   (esperado: trava e depois conflito; nunca 2 atribuições)
-- Aba 1: COMMIT;
-- Limite: 4º pedido na mesma rota sem p_autorizar_extra → bloqueado 'rota acima do limite'.

-- ============ §B5 — retirada × entrega cruzadas ============
-- Pedido entrega com status pronto:
-- SELECT resultado FROM public.retirar_pedido_cliente('<PID_ENTREGA>', false);
-- (esperado: bloqueado 'entrega usa fluxo de motoboy')
-- Pedido retirada pronto: ok na 1ª, conflito na 2ª.

-- ============ §B6 — impressão idempotente (sem TANCA física) ============
-- SELECT resultado FROM public.enfileirar_evento_cozinha('<PID>', 'liberado');
-- (1ª: ok; 2ª: conflito 'ficha ja enfileirada'; demais eventos: ignorado)
-- SELECT resultado FROM public.solicitar_reimpressao('<PID>','E10B-motivo','pedido','E10B-1');
-- (sem base impressa → inelegivel; após marcar uma ficha como impresso
--  manualmente em staging: ok; repetir mesma chave → conflito)
-- SELECT count(*), count(DISTINCT trabalho_uuid) FROM public.fila_impressao
--   WHERE pedido_id = '<PID>';  -- (iguais = sem duplicata)

-- ============ §B7 — guard financeiro (como atendente/producao) ============
-- Via app logado como atendente (SQL Editor é superuser e não testa RLS):
-- tentar UPDATE pagamento_status/total de um pedido → deve falhar
-- 'Coluna protegida'; UPDATE de obs/status operacional → passa.

-- ============ §B8 — limpeza (STAGING ONLY, após os testes) ============
-- DELETE FROM public.fila_impressao WHERE pedido_id IN
--   (SELECT id FROM public.pedidos WHERE cliente_nome LIKE 'E10B-%');
-- DELETE FROM public.rota_pedidos WHERE pedido_id IN
--   (SELECT id FROM public.pedidos WHERE cliente_nome LIKE 'E10B-%');
-- DELETE FROM public.pedidos WHERE cliente_nome LIKE 'E10B-%';
