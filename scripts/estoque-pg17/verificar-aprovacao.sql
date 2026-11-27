-- Verificação das aprovações simultâneas. Executar como superuser local.
DO $$
DECLARE
  v_sol uuid;
BEGIN
  SELECT id INTO v_sol FROM public.salgados_solicitacoes
  WHERE chave_idempotencia = md5('teste:concorrencia:solicitacao')::uuid;
  IF v_sol IS NULL THEN
    RAISE EXCEPTION 'solicitação de concorrência não encontrada';
  END IF;
  IF (SELECT count(*) FROM public.salgados_autorizacoes WHERE solicitacao_id = v_sol) <> 1 THEN
    RAISE EXCEPTION 'aprovações concorrentes criaram mais de uma autorização';
  END IF;
  IF (SELECT count(*) FROM public.admin_logs
      WHERE acao = 'salgados_solicitacao_respondida'
        AND (detalhe::jsonb ->> 'solicitacao_id') = v_sol::text) <> 1 THEN
    RAISE EXCEPTION 'aprovações concorrentes duplicaram a decisão auditada';
  END IF;
  RAISE NOTICE 'Concorrência de aprovação OK';
END $$;
