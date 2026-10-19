==============================================================================
COLA DE SQL PARA O LOVABLE — CUTOVER DO ERP NÉIA SALGADOS
==============================================================================

Cada bloco abaixo é um arquivo INTEIRO do pacote. Cole um bloco por vez,
NA ORDEM. Não junte blocos: cada um é fail-closed e o veredicto de um
precisa ser lido antes de passar ao próximo.

Depois de cada bloco, confira a coluna `resultado` na grade de resultados
(ou a mensagem NOTICE). Se aparecer `NO-GO`, PARE e reporte.

==============================================================================


/*****************************************************************************
*  PASSO 1 — PRÉ-CHECAGEM (read-only, nada é escrito)
*  arquivo: 01_PRECHECK.sql
*  esperado: PRECHECK_OK
*****************************************************************************/

-- ============================================================================
-- 01_PRECHECK.sql — PRÉ-CHECAGEM READ-ONLY DO BANCO DE PRODUÇÃO
-- ============================================================================
-- Executar ANTES de qualquer alteração, com a loja fechada.
-- NÃO ESCREVE NADA. Somente SELECT.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 01_PRECHECK.sql
--
-- Saída: a última instrução devolve
--     NOTICE PRECHECK_OK
-- ou
--     EXCEPTION NO-GO: <lista de condições bloqueantes>   (exit != 0, o script para)
--
-- Se sair NO-GO: PARAR. Não aplicar 02_MIGRATIONS-CUTOVER.sql.
-- ============================================================================

SELECT '=== 01_PRECHECK: identificacao ===' AS secao;
SELECT
  current_database()                AS banco,
  current_user                      AS usuario,
  current_setting('server_version') AS postgres,
  inet_server_addr()::text         AS servidor,
  inet_server_port()                AS porta,
  now()                              AS momento;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: tabelas base do ERP ===' AS secao;
SELECT c.relname AS tabela,
       c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('pedidos','pedido_itens','produtos','categorias','reservas_estoque',
                    'estoque_movimentacoes','cupons','user_roles','fila_impressao',
                    'pedido_status_historico')
ORDER BY c.relname;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: estado das migrations 0087-0098 (esperado: AUSENTES antes do corte) ===' AS secao;
SELECT * FROM (
  VALUES
    ('0087', 'tabela', 'reserva_consumos',            to_regclass('public.reserva_consumos') IS NOT NULL),
    ('0088', 'funcao', 'reservar_estoque_atomica',    to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL),
    ('0088', 'funcao', 'liberar_reserva_atomica',     to_regprocedure('public.liberar_reserva_atomica(uuid)') IS NOT NULL),
    ('0089', 'funcao', 'reservar_pedido_atomico',     to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL),
    ('0090', 'funcao', 'liberar_pedido_atomico',      to_regprocedure('public.liberar_pedido_atomico(uuid)') IS NOT NULL),
    ('0091', 'funcao', 'registrar_consumo_reserva',   to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL),
    ('0092', 'tabela', 'reserva_proveniencia',        to_regclass('public.reserva_proveniencia') IS NOT NULL),
    ('0092', 'tabela', 'reserva_proveniencia_config', to_regclass('public.reserva_proveniencia_config') IS NOT NULL),
    ('0093', 'funcao', 'cancelar_pedido_atomico',     to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL),
    ('0094', 'funcao', 'proteger_consistencia_financeira_pedido', to_regprocedure('public.proteger_consistencia_financeira_pedido()') IS NOT NULL),
    ('0095', 'funcao', 'criar_pedido_com_reserva',    to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL),
    ('0095', 'funcao', 'pedido_cobertura_reserva',    to_regprocedure('public.pedido_cobertura_reserva(uuid)') IS NOT NULL),
    ('0095', 'funcao', 'exigir_reserva_producao',     to_regprocedure('public.exigir_reserva_producao()') IS NOT NULL),
    ('0095', 'funcao', 'exigir_consumo_producao',     to_regprocedure('public.exigir_consumo_producao()') IS NOT NULL),
    ('0097', 'tabela', 'pedido_item_componentes',     to_regclass('public.pedido_item_componentes') IS NOT NULL)
) AS t(migration, tipo, objeto, existe)
ORDER BY migration, objeto;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: coluna combo_preco_unit (0097) ===' AS secao;
SELECT count(*) AS colunas_combo_preco_unit
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'categorias' AND column_name = 'combo_preco_unit';

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: triggers relevantes (read-only) ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela, p.proname AS funcao,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_reserva%' OR t.tgname LIKE 'trigger_exigir_%'
    OR t.tgname LIKE 'trigger_proteger_consistencia%' OR t.tgname LIKE 'trigger_bloquear_pagamento%')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: grants das RPCs (0098) ===' AS secao;
SELECT p.proname AS rpc, g.grantee, g.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                   'reservar_pedido_atomico','liberar_pedido_atomico',
                   'reservar_estoque_atomica','liberar_reserva_atomica')
  AND g.grantee IN ('PUBLIC','anon','service_role','authenticated')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: categorias de combo previstas na 0097 ===' AS secao;
SELECT c.slug, c.nome, c.ativo,
       (SELECT count(*) FROM public.produtos p WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: reservas historicas (universo, sem alterar nada) ===' AS secao;
SELECT count(*) FILTER (WHERE r.status = 'ativa')             AS ativas,
       count(*) FILTER (WHERE r.status = 'consumida')          AS consumidas,
       count(*) FILTER (WHERE r.status IN ('liberada','cancelada')) AS encerradas,
       count(*) FILTER (WHERE p.id IS NULL)                     AS orfas_sem_pedido,
       count(*) FILTER (WHERE pr.id IS NULL)                    AS orfas_sem_produto
FROM public.reservas_estoque r
LEFT JOIN public.pedidos p ON p.id = r.pedido_id
LEFT JOIN public.produtos pr ON pr.id = r.produto_id;

SELECT '' AS secao;
SELECT '=== 01_PRECHECK: VEREDITO (fail-closed) ===' AS secao;
SELECT '   Sem falhas: NOTICE PRECHECK_OK.  Com falhas: EXCEPTION NO-GO (exit != 0, script para).' AS secao;
DO $precheck$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
  v_txt text;
BEGIN
  -- 1) Tabelas base do ERP
  FOREACH v_txt IN ARRAY ARRAY[
    'pedidos','pedido_itens','produtos','categorias','reservas_estoque',
    'estoque_movimentacoes','cupons','user_roles','fila_impressao',
    'pedido_status_historico']
  LOOP
    IF to_regclass('public.' || v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'tabela base ausente: ' || v_txt);
    END IF;
  END LOOP;

  -- 2) Trigger legado de reserva (0042): nao pode existir (reserva dupla)
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND NOT t.tgisinternal
                AND t.tgname = 'trigger_reserva_estoque_pedido') THEN
    v_falhas := array_append(v_falhas, 'trigger legado trigger_reserva_estoque_pedido presente (reserva dupla)');
  END IF;

  -- 3) Gates de producao (0095) nao podem estar instalados antes da reconciliacao
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND NOT t.tgisinternal
                AND t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')) THEN
    v_falhas := array_append(v_falhas, 'gate de producao instalado antes da reconciliacao das 19 reservas');
  END IF;

  -- 4) controlled ja ativo antes do corte = estado inesperado
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    EXECUTE 'SELECT (controlado)::text FROM public.reserva_proveniencia_config WHERE id = true' INTO v_txt;
    IF coalesce(v_txt, 'false') = 'true' THEN
      v_falhas := array_append(v_falhas, 'controlado ja esta true antes do corte (estado inesperado)');
    END IF;
  END IF;

  -- 5) Regime novo ja aplicado (re-execucao) -> revisar
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL
     AND to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL
     AND to_regclass('public.pedido_item_componentes') IS NOT NULL THEN
    v_falhas := array_append(v_falhas, 'regime novo (0095/0093/0097) ja aplicado — revisar se e re-execucao');
  END IF;

  -- 6) Reservas orfas (estado incompativel)
  IF to_regclass('public.reservas_estoque') IS NOT NULL AND to_regclass('public.pedidos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.reservas_estoque r
              LEFT JOIN public.pedidos p ON p.id = r.pedido_id
             WHERE p.id IS NULL' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'reservas orfas (sem pedido): ' || v_n::text);
    END IF;
  END IF;

  -- 7) Categorias de combo previstas na 0097
  IF to_regclass('public.categorias') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias
              WHERE slug IN (''mini-fritos'',''mini-assados'',''mini-pasteis'',''mini-pizzas'',''mini-empadinhas'')
                AND ativo' INTO v_n;
    IF v_n = 0 THEN
      v_falhas := array_append(v_falhas, 'nenhuma das 5 categorias de combo previstas esta ativa');
    END IF;
  END IF;

  -- 8) Categoria de combo ativa sem preco (so relevante se a coluna existir)
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias'
                    AND column_name='combo_preco_unit')
     AND to_regclass('public.produtos') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'categorias de combo ativas sem combo_preco_unit: ' || v_n::text);
    END IF;
  END IF;

  -- 9) Nenhuma RPC nova pode estar com EXECUTE para PUBLIC/anon
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN information_schema.routine_privileges g
      ON g.specific_name = p.proname AND g.specific_schema = 'public'
    WHERE n.nspname = 'public'
      AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva')
      AND g.grantee IN ('PUBLIC','anon')
  ) THEN
    v_falhas := array_append(v_falhas, 'RPC nova com EXECUTE para PUBLIC/anon (a 0098 deve corrigir)');
  END IF;

  -- VEREDITO
  IF cardinality(v_falhas) = 0 THEN
    PERFORM set_config('neia.precheck', 'PRECHECK_OK', false);
    RAISE NOTICE 'PRECHECK_OK';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$precheck$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.precheck', true) AS resultado;


/*****************************************************************************
*  PASSO 2 — MIGRATIONS (0087, 0089–0098; SEM a 0088)
*  arquivo: 02_MIGRATIONS-CUTOVER.sql
*  esperado: sem erro
*****************************************************************************/

-- ==========================================================================
-- 02_MIGRATIONS-CUTOVER.sql
-- CONSOLIDACAO ORDENADA DAS MIGRATIONS DO CORTE
-- ==========================================================================
--
-- Este arquivo consolida, NA VERBATIM, as 11 migrations homologadas do corte,
-- na ordem exata. O conteudo SQL de cada migration NAO foi alterado, refatorado
-- nem "melhorado": o unico material acrescentado sao os cabecalhos de rastreio
-- (arquivo de origem, SHA-256, objetos criados, natureza) e os comentarios de
-- separacao.
--
-- ORDEM DE APLICACAO (obrigatoria):
--   0087  tabela `reserva_consumos` + indices + RLS (base do consumo 0091)
--   0089  RPC `reservar_pedido_atomico` (chamada internamente pela 0095)
--   0090  RPC `liberar_pedido_atomico` (chamada internamente pela 0093)
--   0091  RPC `registrar_consumo_reserva` (retirada fisica parcial/total, idempotente)
--   0092  tabelas `reserva_proveniencia` + `reserva_proveniencia_config` (origem do `controlado`)
--   0093  RPC `cancelar_pedido_atomico` (cancelamento com liberacao correta)
--   0094  trigger de integridade financeira (bloqueia `cancelado`+`pago` e reabertura)
--   0095  RPC `criar_pedido_com_reserva` + `pedido_cobertura_reserva` (cria pedido+itens+reserva em 1 transacao)
--   0096  reforco de RLS/GRANT em parceiros/estoque
--   0097  tabela `pedido_item_componentes` + coluna `categorias.combo_preco_unit` + seed dos 5 slugs
--   0098  matriz de menor privilegio (revoke PUBLIC/anon/service_role)
--
-- 0088 NAO E APLICADA. A migration 0088 substitui a RPC legada
-- `reservar_estoque_atomica`, cujo unico chamador (checkout legado) NAO EXISTE no
-- bundle de corte (0 call sites comprovados). A 0093 a declara INERTE.
-- Se qualquer chamador vivo dela aparecer, PARAR e relatar.
--
-- Como usar:
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 \
--        --file 02_MIGRATIONS-CUTOVER.sql
--
--   Com ON_ERROR_STOP=1, a primeira instrucao que falhar aborta o script
--   inteiro, sem aplicar as migrations seguintes.
--
-- Regras de aplicacao (homologadas):
--   * operar com a loja fechada;
--   * executar ANTES de `controlado = true` e ANTES de publicar o bundle;
--   * o bundle de corte so passa a operar depois desta consolidacao;
--   * nao ha `BEGIN`/`COMMIT` dentro dos arquivos de origem: o arquivo todo roda
--     numa unica transacao implicita do psql (a transacao e confirmada ao fim);
--   * em caso de falha, a transacao fica abortada e o banco permanece no estado
--     anterior (ver ROLLBACK-CUTOVER.md, caso B).
--
-- ==========================================================================

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0087 (verbatim de drizzle/migrations/0087_reserva_consumos.sql)
--     SHA-256 do arquivo de origem : 8d9b737ca7d54228c4f075768ad901bac83f41fa3c7bae156f7372cad60aaf74
--     bytes do arquivo de origem   : 8565
--     natureza                     : ESTRUTURAL
--     objetos                      : tabela `reserva_consumos` + indices + RLS (base do consumo 0091)
-- ==========================================================================
-- 0087: reserva_consumos — ledger de retiradas parciais do freezer (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA.
-- NÃO executar sem autorização expressa. Revisão + staging antes de aplicar.
-- Somente DDL ADITIVA (nova tabela + índices + RLS). NÃO altera nenhuma
-- tabela/coluna/função existente.
--
-- CONTEXTO (Modelo 2 — adotado nas etapas 1.18–1.20):
--   - produtos.estoque = saldo DISPONÍVEL (já líquido de reservas);
--   - a reserva debita o disponível UMA vez (na confirmação do pedido);
--   - a RETIRADA do freezer CONSOME a reserva e NÃO debita novamente o saldo;
--   - cancelamentos devolvem apenas o que ainda está no freezer (não consumido);
--   - físico = disponível + Σ(quantidade − consumido) das reservas ativas.
--
-- PAPEL DESTA TABELA:
--   Registrar cada retirada parcial de forma append-only, com identidade do
--   funcionário e chave idempotente, permitindo:
--     - restante = reservas_estoque.quantidade − Σ(reserva_consumos.quantidade);
--     - status 'consumida' quando o restante chega a zero (feito pela função);
--     - liberação (cancelamento) devolvendo apenas o restante, sem perder
--       o histórico das retiradas já realizadas.
--
-- POR QUE NÃO GERA LINHA EM estoque_movimentacoes:
--   a retirada NÃO altera produtos.estoque (o débito ocorreu na reserva).
--   Registrar em estoque_movimentacoes (quantidade != 0) duplicaria a baixa.
--   O ledger de SALDO continua sendo estoque_movimentacoes (0042);
--   esta tabela é o ledger de CONSUMO FÍSICO.
--
-- ESCRITA: exclusivamente por função autorizada SECURITY DEFINER (etapa 0090).
--   Nenhum INSERT/UPDATE/DELETE é concedido a anon/authenticated.
--
-- IGUALDADE COM O PEDIDO: consultado por reserva e por pedido (índices abaixo).
--
-- DEPENDÊNCIAS CONFIRMADAS LOCALMENTE:
--   0023_base_operacional.sql  -> public.reservas_estoque (id uuid PK)
--   0000_neia_salgados_schema.sql -> public.pedidos (id uuid PK),
--                                    public.produtos (id uuid PK), has_role()
--   0003_operacao.sql          -> papéis atendente/financeiro (app_role)
--   auth.users(id)             -> identidade autenticada (funcionario_id)
--
-- COMPATIBILIDADE: PostgreSQL 17 (gen_random_uuid nativo; IF NOT EXISTS; RLS).
--
-- SEGURANÇA DE REEXECUÇÃO: idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS /
--   REVOKE+GRANT reaplicáveis).
--
-- INTEGRIDADE (PENDÊNCIA — não implementada aqui):
--   A consistência reserva_id ↔ pedido_id ↔ produto_id NÃO é garantida por FK
--   composta nesta migração, pois exigiria UNIQUE(id,pedido_id,produto_id) em
--   public.reservas_estoque (ALTER em tabela EXISTENTE — fora do escopo). Deve
--   ser validada de forma TRANSACIONAL na função SECURITY DEFINER da 0090,
--   conferindo que a reserva pertence ao pedido e ao produto informados.
--
-- IDENTIDADE DO FUNCIONÁRIO:
--   funcionario_id é NOT NULL e usa ON DELETE RESTRICT: todo consumo tem um
--   responsável e o vínculo histórico NÃO é zerado por exclusão de usuário.
--   Dados pessoais permanecem apenas em profiles (sem duplicação). Desligamento
--   de colaborador deve ser feito por papel/perfil, não por exclusão do auth user.
--
-- APPEND-ONLY:
--   Sem políticas/grants de INSERT/UPDATE/DELETE para anon/authenticated; a
--   escrita ocorre apenas por função SECURITY DEFINER (owner). NÃO se adiciona
--   trigger de bloqueio nesta etapa, para não impedir manutenção legítima e
--   autorizada (reavaliar em migração futura, se necessário).
--
-- REVERSÃO:
--   - ANTES de uso (tabela vazia/inerte): DROP TABLE IF EXISTS public.reserva_consumos;
--   - APÓS histórico real: NÃO excluir registros como procedimento padrão;
--     reverter apenas o CÓDIGO dependente (funções/triggers da 0090) e manter a
--     tabela como arquivo histórico; exportar/backup antes de qualquer ação.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_consumos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: protege o histórico — não se apaga uma reserva com consumo.
  reserva_id      uuid NOT NULL REFERENCES public.reservas_estoque(id) ON DELETE RESTRICT,
  -- RESTRICT: preserva o histórico — não se apaga um pedido com consumo.
  pedido_id       uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  -- RESTRICT: preserva o histórico — não se apaga um produto com consumo.
  produto_id      uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  -- Retirada sempre positiva (nunca negativa/zero).
  quantidade      integer NOT NULL CHECK (quantidade > 0),
  -- Identidade confiável: preenchida com auth.uid() pela função DEFINER.
  -- NOT NULL: todo consumo tem um responsável (rastreabilidade).
  -- RESTRICT: preserva o vínculo histórico (não zera ao excluir usuário).
  funcionario_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Idempotência: chave obrigatória e única (o app reenvia a mesma em retries).
  idem_key        uuid NOT NULL UNIQUE,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Índices (consulta por reserva e por pedido; produto para relatórios)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS reserva_consumos_reserva_idx
  ON public.reserva_consumos (reserva_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_pedido_idx
  ON public.reserva_consumos (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_consumos_produto_idx
  ON public.reserva_consumos (produto_id);
-- idem_key já tem índice implícito por UNIQUE.

-- ----------------------------------------------------------------------------
-- 3. RLS (habilita; NENHUMA política de escrita para usuários comuns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.reserva_consumos ENABLE ROW LEVEL SECURITY;

-- Leitura mínima: perfis operacionais (admin, producao, financeiro).
-- Consumo é dado de produção/relatório; não expor a anon nem a cliente.
DROP POLICY IF EXISTS "reserva_consumos leitura staff" ON public.reserva_consumos;
CREATE POLICY "reserva_consumos leitura staff" ON public.reserva_consumos
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

-- Sem políticas de INSERT/UPDATE/DELETE => negado por RLS para authenticated.
-- Escrita ocorrerá APENAS via função SECURITY DEFINER (owner), na 0090.

-- ----------------------------------------------------------------------------
-- 4. Grants (mínimos; sem escrita ampla)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.reserva_consumos FROM anon, authenticated;
-- Somente leitura para usuários autenticados (o RLS filtra por perfil).
GRANT SELECT ON public.reserva_consumos TO authenticated;
-- Backend confiável (bypassa RLS) — papel de operação/manutenção, não usuário
-- comum. A escrita de runtime continua exclusiva da função DEFINER da 0090.
GRANT ALL ON public.reserva_consumos TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Documentação
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.reserva_consumos IS
  '0087: ledger append-only de retiradas parciais do freezer (Modelo 2). '
  'NÃO altera produtos.estoque; a baixa ocorre na reserva. Escrita somente '
  'por função SECURITY DEFINER autorizada.';
COMMENT ON COLUMN public.reserva_consumos.idem_key IS
  '0087: chave idempotente única; reenvio com a mesma chave = replay sem duplicar.';
COMMENT ON COLUMN public.reserva_consumos.funcionario_id IS
  '0087: identidade confiável, sempre auth.uid() da função DEFINER (nunca do cliente). '
  'NOT NULL + ON DELETE RESTRICT preservam a rastreabilidade histórica.';
COMMENT ON COLUMN public.reserva_consumos.quantidade IS
  '0087: quantidade retirada (> 0); restante = reservas_estoque.quantidade − Σ consumos.';

-- ==========================================================================
-- <<< FIM DA MIGRATION 0087

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0089 (verbatim de drizzle/migrations/0089_reservar_pedido_atomico.sql)
--     SHA-256 do arquivo de origem : 1fe4167e9efc8026268e09ddf20eceb435240d235aedbeb8476b5bae6879eff6
--     bytes do arquivo de origem   : 24658
--     natureza                     : ATIVA
--     objetos                      : RPC `reservar_pedido_atomico` (chamada internamente pela 0095)
-- ==========================================================================
-- 0089: reservar_pedido_atomico — reserva transacional de TODO o pedido (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente isolado antes.
--
-- O QUE É: RPC única que reserva, numa só transação, TODOS os produtos de um
-- pedido — substitui (no futuro checkout) o loop por item + o fallback de
-- escrita direta. NÃO altera a 0088 e NÃO é chamada por nenhum módulo ainda.
--
-- MODELO 2 (etapas 1.18–1.27):
--   - produtos.estoque = saldo DISPONÍVEL (líquido de reservas);
--   - a reserva debita o disponível UMA vez;
--   - ledger de SALDO autoritativo = estoque_movimentacoes, tipo enum 'reserva',
--     quantidade NEGATIVA, saldos anterior/posterior reais;
--   - rastreabilidade individual: referencia_id = reservas_estoque.id,
--     referencia_tipo = 'reserva_estoque';
--   - NÃO grava em estoque_mov e NÃO usa registrar_mov_estoque (evita 2ª baixa).
--
-- ============================================================================
-- DEPENDÊNCIAS (verificadas na 1.26 e reconferidas na 1.27)
-- ============================================================================
--   - pedidos: status order_status DEFAULT 'recebido'; user_id NULLABLE.
--   - pedido_itens: pedido_id NOT NULL, produto_id NULLABLE (combo montado),
--     quantidade integer NOT NULL DEFAULT 1 **sem CHECK > 0**.
--   - produtos: estoque integer NOT NULL DEFAULT 100 **sem CHECK >= 0**;
--     disponivel boolean; tipo_venda ('combo_50'|'unidade').
--   - reservas_estoque: status CHECK (ativa|liberada|consumida|cancelada);
--     produto_id NULLABLE (FK ON DELETE SET NULL).
--   - estoque_movimentacoes (0042): tipo tipo_mov_estoque ('reserva','liberacao'),
--     quantidade<>0, saldos NOT NULL, referencia_id/referencia_tipo text.
--   - has_role(uuid, app_role): admin|producao|atendente reservam (0003).
--   - Nenhuma tabela usa FORCE RLS => DEFINER (owner) ignora RLS, como a 0088.
--   - Numeração: 0086/0087/0088 existem; esta é a 0089 (livre).
--
-- ============================================================================
-- CONTRATO DE RETORNO — jsonb, sem dados pessoais
-- ============================================================================
--   {"status":"reservado","itens":N,"montagem":M}             criou N reservas
--   {"status":"ja_reservado","itens":N,"montagem":M}          nada a reservar
--     - "montagem" = nº de itens com produto_id NULL (combo montado), que NÃO
--       entram no controle de estoque (regra 0048). Campo INFORMATIVO: permite
--       ao chamador saber que 'reservado' NÃO garante o estoque físico dessas
--       linhas enquanto a composição do combo não for modelada.
--   {"status":"estoque_insuficiente","itens":[{produto_id,faltante}]}
--   {"status":"produto_inexistente","produtos":[uuid,...]}    item aponta p/
--                                                             produto ausente
--   {"status":"quantidade_invalida"}                          item com qtd<=0
--   {"status":"reconciliacao_pendente","reservas":N}          órfãs ativas
--   {"status":"pedido_invalido"}                              inexistente/sem itens
--   {"status":"permissao_negada"}                             sem auth/autorização
--   {"status":"status_invalido"}                              fora de
--                                                             recebido/em_producao
--   - NUNCA devolve "reservado" em erro; erro técnico => exceção => rollback.
--   - Sem PII: só uuids de produto e inteiros.
--
-- ============================================================================
-- GARANTIAS
-- ============================================================================
--   - Produtos exigidos: TODOS os produto_id dos itens são checados (existe em
--     produtos). Produto ausente => 'produto_inexistente' (NÃO é ignorado,
--     NÃO vira estoque_insuficiente, NÃO vira ja_reservado).
--   - Quantidade: qualquer item com quantidade<=0 => 'quantidade_invalida'.
--   - Atomicidade: o PASSO 1 valida TODOS os produtos e CONGELA o plano
--     (produto, falta, saldo) em arrays. O PASSO 2 só aplica o plano congelado.
--     Sem re-leitura de pedido_itens no PASSO 2 => alteração concorrente dos
--     itens NUNCA provoca débito acima do validado (nem estoque negativo).
--   - Sem baixa parcial: qualquer insuficiência retorna ANTES de escrever;
--     falha técnica no passo 2 => exceção => rollback total.
--   - Locks: L1 pedidos (FOR UPDATE); depois TODOS os produtos em ordem
--     determinística (ORDER BY id) com FOR UPDATE => sem deadlock entre pedidos.
--   - Idempotência: reivindicado = Σ reservas status IN ('ativa','consumida');
--     falta = Σ itens - reivindicado; repetir => 'ja_reservado'.
--   - Plano vazio: se NENHUM produto precisa de reserva (tudo já reservado),
--     v_plan_n = 0 => retorna 'ja_reservado' antes do laço, SEM erro e SEM
--     baixa (o laço nunca roda com limite NULL/vazio).
--   - Reservas antigas: NÃO alteradas/creditadas/neutralizadas; se houver linha
--     'ativa' sem origem no ledger => 'reconciliacao_pendente'. Sob regime
--     controlado (0092), reserva ativa sem MARCADOR de proveniência também =>
--     'reconciliacao_pendente' (não a trata como confiável).
--   - Overflow: somatórios em bigint; débito final limitado por produtos.estoque
--     (integer) => o valor gravado sempre cabe em integer.
--
-- ============================================================================
-- PROVENIÊNCIA (0092, etapa 1.39)
-- ============================================================================
--   - Lê reserva_proveniencia_config.controlado de forma SEGURA (to_regclass):
--     se a 0092 não estiver instalada, o regime fica desligado e nada quebra.
--   - Sob regime controlado, cria UM marcador por reserva criada, na MESMA
--     transação do débito, gravando o id da movimentação (RETURNING id) => origem
--     exata e verificável. Nunca marca retroativamente reservas antigas.
--   - Reserva que não puder receber marcador confiável NÃO é classificada como
--     controlada: a escrita do marcador é obrigatória e, se falhar, o erro aborta
--     a transação (rollback total). Itens sem produto_id (montagem) continuam
--     fora do controle e NÃO contam como reservados.
--
-- ============================================================================
-- COMBOS (diagnóstico 1.27 — NÃO inventar baixa)
-- ============================================================================
--   - Produto combo_50 (tipo_venda='combo_50') é um PRODUTO real com produto_id
--     => é reservado normalmente (quantidade = múltiplo de 50).
--   - "Combo montado" (src/routes/combo.tsx) é linha sintética com
--     produtoId=null => pedido_itens.produto_id NULL => NÃO reservável. Isso é
--     a REGRA já vigente (0048/0042/0050: "combo montado = montagem, sem baixa").
--   - NÃO existe composição de combo no banco (sem tabela de componentes) =>
--     a baixa por sabor de um combo montado NÃO é modelável hoje. Bloqueador
--     estrutural registrado; NÃO implementar regra presumida.
--
-- ============================================================================
-- AUTENTICAÇÃO / PAGAMENTO (compatibilidade; nenhuma regra nova)
-- ============================================================================
--   - Checkout exige login (checkout.tsx:248) => pedidos.user_id preenchido;
--     visitante sem login não cria pedido. Pedidos legados com user_id NULL só
--     por staff (dono nulo => exige staff).
--   - auth.uid() é a única identidade; reserva ocorre no nascimento ('recebido'),
--     ANTES do pagamento; Pix pendente não bloqueia. pix-confirm só muda
--     pagamento_status. Expiração/liberação de reserva pendente é decisão
--     comercial FUTURA (NÃO implementar sem autorização).
--
-- ============================================================================
-- NÃO FAZER AQUI (escopo/regra)
-- ============================================================================
--   - NÃO aplica gate de produtos.disponivel (regra comercial — requer decisão).
--   - NÃO valida múltiplo de 50 no servidor (regra comercial — requer decisão).
--   - NÃO expira reservas por tempo.
--   - NÃO faz liberação/consumo (0090/0091).
--   - NÃO torna atômica a criação do pedido+itens (requer mudança no checkout).
--
-- ============================================================================
-- REVISÃO 1.28 — IDEMPOTÊNCIA, INTEGRIDADE E REGRAS (diagnóstico)
-- ============================================================================
--   Idempotência / plano vazio (Tarefa 1): VERIFICADO e seguro.
--     - arrays inicializados com '{}'; array_length('{}') = NULL => guardado por
--       COALESCE; v_plan_n = 0 => retorno 'ja_reservado' ANTES do laço.
--     - retry de pedido totalmente reservado: falta <= 0 em todo produto =>
--       plano vazio => 'ja_reservado' sem nova baixa (idempotente).
--     - reserva parcial: só os produtos com falta > 0 entram no plano.
--
--   Integridade de pedido_itens (Tarefa 2) — alternativas avaliadas:
--     (a) travar itens (FOR UPDATE em pedido_itens): novo nível de lock; NÃO
--         impede INSERT concorrente (row lock não bloqueia INSERT) => parcial.
--     (b) coordenação obrigatória pelo lock do pedido: exige que TODO escritor
--         de itens (checkout) trave 'pedidos' primeiro — mudança no CHECKOUT.
--     (c) controle de versão dos itens: exige COLUNA nova (schema).
--     (d) operação única de confirmação (pedido+itens+reserva num RPC): exige
--         mudança no CHECKOUT.
--     DECISÃO DESTA ETAPA: manter o PLANO CONGELADO (já implementado) — ele
--     garante que alteração concorrente dos itens NUNCA cause débito acima do
--     validado. NÃO implementar (a)-(d) aqui (tocam schema/checkout).
--
--   Regras comerciais (Tarefa 4) — onde validar / o que falta decidir:
--     - quantidade mínima / múltiplo de 50: hoje SÓ no cliente
--       (checkout.tsx:376, cart.tsx; MINIMO_COMBO=50). Servidor não valida
--       => decisão comercial pendente (bloqueador B5).
--     - congelados por unidade (tipo_venda='unidade'): sem regra extra.
--     - pedidos agendados (pedidos.agendado_para, 0040): existem, mas a RPC
--       reserva no nascimento — NÃO considera a janela de agendamento
--       (bloqueador B7; janela tratada em 0084 para aceite/cupom, não estoque).
--     - reserva vs. confirmação/pagamento: hoje a reserva é no nascimento
--       ('recebido'), ANTES do pagamento. Mudar para "reservar só na
--       confirmação" é DECISÃO COMERCIAL (não alterada aqui).
--     - pedido pendente não pode bloquear estoque indefinidamente: NÃO há
--       expiração/validade de reserva (bloqueador B6) — decisão comercial.
--
--   Retentativa após LIBERAÇÃO (Tarefa 5): 'liberada' não conta em v_ja; logo um
--     retry com status elegível RE-RESERVA. Isso é correto SOMENTE se a liberação
--     creditou o estoque (contrato da 0090: tipo='liberacao',
--     referencia_tipo='reserva_estoque', referencia_id=reserva.id). ENQUANTO a
--     liberação for feita por liberar_reserva_atomica (sem crédito confiável),
--     o retry pode debitar de novo => DEPENDÊNCIA da 0090 (bloqueador B8).
--
-- ============================================================================
-- INTEGRAÇÃO FUTURA NO CHECKOUT (Tarefa 5 — NÃO feito nesta etapa)
-- ============================================================================
--   1. Trocar o loop por item (checkout.tsx:551-568) por 1 chamada a esta RPC.
--   2. Remover o fallback de escrita direta (checkout.tsx:569-581).
--   3. Tratar o retorno classificado (hoje só true/false em :558-609).
--   4. Compensação por liberar_pedido_atomico (0090), não liberar_reserva_atomica.
--   5. Falha de rede => NÃO escrever; orientar retry (idempotente pelo id).
--   6. Impedir pedidos incompletos (esta RPC já recusa pedido sem itens).
--   7. Pagamento/expiração: reserva no nascimento; expiração é decisão futura.
--
-- REVERSÃO: DROP FUNCTION IF EXISTS public.reservar_pedido_atomico(uuid);
--   Função INERTE (nada a chama) => sem efeitos em dados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reservar_pedido_atomico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_eh_staff   boolean;
  v_ids        uuid[];
  v_missing    uuid[];
  v_n_itens    integer;
  v_orfa       integer;
  v_montagem   integer;
  v_prod       record;
  v_solicitado bigint;
  v_ja         bigint;
  v_falta      bigint;
  v_faltas     jsonb := '[]'::jsonb;
  -- Plano congelado no PASSO 1 (aplicado sem re-leitura no PASSO 2):
  v_plan_ids   uuid[]    := '{}';
  v_plan_falta bigint[]  := '{}';
  v_plan_saldo integer[] := '{}';
  v_plan_n     integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
  v_controlado boolean := false;
  i            integer;
BEGIN
  -- 1. Autenticação (auth.uid() é a única fonte de identidade).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 1b. Proveniência (0092): ler o controle de forma SEGURA (to_regclass). Se a
  --     0092 não estiver instalada, o regime fica desligado e nada quebra.
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT controlado
      INTO v_controlado
    FROM public.reserva_proveniencia_config
    WHERE id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;

  -- 2. L1: bloquear o pedido (serializa retries/consultas do mesmo pedido).
  SELECT user_id, status
    INTO v_dono, v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 3. Autorização: dono do pedido OU staff operacional (paridade 0068/0088).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN jsonb_build_object('status', 'permissao_negada');
    END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 4. Status elegível.
  IF v_status NOT IN ('recebido', 'em_producao') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- 5. Pedido precisa ter itens (impede pedido incompleto/vazio).
  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 6. Quantidade inválida (<=0) em qualquer item => recusa (não reserva lixo).
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
      AND (quantidade IS NULL OR quantidade <= 0)
  ) THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

  -- 6b. Composição do combo: quantidade positiva e soma EXATA do item pai.
  IF EXISTS (
    SELECT 1
      FROM public.pedido_item_componentes c
      JOIN public.pedido_itens i ON i.id = c.pedido_item_id
     WHERE i.pedido_id = p_pedido_id
       AND (c.quantidade IS NULL OR c.quantidade <= 0)
  ) THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NULL
       AND EXISTS (SELECT 1 FROM public.pedido_item_componentes c WHERE c.pedido_item_id = i.id)
       AND COALESCE((
         SELECT SUM(c.quantidade) FROM public.pedido_item_componentes c
          WHERE c.pedido_item_id = i.id
       ), 0) <> i.quantidade
  ) THEN
    RETURN jsonb_build_object('status', 'montagem_soma_divergente');
  END IF;

  -- 7. Itens de MONTAGEM sem composição (combo legado, produto_id NULL):
  --    NÃO entram no controle de estoque. Itens com `pedido_item_componentes`
  --    são reserváveis pelos componentes (abaixo) e NÃO contam como montagem.
  SELECT COUNT(*) INTO v_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

  -- 8. Reservas ativas SEM prova confiável => reconciliação pendente.
  --    (Não debita, não credita, não altera status; apenas classifica.)
  --    Sem origem no ledger: indeterminada. Sempre executado; NÃO referencia
  --    reserva_proveniencia aqui (a 0092 pode não estar instalada).
  SELECT COUNT(*) INTO v_orfa
  FROM public.reservas_estoque r
  WHERE r.pedido_id = p_pedido_id
    AND r.status = 'ativa'
    AND NOT EXISTS (
      SELECT 1
      FROM public.estoque_movimentacoes em
      WHERE em.referencia_tipo = 'reserva_estoque'
        AND em.referencia_id = r.id
        AND em.tipo = 'reserva'
    );

  -- 8b. Sob regime controlado (0092), conta também as ativas SEM MARCADOR de
  --     proveniência (indeterminadas). Só aqui se referencia a tabela do marcador
  --     (dentro do IF), de modo que a função não quebra se a 0092 não existir.
  --     Marcador implica origem => este conjunto cobre o anterior (superset).
  IF v_controlado THEN
    SELECT COUNT(*) INTO v_orfa
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.status = 'ativa'
      AND NOT EXISTS (
        SELECT 1 FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = r.id
      );
  END IF;

  IF v_orfa > 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'reservas', v_orfa);
  END IF;

  -- 9. Produtos reserváveis do pedido (itens com produto + componentes de
  --    combo), ordem determinística. `UNION` deduplica produto repetido.
  SELECT COALESCE(array_agg(DISTINCT pid ORDER BY pid), '{}'::uuid[])
    INTO v_ids
  FROM (
    SELECT i.produto_id AS pid
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NOT NULL
    UNION
    SELECT c.produto_id AS pid
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    -- Só itens de montagem sem composição: nada a reservar.
    -- 'montagem' quantifica as linhas fora do controle de estoque.
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

  -- 10. TODO produto exigido precisa existir (não ignorar produto ausente).
  SELECT array_agg(u.pid) INTO v_missing
  FROM unnest(v_ids) AS u(pid)
  WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = u.pid);
  IF v_missing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'produto_inexistente', 'produtos', to_jsonb(v_missing));
  END IF;

  -- 11. PASSO 1 — LEITURA (lock ordenado por id): validar TODOS e congelar plano.
  --     Nenhuma escrita acontece antes de confirmar disponibilidade total.
  FOR v_prod IN
    SELECT id, estoque
    FROM public.produtos
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    SELECT COALESCE(SUM(qtd), 0) INTO v_solicitado
    FROM (
      SELECT i.quantidade AS qtd
        FROM public.pedido_itens i
       WHERE i.pedido_id = p_pedido_id AND i.produto_id = v_prod.id
      UNION ALL
      SELECT c.quantidade AS qtd
        FROM public.pedido_itens i
        JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
       WHERE i.pedido_id = p_pedido_id AND c.produto_id = v_prod.id
    ) s;

    -- Reivindicado = ativa (ainda no freezer) + consumida (já retirada).
    SELECT COALESCE(SUM(quantidade), 0) INTO v_ja
    FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id AND produto_id = v_prod.id
      AND status IN ('ativa', 'consumida');

    v_falta := v_solicitado - v_ja;
    IF v_falta > 0 THEN
      IF v_prod.estoque < v_falta THEN
        v_faltas := v_faltas || jsonb_build_object(
          'produto_id', v_prod.id,
          'faltante', v_falta - v_prod.estoque
        );
      ELSE
        v_plan_ids   := v_plan_ids   || v_prod.id;
        v_plan_falta := v_plan_falta || v_falta;
        v_plan_saldo := v_plan_saldo || v_prod.estoque;
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltas) > 0 THEN
    -- Sem débito parcial: aborta antes de qualquer escrita.
    RETURN jsonb_build_object('status', 'estoque_insuficiente', 'itens', v_faltas);
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_ids, 1), 0);
  IF v_plan_n = 0 THEN
    -- Nada a debitar (tudo já reservado): idempotente — sem erro e sem baixa.
    RETURN jsonb_build_object('status', 'ja_reservado', 'itens', 0, 'montagem', v_montagem);
  END IF;

  -- 12. PASSO 2 — ESCRITA (mesma transação): aplica o plano congelado.
  --     Sem RETURNS controlados no meio: qualquer erro aqui => rollback total.
  FOR i IN 1 .. v_plan_n LOOP
    v_reserva_id := gen_random_uuid();

    UPDATE public.produtos
       SET estoque = v_plan_saldo[i] - v_plan_falta[i]
     WHERE id = v_plan_ids[i];

    INSERT INTO public.reservas_estoque (id, pedido_id, produto_id, quantidade, status)
    VALUES (v_reserva_id, p_pedido_id, v_plan_ids[i], v_plan_falta[i], 'ativa');

    INSERT INTO public.estoque_movimentacoes (
      produto_id, lote_id, tipo, quantidade,
      saldo_anterior, saldo_posterior,
      referencia_id, referencia_tipo, usuario_id, observacao
    ) VALUES (
      v_plan_ids[i],
      NULL,
      'reserva',
      -v_plan_falta[i],
      v_plan_saldo[i],
      v_plan_saldo[i] - v_plan_falta[i],
      v_reserva_id,
      'reserva_estoque',
      v_uid,
      'Reserva de estoque (Modelo 2) pedido ' || p_pedido_id::text
    )
    RETURNING id INTO v_mov_id;

    -- 13. Marcador de proveniência (0092) para ESTA reserva, na MESMA transação
    --     do débito legítimo. Só sob regime controlado. O marcador é criado junto
    --     do débito (nunca separado) e usa o id exato da movimentação; qualquer
    --     falha aborta a transação inteira (rollback total, sem baixa parcial).
    --     Não marca reservas antigas (só as criadas aqui, neste pedido).
    IF v_controlado THEN
      INSERT INTO public.reserva_proveniencia (
        reserva_id, pedido_id, produto_id, quantidade,
        origem, estoque_movimentacao_id, criado_por
      ) VALUES (
        v_reserva_id, p_pedido_id, v_plan_ids[i], v_plan_falta[i],
        '0089', v_mov_id, v_uid
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'reservado', 'itens', v_plan_n, 'montagem', v_montagem);
END;
$$;

