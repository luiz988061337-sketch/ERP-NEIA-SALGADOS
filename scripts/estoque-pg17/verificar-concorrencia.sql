-- Verificação da movimentação simultânea. Executar como superuser local.
DO $$
DECLARE
  v_key uuid := md5('teste:concorrencia:movimentacao')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.estoque_mov_operacoes WHERE chave_idempotencia = v_key) <> 1 THEN
    RAISE EXCEPTION 'movimentação concorrente duplicou a operação';
  END IF;
  IF (SELECT count(*) FROM public.lotes WHERE codigo = 'CONCORRENCIA-1') <> 1
     OR (SELECT restante FROM public.lotes WHERE codigo = 'CONCORRENCIA-1') <> 100 THEN
    RAISE EXCEPTION 'movimentação concorrente duplicou o lote ou a baixa';
  END IF;
  RAISE NOTICE 'Concorrência de movimentação OK';
END $$;
