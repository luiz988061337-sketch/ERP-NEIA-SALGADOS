-- test-0091-transacional.sql — MATRIZ DE TESTES TRANSACIONAIS da 0091.
-- ============================================================================
-- STATUS: NÃO EXECUTADO. Requer ambiente ISOLADO (Postgres + schema + stubs de
-- auth.uid()/auth.jwt()), autorização expressa e backup. NÃO rodar em produção.
-- Este arquivo é um ROTEIRO executável; os resultados NÃO foram verificados.
-- Enquanto não houver execução real, NENHUM teste transacional é declarado
-- aprovado (ver relatório da Etapa 1.35, item "Testes").
--
-- PRÉ-CONDIÇÕES de ambiente isolado:
--   - migrations 0000/0003/0023/0042/0087 aplicadas;
--   - auth.uid() derivado de um JWT sintético (request.jwt.claim.sub), com
--     usuários de teste por papel (admin, producao, atendente, cliente, anon);
--   - fixtures criadas DENTRO de transações revertidas ao final.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIXTURES (executar em bloco revertido). Nomes/valores fictícios.
-- P1 = produto; R1 = reserva COM origem (via 0089); R0 = reserva SEM origem.
-- ---------------------------------------------------------------------------
-- DO $$
-- BEGIN
--   PERFORM set_config('request.jwt.claim.sub', <uuid_admin>, true);  -- staff
--   -- produto P1 com estoque; pedido PD1 (recebido); item PD1->P1 (qtd 100)
--   -- chamar reservar_pedido_atomico(PD1) => cria R1 com origem 'reserva'.
--   -- criar à mão R0 (reserva 'ativa' SEM movimento de reserva) = legado.
-- END $$;

-- ===========================================================================
-- T1 — Retirada parcial: registrar_consumo_reserva(R1, 30, keyA) [staff]
--      Esperado: {"status":"consumido","quantidade":30,"restante":70}
--      E: produtos.estoque INALTERADO; reservas.status ainda 'ativa'.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 30, gen_random_uuid());

-- ===========================================================================
-- T2 — Retirada completa: consumir restante => status 'consumida'.
--      Esperado: {"status":"consumido","restante":0}; reservas.status='consumida'.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 70, gen_random_uuid());

-- ===========================================================================
-- T3 — Além do saldo: quantidade > restante.
--      Esperado: {"status":"acima_do_restante"} e NENHUMA linha nova.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 999, gen_random_uuid());

-- ===========================================================================
-- T4 — Repetição com a MESMA idem_key e MESMOS dados.
--      Esperado: {"status":"ja_registrado"}; contagem de consumos NÃO aumenta.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 30, :keyA);  -- replay

-- ===========================================================================
-- T4b — (1.39/E) Replay OMITINDO p_produto_id (o defeito corrigido).
--      A chamada original informou (ou não) p_produto_id; o replay NÃO informa.
--      Esperado: {"status":"ja_registrado"} (produto comparado ao EFETIVO da
--      reserva, não ao parâmetro). ANTES da 1.39 devolvia 'chave_conflito'.
--      Contagem de consumos NÃO aumenta.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 30, :keyA);              -- sem p_produto_id

-- ===========================================================================
-- T4c — (1.39/E) Replay após retirada COMPLETA (reserva já 'consumida').
--      Esperado: {"status":"ja_registrado"} (a pré-checagem de idempotência roda
--      ANTES do check de status) e NENHUM consumo novo (não duplica).
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, <Q_que_zerou>, :keyZ);   -- 1ª vez
-- SELECT public.registrar_consumo_reserva(<R1>, <Q_que_zerou>, :keyZ);   -- replay

-- ===========================================================================
-- T4d — (1.39/E) Replay de uma chave JÁ registrada após o pedido virar
--      'entregue'/'cancelado'. Esperado: {"status":"ja_registrado"} (idempotência
--      avaliada ANTES da guarda de pedido fechado, pois replay não cria histórico).
--      Uma chave NOVA nesse estado => {"status":"status_invalido"}.
-- ===========================================================================
-- UPDATE public.pedidos SET status='entregue' WHERE id=<PD1>;
-- SELECT public.registrar_consumo_reserva(<R1>, 30, :keyA);            -- replay => ja_registrado
-- SELECT public.registrar_consumo_reserva(<R1>, 5,  gen_random_uuid());-- nova   => status_invalido

