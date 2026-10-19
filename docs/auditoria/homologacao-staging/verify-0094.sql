-- verify-0094.sql — verificação ESTÁTICA (somente leitura) da 0094 (1.43 + 1.44).
-- ============================================================================
-- Rode PRE (antes de aplicar) e POST (depois), em ambiente ISOLADO autorizado.
-- Consulta apenas catálogos (pg_proc/pg_trigger/pg_attribute/pg_class). NÃO lê
-- dados de clientes; NÃO altera nada. NÃO substitui os testes transacionais.
-- Cobre: 1.44/B (bloqueio de transições financeiras inconsistentes em
--        status × pagamento_status) e 1.43/D (cupom não emite p/ cancelado).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (0) PRE: nada da 0094 existe ainda; e os nomes 1.43 não devem existir.
--     Esperado ANTES de aplicar: 0 linhas em (0a),(0b),(0c),(0d).
-- ---------------------------------------------------------------------------
-- (0a) função de proteção (1.44)
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'proteger_consistencia_financeira_pedido';

-- (0b) gatilho (1.44)
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname  = 'trigger_proteger_consistencia_financeira';

-- (0c) nome ANTIGO de função (1.43) deve estar ausente
SELECT p.oid::regprocedure AS nome_143_funcao_nao_deve_existir
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'bloquear_pagamento_pedido_cancelado';

-- (0d) nome ANTIGO de gatilho (1.43) deve estar ausente
SELECT tgname AS nome_143_gatilho_nao_deve_existir FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname  = 'trigger_bloquear_pagamento_cancelado';

-- ---------------------------------------------------------------------------
-- (1) POST: função de proteção — SECURITY INVOKER e search_path fixo.
--     Esperado: 1 linha; security_definer = false; config ~ {search_path=public}.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef          AS security_definer,   -- false
       p.proconfig          AS config              -- {search_path=public}
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'proteger_consistencia_financeira_pedido';

-- ---------------------------------------------------------------------------
-- (2) POST: corpo da função faz EXATAMENTE o esperado.
--     Esperado (todos true, exceto os "mexe_*"/"engole_erro" = false):
-- ---------------------------------------------------------------------------
SELECT proname,
  -- observa as DUAS colunas (variáveis de mudança)
  (prosrc ILIKE '%v_mudou_status%')                                  AS observa_mudanca_status,
  (prosrc ILIKE '%v_mudou_pagamento%')                               AS observa_mudanca_pagamento,
  (prosrc ILIKE '%if not v_mudou_status and not v_mudou_pagamento%') AS ignora_no_op,
  -- (I) cancelado + pago
  (prosrc ILIKE '%new.status = ''cancelado'' and new.pagamento_status = ''pago''%')
                                                                     AS bloqueia_cancelado_e_pago,
  -- (II) confirmação sobre pedido cancelado
  (prosrc ILIKE '%old.status = ''cancelado''%')                      AS olha_status_antigo,
  (prosrc ILIKE '%old.pagamento_status is distinct from ''pago''%')  AS exige_old_nao_pago,
  -- (III) reabertura direta de cancelado
  (prosrc ILIKE '%old.status = ''cancelado'' and new.status is distinct from ''cancelado''%')
                                                                     AS bloqueia_reabertura,
  (prosrc ILIKE '%reabertura_nao_permitida%')                        AS mensagem_reabertura,
  -- (IV) ocultação de pagamento confirmado (1.46)
  (prosrc ILIKE '%old.pagamento_status = ''pago''%')                 AS olha_pagamento_antigo,
  (prosrc ILIKE '%new.pagamento_status in (''pendente'', ''falhou'')%')
                                                                     AS bloqueia_rebaixamento,
  (prosrc ILIKE '%pagamento_confirmado_nao_rebaixavel%')             AS mensagem_rebaixamento,
  (prosrc ILIKE '%raise exception%')                                 AS bloqueia_com_excecao,
  (prosrc ILIKE '%inconsistencia_financeira%')                       AS mensagem_explicita,
  (prosrc ILIKE '%return new%')                                      AS retorna_new,
  -- Esperado FALSE (validação não mexe em dados nem engole erro):
  (prosrc ILIKE '%update %')                                         AS mexe_em_update,   -- false
  (prosrc ILIKE '%insert %')                                         AS mexe_em_insert,   -- false
  (prosrc ILIKE '%delete %')                                         AS mexe_em_delete,   -- false
  (prosrc ILIKE '%exception when others%')                           AS engole_erro       -- false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'proteger_consistencia_financeira_pedido';