COMMENT ON FUNCTION public.reservar_pedido_atomico(uuid) IS
  '0089: reserva transacional de TODO o pedido (Modelo 2). Exige produto '
  'existente para cada item (produto_inexistente), quantidade > 0 '
  '(quantidade_invalida); valida disponibilidade de todos ANTES de debitar '
  '(sem baixa parcial) e aplica um PLANO CONGELADO (sem re-leitura de itens => '
  'sem débito acima do validado). Trava produtos em ordem determinística '
  '(ORDER BY id); cria reserva com id próprio e registra no ledger '
  'estoque_movimentacoes (referencia_tipo=reserva_estoque, tipo=reserva, saldos '
  'reais). Idempotente (plano vazio => ja_reservado sem baixa). Campo montagem '
  'quantifica itens sem produto_id (combo montado) fora do controle de estoque. '
  'Reservas ativas sem origem (ou, sob regime controlado, sem marcador de '
  'proveniência) => reconciliacao_pendente. Proveniência (0092): sob regime '
  'controlado cria o marcador na mesma transação do débito. '
  'Retorno jsonb classificado, sem dados pessoais. NÃO grava em estoque_mov.';

-- ----------------------------------------------------------------------------
-- Permissões de execução: apenas authenticated/service_role (nunca anon/PUBLIC).
-- (A função já nega anon internamente via auth.uid() nulo; defesa em profundidade.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(uuid) TO authenticated;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0089

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0090 (verbatim de drizzle/migrations/0090_liberar_pedido_atomico.sql)
--     SHA-256 do arquivo de origem : 77471eee9dda30e6e5a37d6b2537bc0a583f1534f7a9e1eb9a95801ee030d6c0
--     bytes do arquivo de origem   : 29146
--     natureza                     : ATIVA (interna)
--     objetos                      : RPC `liberar_pedido_atomico` (chamada internamente pela 0093)
-- ==========================================================================
-- 0090: liberar_pedido_atomico — liberação SEGURA e VERIFICADA do restante (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente isolado antes.
--
-- O QUE É: função INTERNA (worker) que devolve ao saldo apenas o RESTANTE das
-- reservas de um pedido JÁ CANCELADO, de forma transacional, idempotente e
-- auditável no ledger autoritativo (estoque_movimentacoes).
--
-- IMPORTANTE — NÃO É UM PONTO DE ENTRADA PÚBLICO:
--   - NÃO recebe EXECUTE de anon/authenticated (REVOKE, sem GRANT residual);
--   - NÃO atualiza status do pedido, NÃO grava histórico, NÃO autoriza
--     cancelamento e NÃO valida pagamento;
--   - SÓ age em pedido com status = 'cancelado' (nunca credita pedido ativo);
--   - deve ser chamada DENTRO de uma futura operação transacional de
--     cancelamento (orquestradora). Ver "INTEGRAÇÃO / BLOQUEADOR" abaixo.
--
-- REVISÃO 1.47 (auditoria de integridade das reservas):
--   ANTES: a função iterava SOMENTE reservas 'ativa'. Toda reserva fora de
--   'ativa' era ignorada e, se NÃO houvesse nenhuma ativa, devolvia
--   'ja_liberado' PRESUMIDO — sem provar que as reservas 'liberada'/'consumida'/
--   'cancelada' estavam realmente consistentes (liberação anterior sem crédito
--   no ledger passava batido => estoque não creditado, "vazamento" silencioso).
--   AGORA: valida TODAS as reservas do pedido (qualquer status) e a
--   correspondência item×reserva por produto; só devolve sucesso quando TUDO é
--   comprovado. Qualquer dúvida => 'reconciliacao_pendente' SEM crédito.
--
-- REVISÃO 1.48 (correção da cobertura × liberação já realizada):
--   CONTRADIÇÃO COMPROVADA (1.47): a conferência item×reserva somava apenas
--   'ativa' + 'consumida'. Assim, depois de uma liberação bem-sucedida
--   (ativa -> liberada), a cobertura caía para 0 e a MESMA chamada/retry devolvia
--   'reconciliacao_pendente' — quebrando a IDEMPOTÊNCIA documentada (o retry
--   deveria devolver 'ja_liberado') e contradizendo a aceitação de 'liberada'
--   com crédito comprovado (DoD 1.47/D.1).
--   CORREÇÃO: a cobertura passa a contar 'ativa' + 'consumida' + 'liberada'
--   (cada reserva uma única vez, sempre COM prova individual do status). Além
--   disso, bloqueia-se a coexistência, no MESMO pedido, de reserva 'ativa' com
--   reserva 'liberada' ("pedido com liberação anterior segurando estoque") —
--   estado que o fluxo controlado NUNCA produz (a liberação só ocorre no
--   cancelamento; depois dele o pedido não é re-reservado) => 'reconciliacao_pendente'.
--   Nada disso enfraquece a prova de crédito/débito: 'liberada' continua exigindo
--   exatamente 1 movimento 'liberacao' coerente; 'ativa' continua exigindo
--   marcador + origem exata; só 'ativa' é creditada.
--
-- MODELO 2 (etapas 1.18–1.29):
--   - produtos.estoque = saldo DISPONÍVEL (líquido de reservas);
--   - a reserva debita o disponível UMA vez (0089);
--   - a retirada do freezer CONSOME a reserva sem novo débito (0087/0091);
--   - o cancelamento devolve SOMENTE o não consumido (esta função);
--   - ledger de SALDO = estoque_movimentacoes (0042), tipo 'liberacao'.
--
-- ============================================================================
-- DEPENDÊNCIAS (devem existir no ambiente alvo)
-- ============================================================================
--   - 0087 reserva_consumos (tabela; se ausente, a chamada falha explicitamente
--     com "relation does not exist" => rollback, nunca libera pela metade);
--   - 0042 estoque_movimentacoes (tipo_mov_estoque tem 'liberacao'; colunas
--     referencia_id/referencia_tipo/saldos; CHECK quantidade != 0);
--   - 0088/0089: convenção de origem referencia_tipo='reserva_estoque',
--     referencia_id=reserva.id, tipo='reserva' (para 0088 e 0089 — compatível);
--   - 0023 reservas_estoque (status: ativa|liberada|consumida|cancelada);
--   - 0023 pedido_itens (produto_id NULL = montagem, fora do estoque);
--   - 0092 reserva_proveniencia (marcador). AUSENTE => to_regclass NULL =>
--     fail-closed (nenhuma reserva 'ativa' é considerada determinada).
--
-- ============================================================================
-- CRITÉRIOS DE CONSISTÊNCIA (por reserva — 1.47/B)
-- ============================================================================
--   Comum a TODO status:
--     - produto presente E pertencente ao pedido (produto_id ∈ itens do pedido)
--       E entre os produtos travados (produto existente);
--     - origem (débito) EXATA no ledger: exatamente 1 movimento 'reserva' com
--       referencia_tipo='reserva_estoque' e referencia_id = reserva.id, negativo,
--       mesmo produto, saldos não nulos e coerentes (posterior = anterior + qtd),
--       e SUM(-quantidade) = reservas_estoque.quantidade (igualdade EXATA);
--     - consumo (0087) coerente: todo reserva_consumos aponta para o MESMO
--       pedido e produto da reserva e tem quantidade > 0; Σconsumo <= quantidade.
--   Por status:
--     'ativa'     => EXIGE marcador de proveniência (0092): exatamente 1 e
--                    apontando para o MESMO movimento de débito; NENHUMA
--                    liberação anterior; consumo coerente; restante >= 0.
--                    Determinada => entra no plano (credita o restante).
--     'consumida' => reserva já RETIRADA por inteiro: exige origem exata,
--                    consumo coerente, restante = 0 e NENHUMA liberação
--                    anterior. NÃO credita (nada a devolver).
--     'liberada'  => exige PROVA DE CRÉDITO: exatamente 1 movimento 'liberacao'
--                    coerente (mesmo produto, quantidade > 0, saldos
--                    consistentes) cujo valor = restante (quantidade - Σconsumo)
--                    e restante > 0. NÃO credita de novo.
--     'cancelada' => SEM prova definida (a liberação antiga 0030/0086 grava em
--                    OUTRA tabela e não deixa rastro no ledger canônico) =>
--                    INDETERMINADA (bloqueia). Não se presume reconciliada.
--   Qualquer reserva INDETERMINADA => 'reconciliacao_pendente' SEM crédito e
--   SEM alterar linha alguma (nunca liberação parcial).
--   OBS (1.48): a comprovação individual NÃO substitui a conferência de
--   quantidades — as duas são exigidas (uma reserva pode ter prova válida e, ainda
--   assim, a soma não fechar com os itens).
--
-- ============================================================================
-- CONFERÊNCIA ITEM × RESERVA (por produto — 1.47/C, corrigida na 1.48)
-- ============================================================================
--   Para cada produto exigido por pedido_itens (produto_id NÃO nulo), a soma das
--   reservas que CONTAM COBERTURA — status 'ativa' + 'consumida' + 'liberada'
--   (cada reserva contada UMA única vez, e sempre com a prova individual exigida
--   por status) — deve ser EXATAMENTE igual à quantidade exigida pelo pedido.
--   Por que 'liberada' conta: uma reserva liberada representa a MESMA quantidade
--   originalmente reservada, cujas unidades já foram devolvidas COM prova de
--   crédito. Excluí-la provocaria falso 'reconciliacao_pendente' no retry
--   (idempotência) e na simples releitura de um pedido já liberado.
--   'cancelada' NÃO conta cobertura (já é indeterminada => bloqueia).
--   Detecta:
--     1. reserva INFERIOR à quantidade exigida (faltando cobertura);
--     2. reserva SUPERIOR à quantidade exigida (cobertura indevida/duplicada);
--     3. reserva de produto NÃO previsto no pedido (marcada no laço por reserva);
--     4. duplicidade que o somatório por produto já evidencia (SOMA > exigido);
--     5. inconsistência "mascarada" por outra reserva válida (validamos TODAS).
--   GUARDA EXTRA (1.48/D.6): se o pedido tiver AO MESMO TEMPO reserva 'ativa'
--   (segura estoque) e 'liberada' (já devolveu), é um estado incompatível com o
--   fluxo controlado => 'reconciliacao_pendente' (mesmo que a soma feche).
--   Item com quantidade NULL/<=0 (reservável) => INDETERMINADO.
--   Itens de MONTAGEM (produto_id NULL = combo montado, regra 0048) NÃO têm
--   composição de estoque modelada: ficam FORA da conferência e são apenas
--   CONTADOS no retorno ('montagem'). O pedido NÃO é declarado "totalmente
--   reconciliado" quanto a essas linhas — é uma regra EXPLÍCITA (não inventamos
--   composição).
--
-- ============================================================================
-- SEMÂNTICA DE `ja_liberado` (1.47/D) — COMPROVADO, NUNCA PRESUMIDO
-- ============================================================================
--   'ja_liberado' só é devolvido quando NÃO há nenhuma reserva 'ativa' E TODAS
--   as reservas do pedido passaram nos critérios acima E a conferência
--   item×reserva fecha (com 'liberada'/'consumida' contando cobertura). Isto
--   cobre, de forma verificável:
--     - todas 'liberada' COM crédito comprovado (retry/idempotência; D.1/D.2);
--     - todas 'consumida' (retirada total comprovada);
--     - mistura 'liberada' + 'consumida' (cada uma comprovada; D.4);
--     - pedido só de montagem (nada a reservar) => 'ja_liberado' legítimo;
--   e BLOQUEIA ('reconciliacao_pendente'):
--     - 'liberada' SEM movimento de crédito (liberação sem prova; D.5);
--     - 'liberada' coexistindo com 'ativa' no mesmo pedido (D.6);
--     - 'cancelada' (sem prova definida);
--     - 'ativa' sem marcador/origem coerente (bloqueia, não libera);
--     - pedido com itens reserváveis e SEM reserva que retenha estoque;
--     - qualquer divergência de cobertura por produto.
--   ATENÇÃO: a distinção "pedido ATIVO com reservas já liberadas" (D.6, deve
--   reconciliar) × "pedido JÁ CANCELADO com reservas liberadas" (D.1/D.2, aceita)
--   depende do status do pedido. A 0093 recusa o caso ativo ANTES de chamar esta
--   função (pré-checagem 'sem_reserva_ativa'); aqui, quando chamada sobre pedido
--   cancelado, a coexistência 'ativa'+'liberada' ainda é bloqueada por segurança.
--
-- ============================================================================
-- CONTRATO DE RETORNO — jsonb, sem dados pessoais
-- ============================================================================
--   {"status":"liberado","reservas":N,"unidades":U,"montagem":M}
--   {"status":"ja_liberado","reservas":0,"unidades":0,"montagem":M}
--   {"status":"reconciliacao_pendente","reservas":N,"montagem":M}
--   {"status":"status_invalido","montagem":M}     pedido não está 'cancelado'
--   {"status":"pedido_invalido"}                   pedido inexistente
--   - M (montagem) = nº de itens do pedido com produto_id NULL (combo montado),
--     FORA do controle de estoque. Campo INFORMATIVO.
--   - NUNCA devolve "liberado" em erro; erro técnico => exceção => rollback.
--   - ATENÇÃO (chamador): 'reconciliacao_pendente'/'status_invalido' são RETORNO,
--     não exceção => NÃO revertem escritas anteriores da MESMA transação.
--     A orquestradora DEVE convertê-los em exceção para forçar rollback.
--
-- ============================================================================
-- ORDEM DE LOCKS (canônica)
-- ============================================================================
--   L1 pedidos (FOR UPDATE) -> L2 produtos (ORDER BY id, FOR UPDATE) ->
--   L3 reservas_estoque (pedido, ORDER BY id, FOR UPDATE — TODOS os status).
--   reserva_consumos é apenas LIDA (SUM/FILTER). A 0091 DEVE travar a reserva
--   (FOR UPDATE) antes de inserir consumo, para serializar com esta função.
--   Bloqueios são mantidos até o fim da transação => passos 1 e 2 estáveis.
--
-- ============================================================================
-- IDEMPOTÊNCIA / CONCORRÊNCIA (conceitual)
-- ============================================================================
--   - 2 cancelamentos simultâneos: o 2º espera em L1; depois vê tudo
--     'liberada'/'consumida' (e cada uma COMPROVADA, contando cobertura na 1.48)
--     => 'ja_liberado'.
--   - cancelamento durante retirada: L3 serializa com a 0091.
--   - retry após liberação / timeout: idempotente (só processa 'ativa'; a
--     cobertura já liberada é reconhecida pelas próprias reservas 'liberada').
--   - pedido já cancelado: idempotente. Pedido 'entregue': 'status_invalido'.
--   - reserva antiga sem origem OU 'liberada' sem crédito no ledger: bloqueia.
--   - 'ativa' coexistindo com 'liberada' no mesmo pedido: bloqueia (1.48/D.6).
--   - pedido com vários produtos: itera por id crescente; saldos reais por
--     produto (mesmo com reservas repetidas do mesmo produto).
--   - falha técnica no passo de escrita: exceção => rollback integral.
--   - SEM exclusão de concorrência com a 0091: a 0091 recusa pedido cancelado.
--
-- ============================================================================
-- SEGURANÇA
-- ============================================================================
--   - SECURITY DEFINER + SET search_path = public;
--   - EXECUTE revogado de PUBLIC/anon/authenticated (sem GRANT residual):
--     só o owner (e futura orquestradora DEFINER) executa; sem superfície para
--     cliente/service_role via PostgREST;
--   - identidade do ledger = auth.uid() (NULL permitido pela 0042 quando a
--     futura orquestradora rodar como service_role);
--   - sem EXCEPTION WHEN OTHERS (falhas propagam => rollback);
--   - RLS: owner ignora RLS (nenhuma tabela usa FORCE RLS).
--
-- REVERSÃO: DROP FUNCTION IF EXISTS public.liberar_pedido_atomico(uuid);
--   Função INERTE (nada a chama) => sem efeitos em dados; nenhuma DDL colateral.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.liberar_pedido_atomico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_status      public.order_status;
  v_has_prov    boolean;
  v_item_prods  uuid[];                 -- produtos exigidos pelo pedido (itens reserváveis)
  v_prod_ids    uuid[];                 -- produtos de TODAS as reservas (qualquer status)
  v_locked_prod uuid[]    := '{}';
  v_n_indet     integer   := 0;
  v_n_montagem  integer   := 0;
  v_res         record;
  v_prod        record;
  v_mov_n       integer;
  v_mov_bad     integer;
  v_mov_id      uuid;
  v_debitado    bigint;
  v_cons_bad    integer;
  v_consumido   bigint;
  v_restante    bigint;
  v_lib_n       integer;
  v_lib_bad     integer;
  v_lib_qtd     bigint;
  v_marker_n    integer;
  v_marker_mov  uuid;
  v_demanda     bigint;
  v_coberto     bigint;
  v_tem_ativa   boolean;
  v_tem_liberada boolean;
  -- Plano congelado no passo 1 (aplicado no passo 2, sem re-leitura):
  v_plan_res    uuid[]    := '{}';
  v_plan_prod   uuid[]    := '{}';
  v_plan_qtd    integer[] := '{}';
  v_plan_n      integer;
  v_saldo_ant   integer;
  v_saldo_pos   integer;
  i             integer;
BEGIN
  -- L1: bloquear o pedido (serializa cancelamentos/retries do mesmo pedido).
  SELECT status
    INTO v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- GUARDA: só libera pedido CANCELADO. Nunca credita pedido ativo/entregue.
  -- (As reservas antigas de pedidos 'entregue' caem aqui.)
  IF v_status <> 'cancelado' THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- PROVENIÊNCIA (0092): exigida para reservas 'ativa'. Fail-closed — se a
  -- tabela NÃO existir (sem mecanismo de prova), nenhuma ativa é determinada.
  v_has_prov := (to_regclass('public.reserva_proveniencia') IS NOT NULL);

  -- Itens de MONTAGEM sem composição (combo legado): contados, não conferidos.
  SELECT COUNT(*)
    INTO v_n_montagem
  FROM public.pedido_itens i
  WHERE i.pedido_id = p_pedido_id
    AND i.produto_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pedido_item_componentes c
       WHERE c.pedido_item_id = i.id
    );

  -- Produtos exigidos pelos itens reserváveis (produto direto + componentes).
  SELECT COALESCE(array_agg(DISTINCT pid ORDER BY pid), '{}'::uuid[])
    INTO v_item_prods
  FROM (
    SELECT i.produto_id AS pid
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
    UNION
    SELECT c.produto_id AS pid
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  -- Item reservável com quantidade inválida => indeterminado (não mascarar).
  IF EXISTS (
    SELECT 1 FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
      AND produto_id IS NOT NULL
      AND (quantidade IS NULL OR quantidade <= 0)
  ) OR EXISTS (
    SELECT 1
      FROM public.pedido_item_componentes c
      JOIN public.pedido_itens i ON i.id = c.pedido_item_id
     WHERE i.pedido_id = p_pedido_id
       AND (c.quantidade IS NULL OR c.quantidade <= 0)
  ) OR EXISTS (
    SELECT 1
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id
       AND i.produto_id IS NULL
       AND EXISTS (SELECT 1 FROM public.pedido_item_componentes c WHERE c.pedido_item_id = i.id)
       AND COALESCE((
         SELECT SUM(c.quantidade) FROM public.pedido_item_componentes c
          WHERE c.pedido_item_id = i.id
       ), 0) <> i.quantidade
  ) THEN
    v_n_indet := v_n_indet + 1;
  END IF;

  -- L2: travar TODOS os produtos referenciados por QUALQUER reserva do pedido
  -- (não só as ativas): a função passa a ler/validar todos os status.
  SELECT COALESCE(array_agg(DISTINCT produto_id ORDER BY produto_id), '{}'::uuid[])
    INTO v_prod_ids
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id IS NOT NULL;

  FOR v_prod IN
    SELECT id
    FROM public.produtos
    WHERE id = ANY(v_prod_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_locked_prod := v_locked_prod || v_prod.id;
  END LOOP;

  -- L3 + PASSO 1 (LEITURA): travar TODAS as reservas do pedido (id ASC) e
  -- classificar. Nenhuma escrita ocorre antes de confirmar que TODAS são
  -- determinadas/consistentes.
  FOR v_res IN
    SELECT id, pedido_id, produto_id, quantidade, status
    FROM public.reservas_estoque
    WHERE pedido_id = p_pedido_id
    ORDER BY id
    FOR UPDATE
  LOOP
    -- 0) Produto ausente, de produto inexistente (não travado) ou FORA dos itens
    --    do pedido => indeterminada (1.47/C.3).
    IF v_res.produto_id IS NULL
       OR NOT (v_res.produto_id = ANY(v_locked_prod))
       OR NOT (v_res.produto_id = ANY(v_item_prods)) THEN
      v_n_indet := v_n_indet + 1;
      CONTINUE;
    END IF;

    -- a) Origem (débito) EXATA: 1 movimento 'reserva' coerente, débito = reserva.
    SELECT COUNT(*),
           COALESCE(SUM(-em.quantidade), 0),
           (array_agg(em.id))[1],
           COUNT(*) FILTER (
             WHERE em.quantidade IS NULL
                OR em.quantidade >= 0
                OR em.produto_id IS NULL
                OR em.produto_id IS DISTINCT FROM v_res.produto_id
                OR em.saldo_anterior IS NULL
                OR em.saldo_posterior IS NULL
                OR em.saldo_posterior <> em.saldo_anterior + em.quantidade
           )
      INTO v_mov_n, v_debitado, v_mov_id, v_mov_bad
    FROM public.estoque_movimentacoes em
    WHERE em.referencia_tipo = 'reserva_estoque'
      AND em.referencia_id = v_res.id
      AND em.tipo = 'reserva';

    -- b) Consumo (0087) coerente: mesmo pedido/produto, quantidade > 0.
    SELECT COALESCE(SUM(rc.quantidade), 0),
           COUNT(*) FILTER (
             WHERE rc.pedido_id IS DISTINCT FROM v_res.pedido_id
                OR rc.produto_id IS DISTINCT FROM v_res.produto_id
                OR rc.quantidade IS NULL
                OR rc.quantidade <= 0
           )
      INTO v_consumido, v_cons_bad
    FROM public.reserva_consumos rc
    WHERE rc.reserva_id = v_res.id;

    v_restante := v_res.quantidade::bigint - v_consumido;

    -- c) Liberações anteriores: quantidade, produto e saldos coerentes.
    SELECT COUNT(*),
           COALESCE(SUM(l.quantidade), 0),
           COUNT(*) FILTER (
             WHERE l.quantidade IS NULL
                OR l.quantidade <= 0
                OR l.produto_id IS NULL
                OR l.produto_id IS DISTINCT FROM v_res.produto_id
                OR l.saldo_anterior IS NULL
                OR l.saldo_posterior IS NULL
                OR l.saldo_posterior <> l.saldo_anterior + l.quantidade
           )
      INTO v_lib_n, v_lib_qtd, v_lib_bad
    FROM public.estoque_movimentacoes l
    WHERE l.referencia_tipo = 'reserva_estoque'
      AND l.referencia_id = v_res.id
      AND l.tipo = 'liberacao';

    IF v_res.status = 'ativa' THEN
      -- Marcador de proveniência (0092): exatamente 1, apontando para o débito.
      IF v_has_prov THEN
        SELECT COUNT(*), (array_agg(rp.estoque_movimentacao_id))[1]
          INTO v_marker_n, v_marker_mov
        FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = v_res.id;
      ELSE
        v_marker_n   := 0;
        v_marker_mov := NULL;
      END IF;

      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_restante < 0
         OR v_lib_n <> 0
         OR NOT v_has_prov
         OR v_marker_n <> 1
         OR v_marker_mov IS DISTINCT FROM v_mov_id THEN
        -- INDETERMINADA: não credita (débito não comprovado, consumo incoerente,
        -- restante negativo, liberação anterior ou proveniência ausente/incompatível).
        v_n_indet := v_n_indet + 1;
      ELSE
        -- Determinada: entra no plano (restante pode ser 0 => vira 'consumida').
        v_plan_res  := v_plan_res  || v_res.id;
        v_plan_prod := v_plan_prod || v_res.produto_id;
        v_plan_qtd  := v_plan_qtd  || v_restante::integer;
      END IF;

    ELSIF v_res.status = 'consumida' THEN
      -- Já retirada por inteiro: origem exata + consumo = reserva + sem liberação.
      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_restante <> 0
         OR v_lib_n <> 0 THEN
        v_n_indet := v_n_indet + 1;
      END IF;

    ELSIF v_res.status = 'liberada' THEN
      -- Exige PROVA DE CRÉDITO: 1 liberação coerente igual ao restante (1.47/D).
      IF v_mov_n <> 1
         OR v_mov_bad <> 0
         OR v_debitado <> v_res.quantidade
         OR v_cons_bad <> 0
         OR v_lib_n <> 1
         OR v_lib_bad <> 0
         OR v_restante <= 0
         OR v_lib_qtd <> v_restante THEN
        v_n_indet := v_n_indet + 1;
      END IF;

    ELSE
      -- 'cancelada' (ou valor inesperado): sem prova definida => bloqueia.
      v_n_indet := v_n_indet + 1;
    END IF;
  END LOOP;

  -- PASSO 1b: conferência ITEM × RESERVA por produto (1.47/C, corrigida na 1.48).
  --   coberto(p) = Σ reservas que CONTAM cobertura (ativa + consumida + liberada)
  --   do produto p. Exige coberto(p) = demanda(p) para TODO produto do pedido.
  FOR v_prod IN
    SELECT pid, COALESCE(SUM(qtd), 0) AS demanda
      FROM (
        SELECT i.produto_id AS pid, i.quantidade AS qtd
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
        UNION ALL
        SELECT c.produto_id AS pid, c.quantidade AS qtd
          FROM public.pedido_itens i
          JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
         WHERE i.pedido_id = p_pedido_id
      ) s
     GROUP BY pid
  LOOP
    SELECT COALESCE(SUM(r.quantidade), 0)
      INTO v_coberto
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.produto_id = v_prod.pid
      AND r.status IN ('ativa', 'consumida', 'liberada');

    IF v_coberto <> v_prod.demanda THEN
      v_n_indet := v_n_indet + 1;   -- falta/sobra de cobertura p/ este produto
    END IF;
  END LOOP;

  -- PASSO 1c (1.48/D.6): coexistência de 'ativa' (segura estoque) com 'liberada'
  -- (já devolveu) no MESMO pedido => estado incompatível com o fluxo controlado
  -- (liberação só ocorre no cancelamento; depois dele não há re-reserva). Bloqueia
  -- mesmo que a soma de cobertura feche. NÃO afeta o retry/idempotência legítimo,
  -- onde o pedido já liberado NÃO tem nenhuma reserva 'ativa'.
  SELECT bool_or(status = 'ativa'), bool_or(status = 'liberada')
    INTO v_tem_ativa, v_tem_liberada
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF COALESCE(v_tem_ativa, false) AND COALESCE(v_tem_liberada, false) THEN
    v_n_indet := v_n_indet + 1;
  END IF;

  -- Bloqueio de segurança: qualquer reserva/produto indeterminado => nada.
  IF v_n_indet > 0 THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'reservas', v_n_indet,
      'montagem', v_n_montagem
    );
  END IF;

  v_plan_n := COALESCE(array_length(v_plan_res, 1), 0);
  IF v_plan_n = 0 THEN
    -- Tudo comprovado e nada 'ativa' a devolver: idempotente, sem crédito.
    RETURN jsonb_build_object(
      'status', 'ja_liberado', 'reservas', 0, 'unidades', 0,
      'montagem', v_n_montagem
    );
  END IF;

  -- PASSO 2 (ESCRITA, mesma transação): aplica o plano congelado.
  FOR i IN 1 .. v_plan_n LOOP
    IF v_plan_qtd[i] > 0 THEN
      SELECT estoque INTO v_saldo_ant
      FROM public.produtos
      WHERE id = v_plan_prod[i];

      v_saldo_pos := v_saldo_ant + v_plan_qtd[i];

      UPDATE public.produtos
         SET estoque = v_saldo_pos
       WHERE id = v_plan_prod[i];

      INSERT INTO public.estoque_movimentacoes (
        produto_id, lote_id, tipo, quantidade,
        saldo_anterior, saldo_posterior,
        referencia_id, referencia_tipo, usuario_id, observacao
      ) VALUES (
        v_plan_prod[i],
        NULL,
        'liberacao',
        v_plan_qtd[i],
        v_saldo_ant,
        v_saldo_pos,
        v_plan_res[i],
        'reserva_estoque',
        v_uid,
        'Liberação de reserva por cancelamento (Modelo 2) pedido ' || p_pedido_id::text
      );

      UPDATE public.reservas_estoque
         SET status = 'liberada'
       WHERE id = v_plan_res[i];
    ELSE
      -- Restante 0: já totalmente retirado (regra 0087) — sem crédito/ledger.
      UPDATE public.reservas_estoque
         SET status = 'consumida'
       WHERE id = v_plan_res[i];
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status',   'liberado',
    'reservas', v_plan_n,
    'unidades', (SELECT COALESCE(SUM(x), 0) FROM unnest(v_plan_qtd) AS x),
    'montagem', v_n_montagem
  );
