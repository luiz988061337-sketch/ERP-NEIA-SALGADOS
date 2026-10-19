-- test-0093-transacional.sql — MATRIZ DE TESTES TRANSACIONAIS da 0093.
-- ============================================================================
-- STATUS: NÃO EXECUTADO. Requer ambiente ISOLADO (Postgres + schema + stubs de
-- auth.uid()/auth.jwt()), autorização expressa e backup. NÃO rodar em produção.
-- Este arquivo é um ROTEIRO executável; os resultados NÃO foram verificados.
-- Enquanto não houver execução real, NENHUM teste transacional é declarado
-- aprovado.
--
-- PRÉ-CONDIÇÕES de ambiente isolado:
--   - migrations 0000/0003/0022/0023/0041/0042/0043/0070/0084/0087/0088/0089/
--     0090/0091/0092 aplicadas;
--   - auth.uid() derivado de um JWT sintético (request.jwt.claim.sub), com
--     usuários de teste por papel (admin, producao, atendente, cliente, terceiro,
--     anon);
--   - fixtures criadas DENTRO de transações revertidas ao final (ROLLBACK);
--   - para T9/T10 (concorrência), DUAS sessões reais (dois psql) — não há como
--     simular concorrência verdadeira numa única transação;
--   - para T18–T22 (falhas de FORMA do retorno da 0090), SUBSTITUIR a 0090 por um
--     STUB craftado DENTRO de uma transação revertida (CREATE OR REPLACE +
--     ROLLBACK), mantendo o MESMO owner (pré-requisito de compatibilidade D da 0093).
--
--   Nomes/valores fictícios. P1=produto; PDx=pedido; Rx=reserva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIXTURES (bloco revertido). Cria produtos, pedidos e reservas COM origem
-- (via 0089) para os cenários elegíveis; e reservas SEM origem para legado.
-- ---------------------------------------------------------------------------
-- DO $$
-- BEGIN
--   PERFORM set_config('request.jwt.claim.sub', <uuid_admin>, true);  -- staff
--   -- P1 (estoque 1000). PD1 (recebido, pendente) item P1 qtd 100.
--   --   chamar reservar_pedido_atomico(PD1) => R1 com origem 'reserva' coerente.
--   -- PD2 (recebido, pago)      idem PD1.
--   -- PD3 (entregue)            idem PD1.
--   -- PD4 (em_producao)         idem PD1.
--   -- PD5 (recebido, pendente) item P1 mas SEM reserva (composição não comprovada).
--   -- PD6 (recebido, pendente) SÓ item de montagem (produto_id NULL).
--   -- PD7 (recebido, pendente) R0 = reserva 'ativa' SEM movimento 'reserva' (legado).
--   -- PD8 (recebido, pendente) marcador inconsistente: 0090 (v_marker_mov != v_mov_id).
--   -- PD9 (recebido, pendente) retirada PARCIAL registrada (0091) => restante > 0.
--   -- PD10 (recebido, pendente) reserva TOTALMENTE consumida (0091) => restante 0.
--   -- PD11..PD22 (1.47/1.48) integridade + cobertura x liberação — ver "GRUPO 1.47/1.48".
--   -- ClienteA = dono de PD1..PD22; TerceiroB = outro usuário autenticado.
-- END $$;

-- ===========================================================================
-- T1 — Cancelamento VÁLIDO de pedido recebido e NÃO pago (seção H.1).
--      Ator: cliente dono (ou staff). Esperado:
--      {"status":"cancelado","pedido_id":<PD1>,"liberacao":{...}};
--      pedidos.status='cancelado'; 1 linha em pedido_status_historico
--      ('recebido'->'cancelado', actor=auth.uid()); produtos.estoque
--      devolvido em (quantidade − consumido); reservas.status='liberada'.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD1>, 'cliente desistiu');

-- ===========================================================================
-- T2 — Cancelamento de pedido com PAGAMENTO CONFIRMADO (seção H.2).
--      PD2 tem pagamento_status='pago'. Esperado:
--      {"status":"pagamento_nao_elegivel","pagamento_status":"pago"};
--      NENHUMA alteração (status, histórico, estoque, reservas intactos).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD2>);

