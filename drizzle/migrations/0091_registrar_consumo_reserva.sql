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
