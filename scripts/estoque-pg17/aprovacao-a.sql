-- Sessão A da aprovação simultânea.
\pset tuples_only on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'admin@estoque.teste'), false);
SELECT 'APROVACAO_A: ' || (
  public.responder_solicitacao_salgado(
    (SELECT id FROM public.salgados_solicitacoes
     WHERE chave_idempotencia = md5('teste:concorrencia:solicitacao')::uuid),
    'aprovada', NULL, 10, 'Aprovação concorrente A', NULL,
    md5('teste:concorrencia:resposta')::uuid)->>'status') AS resultado;
SELECT pg_sleep(2);
COMMIT;
