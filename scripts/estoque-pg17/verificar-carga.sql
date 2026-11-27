-- Verificação da carga/reversão exemplificativa no cluster descartável.
-- fase: carga | recarga | reversao | reversao-repetida
-- psql não substitui variáveis dentro de strings dollar-quoted; a fase entra
-- por GUC, definida fora do DO.
SET estoque.fase = :'fase';
DO $$
DECLARE
  v_fase text := current_setting('estoque.fase', true);
  v_key  uuid := md5('carga-exemplo-homologacao:kibe')::uuid;
  v_rev  uuid := md5('carga-exemplo-homologacao:kibe:reversao')::uuid;
  v_restante integer;
BEGIN
  SELECT restante INTO v_restante
  FROM public.lotes
  WHERE sabor_chave = 'kibe' AND codigo = 'HOMOLOGAÇÃO-TESTE-KIBE';

  IF v_fase IN ('carga', 'recarga') THEN
    IF (SELECT count(*) FROM public.estoque_mov_operacoes WHERE chave_idempotencia = v_key) <> 1 THEN
      RAISE EXCEPTION 'carga não foi idempotente na fase %', v_fase;
    END IF;
    IF v_restante IS DISTINCT FROM 3000 THEN
      RAISE EXCEPTION 'saldo da carga divergente na fase %: %', v_fase, v_restante;
    END IF;
  ELSIF v_fase IN ('reversao', 'reversao-repetida') THEN
    IF (SELECT count(*) FROM public.estoque_mov_operacoes WHERE chave_idempotencia = v_rev) <> 1 THEN
      RAISE EXCEPTION 'reversão não foi idempotente na fase %', v_fase;
    END IF;
    IF v_restante IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'saldo após reversão divergente na fase %: %', v_fase, v_restante;
    END IF;
    IF EXISTS (SELECT 1 FROM public.lotes
               WHERE sabor_chave = 'kibe' AND codigo = 'HOMOLOGAÇÃO-TESTE-KIBE'
                 AND status <> 'esgotado') THEN
      RAISE EXCEPTION 'lote de teste não foi esgotado pela reversão';
    END IF;
  ELSE
    RAISE EXCEPTION 'fase desconhecida: %', v_fase;
  END IF;
  RAISE NOTICE 'Carga/reversão: fase % OK', v_fase;
END $$;
