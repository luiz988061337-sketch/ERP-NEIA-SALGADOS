-- 0101: CUTOVER cancelar_pedido_atomico — 0093 aplicada TAL QUAL no staging
-- ruioyioynwwwiqbjznoa (2026-11-10, pré-Production).
-- ============================================================================
-- A 0093 NÃO precisa de adaptação: não lê regime de proveniência — toda a
-- checagem de proveniência/ledger é interna da 0100 (liberar_pedido_atomico),
-- que é precisamente a versão adaptada (leitura de controlado como 0088/0089).
-- Under controlado=false, o fail-closed de 0100 usa prova de LEDGER.
-- Orquestrador idêntico à 0093 revisada: só cancela status 'recebido' +
-- pagamento 'pendente'; pago/processado => pagamento_nao_elegivel (sem
-- estorno externo); idempotente (ja_cancelado); EXCEPTION em qualquer
-- não-sucesso da 0100 => rollback total; grava pedido_status_historico.
--
-- (cabeçalho original da 0093 mantido para rastreabilidade)
-- ============================================================================
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