END;
$$;

COMMENT ON FUNCTION public.liberar_pedido_atomico(uuid) IS
  '0090 (INTERNA, sem EXECUTE para anon/authenticated; rev. 1.48): libera o '
  'RESTANTE (quantidade - SUM(reserva_consumos)) das reservas ATIVAS de um pedido '
  'JÁ CANCELADO, APÓS validar TODAS as reservas (qualquer status) e a '
  'correspondência item×reserva por produto. Credita estoque_movimentacoes '
  '(tipo=liberacao, referencia_tipo=reserva_estoque, referencia_id=reserva.id, '
  'saldos reais) e mantém a quantidade original intacta. Idempotente. '
  'Consistência exigida por status: ativa = 1 débito coerente + marcador de '
  'proveniência + sem liberação prévia; consumida = débito + consumo total + sem '
  'liberação; liberada = débito + EXATAMENTE 1 liberacao coerente igual ao '
  'restante (prova de crédito); cancelada = sem prova => bloqueia. A soma das '
  'reservas ativa+consumida+LIBERADA por produto (cada uma UMA vez, com prova) '
  'deve IGUALAR a quantidade dos itens; além disso, bloqueia-se a coexistência de '
  'ativa com liberada no mesmo pedido (liberação anterior segurando estoque). '
  'Qualquer dúvida => reconciliacao_pendente SEM crédito. ja_liberado só quando '
  'nada ativo E tudo comprovado (nunca presumido) — inclusive após liberação '
  'integral (retry idempotente). Sem a tabela de proveniência '
  '(0092) ou com controlado=false => reservas ativas ficam fail-closed (nada '
  'liberado). Itens de montagem (produto_id NULL) ficam fora do estoque e são '
  'contados em montagem. Locks: pedidos -> produtos(id) -> reservas_estoque(id). '
  'Deve ser chamada por uma futura operação transacional de cancelamento (que '
  'DEVE converter reconciliacao_pendente em exceção para rollback); NÃO autoriza '
  'cancelamento por si só.';

-- ----------------------------------------------------------------------------
-- Permissões: função INTERNA. Revoga o EXECUTE default (PUBLIC) e de anon/
-- authenticated; SEM GRANT residual. Só o owner (e a futura orquestradora
-- DEFINER, que roda com privilégios do owner) pode executar.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM PUBLIC, anon, authenticated;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0090

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0091 (verbatim de drizzle/migrations/0091_registrar_consumo_reserva.sql)
--     SHA-256 do arquivo de origem : bf2fda366dc4e5cfbcdd461466e7527e42f8c46d0a5908434539d86907a93397
--     bytes do arquivo de origem   : 25230
--     natureza                     : ATIVA
--     objetos                      : RPC `registrar_consumo_reserva` (retirada fisica parcial/total, idempotente)
-- ==========================================================================
-- 0091: registrar_consumo_reserva — retirada física parcial/total do freezer (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente isolado antes.
--
-- REVISÃO 1.37 (auditoria 1.36): (1) removida a delegação de funcionário —
--   executor é SEMPRE auth.uid(); (2) idempotência passa a comparar observação
--   e produto; (3) sem GRANT a service_role; (4) trava pedido->produto->reserva
--   mantida, com ABORTO se a reserva mudar entre as leituras; (5) status de
--   retirada justificados. Nenhum efeito em dados (função inerte).
-- REVISÃO 1.39 (integração da proveniência): corrigida a IDEMPOTÊNCIA — a
--   comparação passa a usar o produto EFETIVO da reserva (e não o parâmetro
--   opcional p_produto_id), eliminando o falso 'chave_conflito' no replay que
--   OMITE p_produto_id; p_produto_id, quando informado, é VALIDADO contra o
--   produto da reserva. Replay após retirada completa continua 'ja_registrado'
--   (sem duplicar consumo). Nenhum efeito em dados (função inerte).
--
-- O QUE É: RPC que REGISTRA a retirada física de unidades de uma reserva
-- (parcial ou total), de forma transacional, idempotente e auditável, gravando
-- APENAS em reserva_consumos (0087). NÃO debita produtos.estoque de novo.
--
-- MODELO 2 (etapas 1.18–1.37):
--   - produtos.estoque = saldo DISPONÍVEL (líquido de reservas);
--   - a reserva debita o disponível UMA única vez (0088/0089);
--   - a RETIRADA do freezer apenas CONSOME a reserva (esta função) — sem 2ª baixa;
--   - o cancelamento devolve SOMENTE o não consumido (0090);
--   - físico = disponível + Σ(quantidade − consumido) das reservas ativas.
--
-- ============================================================================
-- CONTRATO DA RPC (Etapa B — 1.37)
-- ============================================================================
--   public.registrar_consumo_reserva(
--     p_reserva_id     uuid,        -- obrigatório: reserva a consumir
--     p_quantidade     integer,     -- obrigatório: > 0 e <= restante
--     p_idem_key       uuid,        -- obrigatório: chave idempotente do app
--     p_produto_id     uuid,        -- OPCIONAL: confirmação do produto da reserva
--     p_observacao     text         -- OPCIONAL
--   ) RETURNS jsonb
--   (SEM parâmetro de delegação: o executor é SEMPRE auth.uid() — 1.37/B.1.)
--
--   Contrato de retorno (jsonb; NUNCA dados pessoais — só uuid/inteiros):
--     {"status":"consumido","reserva_id":..,"quantidade":Q,
--      "consumido_total":T,"restante":R}       retirada registrada
--     {"status":"ja_registrado","reserva_id":..} replay idempotente (mesma operação)
--     {"status":"chave_conflito"}               mesma idem_key com operação diferente
--     {"status":"permissao_negada"}             sem auth OU sem papel operacional
--     {"status":"entrada_invalida"}             p_reserva_id/p_idem_key nulos
--     {"status":"quantidade_invalida"}          p_quantidade nula/<=0
--     {"status":"reserva_invalida"}             reserva inexistente/produto nulo/incoerente/mudou
--     {"status":"reserva_encerrada"}            status != 'ativa' (liberada/cancelada/consumida)
--     {"status":"produto_divergente"}           p_produto_id != produto da reserva
--     {"status":"pedido_invalido"}              pedido da reserva inexistente
--     {"status":"status_invalido"}              pedido 'entregue'/'cancelado'
--     {"status":"acima_do_restante"}            p_quantidade > (quantidade − consumido)
--     {"status":"reconciliacao_pendente"}       reserva SEM origem comprovada no ledger
--   - Erro técnico NÃO é capturado: propaga => rollback integral (contrato 0087/0090).
--
-- ============================================================================
-- AUTORIZAÇÃO (Etapa A/1.37: mecanismo REAL de identidade)
-- ============================================================================
--   - NÃO existe autenticação por PIN no banco. "PIN" é apenas conteúdo de UI de
--     preview (src/routes/preview/cozinha-inteligente.tsx: "PIN fictício");
--     nenhuma tabela/coluna/função usa PIN.
--   - Identidade confiável = auth.uid() (jamais parâmetro do cliente).
--   - Papéis reais: public.app_role (0000/0003) consultados via public.has_role().
--   - OPERAÇÃO INTERNA: só admin/producao/atendente registram retirada
--     (paridade operacional 0084 retirar_pedido_cliente). O DONO do pedido
--     (cliente) NÃO consome reserva — retirada do freezer é ato da cozinha.
--   - 1.37/B.1: SEM delegação. O registro grava SEMPRE auth.uid(); não há
--     parâmetro para "consumo em nome de terceiros" (elimina caminho ambíguo).
--
-- ============================================================================
-- IDEMPOTÊNCIA (Etapa B — 1.37/B.2; corrigida na 1.39/E)
-- ============================================================================
--   - idem_key UNIQUE (0087). Replay (MESMA chave + MESMA operação:
--     reserva, PRODUTO EFETIVO da reserva, quantidade, funcionário e
--     OBSERVAÇÃO) => 'ja_registrado'.
--   - A comparação de produto usa o produto EFETIVO da reserva (v_reserva_prod),
--     NÃO o parâmetro opcional p_produto_id. Assim, um replay LEGÍTIMO que OMITE
--     p_produto_id devolve 'ja_registrado' (antes devolvia 'chave_conflito').
--   - Se p_produto_id for INFORMADO, é validado contra o produto da reserva antes
--     da idempotência: divergência => 'produto_divergente'.
--   - MESMA chave com QUALQUER dado relevante diferente (inclui observação,
--     comparação NULL-safe) => 'chave_conflito' (rejeitado).
--   - A idempotência é avaliada ANTES da guarda de pedido fechado: o replay é
--     'ja_registrado' (e o conflito de chave é 'chave_conflito') mesmo se o
--     pedido já estiver 'entregue'/'cancelado'; replay NÃO cria histórico novo.
--   - Replay após retirada COMPLETA (reserva já 'consumida'): devolvido
--     'ja_registrado' => não duplica consumo.
--   - Concorrência de mesma chave: INSERT ... ON CONFLICT (idem_key) DO NOTHING
--     seguido de re-leitura; nunca duplica.
--
-- ============================================================================
-- ORDEM DE LOCKS (canônica, igual a 0089/0090) — 1.37/B.4
-- ============================================================================
--   L1 pedidos (FOR UPDATE) -> L2 produtos(id) (FOR UPDATE) ->
--   L3 reservas_estoque(id) (FOR UPDATE). reserva_consumos é INSERT (a própria
--   linha); o restante é lido sob L3, o que SERIALIZA com a 0090 (que trava a
--   mesma reserva em L3 antes de liberar). Sem deadlock com 0089/0090 (mesma
--   ordem de aquisição).
--   A trava de produto NÃO é movida para depois da reserva (manteria a ordem).
--   Para cobrir eventual mudança da reserva entre as leituras, o produto_id
--   lido sob L3 é COMPARADO ao produto travado em L2; se divergir (ou for nulo),
--   a função INTERROMPE sem escrever ('reserva_invalida').
--
-- ============================================================================
-- ORIGEM COMPROVADA (proteção contra histórico fictício)
-- ============================================================================
--   Só consome reserva cuja origem no ledger é EXATA (mesma regra da 0090):
--     - exatamente 1 movimento 'reserva' com referencia_tipo='reserva_estoque'
--       e referencia_id = reserva.id;
--     - quantidade NÃO nula, NEGATIVA; mesmo produto; saldos anterior/posterior
--       NÃO nulos e consistentes (posterior = anterior + quantidade);
--     - débito total (= -Σquantidade) EXATAMENTE igual a reservas_estoque.quantidade;
--     - NENHUMA movimentação 'liberacao' prévia para a reserva.
--   Qualquer desvio => 'reconciliacao_pendente' SEM escrever. Isso bloqueia as
--   19 reservas antigas (sem origem no ledger) e qualquer registro sem débito.
--   Checagens de NULL são EXPLÍCITAS (em SQL, NULL <> x é NULL, não TRUE).
--
--   GUARDA ADICIONAL DE PEDIDO FECHADO: pedido 'entregue'/'cancelado' =>
--   'status_invalido'. Impede criar histórico novo de consumo em pedidos antigos
--   (as 19 reservas pertencem a pedidos 'entregue'). REGRA DE SEGURANÇA, não
--   política comercial nova — deve ser confirmada na ativação.
--
--   LIMITAÇÃO DE PROVENIÊNCIA (registrada na 1.36/1.37; integração 1.39): a
--   origem no ledger prova o DÉBITO, não que as unidades permaneçam no freezer.
--   Reservas criadas ANTES da ativação da retirada podem ter consumo físico não
--   registrado. O marcador por reserva (0092) é criado por 0088/0089 e EXIGIDO
--   pela 0090; esta 0091 continua baseada na origem no ledger (a 0092 exige a
--   ativação coordenada documentada na 1.39).
--
-- ============================================================================
-- ELEGIBILIDADE DE STATUS PARA RETIRADA FÍSICA (1.37/B.7 — justificativa)
-- ============================================================================
--   A retirada do freezer ocorre durante a PREPARAÇÃO do pedido, que atravessa
--   vários status. Bloqueiam-se apenas os estados ENCERRADOS:
--     - 'recebido'          : pedido aceito; a cozinha pode começar a retirar
--                             unidades antes de o status virar 'em_producao'
--                             (a transição é um passo manual/sistêmico). PERMITE.
--     - 'em_producao'       : preparo em curso; retirada típica. PERMITE.
--     - 'pronto'            : finalizado; unidades já retiradas/embaladas. PERMITE.
--     - 'aguardando_motoboy': pronto aguardando coleta; correção tardia. PERMITE.
--     - 'em_rota'           : em entrega; permitir correção tardia é inócuo, pois
--                             a quantidade é SEMPRE limitada pelo restante.
--     - 'entregue'          : ENCERRADO. BLOQUEIA — impede histórico fictício
--                             (as 19 reservas antigas pertencem a 'entregue').
--     - 'cancelado'         : ENCERRADO. BLOQUEIA — retirada após cancelamento
--                             conflitaria com a liberação (0090).
--   Isto é um LIMITE DE SEGURANÇA (não cria regra comercial). Qualquer mudança
--   exigiria autorização expressa.
--
-- ============================================================================
-- DEPENDÊNCIAS (devem existir no ambiente alvo)
-- ============================================================================
--   - 0087 reserva_consumos (tabela alvo; escrita append-only);
--   - 0042 estoque_movimentacoes (leitura de origem: referencia_id/tipo/saldos);
--   - 0023 reservas_estoque (status ativa|liberada|consumida|cancelada);
--   - 0023 pedido_itens (produto pertence ao pedido);
--   - 0000/0003 pedidos, produtos, has_role(), app_role.
--   - Se 0087 não existir, a chamada FALHA explicitamente ("relation does not
--     exist") => rollback; nunca grava parcial. (Dependência dura, como a 0090.)
--
-- ============================================================================
-- NÃO FAZER AQUI (escopo)
-- ============================================================================
--   - NÃO altera produtos.estoque (o débito ocorreu na reserva);
--   - NÃO grava em estoque_mov;
--   - NÃO preenche reserva_consumos de pedidos antigos;
--   - NÃO libera/credita reservas; NÃO reconcilia as 19 reservas antigas;
--   - NÃO altera status do pedido; NÃO grava histórico;
--   - NÃO expira reservas; NÃO cria política de pagamento;
--   - NÃO implementa o marcador de proveniência (desenhado para a 0090).
--
-- ============================================================================
-- SEGURANÇA (1.37/B.5)
-- ============================================================================
--   - SECURITY DEFINER + SET search_path = public; TODAS as referências são
--     schema-qualificadas (public.*) — evitam sequestro por objetos em public;
--     pg_catalog permanece implícito (jsonb_build_object/COALESCE não sequestráveis);
--   - EXECUTE: revogado de PUBLIC/anon/service_role; concedido SOMENTE a
--     authenticated. A função nega internamente quem não tem papel operacional;
--   - SEM GRANT a service_role: o contrato NÃO depende disso — não há job de
--     servidor que registre retirada física, e service_role não possui auth.uid()
--     (seria negado de qualquer forma via 'permissao_negada');
--   - identidade do registro = SEMPRE auth.uid();
--   - sem EXCEPTION WHEN OTHERS (falhas propagam => rollback);
--   - RLS: owner ignora RLS (nenhuma tabela usa FORCE RLS).
--
-- ============================================================================
-- REVERSÃO
-- ============================================================================
--   DROP FUNCTION IF EXISTS public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text);
--   Função INERTE (nada a chama) => sem efeitos em dados. A tabela
--   reserva_consumos (0087) permanece como arquivo histórico.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_consumo_reserva(
  p_reserva_id     uuid,
  p_quantidade     integer,
  p_idem_key       uuid,
  p_produto_id     uuid DEFAULT NULL,
  p_observacao     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_pedido_id      uuid;
  v_reserva_prod   uuid;   -- produto EFETIVO da reserva (lido no passo 2)
  v_pedido_status  public.order_status;
  v_eh_staff       boolean;
  v_produto_lock   uuid;   -- produto travado em L2 (lido antes do L3)
  v_produto_id     uuid;   -- produto relido SOB L3 (deve coincidir com o travado)
  v_reserva_qtd    integer;
  v_reserva_status text;
  v_prev           public.reserva_consumos;
  v_prod_n         integer;
  v_pertence       integer;
  v_mov_n          integer;
  v_mov_bad        integer;
  v_lib_ant        integer;
  v_debitado       bigint;
  v_consumido      bigint;
  v_restante       bigint;
  v_novo_total     bigint;
  v_new_id         uuid;
BEGIN
  -- 0. Identidade (auth.uid() é a única fonte; PIN não é identidade no banco).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 1. Entradas obrigatórias.
  IF p_reserva_id IS NULL OR p_idem_key IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RETURN jsonb_build_object('status', 'quantidade_invalida');
  END IF;

  -- 2. Leitura preliminar da reserva (sem lock) para descobrir o pedido e o
  --    produto EFETIVO (usado na idempotência — corrige o replay sem p_produto_id).
  SELECT pedido_id, produto_id
    INTO v_pedido_id, v_reserva_prod
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  -- 3. L1: travar o pedido (ORDEM CANÔNICA: pedidos -> produtos -> reservas).
  SELECT status
    INTO v_pedido_status
  FROM public.pedidos
  WHERE id = v_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 4. Autorização: SOMENTE staff operacional (retirada é operação interna).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');
  IF NOT v_eh_staff THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 5. (1.37/B.1) SEM delegação. O executor é SEMPRE auth.uid(). Não há
  --    parâmetro de funcionário; nenhum caminho grava em nome de terceiros.

  -- 5b. (1.39/E) Correspondência com o produto EFETIVO da reserva. Se o cliente
  --     informar p_produto_id, ele DEVE coincidir com o produto da reserva. Vale
  --     também para replay (antes da idempotência) => uma operação divergente não
  --     é aceita como "mesma operação".
  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_reserva_prod THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

  -- 6. Idempotência (pré-checagem sob L1) — executada ANTES da guarda de pedido
  --    fechado (1.39/E): um REPLAY (mesma chave + mesma operação) é SEMPRE
  --    'ja_registrado' e um conflito de chave é SEMPRE 'chave_conflito', mesmo
  --    que o pedido já tenha evoluído para 'entregue'/'cancelado' — replay NÃO
  --    cria histórico novo (nada é escrito antes do passo 13). Isto também cobre
  --    o replay APÓS retirada completa, sem duplicar consumo.
  --    Comparação NULL-safe inclui reserva, produto EFETIVO da reserva,
  --    quantidade, funcionário (=auth.uid()) e OBSERVAÇÃO. Comparar com
  --    v_reserva_prod (e não com o parâmetro opcional) corrige o replay legítimo
  --    que OMITE p_produto_id — que antes devolvia 'chave_conflito'.
  SELECT *
    INTO v_prev
  FROM public.reserva_consumos
  WHERE idem_key = p_idem_key;
  IF FOUND THEN
    IF v_prev.reserva_id = p_reserva_id
       AND v_prev.funcionario_id = v_uid
       AND v_prev.quantidade = p_quantidade
       AND v_prev.produto_id IS NOT DISTINCT FROM v_reserva_prod
       AND v_prev.observacao IS NOT DISTINCT FROM p_observacao THEN
      RETURN jsonb_build_object('status', 'ja_registrado', 'reserva_id', p_reserva_id);
    ELSE
      RETURN jsonb_build_object('status', 'chave_conflito');
    END IF;
  END IF;

  -- 7. Guarda de pedido fechado: não cria histórico NOVO em entregue/cancelado.
  --    (Um replay já retornou acima; só chega aqui uma operação inédita.)
  IF v_pedido_status IN ('entregue', 'cancelado') THEN
    RETURN jsonb_build_object('status', 'status_invalido');
  END IF;

  -- 8. Produto da reserva + L2: travar o produto (ANTES da reserva).
  SELECT produto_id
    INTO v_produto_lock
  FROM public.reservas_estoque
  WHERE id = p_reserva_id;
  IF v_produto_lock IS NULL THEN
    -- produto ausente (FK ON DELETE SET NULL): não há o que consumir.
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  SELECT COUNT(*)
    INTO v_prod_n
  FROM public.produtos
  WHERE id = v_produto_lock;
  IF v_prod_n = 0 THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  PERFORM 1
  FROM public.produtos
  WHERE id = v_produto_lock
  FOR UPDATE;

  -- 9. L3: travar a reserva e revalidar sob lock.
  SELECT produto_id, quantidade, status
    INTO v_produto_id, v_reserva_qtd, v_reserva_status
  FROM public.reservas_estoque
  WHERE id = p_reserva_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  -- 9a. Consistência entre leituras (1.37/B.4): se o produto da reserva mudou
  --     entre a leitura de L2 e o lock de L3, ABORTA sem escrever (a trava seria
  --     do produto errado). Não se "corrige" movendo o lock; aborta-se.
  IF v_produto_id IS NULL OR v_produto_id IS DISTINCT FROM v_produto_lock THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;
  IF v_reserva_status <> 'ativa' THEN
    RETURN jsonb_build_object('status', 'reserva_encerrada');
  END IF;
  IF p_produto_id IS NOT NULL AND p_produto_id IS DISTINCT FROM v_produto_id THEN
    RETURN jsonb_build_object('status', 'produto_divergente');
  END IF;

  -- 10. Coerência: o produto da reserva pertence ao pedido da reserva
  --     (item direto OU componente de combo modelado).
  SELECT COUNT(*)
    INTO v_pertence
  FROM public.pedido_itens i
  WHERE i.pedido_id = v_pedido_id
    AND (
      i.produto_id = v_produto_id
      OR EXISTS (
        SELECT 1 FROM public.pedido_item_componentes c
         WHERE c.pedido_item_id = i.id AND c.produto_id = v_produto_id
      )
    );
  IF v_pertence = 0 THEN
    RETURN jsonb_build_object('status', 'reserva_invalida');
  END IF;

  -- 11. Origem comprovada no ledger (mesma regra da 0090). Bloqueia reservas
  --     antigas sem origem e impediria consumo de reserva nunca debitada.
  SELECT COUNT(*),
         COALESCE(SUM(-em.quantidade), 0),
         COUNT(*) FILTER (
           WHERE em.quantidade IS NULL
              OR em.quantidade >= 0
              OR em.produto_id IS NULL
              OR em.produto_id IS DISTINCT FROM v_produto_id
              OR em.saldo_anterior IS NULL
              OR em.saldo_posterior IS NULL
              OR em.saldo_posterior <> em.saldo_anterior + em.quantidade
         )
    INTO v_mov_n, v_debitado, v_mov_bad
  FROM public.estoque_movimentacoes em
  WHERE em.referencia_tipo = 'reserva_estoque'
    AND em.referencia_id = p_reserva_id
    AND em.tipo = 'reserva';

  SELECT COUNT(*)
    INTO v_lib_ant
  FROM public.estoque_movimentacoes
  WHERE referencia_tipo = 'reserva_estoque'
    AND referencia_id = p_reserva_id
    AND tipo = 'liberacao';

  IF v_mov_n <> 1
     OR v_mov_bad <> 0
     OR v_debitado <> v_reserva_qtd::bigint
     OR v_lib_ant <> 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'reserva_id', p_reserva_id);
  END IF;

  -- 12. Restante físico ainda no freezer (calculado sob L3).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_consumido
  FROM public.reserva_consumos
  WHERE reserva_id = p_reserva_id;

  v_restante := v_reserva_qtd::bigint - v_consumido;
  IF v_restante <= 0 THEN
    RETURN jsonb_build_object('status', 'reserva_encerrada');
  END IF;
  IF p_quantidade::bigint > v_restante THEN
    RETURN jsonb_build_object('status', 'acima_do_restante', 'restante', v_restante);
  END IF;

  -- 13. Registro append-only (NÃO debita produtos.estoque de novo).
  --     funcionario_id = auth.uid() (sem delegação).
  INSERT INTO public.reserva_consumos (
    reserva_id, pedido_id, produto_id, quantidade, funcionario_id, idem_key, observacao
  ) VALUES (
    p_reserva_id, v_pedido_id, v_produto_id, p_quantidade, v_uid, p_idem_key, p_observacao
  )
  ON CONFLICT (idem_key) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    -- Corrida: a mesma chave apareceu concorrentemente. Reavaliar replay/conflito
    -- com a MESMA comparação NULL-safe (produto EFETIVO + observação).
    SELECT *
      INTO v_prev
    FROM public.reserva_consumos
    WHERE idem_key = p_idem_key;
    IF v_prev.reserva_id = p_reserva_id
       AND v_prev.funcionario_id = v_uid
       AND v_prev.quantidade = p_quantidade
       AND v_prev.produto_id IS NOT DISTINCT FROM v_reserva_prod
       AND v_prev.observacao IS NOT DISTINCT FROM p_observacao THEN
      RETURN jsonb_build_object('status', 'ja_registrado', 'reserva_id', p_reserva_id);
    ELSE
      RETURN jsonb_build_object('status', 'chave_conflito');
    END IF;
  END IF;

  -- 14. Restante zero => reserva 'consumida' (o saldo já foi debitado na reserva).
  v_novo_total := v_consumido + p_quantidade;
  IF v_novo_total >= v_reserva_qtd::bigint THEN
    UPDATE public.reservas_estoque
       SET status = 'consumida'
     WHERE id = p_reserva_id;
  END IF;

  RETURN jsonb_build_object(
    'status',           'consumido',
    'reserva_id',       p_reserva_id,
    'quantidade',       p_quantidade,
    'consumido_total',  v_novo_total,
    'restante',         GREATEST(v_reserva_qtd::bigint - v_novo_total, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) IS
  '0091 (Modelo 2, rev. 1.39): registra retirada física parcial/total de uma '
  'reserva em reserva_consumos (append-only, idempotente por idem_key). Replay '
  'exige mesmos reserva/quantidade/funcionário/observação e compara o produto '
  'EFETIVO da reserva (não o parâmetro opcional), de modo que replay que OMITE '
  'p_produto_id devolve ja_registrado; p_produto_id informado é validado '
  '(divergência => produto_divergente); replay após retirada completa => '
  'ja_registrado sem duplicar consumo. NÃO debita '
  'produtos.estoque de novo. Executor = SEMPRE auth.uid() (sem delegação). Só '
  'aceita reserva ATIVA com origem EXATA no ledger (1 movimento reserva coerente, '
  'débito = quantidade, sem liberacao prévia) e pedido não fechado '
  '(entregue/cancelado => status_invalido): bloqueia histórico fictício e as 19 '
  'reservas antigas (reconciliacao_pendente). Só staff operacional '
  '(admin/producao/atendente). Locks L1 pedidos -> L2 produtos(id) -> L3 '
  'reservas_estoque(id), com ABORTO se a reserva mudar entre leituras, compatível '
  'com 0089/0090. Restante zero => reserva consumida. Retorno jsonb classificado, '
  'sem dados pessoais.';

-- ----------------------------------------------------------------------------
-- Permissões: SOMENTE authenticated (nunca anon/PUBLIC/service_role).
-- A função nega internamente quem não tem papel operacional.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text)
  TO authenticated;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0091

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0092 (verbatim de drizzle/migrations/0092_reserva_proveniencia.sql)
--     SHA-256 do arquivo de origem : 1c50a8340326f2bf0798c51f84a8776a632387734105c797e6114aa9760692db
--     bytes do arquivo de origem   : 12352
--     natureza                     : ESTRUTURAL
--     objetos                      : tabelas `reserva_proveniencia` + `reserva_proveniencia_config` (origem do `controlado`)
-- ==========================================================================
-- 0092: reserva_proveniencia — marcador de proveniência confiável (Modelo 2)
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente isolado antes.
--
-- O QUE É: tabela ADITIVA que registra, por reserva, a PROVA de que o débito no
-- ledger foi feito por um caminho transacional confiável (0088/0089) E de que a
-- reserva nasceu sob controle obrigatório de retirada física. É o MARCADOR de
-- proveniência que a 0090 (futuro) exigirá para liberar/devolver saldo.
--
-- PROBLEMA QUE RESOLVE (Etapa 1.36/1.37):
--   A origem no ledger (1 movimento 'reserva' coerente) prova o DÉBITO, mas NÃO
--   que as unidades permaneçam no freezer. Sem este marcador, a 0090 poderia
--   devolver integralmente uma reserva cujo consumo físico não foi registrado
--   (janela "0089 sem 0091"). O marcador distingue:
--     (a) reserva antiga sem histórico confiável     -> SEM marcador -> NÃO libera
--     (b) nova com débito mas sem garantia de registro-> SEM marcador -> NÃO libera
--     (c) criada sob controle obrigatório de retirada -> COM marcador -> liberável
--     (d) totalmente consumida (status 'consumida')   -> 0090 ignora (sem crédito)
--     (e) parcialmente consumida ('ativa' + marcador) -> libera (quantidade-Σ)
--     (f) não consumida confiável ('ativa' + marcador)-> libera a reserva inteira
--
-- NÃO USA created_at COMO PROVA: a confiança vem da EXISTÊNCIA da linha do
-- marcador (persistente e verificável), inserida SOMENTE na mesma transação que
-- cria a reserva e comprova o débito. Reservas anteriores NUNCA são marcadas
-- automaticamente (sem gatilho de backfill; ver C.5/C.6).
--
-- ============================================================================
-- ESTRUTURA (Etapa B)
-- ============================================================================
--   public.reserva_proveniencia
--     reserva_id             uuid PRIMARY KEY
--     pedido_id              uuid NOT NULL
--     produto_id             uuid NOT NULL  REFERENCES produtos(id)   (RESTRICT)
--     quantidade             integer NOT NULL CHECK (> 0)
--     origem                 text NOT NULL CHECK (IN ('0088','0089'))
--     estoque_movimentacao_id uuid NOT NULL UNIQUE REFERENCES estoque_movimentacoes(id) (RESTRICT)
--     criado_em              timestamptz NOT NULL DEFAULT now()
--     criado_por             uuid REFERENCES auth.users(id) (SET NULL)
--     FK COMPOSTA (reserva_id, pedido_id, produto_id, quantidade)
--       REFERENCES reservas_estoque(id, pedido_id, produto_id, quantidade)
--   - A FK composta GARANTE, por constraint, que o marcador não pode apontar para
--     OUTRO pedido/produto/quantidade da reserva (não só outro id).
--   - UNIQUE(estoque_movimentacao_id): um marcador por movimento de débito
--     (impede reutilizar o mesmo débito em dois marcadores).
--
--   Estrutura de apoio (para permitir a FK composta):
--     ALTER TABLE reservas_estoque ADD CONSTRAINT reservas_estoque_prov_uk
--       UNIQUE (id, pedido_id, produto_id, quantidade);
--     (id já é PK; o índice é aditivo e sempre único. quantidade é imutável após
--      a criação nos fluxos atuais — 0090/0091 não a alteram.)
--
-- ============================================================================
-- CONFIGURAÇÃO DE ATIVAÇÃO (Etapa D) — ESTADO INICIAL: DESATIVADO
-- ============================================================================
--   public.reserva_proveniencia_config (singleton id=true)
--     id boolean PRIMARY KEY DEFAULT true CHECK (id = true)
--     controlado boolean NOT NULL DEFAULT false   <-- DESATIVADO
--     ativado_em timestamptz
--     ativado_por uuid REFERENCES auth.users(id) (SET NULL)
--     observacao text
--   - Inserida com controlado = false. NÃO é ligada por migration.
--   - NÃO há RPC pública para ativar. A ativação futura exige as garantias
--     operacionais da Etapa D e é feita por caminho autorizado (fora desta migração).
--   - 0088/0089 (futuras) só inserirão o marcador quando controlado = true; assim
--     NENHUM marcador existe antes do regime controlado entrar em vigor.
--
-- ============================================================================
-- SEGURANÇA (Etapa C)
-- ============================================================================
--   - RLS HABILITADA nas duas tabelas.
--   - NENHUM INSERT/UPDATE/DELETE cedido a anon/authenticated (só SELECT, filtrado
--     por RLS). Escrita EXCLUSIVA do owner (funções SECURITY DEFINER) e service_role.
--   - SEM gatilhos de backfill; uma simples mudança de status NÃO cria marcador.
--   - Sem funções nesta migração (DDL aditiva). A criação do marcador será feita
--     por 0088/0089 (futuro) com SECURITY DEFINER + SET search_path = public.
--
-- ============================================================================
-- DEPENDÊNCIAS
-- ============================================================================
--   - 0023 reservas_estoque (id, pedido_id, produto_id, quantidade);
--   - 0023/0042 produtos, estoque_movimentacoes(id);
--   - 0000 profiles/auth.users, has_role(); 0003 app_role.
--
-- ============================================================================
-- NÃO FAZER AQUI (escopo)
-- ============================================================================
--   - NÃO cria marcadores para reservas existentes (nem as 19 antigas);
--   - NÃO liga `controlado`;
--   - NÃO cria RPC de ativação;
--   - NÃO altera 0087–0091;
--   - NÃO altera dados de reservas/pedidos/estoque.
--
-- ============================================================================
-- REVERSÃO
-- ============================================================================
--   Função/tabela INERTE (nada as usa ainda). Reverter apenas se vazias:
--     DROP TABLE IF EXISTS public.reserva_proveniencia;
--     DROP TABLE IF EXISTS public.reserva_proveniencia_config;
--     ALTER TABLE public.reservas_estoque DROP CONSTRAINT IF EXISTS reservas_estoque_prov_uk;
--   APÓS uso real: NÃO excluir marcadores como procedimento; reverter apenas o
--   CÓDIGO dependente e manter o histórico.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Base para a FK composta (aditivo; idempotente)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_estoque_prov_uk'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque
      ADD CONSTRAINT reservas_estoque_prov_uk
      UNIQUE (id, pedido_id, produto_id, quantidade);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Marcador de proveniência
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_proveniencia (
  reserva_id              uuid PRIMARY KEY,
  pedido_id               uuid NOT NULL,
  produto_id              uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade              integer NOT NULL CHECK (quantidade > 0),
  origem                  text NOT NULL CHECK (origem IN ('0088', '0089')),
  estoque_movimentacao_id uuid NOT NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  criado_por              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT reserva_proveniencia_mov_uk
    UNIQUE (estoque_movimentacao_id),
  CONSTRAINT reserva_proveniencia_reserva_fk
    FOREIGN KEY (reserva_id, pedido_id, produto_id, quantidade)
    REFERENCES public.reservas_estoque (id, pedido_id, produto_id, quantidade)
    ON DELETE RESTRICT
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_proveniencia_mov_fk'
      AND conrelid = 'public.reserva_proveniencia'::regclass
  ) THEN
    ALTER TABLE public.reserva_proveniencia
      ADD CONSTRAINT reserva_proveniencia_mov_fk
      FOREIGN KEY (estoque_movimentacao_id)
      REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reserva_proveniencia_pedido_idx
  ON public.reserva_proveniencia (pedido_id);
CREATE INDEX IF NOT EXISTS reserva_proveniencia_produto_idx
  ON public.reserva_proveniencia (produto_id);

-- ----------------------------------------------------------------------------
-- 3. Configuração de ativação (singleton, DESATIVADO)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reserva_proveniencia_config (
  id          boolean PRIMARY KEY DEFAULT true,
  controlado  boolean NOT NULL DEFAULT false,
  ativado_em  timestamptz,
  ativado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao  text,
  CONSTRAINT reserva_proveniencia_config_single CHECK (id = true)
);
INSERT INTO public.reserva_proveniencia_config (id, controlado)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. RLS (habilitada; escrita negada a anon/authenticated)
-- ----------------------------------------------------------------------------
ALTER TABLE public.reserva_proveniencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia leitura staff" ON public.reserva_proveniencia;
CREATE POLICY "reserva_proveniencia leitura staff" ON public.reserva_proveniencia
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'financeiro')
  );

