-- Sessão B da movimentação simultânea: inicia depois da A e usa a mesma chave.
\pset tuples_only on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin2@estoque.teste'), false);
SELECT pg_sleep(0.7);
SELECT 'RESULTADO_B: ' || public.movimentar_lote_salgado(
  'enroladinho-salsicha', NULL, 'entrada', 100,
  md5('teste:concorrencia:movimentacao')::uuid, NULL, 'CONCORRENCIA-1',
  DATE '2026-11-20', DATE '2027-01-31', 'Ensaio de concorrência') AS resultado;
COMMIT;
