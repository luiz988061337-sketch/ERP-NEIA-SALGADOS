-- verify-0093.sql — verificação ESTÁTICA (somente leitura) da 0093.
-- ============================================================================
-- Rode PRE (antes de aplicar) e POST (depois), em ambiente ISOLADO autorizado.
-- Consulta apenas catálogos (pg_proc/pg_class). NÃO acessa dados de clientes;
-- NÃO exibe dados pessoais. NÃO substitui os testes transacionais.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (0) PRE: a função ainda NÃO existe (esperado: 0 linhas antes de aplicar).
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'cancelar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (1) POST: assinatura, SECURITY DEFINER e search_path fixo.
--     Esperado: 1 linha; security_definer = true; config ~ {search_path=public}.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef          AS security_definer,
       p.proconfig          AS config,
       pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'cancelar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (2) POST: EXECUTE. Esperado anon=false, authenticated=true, service_role=false.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'cancelar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (3) POST: o corpo faz EXATAMENTE o esperado (checagem textual defensiva).
--     Esperado (todos true): trava o pedido; autoriza por papel; só 'pendente';
--     chama a 0090; converte não-sucesso em EXCEPTION; grava histórico;
--     NÃO toca pagamento/valores; NÃO grava em estoque_mov; sem WHEN OTHERS.
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%from public.pedidos%for update%')                 AS trava_pedido,
  (prosrc ILIKE '%has_role%')                                       AS tem_autorizacao,
  (prosrc ILIKE '%pagamento_status%')                               AS le_pagamento,
  (prosrc ILIKE '%is distinct from ''pendente''%')                  AS so_pendente_elegivel,
  (prosrc ILIKE '%public.liberar_pedido_atomico(%')                 AS chama_0090,
  -- 1.41/B: validação ESTRITA do retorno da 0090.
  (prosrc ILIKE '%jsonb_typeof(v_lib) is distinct from ''object''%')
                                                                     AS rejeita_null_e_nao_objeto,
  (prosrc ILIKE '%jsonb_typeof(v_lib -> ''status'') is distinct from ''string''%')
                                                                     AS exige_status_textual,
  (prosrc ILIKE '%v_lib_status not in (''liberado'', ''ja_liberado'')%')
                                                                     AS aceita_so_sucesso,
  (prosrc ILIKE '%ja_liberado%' AND prosrc ILIKE '%v_reserv_total = 0%')
                                                                     AS ja_liberado_exige_reserva,
  (prosrc ILIKE '%reconciliacao_pendente%')                         AS rejeita_reconciliacao,
  (prosrc ILIKE '%status_invalido%')                                AS rejeita_status_invalido,
  (prosrc ILIKE '%pedido_invalido%')                                AS rejeita_pedido_invalido,
  (prosrc ILIKE '%raise exception%')                                AS converte_em_excecao,
  (prosrc ILIKE '%insert into public.pedido_status_historico%')     AS grava_historico,
  (prosrc ILIKE '%requer_analise%')                                 AS classifica_decisao_humana,
  (prosrc ILIKE '%ja_cancelado%')                                   AS idempotente,
  (prosrc ILIKE '%pagamento_nao_elegivel%')                         AS bloqueia_pagamento,
  -- Esperado FALSE (a 0093 NÃO deve mexer em dinheiro nem duplicar ledger):
  (prosrc ILIKE '%set pagamento_status%')                           AS altera_pagamento,     -- false
  (prosrc ILIKE '%set forma_pagamento%')                            AS altera_forma,         -- false
  (prosrc ILIKE '%set total%')                                      AS altera_total,         -- false
  (prosrc ILIKE '%insert into public.estoque_movimentacoes%')       AS grava_estoque_mov,    -- false
  (prosrc ILIKE '%update public.produtos%')                         AS atualiza_produtos,    -- false
  (prosrc ILIKE '%update public.reservas_estoque%')                 AS atualiza_reservas,    -- false
  (prosrc ILIKE '%exception when others%')                          AS engole_erro          -- false
