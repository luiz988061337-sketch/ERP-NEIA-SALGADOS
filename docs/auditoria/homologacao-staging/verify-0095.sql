-- verify-0095.sql — verificação ESTÁTICA (somente leitura) da 0095 (Etapa 1.52).
-- ============================================================================
-- Rode PRE (antes de aplicar) e POST (depois), em ambiente ISOLADO autorizado.
-- Consulta apenas catálogos (pg_proc/pg_trigger/pg_class/pg_attribute/pg_policy/
-- information_schema). NÃO lê dados de clientes; NÃO altera nada.
-- NÃO substitui os testes transacionais (T1–T20 continuam pendentes).
--
-- O que a 0095 prepara:
--   * public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb) -> jsonb
--   * public.pedido_cobertura_reserva(uuid) -> jsonb (leitura pura)
--   * public.exigir_reserva_producao() -> trigger (SEM trigger instalado)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (0) PRE: nada da 0095 existe ainda; o trigger NÃO pode existir.
--     Esperado ANTES de aplicar: 0 linhas em (0a)-(0d).
-- ---------------------------------------------------------------------------
-- (0a) RPC principal
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_com_reserva';

-- (0b) cobertura
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pedido_cobertura_reserva';

-- (0c) função de trigger
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'exigir_reserva_producao';

-- (0d) trigger (deve continuar AUSENTE também no POST)
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname IN ('trigger_exigir_reserva_producao', 'trigger_reserva_estoque_pedido');

-- ---------------------------------------------------------------------------
-- (1) POST: assinatura, tipo de retorno e configuração da RPC.
--     Esperado: 1 linha; retorno jsonb; security_definer = true;
--               config = {search_path=public}; volatility = 'v' (volatile).
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       pg_get_function_result(p.oid) AS retorno,
       p.prosecdef                    AS security_definer,   -- true
       p.proconfig                    AS config,             -- {search_path=public}
       p.provolatile                  AS volatility          -- v
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_com_reserva';

-- ---------------------------------------------------------------------------
-- (2) POST: ACL da RPC. Esperado: authenticated = true; anon = false;
--     public_exec = false (REVOKE ALL FROM PUBLIC aplicado).
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_com_reserva';

-- ---------------------------------------------------------------------------
-- (3) POST: o corpo da RPC tem as garantias esperadas (tudo true, exceto
--     "usa_delete"/"escreve_reserva_direto"/"executa_sql_dinamico" = false).
-- ---------------------------------------------------------------------------
SELECT p.proname,
  (p.prosrc ILIKE '%auth.uid()%')                                  AS usa_auth_uid,
  (p.prosrc ILIKE '%public.has_role(v_uid%')                       AS autoriza_papel,
  (p.prosrc ILIKE '%pg_advisory_xact_lock%')                       AS serializa_por_id,
  (p.prosrc ILIKE '%select * into v_ped from public.pedidos where id = p_id%')
                                                                    AS checa_existente,
  (p.prosrc ILIKE '%v_ped.user_id is distinct from v_uid%')         AS exige_dono,
  (p.prosrc ILIKE '%criacao_atomica:%')                            AS registra_canal,
  (p.prosrc ILIKE '%v_req_fp%')                                    AS fingerprint_pedido,
  (p.prosrc ILIKE '%idempotencia_divergente%')                     AS idempotencia_divergente,
  (p.prosrc ILIKE '%''ja_criado''%')                               AS retorna_ja_criado,
  (p.prosrc ILIKE '%to_regprocedure%')                             AS checa_dependencia,
  (p.prosrc ILIKE '%reservar_pedido_atomico(p_id)%')               AS chama_0089,
  (p.prosrc ILIKE '%not in (''reservado'', ''ja_reservado'')%')    AS exige_reserva_ok,
  (p.prosrc ILIKE '%errCode = ''p0095''%')                         AS usa_sqlstate_controle,
  (p.prosrc ILIKE '%get stacked diagnostics%')                     AS captura_detalhe,
  (p.prosrc ILIKE '%coalesce(v_prod.preco_promocional, v_prod.preco)%')
                                                                    AS preco_do_catalogo,
  (p.prosrc ILIKE '%not v_prod.disponivel%')                       AS checa_disponivel,
  (p.prosrc ILIKE '%v_qtd % 50 <> 0%')                             AS regra_multiplo_50,
  (p.prosrc ILIKE '%montagem_sem_modelagem%')                      AS bloqueia_montagem,
  (p.prosrc ILIKE '%loja_config.taxa_entrega%')                    AS taxa_fonte_config,
  (p.prosrc ILIKE '%cupom_invalido%')                              AS valida_cupom,
  (p.prosrc ILIKE '%cupom_esgotado%')                              AS valida_max_usos,
  (p.prosrc ILIKE '%v_forma::public.pagamento%')                   AS forma_enum,
  (p.prosrc ILIKE '%na_entrega%')                                  AS modalidade_derivada,
  (p.prosrc ILIKE '%pagamento_imediato%')                          AS pagamento_pdv,
  (p.prosrc ILIKE '%insert into public.pedidos%')                  AS insere_pedido,
  (p.prosrc ILIKE '%insert into public.pedido_itens%')             AS insere_itens,
  (p.prosrc ILIKE '%insert into public.pedido_status_historico%')  AS insere_historico,
  (p.prosrc ILIKE '%insert into public.reservas_estoque%')         AS escreve_reserva_direto, -- false
  (p.prosrc ILIKE '%delete from%')                                 AS usa_delete,            -- false
  (p.prosrc ILIKE '%update public.pedidos%')                       AS faz_update_pedido,     -- false
  (p.prosrc ILIKE '%execute format(%')                             AS executa_sql_dinamico   -- false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_com_reserva';

