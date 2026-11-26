-- Preparação para revisão. Aplicar somente mediante autorização específica,
-- após o cadastro e a conferência dos vínculos oficiais em homologação.
BEGIN;

CREATE SCHEMA IF NOT EXISTS estoque_salgados_privado;
REVOKE ALL ON SCHEMA estoque_salgados_privado FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS estoque_salgados_privado.lotes_operacoes (
  id uuid PRIMARY KEY,
  autor uuid NOT NULL,
  dados jsonb NOT NULL
);
ALTER TABLE estoque_salgados_privado.lotes_operacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE estoque_salgados_privado.lotes_operacoes FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.movimentar_lote_salgado(
  p_sabor text, p_produto uuid, p_tipo text, p_quantidade integer, p_chave uuid,
  p_lote uuid DEFAULT NULL, p_codigo text DEFAULT NULL, p_fabricacao date DEFAULT NULL,
  p_validade date DEFAULT NULL, p_observacao text DEFAULT NULL, p_saldo_esperado integer DEFAULT NULL,
  p_reserva uuid DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_dados jsonb := jsonb_build_array(p_sabor,p_produto,p_tipo,p_quantidade,p_lote,p_codigo,p_fabricacao,p_validade,p_observacao,p_saldo_esperado,p_reserva);
  v_operacao estoque_salgados_privado.lotes_operacoes%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_validos bigint;
  v_ativos bigint;
  v_reservado bigint;
  v_saldo integer;
  v_diferenca integer;
  v_resto integer;
  v_retira integer;
  v_novo_id uuid;
  v_pedido uuid;
  v_consumo jsonb;
BEGIN
  IF v_autor IS NULL OR NOT (public.has_role(v_autor, 'admin') OR public.has_role(v_autor, 'producao'))
     OR (p_tipo = 'ajuste' AND NOT public.has_role(v_autor, 'admin')) THEN
    RAISE EXCEPTION 'Permissão insuficiente para movimentar o estoque';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('entrada','perda','ajuste','retirada') OR p_quantidade IS NULL
     OR p_quantidade < (CASE WHEN p_tipo = 'ajuste' THEN 0 ELSE 1 END)
     OR p_chave IS NULL OR p_produto IS NULL OR length(coalesce(p_observacao,'')) > 503
     OR (p_reserva IS NOT NULL AND p_tipo <> 'retirada') THEN
    RAISE EXCEPTION 'Dados de movimentação inválidos';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave::text, 0));
  SELECT * INTO v_operacao FROM estoque_salgados_privado.lotes_operacoes WHERE id = p_chave;
  IF FOUND THEN
    IF v_operacao.autor = v_autor AND v_operacao.dados = v_dados THEN RETURN 'ja_registrado'; END IF;
    RAISE EXCEPTION 'Chave de movimentação já utilizada';
  END IF;

  IF p_reserva IS NOT NULL THEN
    SELECT pedido_id INTO v_pedido FROM public.reservas_estoque WHERE id = p_reserva AND produto_id = p_produto;
    PERFORM FROM public.pedidos WHERE id = v_pedido FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Reserva ou pedido indisponível'; END IF;
  END IF;
  SELECT estoque INTO v_saldo FROM public.produtos WHERE id = p_produto FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT FROM public.sabores_estoque WHERE chave = p_sabor AND produto_id = p_produto FOR SHARE
  ) THEN
    RAISE EXCEPTION 'Vínculo oficial de estoque ausente';
  END IF;
  SELECT coalesce(sum(restante) FILTER (WHERE status = 'ativo'), 0),
         coalesce(sum(restante) FILTER (WHERE status = 'ativo' AND (validade IS NULL OR validade >= v_hoje)), 0)
    INTO v_ativos, v_validos FROM public.lotes WHERE produto_id = p_produto;
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0),0)),0) INTO v_reservado
    FROM public.reservas_estoque r
    LEFT JOIN LATERAL (SELECT sum(quantidade) AS consumido FROM public.reserva_consumos WHERE reserva_id = r.id) c ON true
    WHERE r.produto_id = p_produto AND r.status = 'ativa';
  IF v_saldo <> v_ativos - v_reservado THEN
    RAISE EXCEPTION 'Saldo legado divergente. Concilie os lotes e as reservas antes de movimentar.';
  END IF;

  IF p_tipo = 'entrada' THEN
    IF nullif(btrim(p_codigo),'') IS NULL OR length(p_codigo) > 80 OR p_fabricacao IS NULL OR p_validade IS NULL
       OR p_fabricacao > v_hoje OR p_validade < greatest(p_fabricacao,v_hoje) OR EXISTS (
        SELECT FROM public.lotes WHERE produto_id = p_produto AND lower(codigo) = lower(btrim(p_codigo))
       ) THEN
      RAISE EXCEPTION 'Código já utilizado ou datas do lote inválidas';
    END IF;
    INSERT INTO public.lotes(produto_id,codigo,quantidade,restante,produzido_em,validade,status)
      VALUES (p_produto,btrim(p_codigo),p_quantidade,p_quantidade,p_fabricacao,p_validade,'ativo')
      RETURNING id INTO v_novo_id;
    PERFORM public.registrar_mov_estoque(p_produto,'entrada_manual',p_quantidade,v_novo_id,p_chave,'lote_manual',v_autor,p_observacao, true);
  ELSIF p_tipo IN ('perda','ajuste') THEN
    SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote AND produto_id = p_produto FOR UPDATE;
    IF NOT FOUND OR v_lote.restante IS DISTINCT FROM p_saldo_esperado OR nullif(btrim(p_observacao),'') IS NULL THEN
      RAISE EXCEPTION 'Lote ou saldo mudou. Confira o saldo e informe o motivo.';
    END IF;
    IF p_tipo = 'perda' THEN
      IF p_quantidade > v_lote.restante THEN RAISE EXCEPTION 'A perda ultrapassa o saldo do lote'; END IF;
      IF v_lote.status = 'ativo' AND (v_lote.validade IS NULL OR v_lote.validade >= v_hoje)
         AND v_validos - p_quantidade < v_reservado THEN RAISE EXCEPTION 'A perda compromete as reservas'; END IF;
      UPDATE public.lotes SET restante = restante - p_quantidade,
         status = CASE WHEN restante = p_quantidade THEN 'esgotado' ELSE status END WHERE id = p_lote;
      IF v_lote.status = 'ativo' THEN
        PERFORM public.registrar_mov_estoque(p_produto,'perda',-p_quantidade,p_lote,p_chave,'lote_manual',v_autor,p_observacao,true);
      ELSE
        INSERT INTO public.estoque_movimentacoes(produto_id,lote_id,tipo,quantidade,saldo_anterior,saldo_posterior,referencia_id,referencia_tipo,usuario_id,observacao)
        VALUES (p_produto,p_lote,'perda',-p_quantidade,v_saldo,v_saldo,p_chave,'lote_manual',v_autor,p_observacao);
      END IF;
    ELSE
      v_diferenca := p_quantidade - v_lote.restante;
      IF v_diferenca = 0 OR v_validos + v_diferenca < v_reservado OR v_lote.status NOT IN ('ativo','esgotado')
         OR (v_lote.status = 'esgotado' AND v_lote.restante <> 0)
         OR (v_lote.validade IS NOT NULL AND v_lote.validade < v_hoje) THEN
        RAISE EXCEPTION 'Inventário sem diferença válida ou com saldo reservado protegido';
      END IF;
      UPDATE public.lotes SET restante = p_quantidade, status = CASE WHEN p_quantidade = 0 THEN 'esgotado' ELSE 'ativo' END
        WHERE id = p_lote;
      PERFORM public.registrar_mov_estoque(p_produto,'ajuste',v_diferenca,p_lote,p_chave,'lote_manual',v_autor,p_observacao,true);
    END IF;
  ELSE
    IF p_reserva IS NOT NULL THEN
      IF v_validos < v_reservado OR v_validos < p_quantidade THEN RAISE EXCEPTION 'Saldo físico insuficiente'; END IF;
      SELECT public.registrar_consumo_reserva(p_reserva,p_quantidade,p_chave,p_produto,p_observacao) INTO v_consumo;
      IF v_consumo->>'status' IS DISTINCT FROM 'consumido' THEN RAISE EXCEPTION 'Consumo da reserva não confirmado'; END IF;
    ELSIF v_validos - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'Estoque disponível insuficiente';
    END IF;
    v_resto := p_quantidade;
    FOR v_lote IN SELECT * FROM public.lotes
      WHERE produto_id = p_produto AND status = 'ativo' AND restante > 0 AND (validade IS NULL OR validade >= v_hoje)
      ORDER BY validade NULLS LAST, created_at, id FOR UPDATE
    LOOP
      v_retira := least(v_lote.restante,v_resto);
      UPDATE public.lotes SET restante = restante - v_retira,
        status = CASE WHEN restante = v_retira THEN 'esgotado' ELSE status END WHERE id = v_lote.id;
      PERFORM public.registrar_mov_estoque(p_produto,'venda',-v_retira,v_lote.id,p_chave,'lote_manual',v_autor,p_observacao,p_reserva IS NULL);
      v_resto := v_resto - v_retira;
      EXIT WHEN v_resto = 0;
    END LOOP;
    IF v_resto <> 0 THEN RAISE EXCEPTION 'Saldo FEFO mudou'; END IF;
  END IF;
  INSERT INTO estoque_salgados_privado.lotes_operacoes VALUES (p_chave,v_autor,v_dados);
  RETURN 'registrado';
END;
$$;

REVOKE ALL ON FUNCTION public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.movimentar_lote_salgado(text,uuid,text,integer,uuid,uuid,text,date,date,text,integer,uuid) TO authenticated;
COMMIT;
