-- verify-0056-0057.sql — trigger_reserva_estoque_pedido (0042 → removido).
-- Somente leitura. Rode PRE antes de aplicar 0056; POST após 0056 e após 0057.

-- PRE: o trigger precisa EXISTIR (criado na 0042). Se vazio, a baseline
-- está incompleta — parar antes de aplicar.
SELECT tgname AS trigger_esperado
FROM pg_trigger
WHERE tgname = 'trigger_reserva_estoque_pedido';

-- (aplicar drizzle/migrations/0056_desativa_trigger_fefo_status.sql)

-- POST-0056: trigger deve ter sumido (1ª remoção).
SELECT tgname AS trigger_restante
FROM pg_trigger
WHERE tgname = 'trigger_reserva_estoque_pedido';

-- POST-0056: comentário documental da 0056 presente na função mantida.
SELECT obj_description(oid) AS comentario_0056
FROM pg_proc
WHERE proname = 'reservar_estoque_pedido';

-- (aplicar drizzle/migrations/0057_desativa_reserva_lotes_preparo.sql)

-- POST-0057: continua ausente (2ª remoção é no-op idempotente).
SELECT tgname AS trigger_restante
FROM pg_trigger
WHERE tgname = 'trigger_reserva_estoque_pedido';

-- Critério: PRE com 1 linha; POSTs com 0 linhas; comentário mencionando
-- produção/manual. Qualquer divergência = interromper.