-- ---------------------------------------------------------------------------
-- (4) POST: cobertura — leitura pura, SECURITY DEFINER, sem escrita.
--     Esperado: stable = true; security_definer = true; sem INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.provolatile AS volatility,           -- s (stable)
       p.prosecdef   AS security_definer,     -- true
       p.proconfig   AS config,
       (p.prosrc ILIKE '%estoque_movimentacoes%')              AS confere_ledger,
       (p.prosrc ILIKE '%reserva_proveniencia%')                AS confere_proveniencia,
       (p.prosrc ILIKE '%controlado%')                          AS le_controlado,
       (p.prosrc ILIKE '%cobertura_excedente%')                 AS bloqueia_excesso,
       (p.prosrc ILIKE '%debito_nao_comprovado%')               AS bloqueia_sem_debito,
       (p.prosrc ILIKE '%insert into%')                         AS escreve,       -- false
       (p.prosrc ILIKE '%update public.%')                      AS atualiza,      -- false
       (p.prosrc ILIKE '%delete from%')                         AS apaga          -- false
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'pedido_cobertura_reserva';

-- ---------------------------------------------------------------------------
-- (5) POST: função de trigger preparada e NÃO instalada.
--     Esperado: 1 função RETURNS trigger; 0 linhas em pg_trigger.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       pg_get_function_result(p.oid) AS retorno,       -- trigger
       p.prosecdef AS security_definer,                -- true
       (p.prosrc ILIKE '%old.status <> ''recebido''%') AS olha_saida_recebido,
       (p.prosrc ILIKE '%controlado%')                 AS exige_controlado,
       (p.prosrc ILIKE '%pedido_cobertura_reserva%')   AS usa_cobertura,
       (p.prosrc ILIKE '%raise exception%')            AS bloqueia
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'exigir_reserva_producao';

SELECT tgname AS trigger_nao_deve_existir FROM pg_trigger
WHERE tgrelid = 'public.pedidos'::regclass
  AND tgname IN ('trigger_exigir_reserva_producao', 'trigger_reserva_estoque_pedido');

