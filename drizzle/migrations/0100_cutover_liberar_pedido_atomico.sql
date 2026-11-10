-- 0100: CUTOVER liberar_pedido_atomico — adaptação da 0090 ao banco staging
-- ruioyioynwwwiqbjznoa (2026-11-10, pré-Production).
-- ============================================================================
-- ÚNICA DIFERENÇA DA 0090 ORIGINAL: o regime de proveniência é lido como
-- 0088/0089 fazem (via to_regclass('public.reserva_proveniencia_config') +
-- SELECT controlado), e NÃO pela mera existência da tabela. No staging
-- reserva_proveniencia_config.controlado=false (regime conservador; marcadores
-- não são gravados), logo o teste original "tabela existe => exigir marcador"
-- invalidaria TODO cancelamento (reconciliacao_pendente sempre). Aqui:
--   - controlado=true  => marcador de proveniência exigido (idêntico à 0090);
--   - controlado=false => a prova continua sendo o LEDGER (exatamente 1 débito
--     coerente por reserva ativa), a mesma prova usada pela 0099.
-- Demais passos idênticos à 0090 (locks L1 pedidos → L2 produtos → reservas,
-- fail-closed em qualquer inconsistência sem crédito, idempotência).
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
  -- Regime de proveniência (ADAPTAÇÃO CUTOVER 0100): lido como 0088/0089 —
  -- com guard to_regclass — em vez do teste de existência da tabela.
  v_has_prov := false;
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT COALESCE(c.controlado, false)
      INTO v_has_prov
    FROM public.reserva_proveniencia_config c
    WHERE c.id = true;
  END IF;

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
         OR (v_has_prov AND (
               v_marker_n <> 1
               OR v_marker_mov IS DISTINCT FROM v_mov_id
             )) THEN
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
  'integral (retry idempotente). ADAPTAÇÃO CUTOVER 0100: o regime de '
  'proveniência é lido como 0088/0089 (reserva_proveniencia_config.controlado '
  'com guard to_regclass). controlado=true => marcador de proveniência exigido '
  '(1 marcador apontando para o próprio débito); controlado=false => a prova '
  'para reservas ativas é o LEDGER (exatamente 1 débito coerente) e o marcador '
  'NÃO é exigido — compatível com o regime conservador do staging. Itens de '
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
