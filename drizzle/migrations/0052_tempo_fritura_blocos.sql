-- 0052: tempo de fritura em BLOCOS (igual ao app).
-- A 0043 calculava linear (qtd/base*qtd*seg): 1 salgado = 5 segundos, o que
-- não existe em fritadeira — e divergia do src/lib/cozinha.ts (1 lote = 210s).
-- Modelo único: teto da quantidade em lotes de unidade_base (mínimo 1 lote).
-- Idempotente. Rode APÓS 0051. (Arquivo 0043 sincronizado p/ fresh.)

CREATE OR REPLACE FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_seg integer;
  v_base_qtd integer;
BEGIN
  SELECT tempo_fritura_base_segundos, unidade_base_tempo_fritura
  INTO v_base_seg, v_base_qtd
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND OR v_base_seg IS NULL OR v_base_seg <= 0
     OR v_base_qtd IS NULL OR v_base_qtd <= 0 THEN
    RETURN 210; -- default 3:30 (igual a SEGUNDOS_POR_50_PADRAO)
  END IF;

  -- Blocos: 1un..50un = 1 lote; 51un..100un = 2 lotes (igual a tempoFritura()).
  RETURN GREATEST(1, CEIL(GREATEST(0, p_quantidade)::numeric / v_base_qtd)) * v_base_seg;
END;
$$;

COMMENT ON FUNCTION public.calcular_tempo_fritura(uuid, integer) IS '0052: blocos (teto), espelha src/lib/cozinha.ts tempoFritura().';
