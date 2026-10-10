-- verify-0069.sql — liberação de lotes idempotente (processada_em).
-- Somente leitura. Rode PRE antes de aplicar 0069; POST depois.

-- PRE: coluna deve estar ausente (0 linhas).
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'estoque_movimentacoes'
  AND column_name = 'processada_em';

-- (aplicar drizzle/migrations/0069_liberacao_idempotente.sql)

-- POST: coluna nullable presente.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'estoque_movimentacoes'
  AND column_name = 'processada_em';

-- POST: corpo filtra e marca processada_em.
SELECT CASE WHEN prosrc ILIKE '%processada_em IS NULL%'
             AND prosrc ILIKE '%SET processada_em = now()%'
            THEN 'OK-0069' ELSE 'DIVERGE' END AS idempotencia
FROM pg_proc
WHERE proname = 'liberar_reserva_pedido';

-- Critério: coluna presente; corpo OK.
-- Testes funcionais (sintéticos, estoque 100 / pedido 30): cancela 1x
-- devolve; 2º cancel no-op; cancels concorrentes serializam; histórico
-- sem processada_em processa 1x (backfill documentado). Devolução
-- duplicada = interromper.
