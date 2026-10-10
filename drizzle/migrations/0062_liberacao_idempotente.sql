-- 0062: liberação de lotes idempotente (K5 Fase 4).
-- PROBLEMA (auditoria K3/K4, código 0042/0050): liberar_reserva_pedido
-- relê TODAS as linhas tipo='reserva' a cada chamada e reinsere 'liberacao'
-- + soma lotes.restante de novo -> N chamadas inflam o lote N vezes. A 0050
-- corrigiu o duplo-débito em produtos.estoque, mas não a re-devolução.
-- SOLUÇÃO (menor risco, comparada no cabeçalho):
--   - coluna nova NULLABLE processada_em em estoque_movimentacoes: nunca
--     falha com histórico (sem constraint sobre dados antigos), só marca
--     metadado nas linhas de RESERVA já processadas (valores intactos);
--   - alternativa UNIQUE parcial em linhas 'liberacao' foi REJEITADA:
--     duplicatas históricas (se existirem) quebrariam o CREATE INDEX;
--   - lock FOR UPDATE na linha do pedido serializa execuções concorrentes
--     do MESMO pedido (a 2ª vê tudo processado -> no-op);
--   - transação única da função: falha intermediária reverte tudo (nunca
--     devolução parcial confirmada).
-- COMPATIBILIDADE COM 0050 (preservada integralmente):
--   - chama liberar_reserva_atomica primeiro (com tolerância legado);
--   - v_tem_0030 decide se recredita produtos.estoque (NOT v_tem_0030);
--   - regra "0030 dona quando engajou" inalterada.
-- Idempotente (ADD COLUMN IF NOT EXISTS + OR REPLACE). NÃO aplicar sem
-- autorização. Staging + backup antes. Rollback: a coluna é ignorada
-- pelas versões antigas (nullable, sem constraint).

ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS processada_em timestamptz;

CREATE OR REPLACE FUNCTION public.liberar_reserva_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mov record;
  v_tem_0030 boolean := false;
BEGIN
  -- Serializa liberações concorrentes do mesmo pedido; prova existência.
  PERFORM 1 FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  -- 0030 primeiro: restaura produtos.estoque e marca as reservas (no-op se
  -- vazio). Erro aqui aborta o cancel com mensagem visível (melhor que
  -- corromper saldo em silêncio). Só ignora se 0030 nunca foi aplicada.
  BEGIN
    PERFORM public.liberar_reserva_atomica(p_pedido_id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  -- Se 0030 engajou neste pedido, ela é dona do produtos.estoque: aqui só
  -- devolvemos os LOTES (modo legado = sem linhas 0030 → restaura tudo).
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.reservas_estoque WHERE pedido_id = p_pedido_id
    ) INTO v_tem_0030;
  EXCEPTION WHEN undefined_table THEN
    v_tem_0030 := false;
  END;

  -- Só reservas AINDA NÃO processadas (idempotente: repetir = no-op).
  FOR v_mov IN
    SELECT id, produto_id, lote_id, ABS(quantidade) AS qtd
    FROM public.estoque_movimentacoes
    WHERE referencia_id = p_pedido_id
      AND referencia_tipo = 'pedido'
      AND tipo = 'reserva'
      AND processada_em IS NULL
    FOR UPDATE
  LOOP
    -- Devolve ao lote
    IF v_mov.lote_id IS NOT NULL THEN
      UPDATE public.lotes
      SET restante = restante + v_mov.qtd
      WHERE id = v_mov.lote_id;
    END IF;

    -- Registra liberação (sem recreditar produtos.estoque se 0030 já o fez)
    PERFORM public.registrar_mov_estoque(
      v_mov.produto_id,
      'liberacao',
      v_mov.qtd,
      v_mov.lote_id,
      p_pedido_id,
      'pedido',
      NULL,
      'Liberação de reserva por cancelamento/alteração do pedido',
      NOT v_tem_0030
    );

    -- Marca como processada (metadado; valores e histórico preservados)
    UPDATE public.estoque_movimentacoes
    SET processada_em = now()
    WHERE id = v_mov.id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.liberar_reserva_pedido(uuid) IS
  '0062: idempotente via processada_em + lock do pedido; compatível com 0050.';
