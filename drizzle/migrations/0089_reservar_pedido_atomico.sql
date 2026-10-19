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