ALTER TABLE public.reserva_proveniencia_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config;
CREATE POLICY "reserva_proveniencia_config leitura admin" ON public.reserva_proveniencia_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- 5. Grants (mínimos; SEM escrita para anon/authenticated)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.reserva_proveniencia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia TO authenticated;   -- RLS filtra por perfil
GRANT ALL ON public.reserva_proveniencia TO service_role;

REVOKE ALL ON public.reserva_proveniencia_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reserva_proveniencia_config TO authenticated;  -- RLS filtra (admin)
GRANT ALL ON public.reserva_proveniencia_config TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Documentação
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.reserva_proveniencia IS
  '0092: marcador de proveniência confiável (Modelo 2). Existência = reserva '
  'criada por caminho transacional confiável (0088/0089) sob controle de retirada. '
  'Ausência = reserva NÃO confiável (antiga ou sem garantia de registro) e NÃO '
  'liberável. Escrita apenas por função SECURITY DEFINER; nenhum backfill.';
COMMENT ON COLUMN public.reserva_proveniencia.estoque_movimentacao_id IS
  '0092: id do movimento de débito (estoque_movimentacoes) que comprova a baixa. '
  'Único por marcador; amarra o marcador ao débito real.';
COMMENT ON COLUMN public.reserva_proveniencia.origem IS
  '0092: caminho técnico que criou a reserva (0088 individual / 0089 por pedido).';
COMMENT ON TABLE public.reserva_proveniencia_config IS
  '0092: configuração de ativação do controle de proveniência. Inicia DESATIVADO '
  '(controlado=false). Não é ligada por migration; exige garantias operacionais.';
COMMENT ON COLUMN public.reserva_proveniencia_config.controlado IS
  '0092: false = 0088/0089 NÃO inserem marcador (sistema conservador; 0090 não '
  'libera). true = regime controlado ativo (só após autorização e comprovação).';