-- ---------------------------------------------------------------------------
-- (3) POST: gatilho — BEFORE UPDATE OF status, pagamento_status; FOR EACH ROW;
--     enabled. Esperado: 1 linha; before=true; for_each_row=true; enabled='O';
--     of_colunas = {pagamento_status,status}.
-- ---------------------------------------------------------------------------
SELECT t.tgname,
       t.tgenabled = 'O'                                          AS enabled,
       (t.tgtype & 2) = 2                                         AS before,        -- 2=BEFORE
       (t.tgtype & 1) = 1                                         AS for_each_row,  -- 1=ROW
       (SELECT array_agg(a.attname ORDER BY u.ord)
          FROM unnest(t.tgattr) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = u.attnum
       )                                                          AS of_colunas,
       pg_get_triggerdef(t.oid)                                   AS definicao
FROM pg_trigger t
WHERE t.tgrelid = 'public.pedidos'::regclass
  AND t.tgname  = 'trigger_proteger_consistencia_financeira'
  AND NOT t.tgisinternal;

-- ---------------------------------------------------------------------------
-- (4) POST: gatilhos BEFORE UPDATE vigentes em pedidos (registro informativo).
--     Esperado (entre outros): trigger_proteger_consistencia_financeira,
--     trigger_congelar_colunas (0084), trigger_exigir_conferencia (0084),
--     trigger_validar_transicao (0041), e o guard (0085). A proteção é ADITIVA.
-- ---------------------------------------------------------------------------
SELECT t.tgname, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
WHERE t.tgrelid = 'public.pedidos'::regclass
  AND NOT t.tgisinternal
  AND (t.tgtype & 2) = 2          -- BEFORE
  AND (t.tgtype & 16) = 16        -- UPDATE
ORDER BY t.tgname;

-- ---------------------------------------------------------------------------
-- (5) POST: (D) enfileirar_cupom foi recriada com o guard de cancelado.
--     Esperado (todos true):
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
  (p.prosrc ILIKE '%v_p.status = ''cancelado''%')             AS tem_guard_cancelado,
  (p.prosrc ILIKE '%if not found%')                           AS mantem_nao_encontrado,
  (p.prosrc ILIKE '%pagamento_modalidade%')                   AS mantem_regra_modalidade,
  (p.prosrc ILIKE '%pagamento_status%')                       AS mantem_regra_pagamento,
  (p.prosrc ILIKE '%fila_impressao%')                         AS mantem_enfileiramento,
  (p.prosrc ILIKE '%on conflict (trabalho_uuid) do nothing%') AS mantem_idempotencia
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'enfileirar_cupom';

-- ---------------------------------------------------------------------------
-- (6) POST: EXECUTE de enfileirar_cupom preservado.
--     Esperado: authenticated=true, service_role=true.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'enfileirar_cupom';

-- ---------------------------------------------------------------------------
-- (7) POST: o gatilho de impressão continua existindo (não foi removido).
--     Esperado: 1 linha.
-- ---------------------------------------------------------------------------
SELECT t.tgname, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
WHERE t.tgrelid = 'public.pedidos'::regclass
  AND t.tgname  = 'trigger_pagamento_confirmado';

-- ---------------------------------------------------------------------------
-- (8) Interação com a 0093: confirmar que ela NÃO grava pagamento_status.
--     Esperado: altera_pagamento = false (a 0093 não cai no §2).
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%pagamento_status%')     AS le_pagamento,
  (prosrc ILIKE '%set pagamento_status%') AS altera_pagamento   -- false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'cancelar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (9) Compatibilidade com os triggers existentes (nomes esperados presentes).
--     Esperado: 4 linhas.
-- ---------------------------------------------------------------------------
SELECT t.tgname
FROM pg_trigger t
WHERE t.tgrelid = 'public.pedidos'::regclass
  AND NOT t.tgisinternal
  AND t.tgname IN ('trigger_validar_transicao','trigger_congelar_colunas',
                   'trigger_exigir_conferencia','pedidos_guard_update_trg')
ORDER BY t.tgname;