FROM pg_proc WHERE proname = 'cancelar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (4) Pré-requisito: a 0090 existe (a 0093 a chama internamente) e continua
--     SEM EXECUTE para anon/authenticated/service_role (função INTERNA).
--     Esperado: 1 linha; anon/authenticated/service_role = false.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'liberar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (5) Pré-requisito: mesmo OWNER entre 0093 e 0090 (a 0093 DEFINER só executa
--     a 0090 se compartilharem o owner). Esperado: mesma_owner = true.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT p.proowner FROM pg_proc p WHERE p.proname = 'cancelar_pedido_atomico') =
  (SELECT p.proowner FROM pg_proc p WHERE p.proname = 'liberar_pedido_atomico')
    AS mesma_owner;

-- ---------------------------------------------------------------------------
-- (5b) Pré-requisito (1.41/D): o OWNER da 0093 deve ser o dono da tabela pedidos
--      (ou ter BYPASSRLS), senão o UPDATE fica sujeito à política do chamador —
--      insuficiente para o cliente. Esperado: owner_pedidos = true.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT relowner FROM pg_class WHERE oid = 'public.pedidos'::regclass) =
  (SELECT p.proowner FROM pg_proc p WHERE p.proname = 'cancelar_pedido_atomico')
    AS owner_pedidos,
  (SELECT relowner FROM pg_class WHERE oid = 'public.reservas_estoque'::regclass) =
  (SELECT p.proowner FROM pg_proc p WHERE p.proname = 'cancelar_pedido_atomico')
    AS owner_reservas,
  (SELECT relowner FROM pg_class WHERE oid = 'public.pedido_status_historico'::regclass) =
  (SELECT p.proowner FROM pg_proc p WHERE p.proname = 'cancelar_pedido_atomico')
    AS owner_historico;

-- ---------------------------------------------------------------------------
-- (6) Pré-requisito: a matriz 0041 contém ('recebido','cancelado').
--     Esperado: 1 linha.
-- ---------------------------------------------------------------------------
SELECT de_status, para_status
FROM public.pedido_status_transicoes
WHERE de_status = 'recebido' AND para_status = 'cancelado';

-- ---------------------------------------------------------------------------
-- (7) Compatibilidade: colunas reais usadas existem (0022/0063/0023).
--     Esperado: pagamento_status, pagamento_modalidade, forma_pagamento, status.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pedidos'
  AND column_name IN ('status', 'pagamento_status', 'pagamento_modalidade',
                      'forma_pagamento', 'pago_em', 'pagamento_em', 'user_id')
ORDER BY column_name;

-- ---------------------------------------------------------------------------
-- (8) Pré-requisito: estrutura do histórico (0023) para o INSERT da 0093.
--     Esperado: de_status/para_status/actor/motivo presentes e compatíveis.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pedido_status_historico'
ORDER BY ordinal_position;

-- Critério de aceite estático: (0) ausente no PRE; (1) definer + search_path=public;
-- (2) anon=false / authenticated=true / service_role=false; (3) todos os flags
-- positivos = true (trava_pedido, tem_autorizacao, so_pendente_elegivel, chama_0090,
-- rejeita_null_e_nao_objeto, exige_status_textual, aceita_so_sucesso,
-- ja_liberado_exige_reserva, rejeita_reconciliacao, rejeita_status_invalido,
-- rejeita_pedido_invalido, converte_em_excecao, grava_historico, classifica_decisao_humana,
-- idempotente, bloqueia_pagamento) e os negativos (altera_pagamento/altera_forma/
-- altera_total/grava_estoque_mov/atualiza_produtos/atualiza_reservas/engole_erro) = false;
-- (4) 0090 presente e sem EXECUTE público; (5) mesma_owner=true; (5b) owner_pedidos=
-- owner_reservas=owner_historico=true (ou registrar a dependência se BYPASSRLS);
-- (6) transição recebido->cancelado existe; (7) colunas reais presentes; (8) histórico
-- presente. Dependência de privilégio remoto (owner × RLS) NÃO é presumida: se (5b)
-- for false, registrar antes de ativar (ver cabeçalho da 0093, seção D).
-- Os TESTES TRANSACIONAIS (T1–T20) NÃO constam aqui: ver
-- test-0093-transacional.sql e executar SOMENTE em ambiente isolado autorizado.