-- ==========================================================================
-- <<< FIM DA MIGRATION 0092

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0093 (verbatim de drizzle/migrations/0093_cancelar_pedido_atomico.sql)
--     SHA-256 do arquivo de origem : 271c73541e394cb09bdfc3598b39ea7fd65f3a089902dcdee39847e94da4af84
--     bytes do arquivo de origem   : 31381
--     natureza                     : ATIVA
--     objetos                      : RPC `cancelar_pedido_atomico` (cancelamento com liberacao correta)
-- ==========================================================================
-- 0093: cancelar_pedido_atomico — CANCELAMENTO transacional (orquestrador) — Modelo 2
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA / NÃO ATIVADA NO SISTEMA.
-- Não executar sem autorização expressa. Revisão + ambiente ISOLADO antes.
--
-- O QUE É: a operação TRANSACIONAL que a 0090 exige (Tarefa 4) para cancelar um
-- pedido e liberar o restante das reservas NA MESMA transação, de forma
-- idempotente, autorizada, auditável e com rollback integral. É o ÚNICO caminho
-- previsto para substituir os 3 cancelamentos atuais (checkout/admin/cliente),
-- que hoje são multi-requisição, engolem erros e não são atômicos.
--
-- ESTA MIGRAÇÃO NÃO ALTERA CHAMADORES. A função é INERTE (nada a chama) até
-- que checkout/admin/pedido.$id sejam migrados numa etapa própria e autorizada
-- (ver seção "INTEGRAÇÃO FUTURA"). NÃO liga reserva_proveniencia_config.controlado.
--
-- REVISÃO 1.41 (correção de segurança — Etapa 1.41): (1) VALIDAÇÃO ESTRITA do
--   retorno da 0090 (rejeita SQL NULL, JSON null, status ausente, status não
--   textual, 'reconciliacao_pendente', 'status_invalido', 'pedido_invalido' e
--   qualquer valor inesperado); (2) 'ja_liberado' deixa de ser aceito quando
--   mascara AUSÊNCIA de reserva (exige reserva comprovada para itens reserváveis);
--   (3) documentadas a dependência do OWNER poder atualizar pedidos sob RLS e o
--   risco de confirmação assíncrona de Pix/cartão após o cancelamento. Nenhuma
--   alteração em 0087–0092 e nenhuma mudança de caller/permissão comercial.
--
-- REVISÃO 1.47 (integridade de reservas): a 0090 passou a validar TODAS as
--   reservas (qualquer status) e a correspondência item×reserva por produto, e
--   'ja_liberado' só é aceito quando COMPROVADO (nunca presumido). Esta
--   orquestradora já converte qualquer retorno ≠ 'liberado'/'ja_liberado' em
--   EXCEPTION (rollback integral) e já exige prova para 'ja_liberado' (9d).
--   Acrescenta-se apenas uma PRÉ-CHECAGEM alinhada: itens reserváveis exigem
--   reserva que RETENHA estoque ('ativa'/'consumida'). Nenhuma mudança de
--   política financeira nem de chamadores.
--
-- REVISÃO 1.48 (cobertura × liberação já realizada): a 0090 passou a CONTAR as
--   reservas 'liberada' (com crédito comprovado) na cobertura item×reserva, para
--   não devolver falso reconciliacao_pendente no retry idempotente de um pedido
--   já liberado. Consequência para ESTA orquestradora: a pré-checagem
--   'sem_reserva_ativa' passa a ser a ÚNICA guarda que distingue
--     (a) pedido ATIVO com reservas já liberadas (D.6) => reconciliar, de
--   (b) pedido JÁ CANCELADO com reservas liberadas (idempotência) => ja_cancelado.
--   Nenhuma mudança de autorização, política financeira, rollback ou chamadores.
--
-- MODELO 2 (etapas 1.18–1.40):
--   - produtos.estoque = saldo DISPONÍVEL (líquido de reservas);
--   - a reserva debita o disponível UMA vez (0088/0089);
--   - a retirada do freezer CONSOME a reserva sem novo débito (0087/0091);
--   - o cancelamento devolve SOMENTE o não consumido (0090);
--   - ledger de SALDO = estoque_movimentacoes (0042), tipo 'liberacao'.
--
-- ============================================================================
-- CONFERÊNCIA OBRIGATÓRIA (Etapa 1.40 / seção A) — FATOS VERIFICADOS NOS ARQUIVOS
-- ============================================================================
--   - 0087 reserva_consumos: tabela append-only; quantidade > 0; idem_key UNIQUE.
--   - 0088 reservar_estoque_atomica(uuid,uuid,integer) RETURNS boolean (INERTE).
--   - 0089 reservar_pedido_atomico(uuid) RETURNS jsonb (INERTE).
--   - 0090 liberar_pedido_atomico(uuid) RETURNS jsonb (INTERNA, INERTE); rev. 1.47:
--     só age em pedido 'cancelado'; valida TODAS as reservas (ativa/liberada/
--     consumida/cancelada) e a cobertura item×reserva; exige proveniência (0092)
--     p/ ativas e prova de crédito p/ liberadas; 'ja_liberado' só comprovado.
--   - 0091 registrar_consumo_reserva(...) RETURNS jsonb (INERTE).
--   - 0092 reserva_proveniencia + reserva_proveniencia_config(controlado=false).
--   - 0000/0022/0023/0042/0063: order_status (recebido..cancelado); pagamento_status
--     text NOT NULL DEFAULT 'pendente' CHECK IN ('pendente','pago','falhou',
--     'reembolsado'); forma_pagamento public.pagamento; pagamento_modalidade text
--     CHECK IN ('online','na_entrega'); pago_em/pagamento_em; pedido_status_historico
--     (pedido_id, de_status text, para_status text NOT NULL, actor uuid, motivo text,
--     override boolean DEFAULT false); reservas_estoque(status CHECK ativa|liberada|
--     consumida|cancelada); estoque_movimentacoes(tipo tipo_mov_estoque, quantidade<>0,
--     saldos NOT NULL, referencia_id uuid, referencia_tipo text, usuario_id NULL).
--   - 0041 validar_transicao_status: BEFORE UPDATE OF status; matriz contém
--     ('recebido','cancelado'); admin ignora; NÃO contém entregue->cancelado.
--   - 0070/0074/0077/0085 pedidos_guard_update (BEFORE UPDATE): service_role e staff
--     (admin/producao/atendente/financeiro) passam; cliente só altera o próprio
--     'recebido' -> 'cancelado' (com colunas de identidade/negócio congeladas).
--   - 0084 congelar_colunas_protegidas (BEFORE UPDATE): isenta service_role e
--     admin/financeiro; para os demais, bloqueia alteração de colunas financeiras/
--     promessa/identidade (pagamento_*, valores, cupom, pago_em/pagamento_em,
--     agendado_*, tipo_entrega, user_id). 'status' NÃO é congelado.
--   - 0084 retirar_pedido_cliente: modelo de histórico
--     INSERT ... pedido_status_historico(pedido_id,de_status,para_status,actor,motivo).
--   - NENHUM trigger em produtos/reservas_estoque reescreve ledger de saldo
--     (não há dupla baixa automática).
--   - PRÓXIMA NUMERAÇÃO LIVRE: 0093 (última aplicável era 0092). Nada sobrescrito.
--
-- ============================================================================
-- CONTRATO DA FUNÇÃO (Etapa B)
-- ============================================================================
--   public.cancelar_pedido_atomico(
--     p_pedido_id uuid,          -- obrigatório
--     p_motivo    text DEFAULT NULL  -- opcional (vai para o histórico)
--   ) RETURNS jsonb
--
--   Retorno (jsonb; NUNCA dados pessoais — só uuid/texto de status/inteiros):
--     {"status":"cancelado","pedido_id":..,"liberacao":{...}}  cancelado e liberado
--     {"status":"ja_cancelado","pedido_id":..}                 idempotente (sem escrita)
--     {"status":"entrada_invalida"}                            p_pedido_id nulo
--     {"status":"permissao_negada"}                            sem auth ou não autorizado
--     {"status":"pedido_invalido"}                             inexistente/sem itens
--     {"status":"status_invalido","atual":"entregue"}          pedido entregue
--     {"status":"requer_analise","atual":"em_producao"}        exige decisão humana
--     {"status":"pagamento_nao_elegivel","pagamento_status":"pago"}
--     {"status":"reconciliacao_pendente","motivo":"sem_reserva"|"sem_reserva_ativa"}
--   - Erro técnico NÃO é capturado: propaga => rollback integral (contrato 0087/0090).
--   - Se a 0090 devolver algo diferente de 'liberado'/'ja_liberado' => EXCEPTION
--     (força rollback do status já alterado). NUNCA converte falha em "sucesso".
--
-- ============================================================================
-- ESTADOS E PAGAMENTOS ACEITOS/BLOQUEADOS (Etapa B / seção D)
-- ============================================================================
--   ACEITO (caminho funcional da 1ª versão):
--     - status = 'recebido'  E  pagamento_status = 'pendente'.
--   BLOQUEADO por exigir decisão humana (RETURN, sem escrita):
--     - 'em_producao', 'pronto', 'aguardando_motoboy', 'em_rota' => 'requer_analise'.
--   BLOQUEADO definitivamente:
--     - 'entregue'          => 'status_invalido' (encerrado; nunca cancela).
--     - pagamento != 'pendente' ('pago' confirmado/capturado; 'falhou';
--       'reembolsado' situação não verificável) => 'pagamento_nao_elegivel'.
--   IDEMPOTENTE (sem escrita):
--     - 'cancelado' => 'ja_cancelado'.
--   INTEGRIDADE (sem escrita):
--     - sem itens => 'pedido_invalido';
--     - itens reserváveis (produto_id NOT NULL) SEM nenhuma reserva no pedido =>
--       'reconciliacao_pendente' (motivo 'sem_reserva');
--     - itens reserváveis SEM reserva que RETENHA estoque (ativa/consumida) =>
--       'reconciliacao_pendente' (motivo 'sem_reserva_ativa'; 1.47).
--   CANCELAMENTO NÃO É ESTORNO FINANCEIRO: a função NUNCA toca pagamento_status,
--   forma_pagamento, valores ou pago_em. Não há crédito/estorno aqui.
--   Só 'pendente' é elegível na 1ª versão (decisão conservadora; política de
--   pagamento/cancelamento é DECISÃO COMERCIAL pendente de autorização).
--
-- ============================================================================
-- AUTORIZAÇÃO (Etapa B / seção E)
-- ============================================================================
--   - Identidade confiável = auth.uid() (jamais parâmetro do cliente).
--   - auth.uid() nulo => 'permissao_negada' (nunca executa).
--   - AUTORIZADO: dono do pedido (pedidos.user_id = auth.uid()) OU staff
--     operacional (admin/producao/atendente — mesmo conjunto da 0084/0089/0091).
--     'financeiro' NÃO cancela (cancelamento não é operação financeira nesta versão).
--   - IMPEDE TERCEIROS: quem não é dono nem staff operacional => 'permissao_negada'
--     (avaliado ANTES de classificar status => não vaza estado do pedido a terceiros).
--   - Pedido com user_id NULL (legado/staff): só staff operacional.
--
-- ============================================================================
-- INTERAÇÃO COM A 0090 (Etapa C)
-- ============================================================================
--   Passos, NA MESMA TRANSAÇÃO e NESTA ORDEM:
--     1. validar entradas/identidade;
--     2. L1: travar o pedido (SELECT ... FOR UPDATE);
--     3. autorizar (dono OU staff);
--     4. classificar status e pagamento (SEM escrita);
--     5. verificar integridade de reserva (SEM escrita);
--     6. UPDATE pedidos.status := 'cancelado' (dispara guard 0070/0084 e matriz 0041);
--     7. chamar public.liberar_pedido_atomico(p_pedido_id) — agora vê 'cancelado';
--     8. VALIDAR o retorno: só 'liberado'/'ja_liberado' prosseguem; qualquer outro
--        valor => EXCEPTION (rollback do passo 6). Rev. 1.47: a 0090 valida TODAS
--        as reservas e a cobertura item×reserva; 'ja_liberado' é COMPROVADO;
--     9. INSERT pedido_status_historico ('recebido'->'cancelado', actor=auth.uid());
--    10. retornar {"status":"cancelado","liberacao":<retorno 0090>}.
--   - A chamada à 0090 é INTERNA (o owner do cancelador chama o owner da 0090;
--     a 0090 tem EXECUTE revogado de PUBLIC/anon/authenticated). PRÉ-REQUISITO:
--     as duas funções devem pertencer ao MESMO owner (papel que aplica migrations).
--   - ORDEM DE LOCKS (canônica, igual a 0090): L1 pedidos -> L2 produtos(id) ->
--     L3 reservas_estoque(id). A função SÓ adquire L1; L2/L3 são adquiridos pela
--     0090 na mesma ordem => sem deadlock.
--
-- ============================================================================
-- GARANTIAS DE ROLLBACK (Etapa C/F)
-- ============================================================================
--   - Se a 0090 devolver 'reconciliacao_pendente'/'status_invalido'/'pedido_invalido'
--     (ou valor inesperado) => EXCEPTION => desfaz o status e TODA a transação.
--     O pedido NUNCA fica 'cancelado' pela metade.
--   - Se o INSERT do histórico falhar => EXCEPTION => rollback total.
--   - Se QUALQUER escrita da 0090 falhar (ex.: consumo > reserva) => EXCEPTION da
--     0090 propaga => rollback total.
--   - Sem EXCEPTION WHEN OTHERS (nada é engolido — proibido neste fluxo).
--   - Colisão de status concorrente no UPDATE (0 linhas) => EXCEPTION explícita.
--   - Idempotência: 2 cancelamentos simultâneos → o 2º espera em L1, então vê
--     'cancelado' => 'ja_cancelado' (sem crédito). Replay => 'ja_cancelado'.
--   - 'reconciliacao_pendente' da PRÉ-CHEcAGEM (sem_reserva) é RETURN (nada foi
--     escrito ainda) => não há o que reverter; o chamador deve orientar retry/manual.
--
-- ============================================================================
-- COMPATIBILIDADE COM TRIGGERS REAIS CONHECIDOS (Etapa E)
-- ============================================================================
--   - 0041 validar_transicao_status: 'recebido'->'cancelado' consta da matriz.
--   - 0070/0074/0077/0085 pedidos_guard_update: staff passa; cliente passa só no
--     próprio 'recebido'->'cancelado'. A função só altera 'status'.
--   - 0084 congelar_colunas_protegidas: a função NÃO altera coluna congelada
--     (só 'status') => passa para cliente e para producao/atendente.
--   - 0084 exigir_conferencia_para_pronto: só age em em_producao->pronto (irrelevante).
--   - 0062 trigger_pagamento_confirmado: só dispara em pagamento_status->'pago'
--     (irrelevante: a função nunca altera pagamento).
--   - RLS: as tabelas NÃO usam FORCE RLS => o owner (DEFINER) ignora RLS.
--
-- ============================================================================
-- DIFERENÇAS ESTRUTURAIS DOS CAMINHOS ATUAIS (substituídos apenas no futuro)
-- ============================================================================
--   src/routes/checkout.tsx (~:585-609): RPC + UPDATE status + INSERT histórico,
--     3 requisições, erros engolidos, fallback de insert direto em reservas.
--   src/routes/admin.tsx   (~:682-695): RPC + UPDATE reservas + UPDATE pedidos,
--     3 requisições, erros engolidos, SEM histórico.
--   src/routes/pedido.$id.tsx (~:162-176): UPDATE pedidos + RPC + UPDATE reservas,
--     3 requisições, erros engolidos, SEM histórico.
--   Nenhum é transacional; todos podem deixar estoque debitado ou status parcial.
--
-- ============================================================================
-- INTEGRAÇÃO FUTURA (Etapa F) — NÃO executada nesta etapa
-- ============================================================================
--   Trocar, SIMULTANEAMENTE (para não deixar operação parcialmente migrada):
--     (1) checkout.tsx: usar reservar_pedido_atomico (0089) no nascimento e
--         cancelar_pedido_atomico (0093) na compensação; remover o fallback de
--         insert direto em reservas_estoque.
--     (2) admin.tsx mudarStatusPedido: no caminho 'cancelado', chamar 0093
--         (remover libs/updates soltos e o UPDATE direto em reservas_estoque).
--     (3) pedido.$id.tsx cancelar(): chamar 0093 (remover UPDATE + RPC + UPDATE).
--     (4) Remover TODA gravação direta em reservas_estoque fora das funções DEFINER.
--   Mudar (1)-(4) no MESMO ciclo de release evita estados mistos. Enquanto não
--   forem trocados, a 0093 é INERTE.
--
-- ============================================================================
-- ATIVAÇÃO E CONTINGÊNCIA (Etapa G) — NÃO executada aqui
-- ============================================================================
--   Ordem sugerida (com janela de manutenção; NÃO é rollback completo desligar
--   'controlado'):
--     0. Backup + verificações de pré-condição (ver verify-0093.sql).
--     1. Aplicar 0087, 0088, 0089, 0090, 0091, 0092, 0093 num ambiente isolado
--        e rodar os roteiros transacionais (test-0093-transacional.sql).
--     2. Concluir a RECONCILIAÇÃO das reservas antigas (migração própria, futura):
--        sem ela, pedidos 'entregue' antigos e reservas órfãs permanecem bloqueados.
--     3. Remover o fallback inseguro do checkout (insert direto) e migrar o
--        nascimento para 0089.
--     4. Migrar os 3 cancelamentos para 0093 (mesma janela).
--     5. Ligar reserva_proveniencia_config.controlado = true SOMENTE após
--        (2)+(3) e após confirmar que não há reserva ativa SEM marcador.
--     6. Verificações pós-ativação (verify-0093.sql POST) antes de retomar.
--   CONTINGÊNCIA: desligar 'controlado' NÃO desfaz marcadores nem libera estoque
--   automaticamente — é um freio, não um rollback. Emergência: manter o caminho
--   antigo (não migrado) é preferível a ligar 0093 com checkout ainda no fallback.
--
-- ============================================================================
-- COMPATIBILIDADE COM O BANCO REAL (Etapa 1.41/D) — DEPENDÊNCIAS A VERIFICAR
-- ============================================================================
--   FATOS RELATADOS (Supabase): o guard efetivo é compatível com a lógica da
--   0085; pedidos_guard_update_trg, trigger_congelar_colunas e
--   trigger_validar_transicao estão HABILITADOS; a RLS de pedidos está HABILITADA;
--   a política atual de UPDATE do cliente NÃO permite concluir com segurança um
--   cancelamento direto. (Não se presume versão desconhecida do guard.)
--   1. SECURITY DEFINER / OWNER: a função roda com os privilégios do OWNER. Como
--      NENHUMA tabela usa FORCE ROW LEVEL SECURITY (verificado nos arquivos), o
--      OWNER que é dono da tabela pedidos BYPASSA a RLS. DEPENDÊNCIA (a confirmar
--      no ambiente, SEM presumir): o owner da 0093 deve ser o MESMO owner de
--      pedidos (ou ter BYPASSRLS). Se o owner NÃO puder atualizar sob RLS, o
--      UPDATE do passo 7 fica sujeito à política do CHAMADOR — que, no caso do
--      cliente, é insuficiente para concluir o cancelamento. Verificar:
--        SELECT (SELECT relowner FROM pg_class  WHERE oid = 'public.pedidos'::regclass)
--             = (SELECT proowner FROM pg_proc   WHERE proname = 'cancelar_pedido_atomico');
--      (o mesmo vale para reservas_estoque e pedido_status_historico, escritas
--       pela 0090 e pela 0093.)
--   2. Executar a 0090: a 0090 tem EXECUTE revogado de PUBLIC/anon/authenticated;
--      a 0093 só a executa por compartilhar o OWNER (DEFINER). DEPENDÊNCIA:
--      MESMO owner entre 0093 e 0090.
--   3. Guard instalado (0085-compatível): staff passa; cliente passa SOMENTE no
--      próprio 'recebido'->'cancelado' (a 0093 só altera 'status' e mantém
--      user_id/numero intactos). trigger_congelar_colunas: a 0093 NÃO altera
--      coluna congelada (só 'status') => produção/atendente e cliente passam.
--      trigger_validar_transicao: 'recebido'->'cancelado' consta da matriz 0041.
--   4. EXECUTE da 0093: revogado de PUBLIC/anon/service_role; concedido SOMENTE a
--      authenticated (cliente cancela o PRÓPRIO pedido; terceiros são negados
--      internamente).
--   5. Ordem de locks: a 0093 adquire L1 (pedidos) e chama a 0090 (L1->L2->L3);
--      a 0091 usa a MESMA ordem (L1->L2->L3). Sem inversão => sem deadlock.
--
-- ============================================================================
-- RISCO DE PAGAMENTO ASSÍNCRONO APÓS CANCELAMENTO (Etapa 1.41/E) — PROTEGER DEPOIS
-- ============================================================================
--   A confirmação Pix/cartão chega por caminho assíncrono com service_role
--   (src/routes/api/public/pix/event.ts), que BYPASSA o guard de pedidos (bypass
--   service_role de 0074/0085). O leitor JÁ filtra candidatos com
--   status <> 'cancelado' na LEITURA, mas a BAIXA (.update pagamento_status='pago')
--   só exige 'pagamento_status = pendente' — NÃO revalida 'status <> cancelado'.
--   Como a 0093 NÃO altera pagamento_status (continua 'pendente'), uma confirmação
--   que LEIA o pedido antes do cancelamento e GRAVE depois pode marcar 'pago' um
--   pedido já 'cancelado' (janela de corrida), e o trigger_pagamento_confirmado
--   enfileira o cupom. NENHUMA ponta é alterada nesta etapa.
--   PROTEÇÃO FUTURA (decisão comercial + código, fora do escopo aqui):
--     (a) a baixa Pix deve ser condicional também a status <> 'cancelado' (ou
--         assumir a decisão comercial de reembolso/conferência manual);
--     (b) o cancelamento pode registrar intenção de reembolso quando o pagamento
--         confirmar APÓS o cancelamento (NÃO implementado).
--   Cancelamento continua NÃO sendo estorno: a 0093 nunca toca pagamento.
--
-- ============================================================================
-- SEGURANÇA (Etapa E)
-- ============================================================================
--   - SECURITY DEFINER + SET search_path = public; referências schema-qualificadas;
--   - EXECUTE: revogado de PUBLIC/anon; concedido SOMENTE a authenticated (o
--     cliente precisa cancelar o PRÓPRIO pedido; a função nega terceiros
--     internamente). SEM GRANT a service_role (não há job de servidor que cancele);
--   - identidade do histórico/ledger = auth.uid();
--   - sem EXCEPTION WHEN OTHERS.
--
-- REVERSÃO: DROP FUNCTION IF EXISTS public.cancelar_pedido_atomico(uuid, text);
--   Função INERTE (nada a chama) => sem efeitos em dados; nenhuma DDL colateral.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_pedido_atomico(
  p_pedido_id uuid,
  p_motivo    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_dono        uuid;   -- pedidos.user_id
  v_status      public.order_status;
  v_pag         text;   -- pedidos.pagamento_status
  v_eh_staff    boolean;
  v_n_itens     integer;
  v_reserv_total integer;
  v_reserv_retem integer;
  v_reservaveis integer;
  v_lib         jsonb;
  v_lib_status  text;
  v_de          text;
BEGIN
  -- 0. Entrada mínima.
  IF p_pedido_id IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida');
  END IF;

  -- 1. Identidade (auth.uid() é a única fonte; nunca parâmetro).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 2. L1: travar o pedido (serializa cancelamentos/retries do MESMO pedido).
  SELECT user_id, status, pagamento_status
    INTO v_dono, v_status, v_pag
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  -- 3. Autorização: dono OU staff operacional (admin/producao/atendente).
  --    Avaliada ANTES de classificar status (não vaza estado a terceiros).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF NOT v_eh_staff AND (v_dono IS NULL OR v_dono IS DISTINCT FROM v_uid) THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;

  -- 4. Elegibilidade de status (SEM escrita; nada foi alterado ainda).
  IF v_status = 'entregue' THEN
    RETURN jsonb_build_object('status', 'status_invalido', 'atual', v_status);
  END IF;
  IF v_status = 'cancelado' THEN
    -- Idempotência: não reexecuta a liberação nem grava histórico novo.
    -- (Reservas legadas/antigas NÃO são creditadas por aqui — reconciliação é
    --  etapa própria; ver "NÃO FAZER".)
    RETURN jsonb_build_object('status', 'ja_cancelado');
  END IF;
  IF v_status <> 'recebido' THEN
    -- 'em_producao'/'pronto'/'aguardando_motoboy'/'em_rota': decisão humana.
    RETURN jsonb_build_object('status', 'requer_analise', 'atual', v_status);
  END IF;

  -- 5. Pagamento: 1ª versão aceita SOMENTE 'pendente'.
  --    'pago' (confirmado/capturado), 'falhou' e 'reembolsado' (situação não
  --    verificável de forma segura) => bloqueio. Cancelamento NÃO é estorno.
  IF v_pag IS DISTINCT FROM 'pendente' THEN
    RETURN jsonb_build_object('status', 'pagamento_nao_elegivel', 'pagamento_status', v_pag);
  END IF;

  -- 6. Integridade de itens/reserva (SEM escrita).
  SELECT COUNT(*) INTO v_n_itens
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido');
  END IF;

  --    Itens RESERVÁVEIS (produto direto ou componente de combo) exigem ao
  --    menos uma reserva no pedido. Sem reserva => composição não comprovada =>
  --    bloqueio. Itens de MONTAGEM sem composição (produto_id NULL) não exigem.
  SELECT COUNT(*) INTO v_reservaveis
  FROM (
    SELECT i.id
      FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
    UNION
    SELECT i.id
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) s;

  SELECT COUNT(*) INTO v_reserv_total
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id;

  IF v_reservaveis > 0 AND v_reserv_total = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva');
  END IF;

  --     (1.47/1.48) Além de EXISTIR reserva, ela precisa RETER estoque
  --     (ativa/consumida). Um pedido AINDA ATIVO cujas reservas estão todas
  --     'liberada'/'cancelada' representa "liberação anterior segurando estoque"
  --     (D.6) => incompatível => reconciliacao_pendente, ANTES de qualquer escrita.
  --     Esta é a ÚNICA guarda que distingue o caso ATIVO do caso JÁ CANCELADO: a
  --     0090 (na 1.48) ACEITA reservas 'liberada' comprovadas como cobertura, o
  --     que é correto no pedido cancelado (idempotência) mas NÃO no pedido ativo.
  --     Devolver o motivo classificado aqui evita a escrita seguida de rollback.
  SELECT COUNT(*) INTO v_reserv_retem
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND status IN ('ativa', 'consumida');
  IF v_reservaveis > 0 AND v_reserv_retem = 0 THEN
    RETURN jsonb_build_object('status', 'reconciliacao_pendente', 'motivo', 'sem_reserva_ativa');
  END IF;

  -- 7. ESCRITA (mesma transação): cancela o pedido. Guardas 0041/0070/0084
  --    avaliam a identidade do CHAMADOR (auth.uid()) e só veem 'status' mudar.
  --    Condição de status reforçada => se algo mudou sob o lock, 0 linhas.
  v_de := v_status::text;
  UPDATE public.pedidos
     SET status = 'cancelado'
   WHERE id = p_pedido_id
     AND status = 'recebido';
  IF NOT FOUND THEN
    -- Corrida impossível sob L1, mas nunca seguir com escrita parcial: aborta.
    RAISE EXCEPTION
      'cancelar_pedido_atomico: status do pedido % mudou durante o cancelamento', p_pedido_id;
  END IF;

  -- 8. Liberação SEGURA do restante das reservas (0090), na MESMA transação.
  --    Agora o pedido está 'cancelado' (visto dentro da própria transação).
  v_lib := public.liberar_pedido_atomico(p_pedido_id);

  -- 9. VALIDAÇÃO ESTRITA do retorno da 0090 (Etapa 1.41/B). Só aceita sucesso
  --    COMPROVADO; qualquer outra coisa é EXCEPTION => rollback do passo 7
  --    (um RETURN da 0090 NÃO reverte escritas da MESMA transação).
  --    9a. Retorno SQL NULL ou JSON null/qualquer não-objeto => rejeita.
  IF v_lib IS NULL OR jsonb_typeof(v_lib) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno invalido da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  --    9b. Campo 'status' ausente OU não textual => rejeita (impede tratar
  --        null, número, booleano, array/objeto como se fosse status válido).
  IF NOT (v_lib ? 'status')
     OR jsonb_typeof(v_lib -> 'status') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: retorno sem status textual da liberacao (pedido %) — rollback',
      p_pedido_id;
  END IF;

  v_lib_status := v_lib ->> 'status';

  --    9c. Só 'liberado'/'ja_liberado' são sucesso. Rejeita explicitamente
  --        'reconciliacao_pendente', 'status_invalido', 'pedido_invalido' e
  --        QUALQUER valor inesperado (inclusive o literal 'NULL' e SQL NULL).
  IF v_lib_status IS NULL OR v_lib_status NOT IN ('liberado', 'ja_liberado') THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: liberacao nao concluida (%, pedido %) — rollback',
      COALESCE(v_lib_status, 'null'), p_pedido_id;
  END IF;

  --    9d. 'ja_liberado' = NENHUMA reserva ATIVA. Isso também acontece quando o
  --        pedido NUNCA teve reserva => NÃO pode ser lido como "liberação
  --        concluída". Exige comprovação: se há itens reserváveis, precisa
  --        existir ao menos uma reserva para o pedido (v_reserv_total > 0 —
  --        garantido pela pré-checagem, reforçado aqui em defesa em profundidade).
  --        Pedido só de montagem (sem item reservável) pode ser 'ja_liberado'
  --        legitimamente: não há o que liberar.
  IF v_lib_status = 'ja_liberado'
     AND v_reservaveis > 0
     AND v_reserv_total = 0 THEN
    RAISE EXCEPTION
      'cancelar_pedido_atomico: ja_liberado sem reserva comprovada (pedido %) — rollback',
      p_pedido_id;
  END IF;

  -- 10. Histórico (estrutura real 0023). actor = auth.uid().
  INSERT INTO public.pedido_status_historico (pedido_id, de_status, para_status, actor, motivo)
  VALUES (
    p_pedido_id,
    v_de,
    'cancelado',
    v_uid,
    COALESCE(NULLIF(btrim(p_motivo), ''), 'cancelamento transacional (Modelo 2)')
  );

  -- 11. Sucesso: só aqui a transação é considerada concluída.
  RETURN jsonb_build_object(
    'status',    'cancelado',
    'pedido_id', p_pedido_id,
    'liberacao', v_lib
  );
END;
$$;

COMMENT ON FUNCTION public.cancelar_pedido_atomico(uuid, text) IS
  '0093 (ORQUESTRADOR transacional, INERTE até migração dos chamadores). Cancela '
  'um pedido e libera o restante das reservas (0090) NA MESMA transação. Exige '
  'auth.uid(); autoriza dono do pedido OU staff operacional (admin/producao/'
  'atendente); nega terceiros. Caminho funcional da 1ª versão: status=recebido E '
  'pagamento_status=pendente. Bloqueia entregue (status_invalido) e estados em '
  'andamento (requer_analise); bloqueia pagamento não-pendente (pagamento_nao_'
  'elegivel); idempotente em cancelado (ja_cancelado); exige itens e reserva para '
  'itens reserváveis (pedido_invalido/reconciliacao_pendente). NÃO é estorno '
  'financeiro (nunca toca pagamento). Trava o pedido (L1) e VALIDA ESTRITAMENTE '
  'o retorno da 0090 (rejeita SQL NULL, JSON null, status ausente/não textual, '
  'reconciliacao_pendente, status_invalido, pedido_invalido e valores inesperados), '
  'convertendo QUALQUER não-sucesso em EXCEPTION (rollback integral); ja_liberado '
  'exige reserva comprovada (não mascara ausência de reserva). Grava '
  'pedido_status_historico. Locks compatíveis com 0090 (pedidos -> produtos -> '
  'reservas). EXECUTE só para authenticated. Sem EXCEPTION WHEN OTHERS.';

-- ----------------------------------------------------------------------------
-- Permissões: EXECUTE só para authenticated (cliente cancela o PRÓPRIO pedido;
-- a função nega terceiros e não-autenticados internamente). Nunca PUBLIC/anon/
-- service_role (sem job de servidor que cancele nesta versão).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(uuid, text)
  TO authenticated;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0093

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0094 (verbatim de drizzle/migrations/0094_protecao_pagamento_cancelado.sql)
--     SHA-256 do arquivo de origem : 7bde96a09b003e3302f7357f7ae54a00ff566246478878c0583168aec50a7f5f
--     bytes do arquivo de origem   : 23901
--     natureza                     : ATIVA
--     objetos                      : trigger de integridade financeira (bloqueia `cancelado`+`pago` e reabertura)
-- ==========================================================================
-- =============================================================================
-- 0094 — ETAPAS 1.43 + 1.44 + 1.45 + 1.46: PROTEÇÃO FINANCEIRA DO PEDIDO
-- =============================================================================
-- STATUS: ATIVA / CUTOVER — NÃO é inerte. Instala UM gatilho BEFORE UPDATE em
--         pedidos (trigger_proteger_consistencia_financeira, §2) e RECRIA
--         enfileirar_cupom (§1). A partir da instalação, TODO UPDATE de
--         status/pagamento_status passa pelo gatilho (I-IV) e a emissão de cupom
--         automático deixa de ocorrer para pedido cancelado — ou seja, o
--         comportamento muda IMEDIATAMENTE. NÃO contém backfill, NÃO altera
--         dados existentes e NÃO toca 0087–0093. Tratar como migration de
--         ativação/cutover (não aplicar fora da janela coordenada). Reversível
--         (§5).
--
-- HISTÓRICO: criada na 1.43; AMPLIADA na 1.44/B para observar também o STATUS
--   (a versão 1.43 só olhava `pagamento_status` e não barrava "cancelar um
--   pedido já pago" por UPDATE direto). Nomes 1.43 são removidos no §2.
--   Ampliada na 1.45/C para barrar a REABERTURA DIRETA de pedido cancelado.
--   Ampliada na 1.46/B para barrar o REBAIXAMENTO de pagamento confirmado
--   (fechar G1: 'pago'→'pendente'/'falhou' seguido de cancelamento).
--
-- PROBLEMA COMPROVADO (auditorias 1.42 + 1.44):
--   (P1) R1 — corrida Pix × cancelamento: o webhook (src/routes/api/public/
--        pix/event.ts) lê candidatos PIX e depois confirmava a baixa só com
--        `.eq(pagamento_status,'pendente')`; um cancelamento concorrente
--        (0093 ou UPDATE direto) podia deixar o pedido `cancelado` E `pago`,
--        disparando cupom automático. Corrigido no próprio arquivo do webhook
--        (1.43/B) ao exigir `.neq('status','cancelado')` NO MESMO UPDATE.
--   (P2) R2 — confirmação manual: admin/financeiro podiam marcar `pago` um
--        pedido JÁ `cancelado` por UPDATE direto (o guard 0085 libera staff, e
--        `trigger_congelar_colunas` isenta admin/financeiro/service_role).
--   (P2b) R2b (1.44) — sentido INVERSO: `UPDATE pedidos SET status='cancelado'`
--        num pedido JÁ `pago` NÃO era barrado por nenhum gatilho (o guard 0085
--        libera staff até sem olhar pagamento; o cliente podia cancelar o
--        próprio pedido pago). O §2 agora bloqueia os dois sentidos.
--   (P3) R3 — cupom: `enfileirar_cupom` (0077) emitia cupom para pedido
--        cancelado se o pagamento virasse `pago` (ou via backfill). Aqui: §1
--        impede NOVO cupom automático para pedido cancelado.
--   (P4) R3b (1.45) — REABERTURA DIRETA: um pedido 'cancelado' podia voltar a
--        'recebido'/'em_producao'/... por UPDATE direto (admin contorna a
--        matriz 0041 via `eh_admin`) sem tratar estoque/reserva/histórico.
--        Aqui: §2-(III) barra a reabertura direta.
--   (P5) G1 (1.46) — OCULTAÇÃO DE PAGAMENTO CONFIRMADO: `pago → pendente`/
--        `falhou` (oferecido no dropdown do admin) permitia rebaixar um
--        pagamento JÁ confirmado e, depois, cancelar o pedido (0093/direto),
--        apagando o indício do recebimento. Aqui: §2-(IV) barra
--        `pago → pendente`/`falhou` para TODO papel; `pago → reembolsado`
--        segue permitido (saída sancionada).
--
-- DEPENDÊNCIA REMANESCENTE (decisão comercial; NÃO implementada): corrigir um
--   pagamento confirmado por ENGANO (sem dinheiro efetivamente recebido) passa a
--   exigir um FLUXO AUDITADO dedicado (inexistente hoje). Ver §6-vi. A 0093 não
--   é afetada (não altera pagamento).
--
-- ESCOPO / NÃO-OBJETIVOS (1.43/1.44):
--   * NÃO implementa estorno/reembolso automático.
--   * NÃO altera checkout, admin, financeiro, PDV, produção, entregas, Pix,
--     layouts nem a impressora.
--   * NÃO apaga jobs já enfileirados em `fila_impressao` (ver risco §6).
--   * NÃO modifica o guard `pedidos_guard_update` (0085/0077) — proteção
--     ADITIVA por gatilho coluna-específico (§2).
--   * NÃO reconcilia as 19 reservas antigas.
--
-- INTERAÇÃO COM A 0093 (prova de leitura):
--   * `cancelar_pedido_atomico` só age em pedido 'recebido'+'pendente' e NUNCA
--     grava `pagamento_status`. Seu único UPDATE de status (recebido→cancelado)
--     produz NEW.status='cancelado' com pagamento ainda 'pendente', portanto
--     NÃO cai no gatilho do §2 (nem em (I) nem em (II)).
--   * O gatilho do §2 bloqueia, para TODOS os papéis — inclusive `service_role`
--     (C.4: sem bypass acidental) — as combinações cancelado+pago (I) e
--     confirmação sobre pedido cancelado (II). É a rede de segurança caso as
--     correções de aplicação (1.43/B) sejam contornadas.
-- =============================================================================

-- =============================================================================
-- §0. Pré-condições (verificação, sem alteração de dados)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.pedidos')          IS NULL
     OR to_regclass('public.fila_impressao') IS NULL THEN
    RAISE EXCEPTION '0094: pré-requisito ausente (pedidos/fila_impressao).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pedidos'
      AND column_name='pagamento_status'
  ) THEN
    RAISE EXCEPTION '0094: coluna pedidos.pagamento_status inexistente.';
  END IF;
END $$;

-- =============================================================================
-- §1. (D) Impressão automática: NÃO emitir NOVO cupom para pedido cancelado
-- -----------------------------------------------------------------------------
-- Recria `enfileirar_cupom` (0077) preservando o corpo EXATO e adicionando,
-- logo após o "NOT FOUND", um único guard: pedido cancelado não entra na fila
-- de impressão. Mudança ADITIVA e idempotente (CREATE OR REPLACE; a assinatura
-- não muda, então os GRANTs existentes são mantidos — reafirmados abaixo).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enfileirar_cupom(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.pedidos%ROWTYPE;
  v_modalidade text;
  v_n_itens integer := 0;
  v_total_un integer := 0;
  v_payload text;
  r record;
BEGIN
  SELECT * INTO v_p FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- (1.43/D) Pedido CANCELADO não recebe NOVO cupom automático — nem por
  -- confirmação de pagamento (trg_pagamento_confirmado), nem por inserção de
  -- itens (trg_gerar_cupom_apos_itens), nem pelo backfill
  -- gerar_cupons_pedidos_pagos(). Jobs JÁ enfileirados NÃO são removidos aqui
  -- (risco registrado no §6; nunca apagar histórico automaticamente).
  IF v_p.status = 'cancelado' THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.fila_impressao WHERE trabalho_uuid = p_pedido_id::text || ':pedido') THEN
    RETURN;
  END IF;

  v_modalidade := COALESCE(v_p.pagamento_modalidade, 'online');

  IF v_modalidade = 'online' AND COALESCE(v_p.pagamento_status, 'pendente') <> 'pago' THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_n_itens FROM public.pedido_itens WHERE pedido_id = p_pedido_id;
  IF v_n_itens = 0 THEN
    RETURN;
  END IF;

  v_total_un := 0;
  v_payload := '--- CUPOM FISCAL ---' || chr(10);
  v_payload := v_payload || 'Pedido #:' || COALESCE(v_p.numero::text, '?') || chr(10);
  v_payload := v_payload || 'Data/Horario: ' || to_char(CURRENT_TIMESTAMP, 'DD/MM/YYYY HH24:MI') || chr(10);
  v_payload := v_payload || 'Cliente: ' || COALESCE(v_p.cliente_nome, '-') || chr(10);
  v_payload := v_payload || 'Telefone: ' || COALESCE(v_p.telefone, '-') || chr(10);
  v_payload := v_payload || '----------------------------------------' || chr(10);

  FOR r IN
    SELECT nome, preco_unitario, quantidade
    FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id
    ORDER BY nome
  LOOP
    v_total_un := v_total_un + COALESCE(r.quantidade, 0);
    v_payload := v_payload || '(' || COALESCE(r.quantidade, 0)::text || ') ' || COALESCE(r.nome, 'item') || chr(10);
    v_payload := v_payload || 'Preco: R$ ' || to_char(COALESCE(r.preco_unitario, 0), '999G999G990D00') || chr(10);
  END LOOP;

  v_payload := v_payload || '----------------------------------------' || chr(10);
  v_payload := v_payload || 'Total Unidades: ' || v_total_un::text || chr(10);
  v_payload := v_payload || 'Subtotal: R$ ' || to_char(COALESCE(v_p.subtotal, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Taxa de Entrega: R$ ' || to_char(COALESCE(v_p.taxa_entrega, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Total: R$ ' || to_char(COALESCE(v_p.total, 0), '999G999G990D00') || chr(10);
  v_payload := v_payload || 'Forma Pagamento: ' || COALESCE(v_p.forma_pagamento::text, '-') || chr(10);

  IF COALESCE(v_p.tipo_entrega, 'entrega') = 'entrega' THEN
    v_payload := v_payload || 'Tipo Entrega: ENTREGA' || chr(10);
    v_payload := v_payload || 'Endereco: ' || COALESCE(v_p.endereco, '') || chr(10);
    v_payload := v_payload || 'Bairro: ' || COALESCE(v_p.bairro, '') || chr(10);
    v_payload := v_payload || 'Cidade: ' || COALESCE(v_p.cidade, '') || chr(10);
    v_payload := v_payload || 'CEP: ' || COALESCE(v_p.cep, '') || chr(10);
  ELSE
    v_payload := v_payload || 'Tipo Entrega: RETIRADA NA LOJA' || chr(10);
  END IF;

  v_payload := v_payload || 'Modalidade: ' || v_modalidade || chr(10);
  v_payload := v_payload || 'Status Pagamento: ' || COALESCE(v_p.pagamento_status, 'pendente') || chr(10);
  v_payload := v_payload || 'Observacoes: ' || COALESCE(v_p.observacoes, '') || chr(10);
  v_payload := v_payload || '--- FIM CUPOM ---';

  INSERT INTO public.fila_impressao (pedido_id, tipo, payload, impressora, trabalho_uuid, status, created_at, updated_at)
  VALUES (p_pedido_id, 'pedido', v_payload, 'Tanca TP-550', p_pedido_id::text || ':pedido', 'pendente', now(), now())
  ON CONFLICT (trabalho_uuid) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enfileirar_cupom(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enfileirar_cupom(uuid) TO service_role;

COMMENT ON FUNCTION public.enfileirar_cupom(uuid) IS
  'Fila cupom (0077). 1.43/D: pedido cancelado NÃO gera novo cupom (guard no início). Idempotente por trabalho_uuid. Não remove jobs já enfileirados.';

-- =============================================================================
-- §2. (B) Bloqueio de TRANSIÇÕES financeiras inconsistentes (status × pagamento)
-- -----------------------------------------------------------------------------
-- Gatilho ADITIVO, coluna-específico
-- (`BEFORE UPDATE OF status, pagamento_status`), independente do guard
-- `pedidos_guard_update` (0085/0077), de `trigger_congelar_colunas` (0084) e de
-- `trigger_validar_transicao` (0041).
--
-- CORREÇÃO 1.44: a versão 1.43 só observava `pagamento_status` e, por isso,
-- NÃO barrava `UPDATE pedidos SET status='cancelado'` num pedido JÁ pago. Agora
-- a proteção observa as DUAS colunas relevantes.
-- AMPLIAÇÃO 1.45: além de (I)/(II), passa a barrar a REABERTURA DIRETA de
-- pedido cancelado (III), que contornava a proteção por um UPDATE de status.
-- AMPLIAÇÃO 1.46: passa a barrar a OCULTAÇÃO de pagamento confirmado (IV),
-- rebaixando 'pago'→'pendente'/'falhou' para depois cancelar sem rastro.
--
-- Bloqueia (analisando OLD × NEW da MESMA instrução):
--   (I)  Estado final inconsistente: NEW.status='cancelado' E
--        NEW.pagamento_status='pago'. Cobre:
--          1. pedido cancelado recebendo pagamento 'pago';
--          2. pedido pago recebendo status 'cancelado' (cancelar pedido pago);
--          3. pedido pendente recebendo 'cancelado' E 'pago' simultâneos.
--   (II) Confirmação de pagamento sobre pedido que ESTAVA cancelado (ex.:
--        reabertura 'cancelado'→'recebido' somada a pagamento 'pago' na MESMA
--        instrução). O recebido de pedido cancelado vai para conciliação, não
--        se confirma no pedido.
--   (III) Reabertura DIRETA de pedido cancelado (1.45/C): UPDATE que saia de
--        'cancelado' para qualquer outro status. A matriz 0041 não prevê
--        transição a partir de 'cancelado' e não há fluxo autorizado de
--        reabertura (estoque/histórico). (II) cobre reabertura+pagamento.
--   (IV) Ocultação de pagamento confirmado (1.46 — fecha G1):
--        OLD.pagamento_status='pago' E NEW.pagamento_status IN
--        ('pendente','falhou'). Impede rebaixar um pagamento confirmado (o que
--        liberaria um cancelamento posterior sem rastro). Cobre também a mesma
--        instrução que já tente cancelar.
--
-- NÃO bloqueia (C.2 — alterações financeiras legítimas):
--   * 'pago'→'reembolsado' (reembolso/negação), inclusive em cancelado;
--   * confirmação 'pendente'→'pago' de pedido ATIVO (não cancelado);
--   * transições ENVOLVENDO 'pendente'/'falhou' que NÃO partam de 'pago'
--     (ex.: 'pendente'→'falhou') — (IV) só protege o estado JÁ confirmado;
--   * (reabertura de 'cancelado' — bloqueada por (III));
--   * (ocultação 'pago'→'pendente'/'falhou' — bloqueada por (IV); ver §6-vi);
--   * qualquer UPDATE de pedido cancelado+pago legado que não altere nem crie a
--     combinação financeira (ex.: editar 'observacoes').
--
-- Garantias de escopo:
--   * NÃO há exceção por papel: aplica-se a TODOS, inclusive `service_role`
--     (C.4). NÃO replica o bypass service_role do guard 0085.
--   * Função SECURITY INVOKER (não consulta outras tabelas; não precisa de
--     privilégio elevado).
--   * NÃO altera o guard atual (C.7) nem dados existentes (C.6).
--   * A 0093 NÃO é afetada: `cancelar_pedido_atomico` só cancela pedido
--     'recebido'+'pendente' e NUNCA grava pagamento_status → nunca cai em (I),
--     (II), (III) nem (IV) (a 0093 entra EM 'cancelado' e não baixa pagamento).
--
-- EVIDÊNCIA FINANCEIRA (D): a proteção NÃO descarta o PIX — o evento permanece
--   em `pix_notification_events` (CONFERIR + motivo + matched_order_id, 1.43/B).
--   No fluxo manual, o valor recebido deve ser conciliado pelo módulo financeiro
--   (extratos/contas). Para SAIR de um pedido confirmado, o único caminho é
--   `pagamento_status='reembolsado'` (dinheiro devolvido) — (IV) barra
--   'pago'→'pendente'/'falhou'. Correção de confirmação feita por engano passa
--   a exigir fluxo auditado (dependência, §6-vi). Ver §6.
-- =============================================================================
-- Limpeza defensiva (idempotente): remove os nomes usados na versão 1.43 deste
-- mesmo arquivo (nunca aplicada), evitando gatilho/função órfãos.
DROP TRIGGER  IF EXISTS trigger_bloquear_pagamento_cancelado ON public.pedidos;
DROP FUNCTION IF EXISTS public.bloquear_pagamento_pedido_cancelado();

CREATE OR REPLACE FUNCTION public.proteger_consistencia_financeira_pedido()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_mudou_status    boolean := (NEW.status           IS DISTINCT FROM OLD.status);
  v_mudou_pagamento boolean := (NEW.pagamento_status IS DISTINCT FROM OLD.pagamento_status);
  v_confirmou       boolean := (NEW.pagamento_status = 'pago'
                                AND OLD.pagamento_status IS DISTINCT FROM 'pago');
BEGIN
  -- Nada financeiramente relevante mudou → não interferir (protege updates que
  -- apenas repetem os mesmos valores ou mexem em outras colunas).
  IF NOT v_mudou_status AND NOT v_mudou_pagamento THEN
    RETURN NEW;
  END IF;

  -- (I) Estado final inconsistente: cancelado + pago ao mesmo tempo.
  IF NEW.status = 'cancelado' AND NEW.pagamento_status = 'pago' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % ficaria cancelado e pago; use o fluxo de cancelamento (0093) ou registre reembolso antes de cancelar.',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (II) Confirmação de pagamento sobre pedido que estava cancelado.
  IF v_confirmou AND OLD.status = 'cancelado' THEN
    RAISE EXCEPTION
      'inconsistencia_financeira: pedido % estava cancelado; pagamento recebido deve ir para conciliacao financeira (nao confirmar no pedido).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (III) Reabertura DIRETA de pedido cancelado (1.45/C). A matriz 0041 não
  --       prevê NENHUMA transição a partir de 'cancelado', e NÃO existe fluxo
  --       transacional autorizado que reabra tratando estoque/histórico. O
  --       admin hoje contorna a matriz via `validar_transicao_status`
  --       (eh_admin => RETURN NEW); aqui barramos a reabertura direta p/ todos.
  IF OLD.status = 'cancelado' AND NEW.status IS DISTINCT FROM 'cancelado' THEN
    RAISE EXCEPTION
      'reabertura_nao_permitida: pedido % cancelado nao pode ser reaberto por UPDATE direto; exige fluxo autorizado (inexistente hoje).',
      NEW.id USING ERRCODE = 'P0001';
  END IF;

  -- (IV) Ocultação de pagamento JÁ confirmado (1.46 — fecha o gap G1). Impede
  --      rebaixar `pago` para `pendente`/`falhou`: com o pagamento rebaixado, o
  --      pedido poderia ser cancelado depois (0093 ou UPDATE direto) sem deixar
  --      rastro de que houve recebimento. `pago`→`reembolsado` é a ÚNICA saída
  --      sancionada (dinheiro efetivamente devolvido) e NÃO cai aqui. Sem
  --      exceção para admin, financeiro nem service_role. Observe OLD×NEW da
  --      MESMA instrução: cobre também `SET status='cancelado',
  --      pagamento_status='pendente'` numa única linha.
  IF OLD.pagamento_status = 'pago'
     AND NEW.pagamento_status IN ('pendente', 'falhou') THEN
    RAISE EXCEPTION
      'pagamento_confirmado_nao_rebaixavel: pedido % tinha pagamento confirmado e nao pode voltar para ''%''; registre reembolso (reembolsado) ou use fluxo de correcao auditado (inexistente hoje).',
      NEW.id, NEW.pagamento_status USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_proteger_consistencia_financeira ON public.pedidos;
CREATE TRIGGER trigger_proteger_consistencia_financeira
  BEFORE UPDATE OF status, pagamento_status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_consistencia_financeira_pedido();

COMMENT ON FUNCTION public.proteger_consistencia_financeira_pedido() IS
  '1.44+1.45+1.46/B,C: impede (I) cancelado+pago, (II) confirmar pagamento de pedido cancelado, (III) reabrir pedido cancelado por UPDATE direto e (IV) rebaixar pagamento confirmado (pago->pendente/falhou); para TODO papel (inclui service_role). Coluna-especifico (status, pagamento_status); nao altera guard 0085 nem 0093.';

-- =============================================================================
-- §3. (D) Impressão automática: o gatilho de cupom respeita cancelado via §1.
--     Nada a recriar aqui — `trg_pagamento_confirmado` (0077) chama
--     `enfileirar_cupom`, que retorna cedo para cancelado. Além disso, as
--     transições que gerariam cupom indevido são barradas ANTES pelo §2 (é
--     BEFORE UPDATE), então o AFTER `trigger_pagamento_confirmado` nem chega a
--     executar quando a combinação é inconsistente.
-- =============================================================================

-- =============================================================================
-- §4. Testes locais (NÃO executados aqui — roteiro em docs/auditoria/)
-- =============================================================================

-- =============================================================================
-- §5. Reversibilidade (executar manualmente apenas se necessário)
-- =============================================================================
-- DROP TRIGGER  IF EXISTS trigger_proteger_consistencia_financeira ON public.pedidos;
-- DROP FUNCTION IF EXISTS public.proteger_consistencia_financeira_pedido();
-- -- enfileirar_cupom volta ao estado 0077 apenas recriando-o a partir de 0077.
-- (O guard §1 é aditivo e não precisa ser removido para a proteção §2 valer.)

-- =============================================================================
-- §6. Riscos remanescentes (registrados, NÃO resolvidos aqui)
-- =============================================================================
-- (i)  Jobs JÁ enfileirados em `fila_impressao` para um pedido cancelado
--      continuam na fila e podem ser impressos pelo agente. NÃO são removidos
--      automaticamente (decisão consciente para não apagar histórico). Ação
--      recomendada: cancelar manualmente o job pendente ao cancelar o pedido
--      (fluxo operacional, fora do escopo desta migration).
-- (ii) CONCILIAÇÃO DE PAGAMENTO RECEBIDO (dependência, não implementada):
--      marcar `pago` NO pedido cancelado deixa de ser possível (§2-I). O valor
--      recebido deve ir para o módulo financeiro (extratos/contas). Se o
--      negócio exigir conciliar o recebido vinculado ao pedido cancelado, é
--      necessária uma solução EXPLÍCITA (RPC/tabela dedicada) — NÃO
--      implementada nesta etapa; NÃO é reembolso automático.
-- (iii) CANCELAR UM PEDIDO PAGO (dependência operacional): o §2-I barra
--      `status='cancelado'` enquanto o pedido constar `pago`. O caminho
--      aprovado é marcar antes `pagamento_status='reembolsado'` (dinheiro
--      devolvido) e só então cancelar; §2-(IV) impede o atalho
--      'pago'→'pendente'/'falhou'. O front (admin) exibirá um erro genérico
--      nesses bloqueios — o ajuste de mensagem exige tocar em `admin.tsx`, FORA
--      do escopo desta etapa (dependência registrada).
-- (iv) Pagamento já confirmado ANTES de um cancelamento legítimo fora do §2
--      (ex.: linhas históricas `cancelado`+`pago`) permanece como está: o
--      gatilho é coluna-específico e não reescreve dados existentes (C.6).
-- (v)  A proteção é por estado de LINHA (OLD×NEW); um UPDATE que não mencione
--      `status` nem `pagamento_status` não é interceptado — e também não cria
--      combinação inconsistente.
-- (vi) G1 — CORRIGIDO NA 1.46 por §2-(IV): `pago → pendente`/`falhou` agora é
--      BLOQUEADO para todo papel, fechando o caminho de "rebaixar e cancelar".
--      DEPENDÊNCIA REMANESCENTE: corrigir um pagamento confirmado por ENGANO
--      (sem dinheiro efetivamente recebido) passa a exigir um FLUXO AUDITADO
--      dedicado (RPC/tabela) — inexistente hoje; NÃO criar nesta etapa.
--      `admin_logs` (app) NÃO é auditoria imutável: é best-effort e não cobre
--      SQL direto. Não equiparar `pagamento_status='reembolsado'` a reembolso
--      comprovado.
-- (vii) REABERTURA DE CANCELADO (1.45/C): agora BLOQUEADA por (III). Se o
--      negócio precisar reabrir, exige FLUXO AUTORIZADO (RPC transacional) que
--      trate reserva/estoque e histórico — inexistente hoje. Dependência
--      registrada; NÃO criar esse fluxo nesta etapa.
-- (viii) CAMINHOS DIRETOS DE CANCELAMENTO (D.4) — risco PENDENTE: ainda existem
--      UPDATE direto `status='cancelado'` (admin.tsx:695; e no cliente em
--      checkout/pedido.$id) que NÃO passam pela 0093 (sem liberação/histórico).
--      O §2 barra apenas o caso `pago`; cancelar 'pendente'/'falhou'/
--      'reembolsado' por UPDATE direto segue possível. Migrar esses chamadores
--      para a 0093 é etapa própria (fora do escopo).
-- (ix) A incidência real dos cenários e a ausência de deadlock/regressão com
--      os demais gatilhos BEFORE UPDATE (0041/0084/0085) só se comprovam em
--      execução real (test-0094), ainda pendente.
-- =============================================================================

-- ==========================================================================
-- <<< FIM DA MIGRATION 0094

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0095 (verbatim de drizzle/migrations/0095_criar_pedido_com_reserva.sql)
--     SHA-256 do arquivo de origem : da3f8912e1b78e3183e91025a4deb341e7731b8812ed45b61c72361f79c94001
--     bytes do arquivo de origem   : 57569
--     natureza                     : ATIVA (nucleo)
--     objetos                      : RPC `criar_pedido_com_reserva` + `pedido_cobertura_reserva` (cria pedido+itens+reserva em 1 transacao)
-- ==========================================================================
-- 0095: criacao atomica de pedidos com reserva de estoque (PREPARADA, NAO APLICADA)
-- ============================================================================
-- ETAPA 1.52 — ESTA MIGRATION NAO FOI APLICADA E NAO DEVE SER APLICADA NESTA
-- ETAPA. Ela apenas prepara, localmente, a funcao transacional e a protecao de
-- producao (funcao de trigger SEM trigger instalado).
--
-- OBJETIVO
--   Criar pedido + itens + reserva de estoque em UMA unica transacao, para
--   checkout, PDV e atendimento, sem compensacao por DELETE e sem escrita
--   direta em reservas_estoque.
--
-- O QUE ESTA MIGRATION NAO FAZ
--   * Nao altera tabelas, colunas, constraints, policies ou dados.
--   * Nao altera nenhuma funcao existente (inclui 0088/0089/0090/0093/0094).
--   * Nao instala trigger (a protecao de producao esta preparada no bloco 7).
--   * Nao ativa reserva_proveniencia_config.controlado.
--   * Nao altera checkout, PDV, atendimento, producao, admin, cliente ou Pix.
--
-- DEPENDENCIAS (verificar no ambiente isolado antes de usar)
--   * 0042  estoque_movimentacoes (comprovante de debito)
--   * 0087  reserva_consumos (consumo fisico; exigida pela 0090)
--   * 0089  public.reservar_pedido_atomico(uuid) -> jsonb  (chamada interna)
--   * 0092  reserva_proveniencia + reserva_proveniencia_config.controlado=false
--   * 0006  cupons.cliente_telefone/validade_ini/validade_fim/max_usos/produtos_ids
--   * 0040/0045  pedidos.cidade/cep/tipo_imovel/apartamento/bloco/torre/andar/interfone/pode_subir
--   * 0063  pedidos.pagamento_modalidade
--   * 0084  pedidos.aceito_em_atendente etc. (nao usados aqui)
--
-- ORDEM DE IMPLANTACAO / CUTOVER COORDENADO (NAO executar nesta etapa)
--   0. Baseline: aplicar 0096 (reparo de RLS/GRANT de parceiros) depois de
--      0028/0065 e antes de expor a loja; nao altera a 0095.
--   1. Estruturas INERTES: 0087 + 0092 (+ 0091/0093/0095, que nao alteram
--      comportamento por si so).
--      ATENCAO: 0088/0094 NAO sao inertes. 0088 substitui a RPC viva
--      reservar_estoque_atomica; 0094 instala trigger BEFORE UPDATE em pedidos e
--      recria enfileirar_cupom. Tratar 0088/0094 como migrations de CUTOVER.
--   2. Publicar codigo novo com TODAS as flags OFF.
--   3. Testes transacionais obrigatorios aprovados (T1-T20).
--   4. Eliminar os caminhos legados (fallback de reserva, cancelamento direto).
--   5. controlado = true (provedor de proveniencia ativo).
--   6. MESMA janela: habilitar as flags dos novos chamadores.
--   7. Smoke tests imediatos.
--   NUNCA habilitar 0089/0095 com controlado=false: a 0089 so grava o marcador
--   reserva_proveniencia quando controlado=true; reserva criada sem marcador
--   pode ser rejeitada pela 0090 no cancelamento. Cutover coordenado, sem
--   janela em que reserva nova exista sem proveniencia.
--
-- SEGURANCA
--   Funcoes SECURITY DEFINER com search_path fixo. O owner precisa ser dono de
--   pedidos/pedido_itens/reservas_estoque/produtos/pedido_status_historico e ter
--   EXECUTE em public.reservar_pedido_atomico(uuid). Confirmar proowner x
--   relowner e ausencia de FORCE ROW LEVEL SECURITY no ambiente isolado.
-- ============================================================================

-- ============================================================================
-- 1. RPC PRINCIPAL
-- ============================================================================
-- Contrato:
--   public.criar_pedido_com_reserva(
--     p_id     uuid,    -- id do pedido (idempotencia; PK de pedidos)
--     p_canal  text,    -- 'checkout' | 'pdv' | 'atendente'
--     p_dados  jsonb,   -- dados NAO financeiros do pedido (ver chaves abaixo)
--     p_itens  jsonb    -- [{produto_id, nome?, quantidade, observacao?}, ...]
--   ) RETURNS jsonb
--
-- Chaves aceitas em p_dados (todas opcionais salvo indicacao):
--   cliente_nome (obrigatorio), telefone (obrigatorio),
--   tipo_entrega (obrigatorio: 'entrega'|'retirada'),
--   forma_pagamento (obrigatorio: pix|dinheiro|credito|debito),
--   endereco, bairro, cidade, cep, complemento, referencia, observacoes,
--   tipo_imovel (casa|apartamento), apartamento, bloco, torre, andar,
--   interfone, pode_subir (boolean),
--   cpf_cnpj, nome_fiscal, origem_cliente,
--   agendado_para (ISO-8601 futuro), agendamento_obs,
--   tipo_evento, campanha_origem,
--   destino_lat, destino_lng (numeros),
--   cupom (codigo; revalidado no servidor),
--   pagamento_imediato (boolean; SOMENTE canal pdv e forma <> pix).
--
-- Chaves IGNORADAS (nunca lidas): user_id, status, numero, subtotal, total,
--   desconto, taxa_entrega, pagamento_status, pagamento_modalidade, preco,
--   preco_unitario. Valores financeiros sao sempre recalculados aqui.
--
-- Status de retorno (sempre jsonb):
--   criado | ja_criado | canal_invalido | permissao_negada | entrada_invalida |
--   dados_invalidos | itens_invalidos | quantidade_invalida | produto_inexistente |
--   produto_indisponivel | regra_combo | montagem_sem_modelagem |
--   cupom_invalido | cupom_esgotado |
--   dependencia_ausente | estoque_insuficiente | reconciliacao_pendente |
--   reservas_ausentes | idempotencia_divergente | pedido_de_outro_usuario |
--   inconsistencia_financeira | erro_interno
--
-- Atomicidade: o INSERT do pedido, o INSERT dos itens, a chamada a 0089 e o
-- historico ficam no MESMO bloco interno com EXCEPTION. Qualquer falha da 0089
-- e convertida em RAISE (SQLSTATE P0095) e o bloco interno e revertido por
-- completo; a funcao retorna o JSON da falha sem persistir nada.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(
  p_id    uuid,
  p_canal text,
  p_dados jsonb,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_dados          jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_itens          jsonb := COALESCE(p_itens, '[]'::jsonb);
  v_canal          text;
  v_elem           jsonb;
  v_ped            record;
  v_prod           record;
  v_cupom          record;
  v_lock_id        uuid;
  v_pid            uuid;
  v_qtd            integer;
  v_linhas         integer := 0;
  v_preco          numeric(10,2);
  v_subtotal       numeric(10,2) := 0;
  v_desc           numeric(10,2) := 0;
  v_taxa           numeric(10,2) := 0;
  v_total          numeric(10,2) := 0;
  v_numero         integer;
  v_n              bigint;
  v_cliente        text;
  v_telefone       text;
  v_endereco       text;
  v_bairro         text;
  v_cidade         text;
  v_cep            text;
  v_complemento    text;
  v_referencia     text;
  v_obs            text;
  v_tipo_imovel    text;
  v_apartamento    text;
  v_bloco          text;
  v_torre          text;
  v_andar          text;
  v_interfone      text;
  v_pode_subir     boolean := false;
  v_cpf            text;
  v_nome_fiscal    text;
  v_origem_cliente text;
  v_tipo_entrega   text;
  v_forma          text;
  v_modalidade     text;
  v_pag_status     text := 'pendente';
  v_pag_em         timestamptz := NULL;
  v_agendado       timestamptz := NULL;
  v_ag_obs         text := '';
  v_tipo_evento    text := '';
  v_campanha       text := '';
  v_lat            double precision := NULL;
  v_lng            double precision := NULL;
  v_cupom_cod      text;
  v_desc_manual    numeric(10,2) := 0;
  v_loja_end       text;
  v_loja_bai       text;
  v_loja_cid       text;
  v_taxa_txt       text;
  v_nome_item      text;
  v_obs_item       text;
  v_comp           jsonb;
  v_comp_pid       uuid;
  v_comp_qtd       integer;
  v_comp_soma      integer;
  v_comp_n         integer;
  v_comp_cat       uuid;
  v_comp_ids       uuid[];
  v_cat            record;
  v_item_id        uuid;
  v_res            jsonb;
  v_detail         text;
  v_req_fp         text[];
  v_db_fp          text[];
  v_motivo_hist    text;
  v_cob            jsonb;
BEGIN
  --------------------------------------------------------------------------
  -- 1.1 Autenticacao, canal e autorizacao (sempre no banco)
  --------------------------------------------------------------------------
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_id');
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'permissao_negada', 'motivo', 'sem_sessao');
  END IF;

  v_canal := lower(btrim(COALESCE(p_canal, '')));
  IF v_canal NOT IN ('checkout', 'pdv', 'atendente') THEN
    RETURN jsonb_build_object('status', 'canal_invalido');
  END IF;

  -- O parametro de canal NUNCA concede privilegio: ele apenas EXIGE papel.
  -- Um cliente comum so pode usar 'checkout'. Staff pode usar qualquer canal.
  IF v_canal IN ('pdv', 'atendente')
     AND NOT (public.has_role(v_uid, 'admin'::public.app_role)
              OR public.has_role(v_uid, 'atendente'::public.app_role)) THEN
    RETURN jsonb_build_object('status', 'permissao_negada', 'motivo', 'canal_staff');
  END IF;

  IF jsonb_typeof(v_dados) <> 'object' THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_dados');
  END IF;
  IF jsonb_typeof(v_itens) <> 'array' THEN
    RETURN jsonb_build_object('status', 'entrada_invalida', 'motivo', 'p_itens');
  END IF;
  IF jsonb_array_length(v_itens) = 0 THEN
    RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'vazio');
  END IF;

  --------------------------------------------------------------------------
  -- 1.2 Serializacao por id (mesma chave) e verificacao de idempotencia
  --------------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('criar_pedido_com_reserva:' || p_id::text));

  SELECT * INTO v_ped FROM public.pedidos WHERE id = p_id;
  IF FOUND THEN
    -- Autorizacao: somente o dono (cliente ou operador que criou) pode repetir.
    IF v_ped.user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('status', 'pedido_de_outro_usuario');
    END IF;

    -- Canal original registrado no historico de criacao.
    SELECT motivo INTO v_motivo_hist
      FROM public.pedido_status_historico
     WHERE pedido_id = p_id AND de_status IS NULL AND para_status = 'recebido'
     ORDER BY created_at ASC, id ASC
     LIMIT 1;
    IF v_motivo_hist IS DISTINCT FROM ('criacao_atomica:' || v_canal) THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'canal');
    END IF;

    -- Correspondencia dos itens (produto + quantidade; combo pela composicao
    -- estruturada, com fallback para montagem textual legada).
    SELECT array_agg(x ORDER BY x) INTO v_req_fp
      FROM (
        SELECT CASE
                 WHEN NULLIF(btrim(e.valor->>'produto_id'), '') IS NULL
                   THEN CASE
                          WHEN jsonb_typeof(e.valor->'componentes') = 'array'
                           AND jsonb_array_length(e.valor->'componentes') > 0
                            THEN 'C:' || COALESCE((
                              SELECT string_agg(
                                       lower(btrim(c.valor->>'produto_id')) || ':' ||
                                       COALESCE(NULLIF(regexp_replace(c.valor->>'quantidade', '[^0-9]', '', 'g'), ''), '0'),
                                       ',' ORDER BY lower(btrim(c.valor->>'produto_id'))
                                     )
                                FROM jsonb_array_elements(e.valor->'componentes') AS c(valor)
                            ), '') || ':' ||
                            (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                                  THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
                          ELSE 'M:' || COALESCE(btrim(e.valor->>'nome'), '') || ':' ||
                               (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                                     THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
                        END
                 ELSE 'P:' || lower(btrim(e.valor->>'produto_id')) || ':' ||
                        (CASE WHEN (e.valor->>'quantidade') ~ '^[0-9]{1,9}$'
                              THEN (e.valor->>'quantidade')::int ELSE 0 END)::text
               END AS x
          FROM jsonb_array_elements(v_itens) AS e(valor)
      ) s;

    SELECT array_agg(x ORDER BY x) INTO v_db_fp
      FROM (
        SELECT CASE
                 WHEN i.produto_id IS NULL
                   THEN CASE
                          WHEN EXISTS (
                            SELECT 1 FROM public.pedido_item_componentes c
                             WHERE c.pedido_item_id = i.id
                          )
                            THEN 'C:' || COALESCE((
                              SELECT string_agg(
                                       lower(c.produto_id::text) || ':' || c.quantidade::text,
                                       ',' ORDER BY lower(c.produto_id::text)
                                     )
                                FROM public.pedido_item_componentes c
                               WHERE c.pedido_item_id = i.id
                            ), '') || ':' || i.quantidade::text
                          ELSE 'M:' || i.nome || ':' || i.quantidade::text
                        END
                 ELSE 'P:' || lower(i.produto_id::text) || ':' || i.quantidade::text
               END AS x
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_id
      ) s;

    IF v_req_fp IS DISTINCT FROM v_db_fp THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'itens');
    END IF;

    -- Correspondencia dos dados principais da solicitacao original.
    IF v_ped.cliente_nome IS DISTINCT FROM btrim(v_dados->>'cliente_nome')
       OR v_ped.telefone IS DISTINCT FROM btrim(v_dados->>'telefone')
       OR v_ped.tipo_entrega IS DISTINCT FROM lower(btrim(COALESCE(v_dados->>'tipo_entrega', '')))
       OR v_ped.forma_pagamento::text IS DISTINCT FROM lower(btrim(COALESCE(v_dados->>'forma_pagamento', '')))
       OR v_ped.cupom IS DISTINCT FROM NULLIF(upper(btrim(COALESCE(v_dados->>'cupom', ''))), '')
       OR v_ped.agendado_para IS DISTINCT FROM
            (CASE WHEN jsonb_typeof(v_dados->'agendado_para') = 'string'
                   AND btrim(COALESCE(v_dados->>'agendado_para', '')) <> ''
                  THEN (v_dados->>'agendado_para')::timestamptz
                  ELSE NULL END)
    THEN
      RETURN jsonb_build_object('status', 'idempotencia_divergente', 'motivo', 'dados');
    END IF;

    -- Reservas obrigatorias: leitura pura (nao reserva nem baixa de novo).
    v_cob := public.pedido_cobertura_reserva(p_id);
    IF COALESCE(v_cob->>'status', '') = 'coberto' THEN
      SELECT COALESCE(SUM(i.preco_unitario * i.quantidade), 0), count(*)
        INTO v_subtotal, v_n
        FROM public.pedido_itens i
       WHERE i.pedido_id = p_id;
      IF v_n = 0
         OR abs(v_subtotal - v_ped.subtotal) > 0.005
         OR v_ped.desconto < 0
         OR v_ped.desconto > v_ped.subtotal
         OR abs(v_ped.total - GREATEST(v_ped.subtotal + v_ped.taxa_entrega - v_ped.desconto, 0)) > 0.005
      THEN
        RETURN jsonb_build_object('status', 'inconsistencia_financeira');
      END IF;
      RETURN jsonb_build_object(
        'status', 'ja_criado',
        'pedido_id', p_id,
        'numero', v_ped.numero,
        'total', v_ped.total,
        'cobertura', v_cob
      );
    END IF;
    IF COALESCE(v_cob->>'status', '') = 'sem_reserva' THEN
      RETURN jsonb_build_object(
        'status', 'reservas_ausentes',
        'pedido_id', p_id,
        'numero', v_ped.numero,
        'cobertura', v_cob
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'pedido_id', p_id,
      'numero', v_ped.numero,
      'cobertura', v_cob
    );
  END IF;

  --------------------------------------------------------------------------
  -- 1.3 Dependencia da reserva atomica (checada ANTES de qualquer escrita)
  --------------------------------------------------------------------------
  IF to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'dependencia_ausente',
      'dependencia', 'public.reservar_pedido_atomico(uuid)'
    );
  END IF;

  --------------------------------------------------------------------------
  -- 1.4 Validacao dos dados nao financeiros
  --------------------------------------------------------------------------
  v_cliente := btrim(COALESCE(v_dados->>'cliente_nome', ''));
  IF length(v_cliente) NOT BETWEEN 2 AND 120 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cliente_nome');
  END IF;

  v_telefone := btrim(COALESCE(v_dados->>'telefone', ''));
  IF length(regexp_replace(v_telefone, '\D', '', 'g')) NOT BETWEEN 10 AND 13 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'telefone');
  END IF;

  v_tipo_entrega := lower(btrim(COALESCE(v_dados->>'tipo_entrega', '')));
  IF v_tipo_entrega NOT IN ('entrega', 'retirada') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'tipo_entrega');
  END IF;

  v_forma := lower(btrim(COALESCE(v_dados->>'forma_pagamento', '')));
  IF v_forma NOT IN ('pix', 'dinheiro', 'credito', 'debito') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'forma_pagamento');
  END IF;

  v_cep := regexp_replace(COALESCE(v_dados->>'cep', ''), '\D', '', 'g');
  IF v_cep = '' THEN
    v_cep := NULL;
  ELSIF length(v_cep) <> 8 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cep');
  END IF;

  v_cpf := regexp_replace(COALESCE(v_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  IF v_cpf = '' THEN
    v_cpf := NULL;
  ELSIF length(v_cpf) NOT IN (11, 14) THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cpf_cnpj');
  END IF;

  v_complemento := btrim(COALESCE(v_dados->>'complemento', ''));
  v_referencia  := btrim(COALESCE(v_dados->>'referencia', ''));
  v_obs         := btrim(COALESCE(v_dados->>'observacoes', ''));
  IF length(v_complemento) > 200 OR length(v_referencia) > 200 OR length(v_obs) > 1000 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_tipo_imovel := NULLIF(lower(btrim(COALESCE(v_dados->>'tipo_imovel', ''))), '');
  IF v_tipo_imovel IS NOT NULL AND v_tipo_imovel NOT IN ('casa', 'apartamento') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'tipo_imovel');
  END IF;

  v_apartamento := NULLIF(btrim(COALESCE(v_dados->>'apartamento', '')), '');
  v_bloco       := NULLIF(btrim(COALESCE(v_dados->>'bloco', '')), '');
  v_torre       := NULLIF(btrim(COALESCE(v_dados->>'torre', '')), '');
  v_andar       := NULLIF(btrim(COALESCE(v_dados->>'andar', '')), '');
  v_interfone   := NULLIF(btrim(COALESCE(v_dados->>'interfone', '')), '');
  IF COALESCE(length(v_apartamento), 0) > 50
     OR COALESCE(length(v_bloco), 0) > 50
     OR COALESCE(length(v_torre), 0) > 50
     OR COALESCE(length(v_andar), 0) > 50
     OR COALESCE(length(v_interfone), 0) > 50 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco_estruturado');
  END IF;

  IF jsonb_typeof(v_dados->'pode_subir') = 'boolean' THEN
    v_pode_subir := (v_dados->>'pode_subir')::boolean;
  END IF;

  v_nome_fiscal    := NULLIF(btrim(COALESCE(v_dados->>'nome_fiscal', '')), '');
  v_origem_cliente := NULLIF(btrim(COALESCE(v_dados->>'origem_cliente', '')), '');
  IF COALESCE(length(v_nome_fiscal), 0) > 120 OR COALESCE(length(v_origem_cliente), 0) > 120 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_tipo_evento := btrim(COALESCE(v_dados->>'tipo_evento', ''));
  v_campanha    := btrim(COALESCE(v_dados->>'campanha_origem', ''));
  IF length(v_tipo_evento) > 80 OR length(v_campanha) > 80 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'texto_longo');
  END IF;

  v_ag_obs := btrim(COALESCE(v_dados->>'agendamento_obs', ''));
  IF length(v_ag_obs) > 200 THEN
    RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendamento_obs');
  END IF;

  IF jsonb_typeof(v_dados->'agendado_para') = 'string'
     AND btrim(COALESCE(v_dados->>'agendado_para', '')) <> '' THEN
    BEGIN
      v_agendado := (v_dados->>'agendado_para')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendado_para');
    END;
    IF v_agendado <= now() THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'agendado_para');
    END IF;
  END IF;

  IF jsonb_typeof(v_dados->'destino_lat') = 'number' THEN
    v_lat := (v_dados->>'destino_lat')::double precision;
    IF v_lat NOT BETWEEN -90 AND 90 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'destino_lat');
    END IF;
  END IF;
  IF jsonb_typeof(v_dados->'destino_lng') = 'number' THEN
    v_lng := (v_dados->>'destino_lng')::double precision;
    IF v_lng NOT BETWEEN -180 AND 180 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'destino_lng');
    END IF;
  END IF;

  --------------------------------------------------------------------------
  -- 1.5 Endereco e taxa de entrega (fonte confiavel)
  --------------------------------------------------------------------------
  -- A taxa NAO vem do navegador. A fonte preferencial e a coluna opcional
  -- loja_config.taxa_entrega, lida via to_jsonb para nao exigir a coluna nem
  -- inventa-la. Se a coluna ainda nao existir, PRESERVA o valor equivalente ao
  -- comportamento atual do sistema (R$ 6) no servidor; RETIRADA usa taxa 0.
  SELECT NULLIF(btrim(lc.endereco), ''),
         NULLIF(btrim(lc.bairro), ''),
         NULLIF(btrim(lc.cidade), ''),
         (to_jsonb(lc)->>'taxa_entrega')
    INTO v_loja_end, v_loja_bai, v_loja_cid, v_taxa_txt
    FROM public.loja_config lc
   WHERE lc.id = true;

  IF v_tipo_entrega = 'entrega' THEN
    v_endereco := btrim(COALESCE(v_dados->>'endereco', ''));
    v_bairro   := btrim(COALESCE(v_dados->>'bairro', ''));
    v_cidade   := btrim(COALESCE(v_dados->>'cidade', ''));
    IF length(v_endereco) NOT BETWEEN 5 AND 300 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'endereco');
    END IF;
    IF length(v_bairro) NOT BETWEEN 2 AND 100 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'bairro');
    END IF;
    IF length(v_cidade) NOT BETWEEN 2 AND 100 THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'cidade');
    END IF;
    -- Mesma regra do trigger 0045/0047. Validar aqui evita que o trigger
    -- transforme um erro de preenchimento em 'erro_interno' (P0001) e
    -- devolve o campo culpado sem escrever pedido/reserva.
    IF v_tipo_imovel = 'apartamento' AND v_apartamento IS NULL THEN
      RETURN jsonb_build_object('status', 'dados_invalidos', 'campo', 'apartamento');
    END IF;

    -- Configuravel server-side; default preserva o comportamento atual (R$ 6).
    v_taxa := CASE
                WHEN v_taxa_txt IS NOT NULL
                     AND btrim(v_taxa_txt) <> ''
                     AND btrim(v_taxa_txt) ~ '^[0-9]+(\.[0-9]{1,2})?$'
                  THEN round(btrim(v_taxa_txt)::numeric, 2)
                ELSE 6
              END;
  ELSE
    v_endereco := btrim(COALESCE(v_dados->>'endereco', ''));
    IF v_endereco = '' THEN
      v_endereco := COALESCE(v_loja_end, 'Retirada na loja');
    END IF;
    v_bairro := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'bairro', '')), ''), v_loja_bai, '');
    v_cidade := COALESCE(NULLIF(btrim(COALESCE(v_dados->>'cidade', '')), ''), v_loja_cid, '');
    v_taxa := 0;
  END IF;

  --------------------------------------------------------------------------
  -- 1.6 Itens: validacao de UUID/quantidade, bloqueio de produtos e precos
  --------------------------------------------------------------------------
  -- 1.6.1 Formato dos identificadores (evita cast invalido mais adiante).
  FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
    IF NULLIF(btrim(v_elem->>'produto_id'), '') IS NOT NULL
       AND btrim(v_elem->>'produto_id') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'produto_id');
    END IF;
    IF (v_elem->>'quantidade') IS NULL
       OR (v_elem->>'quantidade') !~ '^[0-9]{1,9}$' THEN
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'quantidade');
    END IF;

    -- Combo/montagem: a composicao e uma lista de produto + quantidade.
    IF NULLIF(btrim(v_elem->>'produto_id'), '') IS NULL THEN
      IF v_elem ? 'componentes'
         AND jsonb_typeof(v_elem->'componentes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componentes');
      END IF;
      IF jsonb_typeof(v_elem->'componentes') = 'array' THEN
        FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
          IF NULLIF(btrim(v_comp->>'produto_id'), '') IS NULL
             OR btrim(v_comp->>'produto_id') !~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componente_produto_id');
          END IF;
          IF (v_comp->>'quantidade') IS NULL
             OR (v_comp->>'quantidade') !~ '^[0-9]{1,9}$'
             OR (v_comp->>'quantidade')::int <= 0 THEN
            RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componente_quantidade');
          END IF;
        END LOOP;
      END IF;
    ELSIF jsonb_typeof(v_elem->'componentes') = 'array'
          AND jsonb_array_length(v_elem->'componentes') > 0 THEN
      -- Item de catalogo normal nao aceita composicao (evita debito duplo).
      RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'componentes_em_produto');
    END IF;
  END LOOP;

  -- 1.6.2 Bloqueio deterministico dos produtos (L2 antes de criar o pedido;
  -- o pedido novo ainda nao e visivel a outras transacoes, entao nao ha
  -- inversao perigosa em relacao a L1). Inclui os componentes do combo.
  FOR v_pid IN
    SELECT DISTINCT pid
      FROM (
        SELECT (e.valor->>'produto_id')::uuid AS pid
          FROM jsonb_array_elements(v_itens) AS e(valor)
         WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NOT NULL
        UNION
        SELECT (c.valor->>'produto_id')::uuid AS pid
          FROM jsonb_array_elements(v_itens) AS e(valor)
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(e.valor->'componentes') = 'array'
                 THEN e.valor->'componentes'
                 ELSE '[]'::jsonb END
          ) AS c(valor)
         WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NULL
      ) s
     ORDER BY pid
  LOOP
    SELECT p.id INTO v_lock_id FROM public.produtos p WHERE p.id = v_pid FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_pid);
    END IF;
  END LOOP;

  -- 1.6.3 Subtotal e regras comerciais. Combo (produto_id NULL) e aceito
  -- SOMENTE com composicao estruturada e preco de categoria configurado no
  -- banco. A soma dos componentes deve ser exatamente a quantidade do combo.
  FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
    v_qtd := (v_elem->>'quantidade')::int;
    v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;
    IF v_pid IS NULL THEN
      IF jsonb_typeof(v_elem->'componentes') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_elem->'componentes') = 0 THEN
        RETURN jsonb_build_object(
          'status', 'montagem_sem_modelagem',
          'item', COALESCE(NULLIF(btrim(v_elem->>'nome'), ''), '(sem nome)')
        );
      END IF;
      IF v_qtd < 50 OR v_qtd % 50 <> 0 THEN
        RETURN jsonb_build_object(
          'status', 'regra_combo',
          'quantidade', v_qtd,
          'minimo', 50,
          'passo', 50
        );
      END IF;

      v_comp_soma := 0;
      v_comp_n    := 0;
      v_comp_cat  := NULL;
      v_comp_ids  := '{}';
      FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
        v_comp_pid := (v_comp->>'produto_id')::uuid;
        v_comp_qtd := (v_comp->>'quantidade')::int;

        IF v_comp_pid = ANY(v_comp_ids) THEN
          RETURN jsonb_build_object(
            'status', 'montagem_componente_duplicado',
            'produto_id', v_comp_pid
          );
        END IF;
        v_comp_ids := array_append(v_comp_ids, v_comp_pid);

        SELECT p.nome, p.disponivel, p.categoria_id
          INTO v_prod
          FROM public.produtos p
         WHERE p.id = v_comp_pid;
        IF NOT FOUND THEN
          RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_comp_pid);
        END IF;
        IF NOT v_prod.disponivel THEN
          RETURN jsonb_build_object('status', 'produto_indisponivel', 'produto_id', v_comp_pid);
        END IF;
        IF v_comp_cat IS NULL THEN
          v_comp_cat := v_prod.categoria_id;
        ELSIF v_comp_cat IS DISTINCT FROM v_prod.categoria_id THEN
          RETURN jsonb_build_object(
            'status', 'montagem_categoria_divergente',
            'produto_id', v_comp_pid
          );
        END IF;

        v_comp_soma := v_comp_soma + v_comp_qtd;
        v_comp_n    := v_comp_n + 1;
      END LOOP;

      IF v_comp_n = 0 OR v_comp_soma <> v_qtd THEN
        RETURN jsonb_build_object(
          'status', 'montagem_soma_divergente',
          'quantidade', v_qtd,
          'componentes', v_comp_soma
        );
      END IF;

      SELECT c.nome, c.combo_preco_unit
        INTO v_cat
        FROM public.categorias c
       WHERE c.id = v_comp_cat;
      IF NOT FOUND OR v_cat.combo_preco_unit IS NULL THEN
        RETURN jsonb_build_object(
          'status', 'montagem_preco_ausente',
          'categoria_id', v_comp_cat
        );
      END IF;

      v_preco := v_cat.combo_preco_unit;
      v_subtotal := v_subtotal + (v_preco * v_qtd);
      v_linhas := v_linhas + 1;
      CONTINUE;
    END IF;

    SELECT p.nome, p.preco, p.preco_promocional, p.disponivel, p.estoque,
           p.tipo_venda::text
      INTO v_prod
      FROM public.produtos p
     WHERE p.id = v_pid;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'produto_inexistente', 'produto_id', v_pid);
    END IF;
    IF NOT v_prod.disponivel THEN
      RETURN jsonb_build_object('status', 'produto_indisponivel', 'produto_id', v_pid);
    END IF;
    IF COALESCE(v_prod.tipo_venda, 'combo_50') = 'combo_50'
       AND (v_qtd < 50 OR v_qtd % 50 <> 0) THEN
      RETURN jsonb_build_object(
        'status', 'regra_combo',
        'produto_id', v_pid,
        'quantidade', v_qtd,
        'minimo', 50,
        'passo', 50
      );
    END IF;

    v_preco := COALESCE(v_prod.preco_promocional, v_prod.preco);
    v_subtotal := v_subtotal + (v_preco * v_qtd);
    v_linhas := v_linhas + 1;
  END LOOP;

  IF v_linhas = 0 THEN
    RETURN jsonb_build_object('status', 'itens_invalidos', 'motivo', 'sem_itens');
  END IF;
  v_subtotal := round(v_subtotal, 2);

  --------------------------------------------------------------------------
  -- 1.7 Cupom (revalidado no servidor; lock seraliza usos concorrentes)
  --------------------------------------------------------------------------
  v_cupom_cod := NULLIF(upper(btrim(COALESCE(v_dados->>'cupom', ''))), '');
  IF v_cupom_cod IS NOT NULL THEN
    SELECT * INTO v_cupom
      FROM public.cupons
     WHERE codigo = v_cupom_cod
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'nao_encontrado');
    END IF;
    IF NOT v_cupom.ativo THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'inativo');
    END IF;
    IF v_cupom.validade_ini IS NOT NULL AND v_cupom.validade_ini > now() THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'validade');
    END IF;
    IF v_cupom.validade_fim IS NOT NULL AND v_cupom.validade_fim < now() THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'validade');
    END IF;
    IF btrim(COALESCE(v_cupom.cliente_telefone, '')) <> ''
       AND regexp_replace(v_cupom.cliente_telefone, '\D', '', 'g')
           <> regexp_replace(v_telefone, '\D', '', 'g') THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'cliente');
    END IF;
    IF v_cupom.minimo > 0 AND v_subtotal < v_cupom.minimo THEN
      RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'minimo');
    END IF;
    IF v_cupom.produtos_ids IS NOT NULL
       AND jsonb_typeof(v_cupom.produtos_ids) = 'array' THEN
      IF jsonb_array_length(v_cupom.produtos_ids) > 0 THEN
        IF NOT EXISTS (
          SELECT 1
            FROM jsonb_array_elements(v_itens) AS e(valor)
           WHERE NULLIF(btrim(e.valor->>'produto_id'), '') IS NOT NULL
             AND btrim(e.valor->>'produto_id') IN (
               SELECT jsonb_array_elements_text(v_cupom.produtos_ids)
             )
        ) THEN
          RETURN jsonb_build_object('status', 'cupom_invalido', 'motivo', 'produtos');
        END IF;
      END IF;
    END IF;
    IF v_cupom.max_usos > 0 THEN
      SELECT count(*) INTO v_n
        FROM public.pedidos p
       WHERE p.cupom = v_cupom_cod AND p.status <> 'cancelado';
      IF v_n >= v_cupom.max_usos THEN
        RETURN jsonb_build_object('status', 'cupom_esgotado', 'max_usos', v_cupom.max_usos);
      END IF;
    END IF;

    IF v_cupom.tipo = 'percentual' THEN
      v_desc := v_subtotal * v_cupom.valor / 100;
    ELSE
      v_desc := v_cupom.valor;
    END IF;
    v_desc := round(GREATEST(0, LEAST(v_desc, v_subtotal)), 2);
  END IF;

  --------------------------------------------------------------------------
  -- 1.7b Desconto manual (somente PDV/atendimento com papel autorizado)
  --------------------------------------------------------------------------
  -- NUNCA confiar cegamente no navegador: o desconto manual so e aceito quando
  -- o canal e staff (pdv/atendente) E o papel e admin|atendente. O valor vem de
  -- p_dados.desconto_manual (numerico >= 0); e somado ao desconto de cupom e
  -- limitado ao subtotal (total nunca negativo). Nao ha limite percentual
  -- inventado — o limite e o proprio subtotal.
  IF v_canal IN ('pdv', 'atendente')
     AND (public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'atendente'::public.app_role))
     AND jsonb_typeof(v_dados->'desconto_manual') = 'number'
     AND (v_dados->>'desconto_manual')::numeric >= 0 THEN
    v_desc_manual := round((v_dados->>'desconto_manual')::numeric, 2);
  END IF;
  v_desc := round(GREATEST(0, LEAST(v_desc + v_desc_manual, v_subtotal)), 2);

  --------------------------------------------------------------------------
  -- 1.8 Pagamento (derivado no servidor; nunca lido do navegador)
  --------------------------------------------------------------------------
  -- Regra 0063: na_entrega somente para entrega + dinheiro.
  v_modalidade := CASE
                    WHEN v_tipo_entrega = 'entrega' AND v_forma = 'dinheiro'
                      THEN 'na_entrega'
                    ELSE 'online'
                  END;

  -- PDV com pagamento imediato fora do Pix pode nascer pago. Pix permanece
  -- pendente ate o webhook. Checkout/atendimento sempre nascem pendentes.
  IF v_canal = 'pdv' AND v_forma <> 'pix'
     AND jsonb_typeof(v_dados->'pagamento_imediato') = 'boolean' THEN
    IF (v_dados->>'pagamento_imediato')::boolean THEN
      v_pag_status := 'pago';
      v_pag_em := now();
    END IF;
  END IF;

  v_total := round(GREATEST(v_subtotal + v_taxa - v_desc, 0), 2);

  --------------------------------------------------------------------------
  -- 1.9 Escrita + reserva + historico no MESMO bloco interno
  --------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.pedidos (
      id, user_id, cliente_nome, telefone, endereco, bairro, cidade, cep,
      complemento, referencia, observacoes,
      tipo_imovel, apartamento, bloco, torre, andar, interfone, pode_subir,
      cpf_cnpj, nome_fiscal, origem_cliente,
      tipo_entrega, forma_pagamento, pagamento_modalidade,
      pagamento_status, pagamento_em,
      subtotal, taxa_entrega, desconto, total, cupom,
      destino_lat, destino_lng, agendado_para, agendamento_obs,
      tipo_evento, campanha_origem
    ) VALUES (
      p_id, v_uid, v_cliente, v_telefone, v_endereco, v_bairro, v_cidade, v_cep,
      v_complemento, v_referencia, v_obs,
      v_tipo_imovel, v_apartamento, v_bloco, v_torre, v_andar, v_interfone,
      v_pode_subir,
      v_cpf, v_nome_fiscal, v_origem_cliente,
      v_tipo_entrega, v_forma::public.pagamento, v_modalidade,
      v_pag_status, v_pag_em,
      v_subtotal, v_taxa, v_desc, v_total, v_cupom_cod,
      v_lat, v_lng, v_agendado, v_ag_obs,
      v_tipo_evento, v_campanha
    )
    RETURNING numero INTO v_numero;

    -- Nome vem do catalogo (fonte confiavel); observacao do item e opcional.
    FOR v_elem IN SELECT e.valor FROM jsonb_array_elements(v_itens) AS e(valor) LOOP
      v_qtd := (v_elem->>'quantidade')::int;
      v_pid := NULLIF(btrim(v_elem->>'produto_id'), '')::uuid;

      IF v_pid IS NULL THEN
        -- Combo: preco e categoria relidos no servidor; composicao e gravada
        -- linha a linha, na MESMA transacao do pedido e da reserva.
        SELECT c.nome, c.combo_preco_unit
          INTO v_cat
          FROM public.categorias c
         WHERE c.id = (
           SELECT p.categoria_id
             FROM public.produtos p
            WHERE p.id = ((v_elem->'componentes'->0)->>'produto_id')::uuid
         );
        IF NOT FOUND OR v_cat.combo_preco_unit IS NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0095',
            MESSAGE = 'montagem_preco_ausente',
            DETAIL  = '{"status":"montagem_preco_ausente"}';
        END IF;

        v_preco := v_cat.combo_preco_unit;
        v_obs_item := btrim(COALESCE(v_elem->>'observacao', ''));
        v_nome_item := COALESCE(
          NULLIF(btrim(v_elem->>'nome'), ''),
          'Combo ' || v_cat.nome || ' ' || v_qtd::text || 'un'
        );
        IF v_obs_item <> '' THEN
          v_nome_item := v_nome_item || ' (obs: ' || v_obs_item || ')';
        END IF;
        v_nome_item := left(v_nome_item, 200);

        INSERT INTO public.pedido_itens (
          pedido_id, produto_id, nome, preco_unitario, quantidade
        ) VALUES (
          p_id, NULL, v_nome_item, v_preco, v_qtd
        )
        RETURNING id INTO v_item_id;

        FOR v_comp IN SELECT c.valor FROM jsonb_array_elements(v_elem->'componentes') AS c(valor) LOOP
          INSERT INTO public.pedido_item_componentes (
            pedido_item_id, produto_id, quantidade
          ) VALUES (
            v_item_id,
            (v_comp->>'produto_id')::uuid,
            (v_comp->>'quantidade')::int
          );
        END LOOP;
        CONTINUE;
      END IF;

      SELECT p.nome, p.preco, p.preco_promocional
        INTO v_prod
        FROM public.produtos p
       WHERE p.id = v_pid;

      v_preco := COALESCE(v_prod.preco_promocional, v_prod.preco);
      v_obs_item := btrim(COALESCE(v_elem->>'observacao', ''));
      v_nome_item := v_prod.nome ||
                     CASE WHEN v_obs_item <> ''
                          THEN ' (obs: ' || v_obs_item || ')'
                          ELSE '' END;

      INSERT INTO public.pedido_itens (
        pedido_id, produto_id, nome, preco_unitario, quantidade
      ) VALUES (
        p_id, v_pid, v_nome_item, v_preco, v_qtd
      );
    END LOOP;

    -- Reserva atomica: debita estoque, grava reservas + comprovante no ledger.
    v_res := public.reservar_pedido_atomico(p_id);
    IF v_res IS NULL
       OR COALESCE(v_res->>'status', '') NOT IN ('reservado', 'ja_reservado') THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0095',
        MESSAGE = 'reserva_nao_confirmada',
        DETAIL  = COALESCE(v_res::text, '{"status":"reserva_nula"}');
    END IF;

    -- Historico obrigatorio DENTRO do bloco: falha aqui desfaz tudo.
    INSERT INTO public.pedido_status_historico (
      pedido_id, de_status, para_status, actor, motivo
    ) VALUES (
      p_id, NULL, 'recebido', v_uid, 'criacao_atomica:' || v_canal
    );

  EXCEPTION
    WHEN SQLSTATE 'P0095' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      -- O bloco interno ja foi revertido (pedido/itens/reserva/historico).
      RETURN COALESCE(NULLIF(v_detail, ''), '{"status":"reserva_nao_confirmada"}')::jsonb;
  END;

  RETURN jsonb_build_object(
    'status', 'criado',
    'pedido_id', p_id,
    'numero', v_numero,
    'canal', v_canal,
    'subtotal', v_subtotal,
    'taxa_entrega', v_taxa,
    'desconto', v_desc,
    'total', v_total,
    'pagamento_status', v_pag_status,
    'pagamento_modalidade', v_modalidade,
    'reserva', v_res
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Nao expor SQLERRM (pode conter valores de dados). Nao ha escrita parcial:
    -- o bloco que escreveu ja foi revertido antes de chegar aqui.
    RETURN jsonb_build_object('status', 'erro_interno', 'sqlstate', SQLSTATE);
END;
$$;

COMMENT ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) IS
$$Criacao atomica de pedido + itens + reserva (checkout/pdv/atendente).
- Autorizacao no banco: auth.uid(); pdv/atendente exigem admin|atendente.
- user_id = auth.uid() (no PDV/atendimento e o operador, nao o cliente final;
  o cliente real fica em cliente_nome/telefone e o operador no historico.actor).
