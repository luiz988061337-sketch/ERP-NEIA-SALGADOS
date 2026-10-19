-- 0088: reservar_estoque_atomica — reserva atômica com rastreabilidade por reserva
-- ============================================================================
-- STATUS: PROPOSTA / PREPARADA — NÃO APLICADA.
-- NÃO executar sem autorização expressa. Revisão + staging antes de aplicar.
-- Substitui (CREATE OR REPLACE) a MESMA assinatura de 0030/0068/0086.
-- INSTALACAO: CUTOVER. Substitui a RPC viva reservar_estoque_atomica, cujo unico
--   chamador hoje e o checkout (src/routes/checkout.tsx). Quando TODOS os
--   chamadores antigos forem migrados para 0095/0089, a 0088 deixa de ser
--   necessaria e PODE PERMANECER NAO INSTALADA. Se instalada, somente durante o
--   cutover coordenado (ver cabecalho da 0095).
--
-- MODELO 2 (etapas 1.18–1.24):
--   - produtos.estoque = saldo DISPONÍVEL;
--   - a reserva debita o disponível UMA única vez;
--   - rastreabilidade individual: referencia_id = reservas_estoque.id;
--   - ledger de SALDO = estoque_movimentacoes, tipo enum 'reserva', quantidade
--     NEGATIVA, com saldo_anterior/posterior reais;
--   - NÃO grava em estoque_mov e NÃO usa registrar_mov_estoque (evita 2ª baixa).
--
-- ============================================================================
-- CONTRATO DE QUANTIDADE (Tarefa 1 da etapa 1.24)
-- ============================================================================
-- Chamador atual (único): src/routes/checkout.tsx:551-557, uma chamada por
-- linha do carrinho, com p_qtd = Math.floor(linha.quantidade), APÓS inserir os
-- pedido_itens (checkout.tsx:522).
--   - 0030/0068 definiam p_qtd como "total desejado" (não aditivo, não
--     "pendente"): já_reservado = Σ ativas; falta = p_qtd − já_reservado.
--   - 0088 TORNA O ALVO AUTORITATIVO: falta = Σ(pedido_itens.quantidade) −
--     Σ(ativas). p_qtd passa a ser apenas VALIDADO (p_qtd ≤ Σ itens).
--   Compatibilidade: no caso normal (1 linha por produto) Σ itens = p_qtd, logo
--     o comportamento é IDÊNTICO ao da 0068. Diferença (melhoria) apenas quando
--     houver 2+ linhas do mesmo produto (ex.: orçamento com linhas distintas do
--     mesmo produto_id): a 0068 subreservava (risco de venda acima do estoque);
--     a 0088 reserva o total efetivamente pedido.
--   Consumo parcial (0090): reservas_estoque.quantidade e status 'ativa' não
--     mudam ao consumir; portanto Σ ativas segue contando o total reivindicado
--     e repetir a chamada continua sendo no-op (idempotente). Correto: após o
--     consumo não se deve reservar de novo o mesmo pedido.
--
-- ============================================================================
-- VALIDAÇÃO DE ITENS (Tarefa 2 da etapa 1.24)
-- ============================================================================
--   - O produto PRECISA constar do pedido (Σ pedido_itens > 0), senão retorna
--     false — impede reservar produto alheio ao pedido (esvaziar estoque de
--     terceiros) por parte do dono/staff.
--   - p_qtd > Σ itens ⇒ false (impede reserva EXCESSIVA além do pedido).
--   - O alvo é Σ itens (não p_qtd): cobre linhas duplicadas do mesmo produto.
--   - Pré-condição do chamador: os itens são inseridos ANTES da RPC
--     (checkout.tsx:522 -> :551). Se essa ordem mudar no checkout, a função
--     passa a retornar false — registrar como dependência de integração.
--
-- ============================================================================
-- RESERVAS SEM ORIGEM / LEGADO (Tarefa 3 da etapa 1.24) — BLOQUEADOR REGISTRADO
-- ============================================================================
--   - Existem (relatado) 19 reservas ativas / 215 un. SEM movimentação em
--     nenhum ledger (origem: fallback do checkout, insert direto em
--     reservas_estoque). São "órfãs" (sem rastreabilidade).
--   - Regime NÃO controlado (controlado=false, padrão): postura CONSERVADORA —
--     conta as órfãs em v_ja_total para evitar débito duplo (seguro), mas AINDA
--     PODE retornar true (no-op) para um par cuja reserva é órfã. Isto é um
--     "sucesso enganoso" tolerado APENAS enquanto o checkout (chamador) não
--     souber distinguir "reconciliação pendente" de "sem estoque".
--   - Regime CONTROLADO (controlado=true, habilitado só após 0092 + ativação
--     coordenada): reserva ativa SEM marcador de proveniência => RAISE
--     (rollback total, sem débito, sem true). Não marca retroativamente e não
--     converte órfã em sucesso idempotente. NÃO devolve false (que o checkout
--     atual interpretaria como estoque insuficiente e dispararia o caminho
--     destrutivo antigo).
--   - POR QUE NÃO FALHAR SEMPRE (bloqueador): a assinatura é boolean, e o
--     checkout trata `false` como ESTOQUE INSUFICIENTE — disparando
--     liberar_reserva_atomica (0030/0068), que CREDITA produtos.estoque das
--     linhas órfãs (débito nunca ocorreu) e muda status p/ 'liberada'.
--     Alternativa (a executar com autorização): (a) ajustar checkout para
--     distinguir "reconciliação pendente" de "sem estoque", ou (b) usar a via
--     por pedido (0089, jsonb) que já devolve status explícito.
--
-- ============================================================================
-- PROVENIÊNCIA (0092, etapa 1.39)
-- ============================================================================
--   - Lê reserva_proveniencia_config.controlado de forma SEGURA (to_regclass):
--     se a 0092 não estiver instalada, o regime fica desligado e nada quebra.
--   - Quando controlado, cria o marcador na MESMA transação do débito, gravando
--     o id da movimentação (RETURNING id) => origem exata e verificável.
--   - Falha de qualquer escrita obrigatória => exceção => rollback integral.
--
-- ============================================================================
-- AUTORIZAÇÃO (preservada da 0068): dono do pedido (pedidos.user_id = auth.uid(),
--   ambos não nulos) OU staff operacional (admin/producao/atendente);
--   auth.uid() nulo => nega. Status elegível: 'recebido' ou 'em_producao'.
--
-- ORDEM DE LOCKS (igual a 0089/0090): L1 pedidos -> L2 produtos.
--
-- IDEMPOTÊNCIA: falta = Σ(pedido_itens) − Σ(ativas); repetir chamada = no-op
--   (true); o lock do pedido serializa chamadas concorrentes do MESMO pedido.
--
-- DEPENDÊNCIAS: estoque_movimentacoes (0042) precisa existir com
--   referencia_id/referencia_tipo/tipo/saldos. (A detecção de órfãs, quando
--   habilitada, usará essas colunas; sem índice dedicado — avaliar 0089/0091.)
--
-- REVERSÃO: reaplicar o corpo da 0068 (CREATE OR REPLACE). Efeitos em DADOS
--   (reservas + ledger) PERSISTEM para reservas já criadas => backup antes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reservar_estoque_atomica(
  p_pedido_id  uuid,
  p_produto_id uuid,
  p_qtd        integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_dono       uuid;
  v_status     public.order_status;
  v_eh_staff   boolean;
  v_solicitado integer;
  v_ja_total   integer;
  v_falta      integer;
  v_estoque    integer;
  v_reserva_id uuid;
  v_mov_id     uuid;
  v_controlado boolean := false;
  v_orfa       integer;
BEGIN
  -- 1. Entrada válida (p_qtd segue exigido; é validado no passo 6).
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RETURN false;
  END IF;

  -- 2. Autenticação (auth.uid() é a única fonte de identidade).
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 3. L1: travar o pedido e ler dono/status.
  SELECT user_id, status
    INTO v_dono, v_status
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 4. Autorização: dono OU staff operacional (inalterado da 0068).
  v_eh_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'producao')
             OR public.has_role(v_uid, 'atendente');

  IF v_dono IS NULL THEN
    IF NOT v_eh_staff THEN
      RETURN false;
    END IF;
  ELSIF v_dono IS DISTINCT FROM v_uid AND NOT v_eh_staff THEN
    RETURN false;
  END IF;

  -- 5. Status elegível.
  IF v_status NOT IN ('recebido', 'em_producao') THEN
    RETURN false;
  END IF;

  -- 5b. Proveniência (0092): ler o controle de forma SEGURA. A 0092 pode não
  --     estar instalada; nesse caso to_regclass() devolve NULL e o regime
  --     controlado permanece desligado (sem marcador), sem exceção.
  IF to_regclass('public.reserva_proveniencia_config') IS NOT NULL THEN
    SELECT controlado
      INTO v_controlado
    FROM public.reserva_proveniencia_config
    WHERE id = true;
    v_controlado := COALESCE(v_controlado, false);
  END IF;

  -- 6. VALIDAÇÃO DE ITEM e alvo autoritativo (Σ pedido_itens).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_solicitado
  FROM public.pedido_itens
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id;

  IF v_solicitado <= 0 THEN
    RETURN false;   -- produto não pertence ao pedido
  END IF;
  IF p_qtd > v_solicitado THEN
    RETURN false;   -- pedido de reserva acima do total do item
  END IF;

  -- 6b. Regime controlado (0092): reserva ATIVA sem marcador confiável NÃO pode
  --     ser tratada como sucesso idempotente. Como a assinatura é boolean e a
  --     alternativa (false) dispararia caminho destrutivo no checkout atual,
  --     falhamos EXPLICITAMENTE (rollback total, sem débito e sem true).
  --     Nunca marca retroativamente: só considera "solucionado" com o marcador.
  IF v_controlado THEN
    SELECT COUNT(*)
      INTO v_orfa
    FROM public.reservas_estoque r
    WHERE r.pedido_id = p_pedido_id
      AND r.produto_id = p_produto_id
      AND r.status = 'ativa'
      AND NOT EXISTS (
        SELECT 1 FROM public.reserva_proveniencia rp
        WHERE rp.reserva_id = r.id
      );
    IF v_orfa > 0 THEN
      RAISE EXCEPTION
        'reconciliacao_pendente: reserva ativa sem proveniencia (pedido %, produto %)',
        p_pedido_id, p_produto_id;
    END IF;
  END IF;

  -- 7. Idempotência: quanto já reservado (inclui legado, postura conservadora).
  SELECT COALESCE(SUM(quantidade), 0)
    INTO v_ja_total
  FROM public.reservas_estoque
  WHERE pedido_id = p_pedido_id
    AND produto_id = p_produto_id
    AND status = 'ativa';

  v_falta := v_solicitado - v_ja_total;
  IF v_falta <= 0 THEN
    RETURN true;   -- já reservado: no-op idempotente
  END IF;

  -- 8. L2: travar o produto e ler o saldo disponível.
  SELECT estoque
    INTO v_estoque
  FROM public.produtos
  WHERE id = p_produto_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 9. Impedir saldo disponível negativo.
  IF v_estoque < v_falta THEN
    RETURN false;
  END IF;

  -- 10. Identidade própria da reserva.
  v_reserva_id := gen_random_uuid();

  -- 11. Débito ÚNICO do disponível.
  UPDATE public.produtos
     SET estoque = v_estoque - v_falta
   WHERE id = p_produto_id;

  -- 12. Cria a reserva (id explícito = chave de rastreabilidade).
  INSERT INTO public.reservas_estoque (id, pedido_id, produto_id, quantidade, status)
  VALUES (v_reserva_id, p_pedido_id, p_produto_id, v_falta, 'ativa');

  -- 13. Ledger de saldo (append; NÃO estoque_mov; NÃO registrar_mov_estoque).
  --     RETURNING id => amarra o marcador ao débito LEGÍTIMO desta transação.
  INSERT INTO public.estoque_movimentacoes (
    produto_id, lote_id, tipo, quantidade,
    saldo_anterior, saldo_posterior,
    referencia_id, referencia_tipo, usuario_id, observacao
  ) VALUES (
    p_produto_id,
    NULL,
    'reserva',
    -v_falta,
    v_estoque,
    v_estoque - v_falta,
    v_reserva_id,
    'reserva_estoque',
    v_uid,
    'Reserva de estoque (Modelo 2) pedido ' || p_pedido_id::text
  )
  RETURNING id INTO v_mov_id;

  -- 14. Marcador de proveniência (0092), na MESMA transação do débito legítimo.
  --     Só sob regime controlado. A FK composta valida a associação
  --     reserva<->pedido<->produto<->quantidade e o UNIQUE amarra ao débito
  --     exato (v_mov_id). Se a escrita obrigatória falhar, o erro aborta a
  --     transação inteira (sem sucesso parcial, sem marcador separado do débito).
  IF v_controlado THEN
    INSERT INTO public.reserva_proveniencia (
      reserva_id, pedido_id, produto_id, quantidade,
      origem, estoque_movimentacao_id, criado_por
    ) VALUES (
      v_reserva_id, p_pedido_id, p_produto_id, v_falta,
      '0088', v_mov_id, v_uid
    );
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) IS
  '0088: reserva atômica (Modelo 2). Alvo autoritativo = Σ pedido_itens do par '
  '(pedido,produto); p_qtd apenas validado (≤ Σ). Exige produto pertencente ao '
  'pedido. Debita o disponível UMA vez, cria reserva com id próprio e registra '
  'no ledger estoque_movimentacoes (referencia_id=reserva.id, '
  'referencia_tipo=reserva_estoque, tipo=reserva). NÃO grava em estoque_mov. '
  'Proveniência (0092): sob regime controlado cria o marcador na mesma transação '
  '(com o id do débito); reserva ativa sem marcador => exceção reconciliacao_pendente. '
  'Idempotente por (pedido,produto). Legado órfão: contabilizado p/ evitar débito '
  'duplo sem regime controlado; classificação explícita pendente de mudança no checkout.';

-- ----------------------------------------------------------------------------
-- Permissões de execução: apenas authenticated/service_role (nunca anon/PUBLIC).
-- (A função já nega anon internamente via auth.uid() nulo; isto é defesa extra.)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_atomica(uuid, uuid, integer) TO authenticated, service_role;