-- ---------------------------------------------------------------------------
-- (6) POST: regime desligado. Esperado: controlado = false.
--     ATENÇÃO: se a 0092 ainda NÃO estiver aplicada, esta consulta falha
--     (relação inexistente). Nesse caso, ignore-a e use a seção (7).
-- ---------------------------------------------------------------------------
SELECT c.controlado, c.ativado_em, c.ativado_por
FROM public.reserva_proveniencia_config c
WHERE c.id = true;

-- ---------------------------------------------------------------------------
-- (7) POST: dependências da 0095.
--     Esperado: todas true, exceto loja_config_taxa_entrega (false hoje).
-- ---------------------------------------------------------------------------
SELECT
  (to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL) AS tem_0089,
  (to_regclass('public.reserva_consumos')  IS NOT NULL)                 AS tem_0087,
  (to_regclass('public.reserva_proveniencia') IS NOT NULL)              AS tem_0092,
  (to_regclass('public.estoque_movimentacoes') IS NOT NULL)             AS tem_0042,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='loja_config'
       AND column_name='taxa_entrega'
  ) AS loja_config_taxa_entrega;

-- ---------------------------------------------------------------------------
-- (8) POST: colunas reais usadas pela RPC (todas devem existir).
--     Esperado: 100% presentes.
-- ---------------------------------------------------------------------------
SELECT c.column_name
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'pedidos'
  AND c.column_name IN (
    'id','user_id','cliente_nome','telefone','endereco','bairro','cidade','cep',
    'complemento','referencia','observacoes','tipo_imovel','apartamento','bloco',
    'torre','andar','interfone','pode_subir','cpf_cnpj','nome_fiscal',
    'origem_cliente','tipo_entrega','forma_pagamento','pagamento_modalidade',
    'pagamento_status','pagamento_em','subtotal','taxa_entrega','desconto',
    'total','cupom','destino_lat','destino_lng','agendado_para',
    'agendamento_obs','tipo_evento','campanha_origem'
  )
ORDER BY c.column_name;

-- ---------------------------------------------------------------------------
-- (9) POST: colunas de cupons/produtos usadas na validação.
--     Esperado: 100% presentes.
-- ---------------------------------------------------------------------------
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'cupons' AND column_name IN (
      'codigo','tipo','valor','minimo','ativo','cliente_telefone',
      'validade_ini','validade_fim','max_usos','produtos_ids'
    ))
    OR
    (table_name = 'produtos' AND column_name IN (
      'id','nome','preco','preco_promocional','disponivel','estoque','tipo_venda'
    ))
  )
ORDER BY table_name, column_name;

-- ---------------------------------------------------------------------------
-- (10) POST: RLS e ownership (indicadores para o teste transacional).
--      Esperado: relrowsecurity = true para pedidos; relforcerowsecurity = false
--      em todas; owner da função x owner das tabelas (mostrar; não julgar).
-- ---------------------------------------------------------------------------
SELECT c.relname,
       c.relrowsecurity       AS rls_habilitada,
       c.relforcerowsecurity  AS rls_forcada,
       pg_get_userbyid(c.relowner) AS owner_tabela
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'pedidos','pedido_itens','reservas_estoque','produtos',
    'pedido_status_historico','cupons','loja_config'
  )
ORDER BY c.relname;

SELECT pg_get_userbyid(p.proowner) AS owner_funcao,
       CASE WHEN to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL
            THEN has_function_privilege(
                   pg_get_userbyid(p.proowner),
                   'public.reservar_pedido_atomico(uuid)',
                   'EXECUTE')
            ELSE NULL END AS owner_pode_chamar_0089
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_com_reserva';

-- ---------------------------------------------------------------------------
-- (11) POST: caminhos antigos que a 0095 NÃO fecha.
--      (a) DELETE em pedidos para authenticated: esperado 0 (compensação por
--          DELETE do checkout/PDV/atendimento falha silenciosamente).
--      (b) pedidos sem reserva continuam possíveis fora da RPC até o trigger.
-- ---------------------------------------------------------------------------
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'pedidos' AND cmd = 'DELETE';

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'pedidos'
  AND privilege_type = 'DELETE'
  AND grantee IN ('authenticated', 'anon', 'PUBLIC');