- Valores financeiros recalculados no servidor: preco do catalogo
  (COALESCE(preco_promocional, preco)), cupom revalidado, taxa de entrega lida de
  loja_config.taxa_entrega (via to_jsonb; ausente => default server-side R$ 6),
  desconto manual (somente pdv/atendente com papel admin|atendente).
- Atomicidade: pedido+itens+reservar_pedido_atomico+historico no mesmo bloco;
  falha da reserva => RAISE P0095 => rollback integral do bloco.
- Idempotencia: advisory lock por id + historico 'criacao_atomica:<canal>' +
  conferencia de autorizacao, itens, dados e cobertura (leitura pura).
- Montagem (produto_id NULL) falha fechado (montagem_sem_modelagem): nao ha
  composicao/preco confiavel no banco.
- Nao escreve direto em reservas_estoque e nao usa DELETE como compensacao.$$;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;

-- ============================================================================
-- 2. COBERTURA DE RESERVA (somente leitura; usada pela idempotencia e pelo gate)
-- ============================================================================
-- Retorna:
--   coberto              -> todos os itens reservaveis com debito comprovado
--   sem_reserva          -> falta cobertura (faltante = unidades sem reserva)
--   reconciliacao_pendente -> liberada/cancelada, excesso, debito ou proveniencia
--   montagem             -> pedido so com itens de montagem (sem reserva)
--   cancelado            -> pedido cancelado (gate nao se aplica)
--   pedido_invalido      -> inexistente/sem itens
--   pedido_de_outro_usuario -> chamador sem permissao (somente se auth.uid() != NULL)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_itens      bigint := 0;
  v_unidades   integer := 0;
  v_montagem   integer := 0;
  v_cobertas   integer := 0;
  v_faltante   integer := 0;
  v_linha      record;
  v_cob        integer;
  v_controlado boolean := false;
  v_tem_prov   boolean := false;