-- ===========================================================================
-- T5 — Reutilização CONFLITANTE da chave (mesma key, dados diferentes).
--      Esperado: {"status":"chave_conflito"}; nenhuma linha nova.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 31, :keyA);            -- qtd difere
-- SELECT public.registrar_consumo_reserva(<R2>, 30, :keyA);            -- reserva difere
-- SELECT public.registrar_consumo_reserva(<R1>, 30, :keyA, NULL,'obs'); -- observação difere

-- ===========================================================================
-- T5b — (1.39/E) p_produto_id INFORMADO divergente do produto da reserva.
--      Esperado: {"status":"produto_divergente"} (validado ANTES da idempotência,
--      inclusive no caminho de replay); nenhuma linha nova.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 30, gen_random_uuid(), <outro_produto>);

-- ===========================================================================
-- T6 — Sem delegação (1.37/B.1). Não existe parâmetro de funcionário.
--      (a) cliente (sem papel)    => {"status":"permissao_negada"}
--      (b) anon (auth.uid() nulo) => {"status":"permissao_negada"}
--      (c) staff ok grava SEMPRE auth.uid() em funcionario_id (conferir a linha)
--      (d) NÃO há caminho para gravar consumo em nome de terceiros
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R1>, 10, gen_random_uuid());  -- staff
-- SELECT funcionario_id FROM public.reserva_consumos WHERE idem_key = <...>; -- == uid

-- ===========================================================================
-- T7 — Reserva cancelada/liberada (status != 'ativa').
--      Esperado: {"status":"reserva_encerrada"}.
-- ===========================================================================
-- UPDATE public.reservas_estoque SET status='liberada' WHERE id=<R1>;
-- SELECT public.registrar_consumo_reserva(<R1>, 1, gen_random_uuid());

-- ===========================================================================
-- T8 — Retiradas concorrentes (2 sessões, mesma reserva).
--      Esperado: serialização em L3; soma final nunca > quantidade reservada;
--      nenhuma linha com soma acima do saldo.
-- ===========================================================================
-- (sessão A) BEGIN; SELECT registrar_consumo_reserva(<R1>, 60, gen_random_uuid());
-- (sessão B) BEGIN; SELECT registrar_consumo_reserva(<R1>, 60, gen_random_uuid());
-- => uma aplica (60), a outra vê restante 40 => 'acima_do_restante'.

-- ===========================================================================
-- T9 — Cancelamento concorrente com retirada (0090 x 0091).
--      Esperado: serialização em L1/L3. Uma das ordens:
--        (i) retirada antes do cancelar => 0090 credita apenas o não consumido;
--        (ii) cancelar antes => pedido 'cancelado' => 0091 retorna status_invalido.
--      Em NENHUM caso: crédito duplo nem consumo após liberação.
-- ===========================================================================

-- ===========================================================================
-- T10 — Reserva antiga SEM origem (legado, pedido 'entregue').
--      Esperado: {"status":"status_invalido"} (pedido entregue) OU, se o pedido
--      não estiver fechado, {"status":"reconciliacao_pendente"} (sem origem).
--      NUNCA grava consumo; as 19 reservas permanecem intactas.
-- ===========================================================================
-- SELECT public.registrar_consumo_reserva(<R0>, 1, gen_random_uuid());

-- ===========================================================================
-- T11 — Reserva com origem DUPLICADA/incoerente.
--      Esperado: {"status":"reconciliacao_pendente"} (v_mov_n<>1 ou v_mov_bad<>0).
-- ===========================================================================

-- ===========================================================================
-- T12 — Reserva com 'liberacao' prévia.
--      Esperado: {"status":"reconciliacao_pendente"} (v_lib_ant<>0).
-- ===========================================================================

-- ===========================================================================
-- T13 — quantidade inválida / entradas nulas.
--      (qtd 0, qtd negativa)                  => {"status":"quantidade_invalida"}
--      (p_reserva_id NULL / p_idem_key NULL)  => {"status":"entrada_invalida"}
-- ===========================================================================

-- Critério global: em TODOS os cenários, produtos.estoque não muda na 0091 e
-- reserva_consumos é append-only. Qualquer débito duplo, crédito indevido em
-- reserva antiga, ou consumo em pedido fechado => INTERROMPER.
