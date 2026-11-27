-- Prepara a solicitação usada no ensaio de aprovações simultâneas.
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
  (SELECT id::text FROM auth.users WHERE email = 'atendente@estoque.teste'), false);

DO $$
DECLARE
  v_res jsonb := public.solicitar_salgado(
    'conferencia', 'pizza-queijo', 10, 'Concorrência de aprovação',
    md5('teste:concorrencia:solicitacao')::uuid, current_date,
    md5('pedido-estoque:pizza')::uuid);
BEGIN
  IF v_res->>'status' <> 'ok' THEN
    RAISE EXCEPTION 'setup de concorrência falhou: %', v_res;
  END IF;
END $$;

RESET ROLE;
COMMIT;