-- ===========================================================================
-- T3 — Pedido ENTREGUE (seção H.3). PD3.status='entregue'. Esperado:
--      {"status":"status_invalido","atual":"entregue"}; sem escrita.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD3>);

-- ===========================================================================
-- T4 — RESERVA ANTIGA sem origem (seção H.4). PD7 com R0 órfã. Esperado:
--      EXCEPTION 'liberacao nao concluida (reconciliacao_pendente ...)' =>
--      ROLLBACK: status continua 'recebido', sem histórico, sem crédito.
--      (A 0090 detecta origem ausente e retorna reconciliacao_pendente; a 0093
--       converte em exceção.)
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD7>);

-- ===========================================================================
-- T5 — MARCADOR AUSENTE (seção H.5). Reserva ATIVA com origem no ledger mas SEM
--      linha em reserva_proveniencia (0092). Esperado: mesma EXCEPTION/ROLLBACK
--      de T4 (0090 exige exatamente 1 marcador apontando para o débito).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD8>);   -- ou reserva sem marcador

-- ===========================================================================
-- T6 — MARCADOR INCONSISTENTE (seção H.6). Marcador aponta para OUTRO movimento
--      (v_marker_mov != v_mov_id). Esperado: EXCEPTION/ROLLBACK (sem crédito).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD8>);

-- ===========================================================================
-- T7 — RETIRADA PARCIAL (seção H.7). PD9: consumir 30 de 100 via 0091.
--      Após cancelar: liberação devolve SOMENTE 70 (não 100);
--      estoque final = estoque_após_reserva + 70; reservas.status='liberada'.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R9>, 30, gen_random_uuid());
-- SELECT public.cancelar_pedido_atomico(<PD9>);

-- ===========================================================================
-- T8 — CANCELAMENTO REPETIDO (seção H.8). Cancelar PD1 de novo. Esperado:
--      {"status":"ja_cancelado"}; SEM novo crédito, SEM histórico novo,
--      estoque/histórico inalterados.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- ===========================================================================
-- T9 — DOIS CANCELAMENTOS SIMULTÂNEOS (seção H.9) — 2 SESSÕES.
--      Sessão A: BEGIN; SELECT cancelar_pedido_atomico(PD1);
--      Sessão B: (inicia junto) SELECT cancelar_pedido_atomico(PD1);
--      Esperado: A executa (cancelado); B espera em L1 e, ao liberar, retorna
--      {"status":"ja_cancelado"}. UM único crédito; UMA linha de histórico.
--      (Aumento ÚNICO de estoque relativo ao restante da reserva.)
-- ===========================================================================
-- (executar em duas conexões reais; medir estoque antes/depois)

-- ===========================================================================
-- T10 — CANCELAMENTO CONCORRENTE COM RETIRADA (seção H.10) — 2 SESSÕES.
--      Sessão A: registrar_consumo_reserva(R, q) (trava pedido->produto->reserva).
--      Sessão B: cancelar_pedido_atomico(PD) (trava pedido).
--      Esperado: serialização pela ordem canônica de locks (L1 pedidos). SEM
--      deadlock; o resultado final é consistente: libera (quantidade − consumido
--      efetivo). Se a retirada ocorrer após o cancelamento => 'status_invalido'
--      (0091 bloqueia retirada em pedido 'cancelado').
-- ===========================================================================
-- (executar em duas conexões reais)

-- ===========================================================================
-- T11 — FALHA NO REGISTRO DE HISTÓRICO (seção H.11). Forçar erro no INSERT do
--      histórico (ex.: renomear/derrubar a tabela numa transação de teste, ou
--      trigger temporário que RAISE na pedido_status_historico).
--      Esperado: EXCEPTION => ROLLBACK TOTAL: status volta a 'recebido';
--      ESTOQUE DEVOLVIDO PELA 0090 É REVERTIDO (nenhum crédito fica);
--      reservas continuam 'ativa'.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD1>);   -- com histórico sabotado

-- ===========================================================================
-- T12 — FALHA DA 0090 COM ROLLBACK TOTAL (seção H.12). Cenário que faça a 0090
--      devolver reconciliacao_pendente (T4/T5/T6) OU levantar exceção
--      (ex.: consumo > reserva). Esperado: EXCEPTION; status permanece
--      'recebido'; NENHUM crédito; nenhum histórico.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD7>);

