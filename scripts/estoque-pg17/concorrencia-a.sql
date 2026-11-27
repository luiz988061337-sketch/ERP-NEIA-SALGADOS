-- Sessão A da movimentação simultânea: adquire a trava e mantém a transação
-- aberta por 2 segundos antes de confirmar.
\pset tuples_only on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
SELECT 'RESULTADO_A: ' || public.movimentar_lote_salgado(
  'enroladinho-salsicha', NULL, 'entrada', 100,
  md5('teste:concorrencia:movimentacao')::uuid, NULL, 'CONCORRENCIA-1',
  DATE '2026-11-20', DATE '2027-01-31', 'Ensaio de concorrência') AS resultado;
SELECT pg_sleep(2);
COMMIT;
