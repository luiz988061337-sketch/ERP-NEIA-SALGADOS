-- Sessão B da aprovação simultânea, com outro responsável autorizado.
\pset tuples_only on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin2@estoque.teste'), false);
SELECT pg_sleep(0.7);
SELECT 'APROVACAO_B: ' || (
  public.responder_solicitacao_salgado(
    (SELECT id FROM public.salgados_solicitacoes
     WHERE chave_idempotencia = md5('teste:concorrencia:solicitacao')::uuid),
    'aprovada', NULL, 10, 'Aprovação concorrente B', NULL,
    md5('teste:concorrencia:resposta')::uuid)->>'status') AS resultado;
COMMIT;