-- ===========================================================================
-- T13 — CLIENTE tentando cancelar pedido de TERCEIRO (seção H.13). Ator:
--      TerceiroB (autenticado, não dono, sem papel). Esperado:
--      {"status":"permissao_negada"}; sem escrita. (Avaliado ANTES do status.)
-- ===========================================================================
-- PERFORM set_config('request.jwt.claim.sub', <uuid_terceiro>, true);
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- ===========================================================================
-- T14 — FUNCIONÁRIO SEM AUTORIZAÇÃO (seção H.14). Ator: usuário autenticado sem
--      papel operacional (ex.: 'cliente'), cancelando pedido ALHEIO. Esperado:
--      {"status":"permissao_negada"}. Ator 'financeiro' (fora do conjunto
--      operacional) cancelando pedido alheio => também 'permissao_negada'.
-- ===========================================================================
-- PERFORM set_config('request.jwt.claim.sub', <uuid_cliente_sem_papel>, true);
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- ===========================================================================
-- T15 — PEDIDO SEM RESERVA / COMPOSIÇÃO INCONSISTENTE (seção H.15).
--   (a) PD5: itens reserváveis (produto_id) e NENHUMA reserva => esperado
--       {"status":"reconciliacao_pendente","motivo":"sem_reserva"}; sem escrita.
--   (b) PD6: somente item de montagem (produto_id NULL) => HABILITADO a cancelar
--       (nada a liberar; 0090 => ja_liberado) => {"status":"cancelado"}.
--   (c) PD sem itens => {"status":"pedido_invalido"}; sem escrita.
--   (d) Reserva TOTALMENTE consumida (PD10, restante 0) => cancelar retorna
--       {"status":"cancelado"} e reservas.status='consumida' (sem crédito).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD5>);   -- reconciliacao_pendente
-- SELECT public.cancelar_pedido_atomico(<PD6>);   -- cancelado (montagem)
-- SELECT public.cancelar_pedido_atomico(<PD_sem_itens>);  -- pedido_invalido
-- SELECT public.cancelar_pedido_atomico(<PD10>);  -- cancelado, sem crédito

-- ===========================================================================
-- T16 (EXTRA) — auth.uid() NULO (anon/service_role). Esperado:
--      {"status":"permissao_negada"}; sem escrita.
-- ===========================================================================
-- PERFORM set_config('request.jwt.claim.sub', NULL, true);
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- ===========================================================================
-- T17 (EXTRA) — p_pedido_id NULO. Esperado: {"status":"entrada_invalida"}.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(NULL);

-- ===========================================================================
-- T18–T22 (1.41/B) — VALIDAÇÃO ESTRITA DO RETORNO DA 0090.
--   Como o retorno da 0090 é sempre um dos 5 status normais, para testar as
--   falhas de FORMA é preciso SUBSTITUIR a 0090 por um STUB, DENTRO de uma
--   transação revertida (CREATE OR REPLACE em bloco + ROLLBACK) que devolva um
--   jsonb forjado. O stub e a 0093 ficam no mesmo owner (pré-requisito D).
--   Em TODOS os casos: EXCEPTION => ROLLBACK INTEGRAL: status volta a
--   'recebido', reservas intactas, SEM histórico, SEM crédito no ledger.
--
--   MODELO DO STUB (executar em transação revertida):
--   -- CREATE OR REPLACE FUNCTION public.liberar_pedido_atomico(p uuid)
--   --   RETURNS jsonb LANGUAGE sql AS $$ SELECT <VALOR_FORJADO> $$;
-- ===========================================================================

