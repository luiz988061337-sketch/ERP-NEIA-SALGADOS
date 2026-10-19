-- verify-0091.sql — verificação ESTÁTICA (somente leitura) da 0091.
-- Rode PRE (antes de aplicar) e POST (depois). Consulta apenas catálogos.
-- NÃO acessa pedidos de clientes; NÃO exibe dados pessoais.

-- ---------------------------------------------------------------------------
-- (1) PRE: a função ainda NÃO existe (esperado: 0 linhas antes de aplicar).
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_consumo_reserva';

-- ---------------------------------------------------------------------------
-- (2) POST: assinatura, SECURITY DEFINER e search_path fixo.
--     Esperado: 1 linha; security_definer = true; config ~ {search_path=public}.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef          AS security_definer,
       p.proconfig          AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_consumo_reserva';

-- ---------------------------------------------------------------------------
-- (3) POST: EXECUTE. Esperado anon=false, authenticated=true, service_role=false.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'registrar_consumo_reserva';

-- ---------------------------------------------------------------------------
-- (4) POST: o corpo toca APENAS o esperado (checagem textual defensiva).
--     Esperado: grava em reserva_consumos; NÃO grava em estoque_mov;
--     NÃO faz UPDATE em produtos.
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%insert into public.reserva_consumos%')     AS grava_consumos,
  (prosrc ILIKE '%estoque_mov%')                             AS toca_estoque_mov,   -- esperado false
  (prosrc ILIKE '%update public.produtos%')                  AS atualiza_produtos,  -- esperado false
  (prosrc ILIKE '%reconciliacao_pendente%')                  AS tem_guarda_origem,
  (prosrc ILIKE '%has_role%')                                AS tem_autorizacao,
  (prosrc ILIKE '%on conflict (idem_key) do nothing%')       AS tem_idempotencia,
  (prosrc ILIKE '%p_funcionario_id%')                        AS tem_delegacao,      -- esperado false (1.37/B.1)
  (prosrc ILIKE '%is distinct from v_produto_lock%')        AS aborta_se_reserva_muda,
  (prosrc ILIKE '%observacao is not distinct from%')        AS idem_compara_observacao,
  -- 1.39/E: idempotência compara o produto EFETIVO e valida p_produto_id informado.
  (prosrc ILIKE '%produto_id is not distinct from v_reserva_prod%')
                                                              AS idem_compara_produto_efetivo,  -- esperado true
  (prosrc ILIKE '%produto_id is not distinct from p_produto_id%')
                                                              AS idem_compara_parametro,        -- esperado false
  (prosrc ILIKE '%p_produto_id is not null and p_produto_id is distinct from v_reserva_prod%')
                                                              AS valida_produto_informado       -- esperado true
FROM pg_proc WHERE proname = 'registrar_consumo_reserva';

-- ---------------------------------------------------------------------------
-- (5) Pré-requisito: reserva_consumos (0087) existe com idem_key UNIQUE.
-- ---------------------------------------------------------------------------
SELECT c.relname,
       (SELECT count(*) FROM pg_index i
          WHERE i.indrelid = c.oid AND i.indisunique) AS indices_unicos
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'reserva_consumos';

-- ---------------------------------------------------------------------------
-- (6) Documentação: NÃO existe mecanismo de autenticação por PIN no banco.
--     Esperado: 0 linhas (PIN é apenas UI de preview). Se retornar algo,
--     REAVALIAR a premissa de identidade antes de ativar.
-- ---------------------------------------------------------------------------
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name ILIKE '%pin%';

-- Critério de aceite estático: (1) ausente no PRE; (2) definer+search_path;
-- (3) anon=false / authenticated=true / service_role=false; (4) grava_consumos=true,
-- toca_estoque_mov=false, atualiza_produtos=false, guardas/idempotência presentes,
-- tem_delegacao=false, aborta_se_reserva_muda=true, idem_compara_observacao=true,
-- idem_compara_produto_efetivo=true, idem_compara_parametro=false,
-- valida_produto_informado=true; (5) reserva_consumos com >=1 índice único;
-- (6) 0 colunas PIN. Os testes TRANSACIONAIS (T1–T13) NÃO constam aqui: ver
-- test-0091-transacional.sql e executar SOMENTE em ambiente isolado autorizado.
