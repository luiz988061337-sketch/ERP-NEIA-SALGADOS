-- Compatibilidade da assinatura antiga com o ledger; nenhuma baixa direta.
BEGIN;
DO $local$ BEGIN
 IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR current_database()<>'lfl_partial'
 OR current_user !~ '^restore_[a-f0-9]{12}$'
 OR current_setting('neia_homologacao.ensaio',true) IS DISTINCT FROM 'LFL_LOCAL_ADITIVO_0123' THEN
  RAISE EXCEPTION 'Rascunho restrito ao laboratorio local. Online exige revisao e autorizacao separadas.';
 END IF;
END $local$;

CREATE OR REPLACE FUNCTION public.estornar_conta(p_conta_id uuid,p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contas%ROWTYPE; p record; r jsonb; q bigint; n integer:=0; ids uuid[]; pid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')) THEN
  RAISE EXCEPTION 'sem_permissao_estorno' USING ERRCODE='42501'; END IF;
 IF p_motivo IS NULL OR length(btrim(p_motivo)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'motivo_obrigatorio'; END IF;
 -- Mesma ordem da RPC financeira: chaves de idempotencia antes da conta.
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.conta_pagamento_eventos WHERE conta_id=p_conta_id AND tipo='pagamento';
 FOREACH pid IN ARRAY coalesce(ids,'{}'::uuid[]) LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('compat-estorno:'||p_conta_id||':'||pid,0));
 END LOOP;
 SELECT * INTO c FROM public.contas WHERE id=p_conta_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'conta_nao_encontrada'; END IF;
 IF c.pagamento_abertura_centavos IS NULL OR c.pagamento_abertura_centavos<>0 THEN
  RAISE EXCEPTION 'historico_sem_parcelas_comprovadas'; END IF;
 IF EXISTS(SELECT 1 FROM public.conta_pagamento_eventos WHERE conta_id=c.id AND tipo='pagamento' AND NOT(id=ANY(coalesce(ids,'{}'::uuid[])))) THEN
  RAISE EXCEPTION 'pagamento_concorrente_repetir_operacao' USING ERRCODE='40001'; END IF;
 FOR p IN SELECT e.id,e.valor_centavos FROM public.conta_pagamento_eventos e WHERE e.conta_id=c.id AND e.tipo='pagamento' ORDER BY e.id LOOP
  SELECT p.valor_centavos-coalesce(sum(valor_centavos),0) INTO q FROM public.conta_pagamento_eventos WHERE tipo='estorno' AND pagamento_id=p.id;
  IF q>0 THEN
   r:=public.estornar_pagamento_conta(p.id,q,btrim(p_motivo),'compat-estorno:'||c.id||':'||p.id);
   IF r->>'status' NOT IN ('estornado','repetido') THEN RAISE EXCEPTION 'estorno_nao_confirmado'; END IF;
   n:=n+1;
  END IF;
 END LOOP;
 IF n>0 THEN INSERT INTO public.admin_logs(actor,acao,detalhe) VALUES(auth.uid(),'conta_estornada','ledger:'||c.id); END IF;
END $$;
REVOKE ALL ON FUNCTION public.estornar_conta(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.estornar_conta(uuid,text) TO authenticated;
COMMIT;