-- T18 — Retorno SQL NULL (a 0090 devolve NULL). <VALOR_FORJADO> = NULL::jsonb.
--       Esperado: EXCEPTION 'retorno invalido da liberacao' => rollback integral.
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- T19 — Retorno JSON null (literal). <VALOR_FORJADO> = 'null'::jsonb.
--       Esperado: EXCEPTION 'retorno invalido da liberacao' => rollback integral.
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- T20 — Retorno SEM o campo status. <VALOR_FORJADO> = '{"reservas":0}'::jsonb.
--       Esperado: EXCEPTION 'retorno sem status textual da liberacao' => rollback.
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- T20b — Campo status NÃO textual. <VALOR_FORJADO> = '{"status":123}'::jsonb
--        (idem para null/true/[]/{}). Esperado: EXCEPTION 'retorno sem status
--        textual da liberacao' => rollback integral.
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- T21 — Status INESPERADO / não-sucesso. <VALOR_FORJADO> =
--        '{"status":"qualquer_coisa"}'::jsonb; repetir com 'reconciliacao_pendente',
--        'status_invalido', 'pedido_invalido' e 'NULL' (literal). Esperado, em
--        TODOS: EXCEPTION 'liberacao nao concluida ...' => rollback integral.
-- SELECT public.cancelar_pedido_atomico(<PD1>);

-- T22 — 'ja_liberado' SEM comprovação suficiente (1.41/B.9). PD5 (itens
--        reserváveis, SEM reserva) já é barrado ANTES da 0090 pela pré-checagem.
--        Para exercitar a guarda 9d, forçar v_reserv_total=0 com reservável:
--        stub devolve '{"status":"ja_liberado"}' para um pedido SEM reserva.
--        Esperado: EXCEPTION 'ja_liberado sem reserva comprovada' => rollback.
--        CONTRASTE (não deve falhar): pedido só de MONTAGEM (sem item reservável)
--        com 'ja_liberado' => {"status":"cancelado"} (nada a liberar).
-- SELECT public.cancelar_pedido_atomico(<PD5>);   -- reservável sem reserva
-- SELECT public.cancelar_pedido_atomico(<PD6>);   -- montagem => cancelado

-- ===========================================================================
-- GRUPO 1.47/1.48 — INTEGRIDADE DAS RESERVAS + COBERTURA × LIBERAÇÃO (0090/0093).
--   Fixtures adicionais (bloco revertido). Sempre que possível criar reservas
--   via 0089/0091 para ter origem/marcador LEGÍTIMOS; manipular o restante por
--   UPDATE/INSERT controlado DENTRO da transação de teste (nunca em dados reais).
--   P2 = segundo produto.
--   PD11 (recebido, pendente) item P1 100; DUAS reservas válidas (P1 60 + P1 40),
--        cada uma com origem 'reserva' + marcador. => cancela e libera 100.
--   PD12 (recebido, pendente) item P1 100; R12a válida (P1 100) + R12b 'ativa'
--        (P1 50) SEM origem no ledger. => reconciliacao_pendente.
--   PD13 (recebido, pendente) item P1 150; UMA reserva válida P1 100. =>
--        reconciliacao_pendente (reserva INFERIOR à exigida).
--   PD14 (recebido, pendente) item P1 100; reserva válida P1 150. =>
--        reconciliacao_pendente (reserva SUPERIOR à exigida).
--   PD15 (recebido, pendente) item P1 100; DUAS reservas válidas P1 100 cada =>
--        reconciliacao_pendente (duplicidade: soma 200 != 100).
--   PD16 (CANCELADO) item P1 100; R16 'liberada' COM crédito comprovado
--        (mov 'liberacao' coerente = 100), SEM reserva 'ativa' — estado
--        pós-liberação. => 0090 DIRETO => {"status":"ja_liberado"} (idempotência;
--        D.1/D.2), SEM novo crédito.
--   PD17 (CANCELADO) item P1 100; R17 'liberada' SEM crédito comprovado (sem
--        mov 'liberacao'), SEM reserva 'ativa'. => 0090 DIRETO =>
--        reconciliacao_pendente (liberação sem prova — FIX CENTRAL 1.47/1.48).
--   PD18 (recebido, pendente) item P1 100; R18a 'cancelada' + R18b 'ativa' 100.
--        => reconciliacao_pendente (status sem prova definida).
--   PD19 (recebido, pendente) item P1 100; reserva 'ativa' com origem
--        DIVERGENTE (SUM(-qtd) != reserva, ou produto errado). =>
--        reconciliacao_pendente.
--   PD20 (recebido, pendente) item P1 100; reserva 'ativa' com origem mas SEM
--        marcador (regime controlado, 0092 presente). => reconciliacao_pendente.
--   PD21 (recebido, pendente) item P1 100; R21a 'ativa' válida 100 + R21b
--        'liberada' COM crédito 100 => reconciliacao_pendente (coexistência
--        ativa+liberada = liberação anterior segurando estoque; D.6 — 1.48).
--   PD22 (CANCELADO) item P1 100; R22a 'liberada' COM crédito 60 + R22b
--        'consumida' 40 (retirada total comprovada), SEM ativa. => 0090 DIRETO =>
--        {"status":"ja_liberado"} (mistura liberada+consumida; D.4 — 1.48).
--   PD23 (recebido, pendente) item P1 100; R23 'liberada' COM crédito 100, SEM
--        ativa (pedido ATIVO com liberação anterior) => pré-checagem da 0093
--        bloqueia ANTES da 0090 (motivo 'sem_reserva_ativa'; D.6 — 1.48).
-- ===========================================================================