BEGIN
  SELECT p.status, p.user_id INTO v_status, v_dono
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pedido_invalido', 'motivo', 'nao_encontrado');
  END IF;

  -- Protecao de leitura: dono ou staff. auth.uid() NULL = contexto interno.
  IF v_uid IS NOT NULL
     AND v_dono IS DISTINCT FROM v_uid
     AND NOT (public.has_role(v_uid, 'admin'::public.app_role)
              OR public.has_role(v_uid, 'atendente'::public.app_role)
              OR public.has_role(v_uid, 'producao'::public.app_role)) THEN
    RETURN jsonb_build_object('status', 'pedido_de_outro_usuario');
  END IF;

  IF v_status = 'cancelado' THEN
    RETURN jsonb_build_object('status', 'cancelado');
  END IF;

  SELECT count(*), COALESCE(SUM(i.quantidade), 0)
    INTO v_itens, v_unidades
    FROM public.pedido_itens i
   WHERE i.pedido_id = p_pedido_id;
  IF v_itens = 0 THEN
    RETURN jsonb_build_object('status', 'pedido_invalido', 'motivo', 'sem_itens');
  END IF;

  SELECT COALESCE(SUM(i.quantidade), 0)
    INTO v_montagem
    FROM public.pedido_itens i
   WHERE i.pedido_id = p_pedido_id
     AND i.produto_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pedido_item_componentes c
        WHERE c.pedido_item_id = i.id
     );

  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens i
     WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1
      FROM public.pedido_itens i
      JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
     WHERE i.pedido_id = p_pedido_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'montagem',
      'itens', v_itens,
      'unidades', v_unidades,
      'montagem', v_montagem
    );
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  v_tem_prov := to_regclass('public.reserva_proveniencia') IS NOT NULL;
  IF v_controlado AND NOT v_tem_prov THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'motivo', 'proveniencia_indisponivel'
    );
  END IF;

  -- Reserva liberada/cancelada em pedido ativo e inconsistencia: bloqueia.
  IF EXISTS (
    SELECT 1 FROM public.reservas_estoque r
     WHERE r.pedido_id = p_pedido_id AND r.status IN ('liberada', 'cancelada')
  ) THEN
    RETURN jsonb_build_object(
      'status', 'reconciliacao_pendente',
      'motivo', 'reserva_liberada_ou_cancelada',
      'unidades', v_unidades,
      'montagem', v_montagem
    );
  END IF;

  FOR v_linha IN
    SELECT pid AS produto_id, SUM(qtd)::int AS solicitado
      FROM (
        SELECT i.produto_id AS pid, i.quantidade AS qtd
          FROM public.pedido_itens i
         WHERE i.pedido_id = p_pedido_id AND i.produto_id IS NOT NULL
        UNION ALL
        SELECT c.produto_id AS pid, c.quantidade AS qtd
          FROM public.pedido_itens i
          JOIN public.pedido_item_componentes c ON c.pedido_item_id = i.id
         WHERE i.pedido_id = p_pedido_id
      ) s
     GROUP BY pid
     ORDER BY pid
  LOOP
    SELECT COALESCE(SUM(r.quantidade), 0)::int
      INTO v_cob
      FROM public.reservas_estoque r
     WHERE r.pedido_id = p_pedido_id
       AND r.produto_id = v_linha.produto_id
       AND r.status IN ('ativa', 'consumida');

    IF v_cob > v_linha.solicitado THEN
      RETURN jsonb_build_object(
        'status', 'reconciliacao_pendente',
        'motivo', 'cobertura_excedente',
        'produto_id', v_linha.produto_id,
        'solicitado', v_linha.solicitado,
        'coberto', v_cob
      );
    END IF;
    IF v_cob < v_linha.solicitado THEN
      v_faltante := v_faltante + (v_linha.solicitado - v_cob);
    END IF;
    v_cobertas := v_cobertas + v_cob;

    -- Cada reserva ativa/consumida precisa do debito correspondente no ledger.
    IF EXISTS (
      SELECT 1
        FROM public.reservas_estoque r
       WHERE r.pedido_id = p_pedido_id
         AND r.produto_id = v_linha.produto_id
         AND r.status IN ('ativa', 'consumida')
         AND COALESCE((
           SELECT SUM(-m.quantidade)
             FROM public.estoque_movimentacoes m
            WHERE m.referencia_tipo = 'reserva_estoque'
              AND m.referencia_id = r.id
              AND m.tipo = 'reserva'
              AND m.quantidade < 0
         ), 0) <> r.quantidade
    ) THEN
      RETURN jsonb_build_object(
        'status', 'reconciliacao_pendente',
        'motivo', 'debito_nao_comprovado',
        'produto_id', v_linha.produto_id
      );
    END IF;

    -- Proveniencia exigida somente quando o regime controlado esta ligado.
    IF v_controlado THEN
      IF EXISTS (
        SELECT 1
          FROM public.reservas_estoque r
         WHERE r.pedido_id = p_pedido_id
           AND r.produto_id = v_linha.produto_id
           AND r.status = 'ativa'
           AND NOT EXISTS (
             SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id
           )
      ) THEN
        RETURN jsonb_build_object(
          'status', 'reconciliacao_pendente',
          'motivo', 'proveniencia_ausente',
          'produto_id', v_linha.produto_id
        );
      END IF;
    END IF;
  END LOOP;

  IF v_faltante > 0 THEN
    RETURN jsonb_build_object(
      'status', 'sem_reserva',
      'faltante', v_faltante,
      'unidades', v_unidades,
      'cobertas', v_cobertas,
      'montagem', v_montagem
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'coberto',
    'unidades', v_unidades,
    'cobertas', v_cobertas,
    'montagem', v_montagem
  );
END;
$$;

COMMENT ON FUNCTION public.pedido_cobertura_reserva(uuid) IS
$$Leitura pura da cobertura de reserva de um pedido.
- Confere quantidade por produto (ativa+consumida) x itens reservaveis.
- Exige debito comprovado em estoque_movimentacoes por reserva.
- Bloqueia se houver reserva liberada/cancelada em pedido ativo, excesso,
  debito ausente ou proveniencia ausente (quando controlado=true).
- Montagem pura retorna 'montagem' (nao reservavel; nao declara cobertura).
- Autorizacao: dono ou staff (admin/atendente/producao); auth.uid() NULL =
  contexto interno (trigger/migration).$$;

REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(uuid) TO authenticated;

-- ============================================================================
-- 3. GATE DE PRODUCAO — FUNCAO DE TRIGGER PREPARADA, TRIGGER NAO INSTALADO
-- ============================================================================
-- ATENCAO: instalar o trigger altera o comportamento imediatamente, mesmo que o
-- novo checkout esteja atras de flag. Por isso o CREATE TRIGGER esta comentado.
--
-- Politica de transicao exigida antes de instalar:
--   * reconciliar/decidir os pedidos historicos em 'recebido' que nao tenham
--     cobertura comprovada (as 19 reservas legadas + pedidos antigos);
--   * ativar reserva_proveniencia_config.controlado=true somente depois;
--   * instalar o trigger em migration/etapa separada, com auditoria.
-- Enquanto controlado=false a funcao (se instalada) fica inerte.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.exigir_reserva_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_controlado boolean := false;
  v_cob        jsonb;
BEGIN
  -- So age quando o pedido SAI de 'recebido' para algo operacional.
  IF OLD.status <> 'recebido' OR NEW.status IN ('recebido', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  IF NOT v_controlado THEN
    RETURN NEW;
  END IF;

  v_cob := public.pedido_cobertura_reserva(NEW.id);
  -- SOMENTE cobertura integral libera a producao. 'montagem' NAO e cobertura:
  -- itens de montagem nao possuem reserva/composicao comprovada no banco.
  IF COALESCE(v_cob->>'status', '') = 'coberto' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Pedido % sem cobertura de reserva para producao (status=%, motivo=%)',
    NEW.id,
    COALESCE(v_cob->>'status', 'desconhecido'),
    COALESCE(v_cob->>'motivo', '')
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.exigir_reserva_producao() IS
$$Trigger (NAO INSTALADO) que bloqueia a saida de 'recebido' para status
operacionais quando controlado=true e pedido_cobertura_reserva nao retorna
'exatamente coberto'. 'montagem' NAO libera: item sem produto/composicao nao
tem cobertura integral comprovada. Cobre transicoes alternativas (ex.: admin indo direto
para 'pronto') porque olha qualquer saida de 'recebido', exceto 'cancelado'.
Nao instalar antes da reconciliacao dos pedidos historicos em 'recebido'.$$;

REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 3.0b DEFESA DE CONSUMO — FUNCAO DE TRIGGER PREPARADA, TRIGGER NAO INSTALADO
-- ----------------------------------------------------------------------------
-- Quando controlado=true e o pedido sai de 'recebido' para producao, TODA
-- reserva ativa precisa ter retirada fisica registrada em reserva_consumos
-- (0087). Sem isso, o pedido nao avanca. NAO INSTALAR antes do cutover
-- coordenado (mesma janela do controlado=true).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exigir_consumo_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_controlado boolean := false;
BEGIN
  IF OLD.status <> 'recebido' OR NEW.status IN ('recebido', 'cancelado') THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT c.controlado INTO v_controlado
      FROM public.reserva_proveniencia_config c
     WHERE c.id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;
  IF NOT v_controlado THEN
    RETURN NEW;
  END IF;
  IF to_regclass('public.reserva_consumos') IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.reservas_estoque r
     WHERE r.pedido_id = NEW.id
       AND r.status = 'ativa'
       AND NOT EXISTS (SELECT 1 FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id)
  ) THEN
    RAISE EXCEPTION
      'Pedido % possui reserva sem retirada fisica registrada', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.exigir_consumo_producao() IS
$$Trigger (NAO INSTALADO) que bloqueia a saida de 'recebido' para producao quando
controlado=true e alguma reserva ativa nao tem retirada fisica registrada em
reserva_consumos (0087). NAO instalar antes do cutover coordenado.$$;

REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 3.1 INSTALACAO FUTURA (descomentar SOMENTE na etapa de ativacao, apos a
--     reconciliacao dos pedidos historicos e com controlado=true). NAO
--     descomentar nesta etapa.
-- ----------------------------------------------------------------------------
-- CREATE TRIGGER trigger_exigir_reserva_producao
--   BEFORE UPDATE OF status ON public.pedidos
--   FOR EACH ROW
--   WHEN (OLD.status = 'recebido' AND NEW.status NOT IN ('recebido', 'cancelado'))
--   EXECUTE FUNCTION public.exigir_reserva_producao();
-- CREATE TRIGGER trigger_exigir_consumo_producao
--   BEFORE UPDATE OF status ON public.pedidos
--   FOR EACH ROW
--   WHEN (OLD.status = 'recebido' AND NEW.status NOT IN ('recebido', 'cancelado'))
--   EXECUTE FUNCTION public.exigir_consumo_producao();

-- ============================================================================
-- 4. DEPENDENCIAS E LIMITES DOCUMENTADOS (nao executado)
-- ============================================================================
-- * taxa de entrega: a coluna loja_config.taxa_entrega e OPCIONAL. Quando existe,
--   e lida via to_jsonb; quando ausente, a funcao usa o default server-side
--   R$ 6,00 (preserva o comportamento atual). RETIRADA = 0. Configurar outro
--   valor e decisao comercial (config/migration propria).
-- * montagem (produto_id NULL): combo.tsx usa COMBO_CATEGORIAS (constante do
--   frontend; categorias nao tem preco) e nao existe tabela de composicao.
--   A RPC rejeita com montagem_sem_modelagem; producao de pedidos antigos com
--   montagem e tratada pela cobertura ('montagem').
-- * desconto manual de PDV/atendimento: IMPLEMENTADO para canais pdv/atendente
--   e papeis admin|atendente. Valor numerico >= 0, somado ao cupom e limitado
--   ao subtotal. O checkout NAO aceita desconto manual.
-- * pedidos sem reserva criados por caminhos antigos continuam possiveis ate o
--   trigger ser instalado; o RPC novo, sozinho, nao fecha esses caminhos.
-- * o gate de producao depende de controlado=true; ativar controlado antes de
--   reconciliar os pedidos historicos em 'recebido' pode bloquea-los.
-- ============================================================================

-- ==========================================================================
-- <<< FIM DA MIGRATION 0095

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0096 (verbatim de drizzle/migrations/0096_reparo_parceiros_rls.sql)
--     SHA-256 do arquivo de origem : ab577a3279609a3fcfa37c15df83a4820b948f32c3560e4f3ea78c35a5c83ffe
--     bytes do arquivo de origem   : 3060
--     natureza                     : ATIVA (RLS/GRANT)
--     objetos                      : reforco de RLS/GRANT em parceiros/estoque
-- ==========================================================================
-- 0096: reparo de RLS/GRANT de parceiros (baseline fora de ordem)
--
-- MOTIVO
--   0001_migration.sql e 0002_secure_loyalty_and_partners.sql foram escritas
--   para rodar DEPOIS da 0028 (tabela parceiros) e da 0088 (funcoes de
--   reserva). No replay linear elas rodam antes e falham; depois a 0028 cria
--   policies permissivas ("parceiros read" USING true e "parceiros write"
--   WITH CHECK true), que ficam no estado final.
--
--   Efeito atual: qualquer visitante (anon/public) le a tabela inteira
--   (inclusive e-mail, CNPJ e proposta) e qualquer authenticated atualiza/
--   apaga qualquer linha. O formulario publico de candidatura, por outro
--   lado, nao tem GRANT INSERT para anon.
--
-- ESCOPO
--   - nao altera dados;
--   - nao altera a view parceiros_publicos (0065);
--   - nao concede nada a service_role;
--   - idempotente (pode ser reaplicada).
--
-- ORDEM
--   Aplicar depois de 0028, 0065 e 0095. Em ambiente novo, preferir snapshot
--   canonico; esta migration e o reparo explicito para quem for replay.

-- 1) Remove as policies permissivas criadas pela 0028.
DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;

-- 2) Leitura direta: somente admin. A leitura publica continua pela view
--    parceiros_publicos (somente aprovada + autoriza_divulgacao).
DROP POLICY IF EXISTS "parceiros admin read" ON public.parceiros;
CREATE POLICY "parceiros admin read" ON public.parceiros
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Candidatura publica: INSERT apenas como 'nova' e com limites de texto.
--    A candidatura nunca pode nascer aprovada/divulgada.
DROP POLICY IF EXISTS "parceiros candidatura" ON public.parceiros;
CREATE POLICY "parceiros candidatura" ON public.parceiros
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'nova'
    AND length(nome) BETWEEN 1 AND 200
    AND coalesce(length(proposta), 0) <= 2000
    AND coalesce(length(descricao), 0) <= 2000
  );

-- 4) Escrita administrativa (insert/update/delete) somente admin.
DROP POLICY IF EXISTS "parceiros admin write" ON public.parceiros;
CREATE POLICY "parceiros admin write" ON public.parceiros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Privilégios de tabela. A policy de INSERT sozinha nao basta: o role
--    anon precisa do GRANT para o formulario publico funcionar.
REVOKE ALL ON public.parceiros FROM anon;
GRANT INSERT ON public.parceiros TO anon, authenticated;
GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;

COMMENT ON POLICY "parceiros admin read" ON public.parceiros IS
  '0096: leitura direta somente admin; publico usa a view parceiros_publicos.';
COMMENT ON POLICY "parceiros candidatura" ON public.parceiros IS
  '0096: candidatura publica somente status=nova e textos limitados.';
COMMENT ON POLICY "parceiros admin write" ON public.parceiros IS
  '0096: update/delete/insert administrativo somente admin.';

-- ==========================================================================
-- <<< FIM DA MIGRATION 0096

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0097 (verbatim de drizzle/migrations/0097_modelagem_combo.sql)
--     SHA-256 do arquivo de origem : 2059312f225d234e57521641ae863b3e0e9ed24227500adcc65558c606196da7
--     bytes do arquivo de origem   : 5006
--     natureza                     : ATIVA + ESTRUTURAL
--     objetos                      : tabela `pedido_item_componentes` + coluna `categorias.combo_preco_unit` + seed dos 5 slugs
-- ==========================================================================
-- ============================================================================
-- 0097: MODELAGEM ESTRUTURADA DO COMBO (MONTAGEM) + PRECO AUTORITATIVO
-- ============================================================================
-- PROBLEMA
--   O carrinho antigo guardava apenas "Combo <categoria> 50un (...)" e a
--   quantidade total. Sem os produtos/quantidades escolhidos, o servidor nao
--   consegue reservar/debitar os componentes e a 0095 falhava fechado com
--   'montagem_sem_modelagem'. Preco tambem vinha de constante do frontend.
--
-- SOLUCAO MINIMA (sem inventar composicao)
--   1. `pedido_item_componentes`: uma linha por produto/quantidade escolhida,
--      ligada ao `pedido_itens` do combo. A soma das quantidades e IGUAL a
--      quantidade do item pai (validado pela 0095/0089).
--   2. `categorias.combo_preco_unit`: preco unitario autoritativo do combo,
--      lido pelo servidor. A 0095 rejeita combo sem preco configurado.
--
-- UNIDADE
--   `quantidade` e sempre a unidade comercial do produto (mini salgado), a
--   mesma unidade de `produtos.estoque` e do preco unitario. O rotulo "25un"
--   no nome e apenas apresentacao; NAO existe conversao de embalagem.
--
-- SEGURANCA
--   - Tabela de leitura; escrita somente pela funcao SECURITY DEFINER 0095.
--   - RLS: dono do pedido ou staff operacional; sem grants para anon.
--   - Nao altera pedidos/reservas existentes; nenhum backfill automatico.
--
-- ORDEM DE CUTOVER
--   Aplicar esta migration ANTES de ligar a flag da criacao atomica (0095).
--   Sem ela, a 0095 continua falhando fechada para combo (nao ha fallback).
-- ============================================================================

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS combo_preco_unit numeric(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'categorias_combo_preco_unit_check'
       AND conrelid = 'public.categorias'::regclass
  ) THEN
    ALTER TABLE public.categorias
      ADD CONSTRAINT categorias_combo_preco_unit_check
      CHECK (combo_preco_unit IS NULL OR combo_preco_unit >= 0);
  END IF;
END;
$$;

-- Semente dos precos unitarios vigentes (mesmos valores do fallback do frontend
-- em src/lib/combo.ts). Nao sobrescreve configuracao ja feita pelo admin.
UPDATE public.categorias
   SET combo_preco_unit = CASE slug
         WHEN 'mini-fritos'      THEN 1.60
         WHEN 'mini-assados'     THEN 2.30
         WHEN 'mini-pasteis'     THEN 2.30
         WHEN 'mini-pizzas'      THEN 3.70
         WHEN 'mini-empadinhas'  THEN 2.40
       END
 WHERE slug IN ('mini-fritos', 'mini-assados', 'mini-pasteis', 'mini-pizzas', 'mini-empadinhas')
   AND combo_preco_unit IS NULL;

CREATE TABLE IF NOT EXISTS public.pedido_item_componentes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_item_id uuid NOT NULL REFERENCES public.pedido_itens(id) ON DELETE CASCADE,
  produto_id     uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  quantidade     integer NOT NULL CHECK (quantidade > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pedido_item_componentes_item_produto_key UNIQUE (pedido_item_id, produto_id)
);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_item_idx
  ON public.pedido_item_componentes (pedido_item_id);

CREATE INDEX IF NOT EXISTS pedido_item_componentes_produto_idx
  ON public.pedido_item_componentes (produto_id);

ALTER TABLE public.pedido_item_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_item_componentes_select ON public.pedido_item_componentes;
CREATE POLICY pedido_item_componentes_select
  ON public.pedido_item_componentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.pedido_itens i
        JOIN public.pedidos p ON p.id = i.pedido_id
       WHERE i.id = pedido_item_id
         AND (
           p.user_id = auth.uid()
           OR p.motoboy_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'atendente'::public.app_role)
           OR public.has_role(auth.uid(), 'producao'::public.app_role)
         )
    )
  );

REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM authenticated;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

COMMENT ON TABLE public.pedido_item_componentes IS
$$Composicao estruturada de um item de combo (montagem). Cada linha e um
produto/quantidade escolhido; a soma deve ser igual a pedido_itens.quantidade.
Escrita apenas pelas funcoes atomicas SECURITY DEFINER (0095).$$;

COMMENT ON COLUMN public.categorias.combo_preco_unit IS
$$Preco unitario autoritativo do combo para esta categoria. A 0095 recalcula o
subtotal do combo com este valor e falha fechada se estiver NULL.$$;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0097

-- ==========================================================================
-- >>> INICIO DA MIGRATION 0098 (verbatim de drizzle/migrations/0098_acl_menor_privilegio.sql)
--     SHA-256 do arquivo de origem : cfd14d8331f2f03589053c95793ab563ed6ee4cf343cbbf58962786e43bb3b0d
--     bytes do arquivo de origem   : 6975
--     natureza                     : ATIVA (ACL)
--     objetos                      : matriz de menor privilegio (revoke PUBLIC/anon/service_role)
-- ==========================================================================
-- ============================================================================
-- 0098: MATRIZ DE MENOR PRIVILEGIO (0089-0097)
-- ============================================================================
-- Fecha os grants historicos excessivos identificados na auditoria:
--   - `liberar_reserva_atomica` tinha PUBLIC/anon/service_role;
--   - `reservar_pedido_atomico` e `reservar_estoque_atomica` tinham service_role;
--   - as tabelas 0092 tinham service_role ALL;
--   - funcoes de trigger 0094/0095 herdavam PUBLIC.
--
-- NAO revoga o DML de `authenticated` em `reservas_estoque`/
-- `estoque_movimentacoes`: os fallbacks legados de admin/pedido/checkout ainda
-- existem e sao protegidos por RLS staff. A remocao desse DML e feita junto da
-- remocao dos fallbacks (pos-cutover, com os chamadores 100% atomicos).
--
-- `service_role` NAO recebe EXECUTE em nenhuma RPC nova sem chamador provado.
-- O print-agent/app usam `authenticated`; a 0095/0093 chamam 0089/0090 como
-- owner (SECURITY DEFINER), sem precisar de grant ao chamador.
-- ============================================================================

-- 1. Funcoes legadas / atomicas -------------------------------------------------
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_reserva_atomica(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reservar_pedido_atomico(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reservar_pedido_atomico(uuid) TO authenticated;

-- 2. Internas / chamadas somente por SECURITY DEFINER ---------------------------
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.liberar_pedido_atomico(uuid) FROM service_role;

-- 3. RPCs de app: somente authenticated ----------------------------------------
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_reserva(uuid, integer, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_atomico(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_atomico(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pedido_cobertura_reserva(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.pedido_cobertura_reserva(uuid) TO authenticated;

-- 4. Funcoes de trigger: nao sao RPC; trigger nao exige EXECUTE do chamador ----
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM anon;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM authenticated;
REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM service_role;

REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM anon;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM authenticated;
REVOKE ALL ON FUNCTION public.proteger_consistencia_financeira_pedido() FROM service_role;

-- 5. Tabelas 0092: leitura staff; escrita somente por funcoes definer --------
REVOKE ALL ON TABLE public.reserva_consumos FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_consumos FROM anon;
REVOKE ALL ON TABLE public.reserva_consumos FROM authenticated;
REVOKE ALL ON TABLE public.reserva_consumos FROM service_role;
GRANT SELECT ON TABLE public.reserva_consumos TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia TO authenticated;

REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM PUBLIC;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM anon;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM authenticated;
REVOKE ALL ON TABLE public.reserva_proveniencia_config FROM service_role;
GRANT SELECT ON TABLE public.reserva_proveniencia_config TO authenticated;

-- 6. 0097: sem service_role/anon (reforco idempotente) -----------------------
REVOKE ALL ON TABLE public.pedido_item_componentes FROM PUBLIC;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM anon;
REVOKE ALL ON TABLE public.pedido_item_componentes FROM service_role;
GRANT SELECT ON TABLE public.pedido_item_componentes TO authenticated;

-- 7. Reservas/movimentos: remove apenas os papeis tecnicos externos -----------
REVOKE ALL ON TABLE public.reservas_estoque FROM PUBLIC;
REVOKE ALL ON TABLE public.reservas_estoque FROM anon;
REVOKE ALL ON TABLE public.reservas_estoque FROM service_role;

REVOKE ALL ON TABLE public.estoque_movimentacoes FROM PUBLIC;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM anon;
REVOKE ALL ON TABLE public.estoque_movimentacoes FROM service_role;

-- ==========================================================================
-- <<< FIM DA MIGRATION 0098

-- ==========================================================================
-- FIM DO PACOTE DE MIGRATIONS. Nenhuma migration de 0088 foi incluida.
-- Proximo passo do cutover: 03_CONFIGURACAO-CUTOVER.sql
-- ==========================================================================


/*****************************************************************************
*  PASSO 3 — CONFIGURAÇÃO DOS COMBOS
*  arquivo: 03_CONFIGURACAO-CUTOVER.sql
*  esperado: CONFIGURACAO_OK
*****************************************************************************/

-- ============================================================================
-- 03_CONFIGURACAO-CUTOVER.sql — CONFIGURAÇÃO DO NOVO FLUXO
-- ============================================================================
-- Executar DEPOIS de 02_MIGRATIONS-CUTOVER.sql e ANTES de ativar o
-- `controlado` e de publicar o bundle de corte.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 03_CONFIGURACAO-CUTOVER.sql
--
-- ESCOPO (deliberadamente restrito):
--   * configura `categorias.combo_preco_unit` — a autoridade de preço do combo no
--     regime novo (migration 0097);
--   * NÃO altera `produtos.preco` de NENHUM item;
--   * NÃO corrige os preços históricos dos 54 produtos `combo_50`;
--   * NÃO toca em estoque, pedidos, pagamentos ou reservas.
--
-- Por que os preços NÃO mudam: o preço do combo sai de `combo_preco_unit`,
-- que recebe exatamente os mesmos 5 valores que a lista estática do frontend
-- já usava (ver PRECO-COMBOS-PRODUCAO.md — 54/54 itens IGUAL). A autoridade
-- muda de lugar (do código para o banco), não de valor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3.0 GUARDA DE ORDEM: a coluna combo_preco_unit e criada pela migration 0097.
--     Se ela nao existir, este script foi rodado ANTES das migrations.
-- ---------------------------------------------------------------------------
SELECT '=== 03_CONFIGURACAO: guarda de ordem ===' AS secao;
DO $ordem$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categorias'
       AND column_name = 'combo_preco_unit'
  ) THEN
    RAISE EXCEPTION 'NO-GO: rodou na ordem errada — a coluna categorias.combo_preco_unit nao existe. Aplique 02_MIGRATIONS-CUTOVER.sql ANTES deste script.';
  END IF;
  IF to_regclass('public.pedido_item_componentes') IS NULL THEN
    RAISE EXCEPTION 'NO-GO: rodou na ordem errada — a tabela pedido_item_componentes (0097) nao existe. Aplique 02_MIGRATIONS-CUTOVER.sql ANTES deste script.';
  END IF;
END
$ordem$;

SELECT '=== 03_CONFIGURACAO: estado antes ===' AS secao;
DO $estado$
DECLARE v_txt text;
BEGIN
  EXECUTE $q$
    SELECT string_agg(c.slug || ' = ' || coalesce(c.combo_preco_unit::text,'sem preco'), ', ' ORDER BY c.slug)
      FROM public.categorias c
     WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
  $q$ INTO v_txt;
  RAISE NOTICE 'estado antes: %', coalesce(v_txt, '(nenhuma das 5 categorias encontrada)');
END
$estado$;

-- ---------------------------------------------------------------------------
-- 3.1 Preco unitario do combo por categoria (mesmos valores do seed da 0097)
--     `AND combo_preco_unit IS NULL` => NAO sobrescreve configuracao do admin.
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: aplicando combo_preco_unit (sem sobrescrever admin) ===' AS secao;
UPDATE public.categorias SET combo_preco_unit = 1.60 WHERE slug = 'mini-fritos'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-assados'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.30 WHERE slug = 'mini-pasteis'    AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 3.70 WHERE slug = 'mini-pizzas'     AND combo_preco_unit IS NULL;
UPDATE public.categorias SET combo_preco_unit = 2.40 WHERE slug = 'mini-empadinhas' AND combo_preco_unit IS NULL;

-- ---------------------------------------------------------------------------
-- 3.2 GUARDA: nenhuma categoria de combo ATIVA pode ficar sem preco.
--     A 0095 falha fechada com `montagem_preco_ausente`; aqui a falha é
--     antecipada, com mensagem clara, e o script ABORTA.
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: guarda de preco (fail-closed) ===' AS secao;
DO $guarda$
DECLARE
  v_faltando text;
  v_n integer;
BEGIN
  SELECT string_agg(c.slug || ' (' || c.nome || ')', ', ')
    INTO v_faltando
  FROM public.categorias c
  WHERE c.ativo
    AND c.combo_preco_unit IS NULL
    AND EXISTS (SELECT 1 FROM public.produtos p
                 WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50');

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'NO-GO: categoria(s) de combo ativa(s) sem combo_preco_unit: % — configurar antes de abrir vendas', v_faltando;
  END IF;

  -- Nenhuma categoria de combo ativa pode ter preco negativo ou zero.
  EXECUTE 'SELECT count(*)::int FROM public.categorias
            WHERE ativo AND combo_preco_unit IS NOT NULL AND combo_preco_unit <= 0' INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'NO-GO: % categoria(s) de combo com combo_preco_unit <= 0', v_n;
  END IF;

    PERFORM set_config('neia.config', 'CONFIGURACAO_OK', false);
  RAISE NOTICE 'CONFIGURACAO_OK: toda categoria de combo ativa tem preco valido';
END
$guarda$;

-- ---------------------------------------------------------------------------
-- 3.3 Estado depois
-- ---------------------------------------------------------------------------
SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: estado depois ===' AS secao;
SELECT c.slug, c.nome, c.combo_preco_unit,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: precos dos 54 itens combo_50 (inalterados, so conferencia) ===' AS secao;
SELECT c.slug,
       count(*)                                            AS itens,
       count(DISTINCT p.preco)                             AS precos_distintos,
       min(p.preco)                                        AS preco_min,
       max(p.preco)                                        AS preco_max
FROM public.produtos p
JOIN public.categorias c ON c.id = p.categoria_id
WHERE p.tipo_venda = 'combo_50'
GROUP BY c.slug
ORDER BY c.slug;
-- Nota: estes precos de `produtos.preco` NAO foram alterados por este script
-- (e nao devem ser: ver PRECO-COMBOS-PRODUCAO.md, secao 4).

SELECT '' AS secao;
SELECT '=== 03_CONFIGURACAO: 3.4 verificacao final de cobertura ===' AS secao;
SELECT
  (SELECT count(*) FROM public.categorias
    WHERE ativo AND combo_preco_unit IS NOT NULL)                       AS categorias_com_preco,
  (SELECT count(*) FROM public.categorias c
    WHERE c.ativo AND c.combo_preco_unit IS NULL
      AND EXISTS (SELECT 1 FROM public.produtos p
                    WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50')) AS combos_sem_preco,
  'CONFIGURACAO_OK'::text                                              AS resultado;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.config', true) AS resultado;


/*****************************************************************************
*  PASSO 4 — FECHAR OS CAMINHOS LEGADOS (ACL)
*  arquivo: 08_LOCKDOWN-ACL.sql
*  esperado: LOCKDOWN_OK
*****************************************************************************/

-- ============================================================================
-- 08_LOCKDOWN-ACL.sql — FECHAMENTO DOS CAMINHOS LEGADOS (ACL)
-- ============================================================================
-- Executar DEPOIS de 03_CONFIGURACAO-CUTOVER.sql e ANTES de
-- 04_ATIVAR-CONTROLADO.sql / da publicação do bundle.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 08_LOCKDOWN-ACL.sql
--
-- O QUE FAZ (e o que NÃO faz):
--   * revoga de `authenticated` o DML direto em `reservas_estoque`,
--     `estoque_movimentacoes` e `pedido_item_componentes`;
--   * revoga de `authenticated` o DELETE compensatório em `pedidos`;
--   * revoga de `authenticated` o EXECUTE das RPCs legadas
--     `reservar_estoque_atomica` e `liberar_reserva_atomica`.
--
--   * NÃO mexe em `produtos.preco`, estoque, pedidos, pagamentos ou reservas;
--   * NÃO mexe em `controlado`;
--   * NÃO revoga o que o fluxo novo usa: as RPCs 0095/0093/0091 e as tabelas
--     `reserva_consumos` / `reserva_proveniencia` / `pedido_item_componentes`
--     continuam acessíveis conforme as policies da 0098/0097.
--
-- POR QUE:
--   O bundle de corte JÁ não contém o caminho legado (0 call sites
--   comprovados). Este lockdown fecha a barreira para um bundle ANTIGO que
--   ainda esteja aberto em um navegador: mesmo com a flag OFF, ele não
--   consegue mais escrever reserva nem chamar as RPCs legadas.
--
-- IRREVERSÍVEL (no sentido de que o caminho legado não volta):
--   Não reverta este lockdown. Se um fluxo novo precisar de escrita direta em
--   `reservas_estoque`, o caminho correto é uma RPC SECURITY DEFINER.
-- ============================================================================

SELECT '=== 08_LOCKDOWN: estado antes ===' AS secao;
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes','pedidos')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: aplicando (cada revoke e independente) ===' AS secao;
DO $revokes$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.reservas_estoque') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.reservas_estoque FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela reservas_estoque ausente');
  END IF;

  IF to_regclass('public.estoque_movimentacoes') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.estoque_movimentacoes FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela estoque_movimentacoes ausente');
  END IF;

  IF to_regclass('public.pedido_item_componentes') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.pedido_item_componentes FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela pedido_item_componentes ausente (0097 nao aplicada)');
  END IF;

  IF to_regclass('public.pedidos') IS NOT NULL THEN
    EXECUTE 'REVOKE DELETE ON TABLE public.pedidos FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'tabela pedidos ausente');
  END IF;

  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'RPC reservar_estoque_atomica ausente');
  END IF;

  IF to_regprocedure('public.liberar_reserva_atomica(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.liberar_reserva_atomica(uuid) FROM authenticated';
  ELSE
    v_falhas := array_append(v_falhas, 'RPC liberar_reserva_atomica ausente');
  END IF;

  IF cardinality(v_falhas) > 0 THEN
    RAISE EXCEPTION 'NO-GO: % — rode este script DEPOIS de 02_MIGRATIONS-CUTOVER.sql', array_to_string(v_falhas, ' | ');
  END IF;
END
$revokes$;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: estado depois ===' AS secao;
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('reservas_estoque','estoque_movimentacoes','pedido_item_componentes','pedidos')
  AND grantee = 'authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
ORDER BY table_name, privilege_type;

SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: o fluxo novo continua acessivel? (deve ser TRUE) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 08_LOCKDOWN: VEREDITO ===' AS secao;
DO $lock$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
BEGIN
  IF has_function_privilege('authenticated','public.reservar_estoque_atomica(uuid,uuid,integer)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda executa reservar_estoque_atomica');
  END IF;
  IF has_function_privilege('authenticated','public.liberar_reserva_atomica(uuid)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda executa liberar_reserva_atomica');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema='public' AND table_name='reservas_estoque'
                AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')) THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda tem DML em reservas_estoque');
  END IF;
  IF NOT has_function_privilege('authenticated','public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a criar_pedido_com_reserva (ERRO)');
  END IF;
  IF NOT has_function_privilege('authenticated','public.cancelar_pedido_atomico(uuid,text)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a cancelar_pedido_atomico (ERRO)');
  END IF;
  IF NOT has_function_privilege('authenticated','public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)','EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated perdeu acesso a registrar_consumo_reserva (ERRO)');
  END IF;
  IF cardinality(v_falhas) = 0 THEN
        PERFORM set_config('neia.lock', 'LOCKDOWN_OK', false);
    RAISE NOTICE 'LOCKDOWN_OK: caminhos legados fechados e fluxo novo intacto';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$lock$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.lock', true) AS resultado;


/*****************************************************************************
*  PASSO 5 — VERIFICAÇÃO DO BANCO
*  arquivo: 05_VERIFY-POS-CORTE.sql
*  esperado: VERIFY_POS_CORTE_OK
*****************************************************************************/

-- ============================================================================
-- 05_VERIFY-POS-CORTE.sql — VERIFICAÇÃO PÓS-INSTALAÇÃO (somente leitura)
-- ============================================================================
-- Executar DEPOIS de 02_MIGRATIONS-CUTOVER.sql + 03_CONFIGURACAO-CUTOVER.sql
-- e (quando o bundle já estiver publicado) de 04_ATIVAR-CONTROLADO.sql.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 05_VERIFY-POS-CORTE.sql
--
-- Saída: NOTICE VERIFY_POS_CORTE_OK  ou  EXCEPTION NO-GO (exit != 0).
-- Nenhuma escrita.
-- ============================================================================

SELECT '=== 05_VERIFY: objetos obrigatorios 0087-0098 ===' AS secao;
SELECT * FROM (
  VALUES
    ('0087','tabela','reserva_consumos',            to_regclass('public.reserva_consumos') IS NOT NULL),
    ('0089','funcao','reservar_pedido_atomico',     to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL),
    ('0090','funcao','liberar_pedido_atomico',      to_regprocedure('public.liberar_pedido_atomico(uuid)') IS NOT NULL),
    ('0091','funcao','registrar_consumo_reserva',   to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia',        to_regclass('public.reserva_proveniencia') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia_config', to_regclass('public.reserva_proveniencia_config') IS NOT NULL),
    ('0093','funcao','cancelar_pedido_atomico',     to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL),
    ('0094','funcao','proteger_consistencia_financeira_pedido', to_regprocedure('public.proteger_consistencia_financeira_pedido()') IS NOT NULL),
    ('0095','funcao','criar_pedido_com_reserva',    to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL),
    ('0095','funcao','pedido_cobertura_reserva',    to_regprocedure('public.pedido_cobertura_reserva(uuid)') IS NOT NULL),
    ('0096','policy','RLS de parceiros/estoque',   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public')),
    ('0097','tabela','pedido_item_componentes',     to_regclass('public.pedido_item_componentes') IS NOT NULL),
    ('0097','coluna','categorias.combo_preco_unit',EXISTS (SELECT 1 FROM information_schema.columns
                                                            WHERE table_schema='public' AND table_name='categorias'
                                                              AND column_name='combo_preco_unit'))
) AS t(migration, tipo, objeto, existe)
ORDER BY migration, objeto;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: 0088 (deve continuar NAO APLICADA) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;
-- Expectativa: as duas existem na versao 0030/0086 (base) e NAO sao chamadas
-- pelo bundle de corte (0 call sites comprovados). A 0098 revoga PUBLIC/anon.

SELECT '' AS secao;
SELECT '=== 05_VERIFY: ACL das RPCs novas (0098) ===' AS secao;
SELECT p.proname AS rpc, g.grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                   'reservar_pedido_atomico','liberar_pedido_atomico')
  AND g.grantee IN ('PUBLIC','anon','service_role','authenticated')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: RLS das tabelas novas (0087/0092/0097) ===' AS secao;
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: protecao 0094 (trigger) e 0095 (gatilhos NAO instalados) ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_proteger_consistencia%'
    OR t.tgname LIKE 'trigger_bloquear_pagamento%'
    OR t.tgname LIKE 'trigger_exigir_%')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: combinacoes (0097) ===' AS secao;
SELECT c.slug, c.combo_preco_unit,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.ativo
  AND (c.combo_preco_unit IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50'))
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: estado do controlled ===' AS secao;
SELECT id, controlado FROM public.reserva_proveniencia_config WHERE id = true;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: VEREDITO (fail-closed) ===' AS secao;
DO $verify$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
  v_txt text;
BEGIN
  -- objetos obrigatorios
  FOREACH v_txt IN ARRAY ARRAY[
    'public.reserva_consumos',
    'public.reserva_proveniencia',
    'public.reserva_proveniencia_config',
    'public.pedido_item_componentes']
  LOOP
    IF to_regclass(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'objeto ausente: ' || v_txt);
    END IF;
  END LOOP;

  FOREACH v_txt IN ARRAY ARRAY[
    'public.reservar_pedido_atomico(uuid)',
    'public.liberar_pedido_atomico(uuid)',
    'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)',
    'public.cancelar_pedido_atomico(uuid,text)',
    'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)',
    'public.pedido_cobertura_reserva(uuid)',
    'public.proteger_consistencia_financeira_pedido()']
  LOOP
    IF to_regprocedure(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'RPC ausente: ' || v_txt);
    END IF;
  END LOOP;

  -- coluna de combo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias'
                    AND column_name='combo_preco_unit') THEN
    v_falhas := array_append(v_falhas, 'coluna categorias.combo_preco_unit ausente (0097)');
  END IF;

  -- ACL: nenhuma RPC nova com EXECUTE para PUBLIC/anon/service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN information_schema.routine_privileges g
      ON g.specific_name = p.proname AND g.specific_schema = 'public'
    WHERE n.nspname = 'public'
      AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                        'reservar_pedido_atomico','liberar_pedido_atomico')
      AND g.grantee IN ('PUBLIC','anon','service_role')
  ) THEN
    v_falhas := array_append(v_falhas, 'ACL: RPC nova com EXECUTE para PUBLIC/anon/service_role (0098 nao aplicada ou incompleta)');
  END IF;

  -- RLS ligado nas tabelas novas
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('reserva_consumos','reserva_proveniencia','pedido_item_componentes')
       AND NOT c.relrowsecurity
  ) THEN
    v_falhas := array_append(v_falhas, 'RLS desligada em tabela nova (0087/0092/0097)');
  END IF;

  -- protecao 0094 presente
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                   JOIN pg_class c ON c.oid = t.tgrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND NOT t.tgisinternal
                    AND t.tgname = 'trigger_proteger_consistencia_financeira') THEN
    v_falhas := array_append(v_falhas, 'protecao 0094 (trigger_proteger_consistencia_financeira) ausente');
  END IF;

  -- os gates de producao (0095) nao podem estar instalados ainda
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND NOT t.tgisinternal
                AND t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')) THEN
    v_falhas := array_append(v_falhas, 'gate de producao instalado — so apos a reconciliacao das 19 reservas');
  END IF;

  -- categorias de combo ativas com preco
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias' AND column_name='combo_preco_unit') THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'categorias de combo ativas sem preco: ' || v_n::text);
    END IF;
  END IF;

  -- controlled no estado esperado
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    EXECUTE 'SELECT (controlado)::text FROM public.reserva_proveniencia_config WHERE id = true' INTO v_txt;
    IF v_txt IS DISTINCT FROM 'true' THEN
      v_falhas := array_append(v_falhas, 'controlado = ' || coalesce(v_txt,'null') || ' (esperado true apos a etapa 04)');
    END IF;
  END IF;

  -- caminho legado nao pode estar acessivel ao cliente
  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL
     AND has_function_privilege('authenticated', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda pode executar reservar_estoque_atomica (aplicar o lockdown da ACL)');
  END IF;

  IF cardinality(v_falhas) = 0 THEN
    PERFORM set_config('neia.verify', 'VERIFY_POS_CORTE_OK', false);
    RAISE NOTICE 'VERIFY_POS_CORTE_OK';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$verify$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.verify', true) AS resultado;


/*****************************************************************************
*  PASSO 7 — ATIVAR `controlado` (SÓ depois de publicar o bundle, passo 6)
*  arquivo: 04_ATIVAR-CONTROLADO.sql
*  esperado: CONTROLADO_OK
*****************************************************************************/

-- ============================================================================
-- 04_ATIVAR-CONTROLADO.sql — ATIVAÇÃO DE `reserva_proveniencia_config.controlado`
-- ============================================================================
-- Executar **SOMENTE** no ponto definido pelo plano homologado:
--
--     migrations (02)  ->  configuração (03)  ->  VERIFY (05)
--                       ->  deploy do bundle de corte
--                       ->  >>> ESTE SCRIPT <<<  ->  smoke
--                       ->  reabertura da loja
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 04_ATIVAR-CONTROLADO.sql
--
-- O script é MÍNIMO e **falha fechado**:
--   * valida que a tabela/config existe e tem exatamente 1 registro (id = true);
--   * valida que o estado atual é o esperado (controlado = false);
--   * altera SOMENTE o registro correto;
--   * confirma o resultado e aborta se algo divergir.
--
-- Não executado hoje. Executar amanhã, com autorização expressa.
-- ============================================================================

SELECT '=== 04_CONTROLADO: estado antes ===' AS secao;
SELECT id, controlado, now() AS momento
FROM public.reserva_proveniencia_config
WHERE id = true;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: validacao + ativacao (fail-closed) ===' AS secao;
DO $ativar$
DECLARE
  v_total integer;
  v_ativas integer;
  v_antes boolean;
  v_depois boolean;
  v_ret integer;
BEGIN
  -- -------------------------------------------------------------------
  -- 1) A tabela/config tem que existir (migration 0092 aplicada)
  -- -------------------------------------------------------------------
  IF to_regclass('public.reserva_proveniencia_config') IS NULL THEN
    RAISE EXCEPTION 'NO-GO: reserva_proveniencia_config nao existe (0092 nao aplicada)';
  END IF;

  -- -------------------------------------------------------------------
  -- 2) Exatamente 1 registro de configuracao, com id = true
  -- -------------------------------------------------------------------
  SELECT count(*)::int INTO v_total FROM public.reserva_proveniencia_config;
  SELECT count(*)::int INTO v_ativas FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_total <> 1 OR v_ativas <> 1 THEN
    RAISE EXCEPTION 'NO-GO: reserva_proveniencia_config deveria ter exatamente 1 registro com id=true (total=%, id_true=%)', v_total, v_ativas;
  END IF;

  -- -------------------------------------------------------------------
  -- 3) Estado anterior inesperado -> abortar (idempotencia explicita)
  -- -------------------------------------------------------------------
  SELECT controlado INTO v_antes FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'NO-GO: controlled esta NULL (valor inesperado)';
  END IF;
  IF v_antes = true THEN
    RAISE EXCEPTION 'NO-GO: controlled ja estava true antes deste passo (estado inesperado) — revisar a sequencia do cutover';
  END IF;

  -- -------------------------------------------------------------------
  -- 4) Ativar SOMENTE o registro correto
  -- -------------------------------------------------------------------
  UPDATE public.reserva_proveniencia_config
     SET controlado = true
   WHERE id = true;
  GET DIAGNOSTICS v_ret = ROW_COUNT;
  IF v_ret <> 1 THEN
    RAISE EXCEPTION 'NO-GO: update afetou % linha(s) (esperado 1) — nada foi alterado', v_ret;
  END IF;

  -- -------------------------------------------------------------------
  -- 5) Confirmar o resultado
  -- -------------------------------------------------------------------
  SELECT controlado INTO v_depois FROM public.reserva_proveniencia_config WHERE id = true;
  IF v_depois IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'NO-GO: controlled nao ficou true apos o update (valor atual: %)', coalesce(v_depois::text, 'null');
  END IF;

    PERFORM set_config('neia.controlado', 'CONTROLADO_OK', false);
  RAISE NOTICE 'CONTROLADO_OK: reserva_proveniencia_config.controlado = true';
