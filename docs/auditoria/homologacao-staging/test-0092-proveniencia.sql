-- test-0092-proveniencia.sql — MATRIZ DE TESTES TRANSACIONAIS da 0092 (+ integração).
-- ============================================================================
-- STATUS: NÃO EXECUTADO. Requer ambiente ISOLADO (Postgres + schema + stubs de
-- auth.uid()/auth.jwt()), autorização expressa e backup. NÃO rodar em produção.
-- Enquanto não houver execução real, NENHUM teste é declarado aprovado.
--
-- PRÉ-CONDIÇÕES: 0000/0003/0023/0042/0087/0092 aplicadas. Fixtures em transação
-- revertida ao final. Os itens 1–12 correspondem à Etapa F do pedido 1.38; os
-- itens 13–14 cobrem a INTEGRAÇÃO da proveniência com 0088/0090 (etapa 1.39).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- T1 — Criação do marcador junto com uma nova reserva válida (controlado=true).
--      Esperado: reserva criada + 1 marcador com (reserva,pedido,produto,qtd,
--      origem='0089',estoque_movimentacao_id=mov de débito). ATÔMICO.
-- ---------------------------------------------------------------------------
-- UPDATE public.reserva_proveniencia_config SET controlado=true;
-- SELECT public.reservar_pedido_atomico(<PD1>);     -- cria reserva + débito
-- SELECT * FROM public.reserva_proveniencia WHERE reserva_id = <R1>;  -- 1 linha

-- ---------------------------------------------------------------------------
-- T2 — Reserva sem débito comprovado: SEM movimento 'reserva' no ledger.
--      Esperado: marcador NÃO é criado (a função não deve marcar sem débito).
-- ---------------------------------------------------------------------------
-- (inserir reserva 'ativa' sem movimento) => SELECT ... WHERE reserva_id = <R0>; => 0

-- ---------------------------------------------------------------------------
-- T3 — Marcador duplicado (mesma reserva / mesmo movimento).
--      Esperado: PK/UNIQUE violam => erro => rollback (nada parcial).
-- ---------------------------------------------------------------------------
-- INSERT INTO public.reserva_proveniencia (...) VALUES (<R1>, ...);  -- 2x

-- ---------------------------------------------------------------------------
-- T4 — Pedido divergente (marcador com pedido_id != reserva.pedido_id).
--      Esperado: FK composta viola => erro.
-- ---------------------------------------------------------------------------
-- INSERT INTO public.reserva_proveniencia (reserva_id,pedido_id,...) VALUES (<R1>, <outro_pedido>, ...);

-- ---------------------------------------------------------------------------
-- T5 — Produto divergente.
--      Esperado: FK composta viola => erro.
-- ---------------------------------------------------------------------------
-- INSERT ... produto_id = <outro_produto> ... => erro

-- ---------------------------------------------------------------------------
-- T6 — Quantidade divergente.
--      Esperado: FK composta viola => erro.
-- ---------------------------------------------------------------------------
-- INSERT ... quantidade = <reserva.qtd + 1> ... => erro

-- ---------------------------------------------------------------------------
-- T7 — Reserva antiga sem marcador.
--      Esperado: rp ausente; 0090 a considera INDETERMINADA (não libera).
-- ---------------------------------------------------------------------------
-- SELECT r.id, rp.reserva_id FROM public.reservas_estoque r
-- LEFT JOIN public.reserva_proveniencia rp ON rp.reserva_id=r.id WHERE rp.reserva_id IS NULL;

-- ---------------------------------------------------------------------------
-- T8 — Configuração DESATIVADA (controlado=false).
--      Esperado: 0089 NÃO cria marcador => reserva nova fica NÃO confiável =>
--      0090 não libera (conservador, seguro).
-- ---------------------------------------------------------------------------
-- UPDATE public.reserva_proveniencia_config SET controlado=false;
-- SELECT public.reservar_pedido_atomico(<PD2>); => reserva SEM marcador

-- ---------------------------------------------------------------------------
-- T9 — Tentativa de INSERT direta não autorizada (authenticated/anon).
--      Esperado: RLS/permissão negam (sem INSERT grant). Sem escrita.
-- ---------------------------------------------------------------------------
-- SET LOCAL role authenticated; INSERT INTO public.reserva_proveniencia ... => erro

-- ---------------------------------------------------------------------------
-- T10 — Falha após criar marcador, com rollback da transação.
--       Esperado: exceção posterior reverte reserva + débito + marcador juntos.
-- ---------------------------------------------------------------------------
-- BEGIN; ... cria reserva+débito+marcador ...; RAISE EXCEPTION 'rollback';
-- ROLLBACK; SELECT count(*) ...  => 0 (nada persistiu)

-- ---------------------------------------------------------------------------
-- T11 — Concorrência reserva/retirada/cancelamento.
--       Esperado: L1 pedido -> L2 produto -> L3 reserva serializa; marcador e
--       débito coerentes; sem crédito excessivo (0090 x 0091).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- T12 — Repetição da migration 0092 em ambiente isolado (idempotência).
--       Esperado: reaplicar NÃO recria/duplica; config permanece 1 linha
--       controlado=false; constraint UNIQUE não é recriada.
-- ---------------------------------------------------------------------------
-- (reaplicar 0092) ; SELECT count(*) FROM public.reserva_proveniencia_config; => 1

-- ---------------------------------------------------------------------------
-- T13 — (1.39) 0088 reservar_estoque_atomica cria o marcador sob controlado=true.
--       Esperado: 1 marcador com origem='0088' e estoque_movimentacao_id = id do
--       débito criado na MESMA transação (RETURNING id). ATÔMICO.
-- ---------------------------------------------------------------------------
-- UPDATE public.reserva_proveniencia_config SET controlado=true;
-- SELECT public.reservar_estoque_atomica(<PD3>, <P1>, <Q>);   -- cria reserva+débito
-- SELECT origem, estoque_movimentacao_id FROM public.reserva_proveniencia
--   WHERE reserva_id = (SELECT id FROM public.reservas_estoque
--                        WHERE pedido_id=<PD3> AND produto_id=<P1>);

-- ---------------------------------------------------------------------------
-- T14 — (1.39) 0090 exige o marcador (proteção de proveniência).
--       (a) reserva ativa SEM marcador (controlado=false => nada marcado)
--           => 0090 retorna 'reconciliacao_pendente' e NÃO credita.
--       (b) reserva ativa COM marcador apontando para o débito => libera.
--       (c) tabela de proveniência ausente (0092 não aplicada) => fail-closed.
-- ---------------------------------------------------------------------------
-- UPDATE public.reserva_proveniencia_config SET controlado=false;
-- SELECT public.reservar_pedido_atomico(<PD4>);      -- reserva SEM marcador
-- UPDATE public.pedidos SET status='cancelado' WHERE id=<PD4>;
-- SELECT public.liberar_pedido_atomico(<PD4>);       -- => reconciliacao_pendente

-- Critério global: marcador só existe com débito comprovado e sob controlado=true;
-- nenhuma marcação retroativa; nenhuma escrita por authenticated/anon; rollback
-- integral em falha. Qualquer violação => INTERROMPER.
