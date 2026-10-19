-- verify-0088-0090-proveniencia.sql
-- ============================================================================
-- Verificação ESTÁTICA (somente leitura) da INTEGRAÇÃO DA PROVENIÊNCIA (1.39)
-- e da INTEGRIDADE COMPLETA DAS RESERVAS (1.47) nas migrations 0088, 0089 e 0090,
-- e da compatibilidade com a 0092.
-- Consulta apenas catálogos (pg_proc/pg_class). NÃO acessa dados de clientes.
-- Rodar PRE (antes) e POST (depois de aplicar 0088/0089/0090/0092 num ambiente
-- ISOLADO autorizado). NÃO substitui os testes transacionais.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (0) Pré-requisito 0092. Em PRE (antes de aplicar) espera-se: marcador_existe
--     = false, config_existe = false, uk_base_existe = false. Em POST: true/true/true.
-- ---------------------------------------------------------------------------
SELECT to_regclass('public.reserva_proveniencia')        IS NOT NULL AS marcador_existe,
       to_regclass('public.reserva_proveniencia_config') IS NOT NULL AS config_existe,
       EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'reservas_estoque_prov_uk'
                 AND conrelid = 'public.reservas_estoque'::regclass) AS uk_base_existe;

-- POST (requer 0092 aplicada): deve existir 1 linha singleton (id=true) e o
-- regime NÃO habilitado. Esperado: controlado = false (ativação é procedimento
-- próprio; a 0092 é inerte). NÃO rodar este SELECT em PRE (tabela inexistente).
-- SELECT id, controlado FROM public.reserva_proveniencia_config;

-- ---------------------------------------------------------------------------
-- (1) Assinatura / segurança das três funções.
--     Esperado: security_definer = true; config ~ {search_path=public}.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef          AS security_definer,
       p.proconfig          AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica',
                    'reservar_pedido_atomico',
                    'liberar_pedido_atomico')
ORDER BY p.proname;

-- ---------------------------------------------------------------------------
-- (2) 0088 reservar_estoque_atomica — integração da proveniência.
--     Esperado (todos true): cria marcador gated por controlado, captura o id do
--     débito (RETURNING), lê a config por to_regclass (seguro), e falha
--     explicitamente (reconciliacao_pendente) sob regime controlado.
--     Esperado false: p_funcionario_id (sem delegação), escrita em estoque_mov.
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%to_regclass(''public.reserva_proveniencia_config'')%') AS le_config_seguro,
  (prosrc ILIKE '%reserva_proveniencia_config%controlado%')              AS le_controlado,
  (prosrc ILIKE '%if v_controlado then%')                                AS gate_controlado,
  (prosrc ILIKE '%returning id into v_mov_id%')                          AS captura_mov_id,
  (prosrc ILIKE '%insert into public.reserva_proveniencia%')             AS insere_marcador,
  (prosrc ILIKE '%estoque_movimentacao_id%')                             AS amarra_movimento,
  (prosrc ILIKE '%raise exception%reconciliacao_pendente%')              AS falha_se_orfa_controlado
FROM pg_proc
WHERE proname = 'reservar_estoque_atomica';

-- ---------------------------------------------------------------------------
-- (3) 0089 reservar_pedido_atomico — integração da proveniência.
--     Esperado (todos true): marcador por reserva, RETURNING id no laço,
--     config via to_regclass e reconciliacao_pendente também quando falta
--     marcador sob regime controlado.
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%to_regclass(''public.reserva_proveniencia_config'')%') AS le_config_seguro,
  (prosrc ILIKE '%if v_controlado then%')                                AS gate_controlado,
  (prosrc ILIKE '%returning id into v_mov_id%')                          AS captura_mov_id,
  (prosrc ILIKE '%insert into public.reserva_proveniencia%')             AS insere_marcador,
  (prosrc ILIKE '%not exists (%select 1 from public.reserva_proveniencia rp%')
                                                                          AS orfa_se_sem_marcador,
  (prosrc ILIKE '%reconciliacao_pendente%')                              AS classifica,
  (prosrc ILIKE '%montagem%')                                            AS trata_montagem
FROM pg_proc
WHERE proname = 'reservar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (4) 0090 liberar_pedido_atomico — proteção por proveniência (rev. 1.47).
--     Esperado (todos true): exige marcador (v_has_prov), captura o id da origem
--     e compara com o marcador (v_marker_mov IS DISTINCT FROM v_mov_id),
--     fail-closed via to_regclass.
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%to_regclass(''public.reserva_proveniencia'')%')        AS checa_existencia,
  (prosrc ILIKE '%v_has_prov%')                                          AS usa_flag,
  (prosrc ILIKE '%array_agg(em.id)%')                                    AS captura_origem,
  (prosrc ILIKE '%array_agg(rp.estoque_movimentacao_id)%')               AS captura_marcador,
  (prosrc ILIKE '%v_marker_mov is distinct from v_mov_id%')              AS exige_mesmo_mov,
  (prosrc ILIKE '%not v_has_prov%')                                      AS fail_closed,
  (prosrc ILIKE '%reconciliacao_pendente%')                              AS bloqueia
