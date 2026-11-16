-- 0105 — contrato explícito para prévia de taxa/área da entrega.
-- Migration incremental: não altera a histórica 0103 nem executa qualquer ação
-- neste repositório. Validar em staging antes de aplicar em qualquer ambiente.

CREATE OR REPLACE FUNCTION public.calcular_taxa_entrega(
  p_destino_lat double precision,
  p_destino_lng double precision,
  p_distancia_km numeric DEFAULT NULL,
  p_subtotal numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg    public.config_entrega%ROWTYPE;
  v_linha  numeric(8,2);
  v_km     numeric(8,2);
  v_taxa   numeric(10,2);
  v_fonte  text;
  v_gratis boolean := false;
  v_sub    numeric(10,2);
BEGIN
  SELECT * INTO v_cfg FROM public.config_entrega WHERE id = true;

  -- Sem config/origem, mantém exatamente o regime legado.
  IF v_cfg.id IS NULL
     OR v_cfg.origem_lat IS NULL OR v_cfg.origem_lng IS NULL THEN
    RETURN jsonb_build_object('modo', 'legado', 'motivo', 'origem_nao_configurada');
  END IF;

  -- Em respostas sem avaliação do endereço, NULL significa área desconhecida.
  IF NOT v_cfg.aceitar_entregas THEN
    RETURN jsonb_build_object(
      'modo', 'config', 'fora_da_area', NULL,
      'aceitar_entregas', false, 'taxa', NULL,
      'erro', 'entregas_desativadas'
    );
  END IF;

  IF p_destino_lat IS NULL OR p_destino_lng IS NULL THEN
    RETURN jsonb_build_object(
      'modo', 'config', 'fora_da_area', NULL,
      'aceitar_entregas', true, 'taxa', NULL,
      'erro', 'destino_ausente'
    );
  END IF;
  IF p_destino_lat NOT BETWEEN -90 AND 90 OR p_destino_lng NOT BETWEEN -180 AND 180 THEN
    RETURN jsonb_build_object(
      'modo', 'config', 'fora_da_area', NULL,
      'aceitar_entregas', true, 'taxa', NULL,
      'erro', 'destino_invalido'
    );
  END IF;

  v_linha := round(public.distancia_linha_reta_km(
    v_cfg.origem_lat, v_cfg.origem_lng, p_destino_lat, p_destino_lng), 2);

  v_km := NULL;
  IF p_distancia_km IS NOT NULL AND p_distancia_km > 0 AND p_distancia_km <= 500 THEN
    v_km := round(p_distancia_km, 2);
  END IF;
  -- Mantém a validação anti-fraude da 0103.
  IF v_km IS NULL OR v_km < v_linha * 0.9 OR v_km > v_linha * 3 THEN
    v_km := v_linha;
    v_fonte := 'linha_reta';
  ELSE
    v_fonte := 'rota';
  END IF;

  IF v_cfg.distancia_max_ativa AND v_cfg.distancia_max_km > 0
     AND v_km > v_cfg.distancia_max_km THEN
    RETURN jsonb_build_object(
      'modo', 'config', 'fora_da_area', true,
      'aceitar_entregas', true, 'taxa', NULL,
      'distancia_km', v_km, 'maximo_km', v_cfg.distancia_max_km
    );
  END IF;

  v_sub := NULL;
  IF p_subtotal IS NOT NULL AND p_subtotal >= 0 THEN
    v_sub := round(p_subtotal, 2);
  END IF;

  -- Preserva valor/km, taxa mínima e gratuidade conforme config_entrega.
  v_taxa := round(v_km * v_cfg.valor_por_km, 2);
  IF v_cfg.taxa_minima_ativa AND v_cfg.taxa_minima > 0 THEN
    v_taxa := GREATEST(v_taxa, round(v_cfg.taxa_minima, 2));
  END IF;
  IF v_cfg.gratis_ativa AND v_cfg.gratis_acima > 0 AND v_taxa > 0
     AND v_sub IS NOT NULL AND v_sub >= round(v_cfg.gratis_acima, 2) THEN
    v_gratis := true;
    v_taxa := 0;
  END IF;

  RETURN jsonb_build_object(
    'modo', 'config',
    'fora_da_area', false,
    'aceitar_entregas', true,
    'taxa', v_taxa,
    'distancia_km', v_km,
    'valor_por_km', round(v_cfg.valor_por_km, 2),
    'fonte', v_fonte,
    'entrega_gratis', v_gratis
  );
END; $$;

REVOKE ALL ON FUNCTION public.calcular_taxa_entrega(double precision, double precision, numeric, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_taxa_entrega(double precision, double precision, numeric, numeric)
  TO authenticated;