-- ===========================================================================
-- T23 (1.47/B) — PEDIDO COM VÁRIAS RESERVAS VÁLIDAS. PD11. Esperado:
--      {"status":"cancelado"}; libera 100 (60+40); ambas viram 'liberada';
--      +100 no estoque (nenhum crédito duplicado).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD11>);

-- ===========================================================================
-- T24 (1.47/C.5) — UMA RESERVA INVÁLIDA ENTRE VÁRIAS VÁLIDAS. PD12. Esperado:
--      EXCEPTION/ROLLBACK: NENHUM crédito (nem o da reserva válida, pois a
--      cobertura por produto exige que TODAS fechem). status segue 'recebido'.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD12>);

-- ===========================================================================
-- T25 (1.47/C.1) — RESERVA INFERIOR ÀS QUANTIDADES DOS ITENS. PD13. Esperado:
--      pré-checagem passa (há reserva ativa), a 0090 devolve
--      reconciliacao_pendente (cobertura) => EXCEPTION da 0093; sem crédito.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD13>);

-- ===========================================================================
-- T26 (1.47/C.2) — RESERVA SUPERIOR ÀS QUANTIDADES DOS ITENS. PD14. Esperado:
--      EXCEPTION/ROLLBACK (cobertura 150 > 100). Sem crédito.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD14>);

-- ===========================================================================
-- T27 (1.47/C.4) — RESERVA DUPLICADA. PD15. Esperado: EXCEPTION/ROLLBACK
--      (soma das reservas que CONTAM cobertura != quantidade exigida).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD15>);

-- ===========================================================================
-- T28 (1.48/D.1-D.2) — PEDIDO JÁ LIBERADO: TODAS as reservas 'liberada' COM
--      crédito comprovado (PD16, CANCELADO). Chamada DIRETA à 0090
--      (idempotência/retry). Esperado: {"status":"ja_liberado"} — a cobertura
--      fecha contando a reserva 'liberada' (correção 1.48); NENHUM novo crédito.
--      ANTES da 1.48 isto devolvia 'reconciliacao_pendente' (contradição 1.47).
-- ===========================================================================
-- SELECT public.liberar_pedido_atomico(<PD16>);

-- ===========================================================================
-- T29 (1.48/D.5) — RESERVA 'liberada' SEM CRÉDITO (bloqueia; causa ISOLADA).
--      PD17 (CANCELADO, SEM ativa). Chamada DIRETA à 0090. Esperado:
--      {"status":"reconciliacao_pendente"} — 'liberada' sem mov 'liberacao'
--      coerente => indeterminada. Garante que o estoque não seja dado como
--      devolvido sem prova (caso-chave). Nenhum crédito.
-- ===========================================================================
-- SELECT public.liberar_pedido_atomico(<PD17>);

-- ===========================================================================
-- T30 (1.47/B) — RESERVA 'cancelada' (bloqueia). PD18. Esperado:
--      EXCEPTION/ROLLBACK: status 'cancelada' não tem prova definida no ledger
--      canônico => não se presume reconciliada.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD18>);

