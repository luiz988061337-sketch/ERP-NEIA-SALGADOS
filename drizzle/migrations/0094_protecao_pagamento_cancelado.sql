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