END
$ativar$;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: estado depois ===' AS secao;
SELECT id, controlado, now() AS momento
FROM public.reserva_proveniencia_config
WHERE id = true;

SELECT '' AS secao;
SELECT '=== 04_CONTROLADO: coerencia do regime (somente leitura) ===' AS secao;
SELECT
  (SELECT controlado FROM public.reserva_proveniencia_config WHERE id = true) AS controlado,
  to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL AS rpc_0095_ok,
  to_regprocedure('public.cancelar_pedido_atomico(uuid,text)')           IS NOT NULL AS rpc_0093_ok,
  to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL AS rpc_0091_ok,
  'PROXIMO PASSO: 05_VERIFY-POS-CORTE.sql e o smoke funcional'::text AS proximo_passo;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.controlado', true) AS resultado;


/*****************************************************************************
*  PASSO 8 — VERIFICAÇÃO FINAL (rode de novo)
*  arquivo: 05_VERIFY-POS-CORTE.sql
*  esperado: VERIFY_POS_CORTE_OK
*****************************************************************************/

-- ============================================================================
-- 05_VERIFY-POS-CORTE.sql — VERIFICAÇÃO PÓS-INSTALAÇÃO (somente leitura)
-- ============================================================================
-- Executar DEPOIS de 02_MIGRATIONS-CUTOVER.sql + 03_CONFIGURACAO-CUTOVER.sql
-- e (quando o bundle já estiver publicado) de 04_ATIVAR-CONTROLADO.sql.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 05_VERIFY-POS-CORTE.sql
--
-- Saída: NOTICE VERIFY_POS_CORTE_OK  ou  EXCEPTION NO-GO (exit != 0).
-- Nenhuma escrita.
-- ============================================================================

SELECT '=== 05_VERIFY: objetos obrigatorios 0087-0098 ===' AS secao;
SELECT * FROM (
  VALUES
    ('0087','tabela','reserva_consumos',            to_regclass('public.reserva_consumos') IS NOT NULL),
    ('0089','funcao','reservar_pedido_atomico',     to_regprocedure('public.reservar_pedido_atomico(uuid)') IS NOT NULL),
    ('0090','funcao','liberar_pedido_atomico',      to_regprocedure('public.liberar_pedido_atomico(uuid)') IS NOT NULL),
    ('0091','funcao','registrar_consumo_reserva',   to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia',        to_regclass('public.reserva_proveniencia') IS NOT NULL),
    ('0092','tabela','reserva_proveniencia_config', to_regclass('public.reserva_proveniencia_config') IS NOT NULL),
    ('0093','funcao','cancelar_pedido_atomico',     to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NOT NULL),
    ('0094','funcao','proteger_consistencia_financeira_pedido', to_regprocedure('public.proteger_consistencia_financeira_pedido()') IS NOT NULL),
    ('0095','funcao','criar_pedido_com_reserva',    to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NOT NULL),
    ('0095','funcao','pedido_cobertura_reserva',    to_regprocedure('public.pedido_cobertura_reserva(uuid)') IS NOT NULL),
    ('0096','policy','RLS de parceiros/estoque',   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public')),
    ('0097','tabela','pedido_item_componentes',     to_regclass('public.pedido_item_componentes') IS NOT NULL),
    ('0097','coluna','categorias.combo_preco_unit',EXISTS (SELECT 1 FROM information_schema.columns
                                                            WHERE table_schema='public' AND table_name='categorias'
                                                              AND column_name='combo_preco_unit'))
) AS t(migration, tipo, objeto, existe)
ORDER BY migration, objeto;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: 0088 (deve continuar NAO APLICADA) ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;
-- Expectativa: as duas existem na versao 0030/0086 (base) e NAO sao chamadas
-- pelo bundle de corte (0 call sites comprovados). A 0098 revoga PUBLIC/anon.

SELECT '' AS secao;
SELECT '=== 05_VERIFY: ACL das RPCs novas (0098) ===' AS secao;
SELECT p.proname AS rpc, g.grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN information_schema.routine_privileges g
  ON g.specific_name = p.proname AND g.specific_schema = 'public'
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                   'reservar_pedido_atomico','liberar_pedido_atomico')
  AND g.grantee IN ('PUBLIC','anon','service_role','authenticated')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: RLS das tabelas novas (0087/0092/0097) ===' AS secao;
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: protecao 0094 (trigger) e 0095 (gatilhos NAO instalados) ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (t.tgname LIKE 'trigger_proteger_consistencia%'
    OR t.tgname LIKE 'trigger_bloquear_pagamento%'
    OR t.tgname LIKE 'trigger_exigir_%')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: combinacoes (0097) ===' AS secao;
SELECT c.slug, c.combo_preco_unit,
       (SELECT count(*) FROM public.produtos p
         WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50') AS itens_combo_50
FROM public.categorias c
WHERE c.ativo
  AND (c.combo_preco_unit IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.categoria_id = c.id AND p.tipo_venda='combo_50'))
ORDER BY c.slug;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: estado do controlled ===' AS secao;
SELECT id, controlado FROM public.reserva_proveniencia_config WHERE id = true;

SELECT '' AS secao;
SELECT '=== 05_VERIFY: VEREDITO (fail-closed) ===' AS secao;
DO $verify$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
  v_txt text;
BEGIN
  -- objetos obrigatorios
  FOREACH v_txt IN ARRAY ARRAY[
    'public.reserva_consumos',
    'public.reserva_proveniencia',
    'public.reserva_proveniencia_config',
    'public.pedido_item_componentes']
  LOOP
    IF to_regclass(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'objeto ausente: ' || v_txt);
    END IF;
  END LOOP;

  FOREACH v_txt IN ARRAY ARRAY[
    'public.reservar_pedido_atomico(uuid)',
    'public.liberar_pedido_atomico(uuid)',
    'public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)',
    'public.cancelar_pedido_atomico(uuid,text)',
    'public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)',
    'public.pedido_cobertura_reserva(uuid)',
    'public.proteger_consistencia_financeira_pedido()']
  LOOP
    IF to_regprocedure(v_txt) IS NULL THEN
      v_falhas := array_append(v_falhas, 'RPC ausente: ' || v_txt);
    END IF;
  END LOOP;

  -- coluna de combo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias'
                    AND column_name='combo_preco_unit') THEN
    v_falhas := array_append(v_falhas, 'coluna categorias.combo_preco_unit ausente (0097)');
  END IF;

  -- ACL: nenhuma RPC nova com EXECUTE para PUBLIC/anon/service_role
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN information_schema.routine_privileges g
      ON g.specific_name = p.proname AND g.specific_schema = 'public'
    WHERE n.nspname = 'public'
      AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                        'reservar_pedido_atomico','liberar_pedido_atomico')
      AND g.grantee IN ('PUBLIC','anon','service_role')
  ) THEN
    v_falhas := array_append(v_falhas, 'ACL: RPC nova com EXECUTE para PUBLIC/anon/service_role (0098 nao aplicada ou incompleta)');
  END IF;

  -- RLS ligado nas tabelas novas
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('reserva_consumos','reserva_proveniencia','pedido_item_componentes')
       AND NOT c.relrowsecurity
  ) THEN
    v_falhas := array_append(v_falhas, 'RLS desligada em tabela nova (0087/0092/0097)');
  END IF;

  -- protecao 0094 presente
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                   JOIN pg_class c ON c.oid = t.tgrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname='public' AND NOT t.tgisinternal
                    AND t.tgname = 'trigger_proteger_consistencia_financeira') THEN
    v_falhas := array_append(v_falhas, 'protecao 0094 (trigger_proteger_consistencia_financeira) ausente');
  END IF;

  -- os gates de producao (0095) nao podem estar instalados ainda
  IF EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND NOT t.tgisinternal
                AND t.tgname IN ('trigger_exigir_reserva_producao','trigger_exigir_consumo_producao')) THEN
    v_falhas := array_append(v_falhas, 'gate de producao instalado — so apos a reconciliacao das 19 reservas');
  END IF;

  -- categorias de combo ativas com preco
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias' AND column_name='combo_preco_unit') THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'categorias de combo ativas sem preco: ' || v_n::text);
    END IF;
  END IF;

  -- controlled no estado esperado
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    EXECUTE 'SELECT (controlado)::text FROM public.reserva_proveniencia_config WHERE id = true' INTO v_txt;
    IF v_txt IS DISTINCT FROM 'true' THEN
      v_falhas := array_append(v_falhas, 'controlado = ' || coalesce(v_txt,'null') || ' (esperado true apos a etapa 04)');
    END IF;
  END IF;

  -- caminho legado nao pode estar acessivel ao cliente
  IF to_regprocedure('public.reservar_estoque_atomica(uuid,uuid,integer)') IS NOT NULL
     AND has_function_privilege('authenticated', 'public.reservar_estoque_atomica(uuid,uuid,integer)', 'EXECUTE') THEN
    v_falhas := array_append(v_falhas, 'authenticated ainda pode executar reservar_estoque_atomica (aplicar o lockdown da ACL)');
  END IF;

  IF cardinality(v_falhas) = 0 THEN
    PERFORM set_config('neia.verify', 'VERIFY_POS_CORTE_OK', false);
    RAISE NOTICE 'VERIFY_POS_CORTE_OK';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$verify$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.verify', true) AS resultado;


/*****************************************************************************
*  PASSO 9 — SMOKE ESTRUTURAL
*  arquivo: 06_SMOKE-DATABASE.sql
*  esperado: SMOKE_DATABASE_OK
*****************************************************************************/

-- ============================================================================
-- 06_SMOKE-DATABASE.sql — SMOKE ESTRUTURAL (somente leitura)
-- ============================================================================
-- Executar depois das migrations (e depois do deploy, para checar o regime).
-- NÃO cria pedidos: os testes FUNCIONAIS (checkout, PDV, combo, consumo,
-- cancelamento) são feitos no aplicativo, depois do deploy.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 06_SMOKE-DATABASE.sql
--
-- Valida: funções chamáveis, tipos de retorno, constraints, triggers, policies,
-- configurações, combo_preco_unit, controlled e os objetos de
-- proveniência/consumo/cancelamento.
-- ============================================================================

SELECT '=== 06_SMOKE: 1. funcoes e assinatura ===' AS secao;
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid)               AS retorno,
       p.prosecdef                               AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                    'reservar_pedido_atomico','liberar_pedido_atomico','pedido_cobertura_reserva',
                    'exigir_reserva_producao','exigir_consumo_producao',
                    'proteger_consistencia_financeira_pedido')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 2. tabelas e policies ===' AS secao;
SELECT c.relname AS tabela, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 3. constraints das tabelas novas ===' AS secao;
SELECT conrelid::regclass AS tabela, conname, contype,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid IN ('public.reserva_consumos'::regclass,
                   'public.reserva_proveniencia'::regclass,
                   'public.pedido_item_componentes'::regclass)
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 4. indices das tabelas novas ===' AS secao;
SELECT tablename AS tabela, indexname AS indice
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('reserva_consumos','reserva_proveniencia','pedido_item_componentes')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 5. triggers do regime novo ===' AS secao;
SELECT t.tgname AS trigger, c.relname AS tabela, p.proname AS funcao,
       CASE t.tgenabled WHEN 'O' THEN 'ATIVO' ELSE 'DESATIVADO' END AS estado
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('pedidos','pedido_itens','reservas_estoque','reserva_consumos','reserva_proveniencia','pedido_item_componentes')
ORDER BY 2, 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 6. policies (RLS) do regime novo ===' AS secao;
SELECT tablename AS tabela, policyname AS policy, permissive, roles::text, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reserva_consumos','reserva_proveniencia','reserva_proveniencia_config','pedido_item_componentes')
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 7. configuracoes (controlado + combo) ===' AS secao;
SELECT 'controlado' AS item, (SELECT controlado::text FROM public.reserva_proveniencia_config WHERE id = true) AS valor
UNION ALL
SELECT 'combo_preco_unit:' || c.slug, c.combo_preco_unit::text
FROM public.categorias c
WHERE c.slug IN ('mini-fritos','mini-assados','mini-pasteis','mini-pizzas','mini-empadinhas')
UNION ALL
SELECT 'combos_ativos_sem_preco',
       (SELECT count(*)::text FROM public.categorias c
         WHERE c.ativo AND c.combo_preco_unit IS NULL
           AND EXISTS (SELECT 1 FROM public.produtos p
                        WHERE p.categoria_id = c.id AND p.tipo_venda = 'combo_50'))
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 8. objetos de proveniencia / consumo / cancelamento ===' AS secao;
DO $contagens$
DECLARE
  v_n integer;
  v_prv integer; v_con integer; v_res integer; v_comp integer;
BEGIN
  EXECUTE 'SELECT count(*)::int FROM public.reserva_proveniencia'   INTO v_prv;
  EXECUTE 'SELECT count(*)::int FROM public.reserva_consumos'      INTO v_con;
  EXECUTE 'SELECT count(*)::int FROM public.reservas_estoque'      INTO v_res;
  EXECUTE 'SELECT count(*)::int FROM public.pedido_item_componentes' INTO v_comp;
  RAISE NOTICE 'reserva_proveniencia=%, reserva_consumos=%, reservas_estoque=%, pedido_item_componentes=%',
    v_prv, v_con, v_res, v_comp;
END
$contagens$;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 9. cobertura de proveniencia (as legadas ficam em quarentena) ===' AS secao;
SELECT
  count(*) FILTER (WHERE r.status = 'ativa')                              AS reservas_ativas,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL)     AS ativas_sem_proveniencia,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NOT NULL) AS ativas_com_proveniencia
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id;
-- Nota: as 19 reservas historicas aparecem como `ativas_sem_proveniencia` — e
-- isso e ESPERADO (quarentena). O smoke funcional valida o regime novo.

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 10. grants effective das RPCs novas ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_executa,
       (SELECT count(*) FROM information_schema.routine_privileges g
         WHERE g.specific_name = p.proname AND g.specific_schema = 'public'
           AND g.grantee = 'PUBLIC') > 0 AS public_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_pedido_com_reserva','cancelar_pedido_atomico','registrar_consumo_reserva',
                    'reservar_pedido_atomico','liberar_pedido_atomico')
ORDER BY 1;

SELECT '' AS secao;
SELECT '=== 06_SMOKE: 11. legadas: nao executaveis pelo cliente apos o lockdown ===' AS secao;
SELECT p.proname AS rpc,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('reservar_estoque_atomica','liberar_reserva_atomica')
ORDER BY 1;
-- Expectativa: `false` para ambas APOS o lockdown de ACL do cutover.

SELECT '' AS secao;
SELECT '=== 06_SMOKE: VEREDITO ===' AS secao;
DO $smoke$
DECLARE
  v_falhas text[] := ARRAY[]::text[];
  v_n integer;
BEGIN
  IF to_regprocedure('public.criar_pedido_com_reserva(uuid,text,jsonb,jsonb)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0095 ausente');
  END IF;
  IF to_regprocedure('public.cancelar_pedido_atomico(uuid,text)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0093 ausente');
  END IF;
  IF to_regprocedure('public.registrar_consumo_reserva(uuid,integer,uuid,uuid,text)') IS NULL THEN
    v_falhas := array_append(v_falhas, 'RPC 0091 ausente');
  END IF;
  IF to_regclass('public.reserva_consumos') IS NULL THEN
    v_falhas := array_append(v_falhas, 'tabela reserva_consumos ausente');
  END IF;
  IF to_regclass('public.pedido_item_componentes') IS NULL THEN
    v_falhas := array_append(v_falhas, 'tabela pedido_item_componentes ausente');
  END IF;
  IF to_regclass('public.categorias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categorias' AND column_name='combo_preco_unit') THEN
    EXECUTE 'SELECT count(*)::int FROM public.categorias c
              WHERE c.ativo AND c.combo_preco_unit IS NULL
                AND EXISTS (SELECT 1 FROM public.produtos p
                             WHERE p.categoria_id = c.id AND p.tipo_venda = ''combo_50'')' INTO v_n;
    IF v_n > 0 THEN
      v_falhas := array_append(v_falhas, 'combos ativos sem preco: ' || v_n::text);
    END IF;
  END IF;
  IF cardinality(v_falhas) = 0 THEN
        PERFORM set_config('neia.smoke', 'SMOKE_DATABASE_OK', false);
    RAISE NOTICE 'SMOKE_DATABASE_OK: estrutura do regime novo conforme';
  ELSE
    RAISE EXCEPTION 'NO-GO: %', array_to_string(v_falhas, ' | ');
  END IF;
END
$smoke$;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.smoke', true) AS resultado;


/*****************************************************************************
*  PASSO 10 — QUARENTENA DAS 19 RESERVAS (read-only)
*  arquivo: 07_QUARENTENA-19-RESERVAS.sql
*  esperado: QUARENTENA_OK
*****************************************************************************/

-- ============================================================================
-- 07_QUARENTENA-19-RESERVAS.sql — LEITURA DA QUARANTENA (somente SELECT)
-- ============================================================================
-- Objetivo:
--   * localizar as reservas historicas;
--   * classifica-las (mesma taxonomia da auditoria);
--   * confirmar que continuam ISOLADAS (sem proveniencia / sem ledger);
--   * confirmar que NAO houve credito automatico;
--   * detectar se apareceu alguma reserva historica PROBLEMATICA nova.
--
-- NÃO faz UPDATE. NÃO faz DELETE. NÃO faz INSERT. NÃO altera estoque.
-- Nenhuma correcao pode ser feita aqui: qualquer ajuste exige revisao manual,
-- conferencia fisica e autorizacao explicita, fora deste arquivo.
--
--   psql "$DATABASE_URL" --no-password --set ON_ERROR_STOP=1 --file 07_QUARENTENA-19-RESERVAS.sql
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT '=== 07_QUARANTENA: 1. universo classificado (detalhe) ===' AS secao;
WITH base AS (
  SELECT
    r.id            AS reserva_id,
    r.pedido_id,
    r.produto_id,
    r.quantidade,
    r.status        AS reserva_status,
    r.created_at,
    p.status        AS pedido_status,
    p.pagamento_status,
    p.total         AS pedido_total,
    pr.reserva_id   AS prov_reserva_id,
    pr.origem       AS prov_origem,
    em.tipo         AS mov_tipo,
    em.quantidade   AS mov_quantidade,
    (SELECT count(*) FROM public.reserva_proveniencia x
      WHERE x.reserva_id = r.id) AS prov_count,
    (SELECT coalesce(sum(rc.quantidade), 0) FROM public.reserva_consumos rc
      WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id
  WHERE r.status IN ('ativa','consumida')
), classificado AS (
  SELECT b.*,
    CASE
      WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa'
        THEN 'pedido_cancelado_reserva_ativa'
      WHEN b.prov_count > 1
        THEN 'divergente_multipla_proveniencia'
      WHEN b.consumido > b.quantidade
        THEN 'divergente_consumo_excedente'
      WHEN b.prov_count = 1 AND b.consumido = b.quantidade
        THEN 'comprovada_por_proveniencia_e_consumo'
      WHEN b.prov_count = 1
        THEN 'comprovada_por_proveniencia'
      WHEN b.consumido = b.quantidade AND b.reserva_status = 'consumida'
        THEN 'comprovada_por_consumo'
      WHEN b.consumido > 0
        THEN 'parcial_sem_proveniencia'
      ELSE 'legado_sem_evidencia'
    END AS classe
  FROM base b
)
SELECT
  c.classe,
  c.acao_proposta,
  count(*)                     AS reservas,
  coalesce(sum(c.quantidade),0) AS unidades,
  min(c.created_at)            AS mais_antiga,
  max(c.created_at)            AS mais_recente
FROM (
  SELECT cl.*,
    CASE cl.classe
      WHEN 'comprovada_por_proveniencia_e_consumo' THEN 'sem_acao'
      WHEN 'comprovada_por_proveniencia'           THEN 'sem_acao'
      WHEN 'comprovada_por_consumo'                THEN 'sem_acao'
      WHEN 'pedido_cancelado_reserva_ativa'        THEN 'revisao_manual'
      WHEN 'divergente_multipla_proveniencia'      THEN 'revisao_manual'
      WHEN 'divergente_consumo_excedente'          THEN 'revisao_manual'
      WHEN 'parcial_sem_proveniencia'              THEN 'revisao_manual'
      ELSE 'quarentena_sem_credito'
    END AS acao_proposta
  FROM classificado cl
) c
GROUP BY 1, 2
ORDER BY 1, 2;

SELECT '' AS secao;
SELECT '=== 07_QUARENTENA: 2. detalhe linha a linha (quarentena) ===' AS secao;
WITH base AS (
  SELECT r.id AS reserva_id, r.pedido_id, r.produto_id, r.quantidade,
         r.status AS reserva_status, r.created_at,
         p.status AS pedido_status, p.pagamento_status,
         (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) AS prov_count,
         (SELECT coalesce(sum(rc.quantidade),0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) AS consumido
  FROM public.reservas_estoque r
  LEFT JOIN public.pedidos p ON p.id = r.pedido_id
  WHERE r.status IN ('ativa','consumida')
)
SELECT
  b.*,
  CASE
    WHEN b.pedido_status = 'cancelado' AND b.reserva_status = 'ativa' THEN 'pedido_cancelado_reserva_ativa'
    WHEN b.prov_count > 1 THEN 'divergente_multipla_proveniencia'
    WHEN b.consumido > b.quantidade THEN 'divergente_consumo_excedente'
    WHEN b.consumido > 0 AND b.prov_count = 0 THEN 'parcial_sem_proveniencia'
    WHEN b.consumido = 0 AND b.prov_count = 0 THEN 'legado_sem_evidencia'
    ELSE 'comprovada'
  END AS classe
FROM base b
ORDER BY b.created_at, b.reserva_id;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 3. ausencia de credito automatico ===' AS secao;
-- Uma reserva em quarentena NUNCA pode ter gerado credito de estoque.
-- Verificacao: nenhuma reserva sem proveniencia tem movimento de 'liberacao'/
-- 'cancelamento' associado, e nenhuma delas aparece como 'devolucao'.
SELECT
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL)                     AS ativas_sem_proveniencia,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
                     AND em.tipo IN ('liberacao','cancelamento','devolucao'))              AS ativas_com_credito,
  count(*) FILTER (WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
                     AND em.id IS NOT NULL)                                              AS ativas_com_movimento_sem_proveniencia,
  'quarentena nao gera credito: nenhuma reserva sem proveniencia tem movimento de liberacao' AS conclusao
FROM public.reservas_estoque r
LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 4. integridade estrutural (NAO "corrigir" com UPDATE) ===' AS secao;
SELECT
  count(*) FILTER (WHERE produto_id IS NULL)  AS reservas_sem_produto,
  count(*) FILTER (WHERE pedido_id IS NULL)   AS reservas_sem_pedido,
  count(*) FILTER (WHERE quantidade <= 0)     AS reservas_quantidade_invalida,
  count(*) FILTER (WHERE status = 'ativa' AND produto_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp
                                    WHERE rp.reserva_id = reservas_estoque.id))
                                               AS ativas_sem_proveniencia
FROM public.reservas_estoque;

SELECT '' AS secao;
SELECT '=== 07_QUARANTENA: 5. isolamento do regime novo (as legadas NAO bloqueiam o fluxo) ===' AS secao;
-- As reservas do regime novo tem proveniencia; as legadas nao. Os dois
-- universos coexistem sem interferencia: e o que a prova de isolamento valida.
SELECT
  (SELECT count(*) FROM public.reservas_estoque r
    WHERE r.status = 'ativa' AND EXISTS (SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id))
    AS reservas_do_regime_novo,
  (SELECT count(*) FROM public.reservas_estoque r
    WHERE r.status = 'ativa' AND NOT EXISTS (SELECT 1 FROM public.reserva_proveniencia rp WHERE rp.reserva_id = r.id))
    AS reservas_em_quarentena;

SELECT '' AS secao;
SELECT '=== 07_QUARENTENA: VEREDITO (fail-closed) ===' AS secao;
DO $quarentena$
DECLARE
  v_criticas integer;
  v_credito  integer;
BEGIN
  -- Divergencias CRITICAS: nao podem existir (se aparecerem => NO-GO).
  SELECT count(*)::int INTO v_criticas FROM (
    SELECT 1 FROM public.reservas_estoque r
    LEFT JOIN public.pedidos p ON p.id = r.pedido_id
    LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
    WHERE r.status IN ('ativa','consumida')
      AND ( (SELECT count(*) FROM public.reserva_proveniencia x WHERE x.reserva_id = r.id) > 1
         OR (SELECT coalesce(sum(rc.quantidade),0) FROM public.reserva_consumos rc WHERE rc.reserva_id = r.id) > r.quantidade )
  ) x;

  IF v_criticas > 0 THEN
    RAISE EXCEPTION 'NO-GO: % reserva(s) historica(s) com divergencia critica (multipla proveniencia ou consumo excedente)', v_criticas;
  END IF;

  -- Credito automatico: nenhuma reserva sem proveniencia pode ter movimento de liberacao.
  SELECT count(*)::int INTO v_credito
  FROM public.reservas_estoque r
  LEFT JOIN public.reserva_proveniencia pr ON pr.reserva_id = r.id
  LEFT JOIN public.estoque_movimentacoes em ON em.id = pr.estoque_movimentacao_id
  WHERE r.status = 'ativa' AND pr.reserva_id IS NULL
    AND em.tipo IN ('liberacao','cancelamento','devolucao');

  IF v_credito > 0 THEN
    RAISE EXCEPTION 'NO-GO: % reserva(s) em quarentena com credito automatico', v_credito;
  END IF;

    PERFORM set_config('neia.quarentena', 'QUARENTENA_OK', false);
  RAISE NOTICE 'QUARENTENA_OK: reservas historicas classificadas, isoladas e sem credito automatico';
END
$quarentena$;

ROLLBACK;

-- Veredicto como linha de resultado (visivel no SQL Editor)
SELECT current_setting('neia.quarentena', true) AS resultado;


==============================================================================
FIM DA COLA. Entre o PASSO 5 e o PASSO 7, publique o bundle de corte
(git push -> a Lovable recompila com .env.production) e confirme
GET /api/versao => {"atual":"1792429500000","minimo":"1792429500000","corte":true}
==============================================================================