-- ===========================================================================
-- T31 (1.47/B) — ORIGEM DIVERGENTE. PD19. Esperado: EXCEPTION/ROLLBACK
--      (SUM(-quantidade) != reserva, ou produto do movimento != produto).
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD19>);

-- ===========================================================================
-- T32 (1.47/B) — MARCADOR AUSENTE em regime controlado. PD20. Esperado:
--      EXCEPTION/ROLLBACK (proveniência ausente => ativa indeterminada).
--      (controle: PD11 tem marcador e é aceito)
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD20>);

-- ===========================================================================
-- T33 (1.48/E.5) — NENHUM CRÉDITO DUPLICADO. (a) cancelar PD16 (já 'cancelado')
--      => {"status":"ja_cancelado"}; (b) 0090 DIRETO em PD11 (cancelado em T23,
--      reservas 'liberada' comprovadas) => {"status":"ja_liberado"}. Em AMBOS:
--      SEM novo crédito no ledger e SEM histórico novo.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD16>);   -- ja_cancelado
-- SELECT public.liberar_pedido_atomico(<PD11>);    -- ja_liberado (idempotência)

-- ===========================================================================
-- T34 (1.48/D.4) — MISTURA 'liberada' + 'consumida' (sem ativa; aceita). PD22
--      (CANCELADO). 0090 DIRETO. Esperado: {"status":"ja_liberado"} — cada
--      reserva comprovada (crédito para a liberada; consumo total para a
--      consumida); cobertura fecha (1.48); nenhum crédito novo.
-- ===========================================================================
-- SELECT public.liberar_pedido_atomico(<PD22>);

-- ===========================================================================
-- T35 (1.48/D.6) — COEXISTÊNCIA 'ativa' + 'liberada' (bloqueia). PD21
--      (recebido). Esperado: EXCEPTION/ROLLBACK — a pré-checagem da 0093 passa
--      (há reserva que retém estoque), mas a 0090 detecta "liberação anterior
--      segurando estoque" => reconciliacao_pendente => rollback Integral. Sem crédito.
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD21>);

-- ===========================================================================
-- T36 (1.48/D.6, caso-borda) — pedido ATIVO cujas reservas são TODAS 'liberada'
--      (com crédito). A pré-checagem da 0093 bloqueia ANTES de chamar a 0090
--      (motivo 'sem_reserva_ativa'). Esperado:
--      {"status":"reconciliacao_pendente","motivo":"sem_reserva_ativa"}; sem
--      escrita. (Contraste com T28: no pedido CANCELADO, 'liberada' é aceita.)
-- ===========================================================================
-- SELECT public.cancelar_pedido_atomico(<PD23>);   -- sem_reserva_ativa (D.6)

-- ===========================================================================
-- VERIFICAÇÕES DE ESTADO (após cada cenário, dentro do mesmo bloco revertido)
-- ===========================================================================
-- - contagem de pedido_status_historico do pedido (esperado: no máximo +1 por
--   sucesso);
-- - produtos.estoque vs valor esperado (após reserva, retirada e liberação);
-- - reservas_estoque.status por reserva;
-- - ausência de linha NOVA em estoque_movimentacoes tipo 'liberacao' nos casos
--   de bloqueio/rollback.
--
-- Critério de aceite: T1 ok; T2/T3/T4/T5/T6/T7/T8/T11/T12/T13/T14/T15(a,c)/T16/
-- T17/T18/T19/T20/T20b/T21/T22 sem escrita (RETURN ou EXCEPTION+rollback);
-- T15(b,d) cancelam sem crédito indevido; T9/T10 consistentes sob concorrência
-- real. GRUPO 1.47/1.48: T23 ok (libera 60+40); T24/T25/T26/T27/T29/T30/T31/
-- T32/T35 sem escrita (EXCEPTION+rollback, nenhum crédito parcial); T28/T34
-- 'ja_liberado' sem novo crédito (cobertura conta 'liberada' — correção 1.48);
-- T33 'ja_cancelado'/'ja_liberado' sem 2º crédito; T36 'sem_reserva_ativa'.
-- NADA disso foi executado: pendente de ambiente isolado com PostgreSQL real
-- (incl. duas sessões para T9/T10).