FROM pg_proc
WHERE proname = 'liberar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (4.1) 0090 — REVISÕES 1.47/1.48 (integridade + cobertura × liberação).
--     Esperado (todos true): valida TODOS os status ('ativa'/'consumida'/
--     'liberada'/'cancelada'), exige PROVA DE CRÉDITO para 'liberada'
--     (v_lib_n = 1 e v_lib_qtd = v_restante), confere a cobertura item×reserva
--     por produto (v_item_prods / v_coberto / v_demanda) contando ativa +
--     consumida + LIBERADA, bloqueia a coexistência de ativa com liberada
--     (v_tem_ativa / v_tem_liberada), trata 'cancelada' como indeterminada,
--     classifica montagem (produto_id NULL) e somente devolve 'ja_liberado'
--     quando COMPROVADO (após o bloqueio de v_n_indet).
-- ---------------------------------------------------------------------------
SELECT proname,
  (prosrc ILIKE '%v_res.status = ''ativa''%')                            AS checa_ativa,
  (prosrc ILIKE '%v_res.status = ''consumida''%')                        AS checa_consumida,
  (prosrc ILIKE '%v_res.status = ''liberada''%')                         AS checa_liberada,
  (prosrc ILIKE '%v_lib_n <> 1%')                                        AS prova_credito_liberada,
  (prosrc ILIKE '%v_lib_qtd <> v_restante%')                             AS exige_credito_igual,
  (prosrc ILIKE '%v_restante <> 0%')                                     AS consumida_exige_tudo,
  (prosrc ILIKE '%sem prova definida%')                                  AS trata_cancelada,
  (prosrc ILIKE '%v_item_prods%')                                        AS usa_itens,
  (prosrc ILIKE '%v_coberto%')                                           AS confere_cobertura,
  (prosrc ILIKE '%status in (''ativa'', ''consumida'', ''liberada'')%')  AS cobre_liberada,
  (prosrc ILIKE '%v_tem_ativa%')                                         AS guarda_ativa,
  (prosrc ILIKE '%v_tem_liberada%')                                      AS guarda_liberada,
  (prosrc ILIKE '%montagem%')                                            AS trata_montagem,
  (prosrc ILIKE '%''ja_liberado''%')                                     AS devolve_ja_liberado,
  (prosrc ILIKE '%if v_n_indet > 0 then%')                               AS bloqueia_antes_de_creditar,
  (prosrc ILIKE '%v_locked_prod%')                                       AS trava_produtos
FROM pg_proc
WHERE proname = 'liberar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (5) 0090 é INTERNA: sem EXECUTE para anon/authenticated (e service_role).
--     Esperado: anon=false, authenticated=false, service_role=false.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'liberar_pedido_atomico';

-- ---------------------------------------------------------------------------
-- (6) 0092 — marcador: UNIQUE no movimento + FK composta para a reserva.
--     Esperado: >=1 índice único; >=1 FK composta (com mais de 1 coluna).
-- ---------------------------------------------------------------------------
SELECT c.relname,
       (SELECT count(*) FROM pg_index i
          WHERE i.indrelid = c.oid AND i.indisunique)                       AS indices_unicos,
       (SELECT count(*) FROM pg_constraint k
          WHERE k.conrelid = c.oid AND k.contype = 'f'
            AND array_length(k.conkey, 1) > 1)                              AS fks_compostas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'reserva_proveniencia';

-- Critério de aceite estático: (0) em PRE marcador/config/uk ausentes; em POST
-- marcador_existe=config_existe=uk_base_existe=true e controlado=false;
-- (1) definer+search_path nas 3 funções; (2)+(3)+(4)+(4.1) todos os flags true;
-- (5) 0090 sem EXECUTE para anon/authenticated/service_role; (6) marcador com
-- UNIQUE + FK composta. Os testes TRANSACIONAIS (reserva -> retirada ->
-- liberação sob regime controlado; integridade de TODAS as reservas; e cobertura
-- x liberação já realizada — rev. 1.47/1.48) constam dos roteiros test-0093*.sql
-- e NÃO foram executados (pendentes de ambiente isolado autorizado).
