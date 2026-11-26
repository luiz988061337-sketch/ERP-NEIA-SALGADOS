-- 0129 — identidade unitária e vínculos operacionais do Estoque de Salgados.
-- Aplicar somente em homologação (lflzlcqinarrcgncafol), com --project-ref
-- explícito e autorização específica. Nada aqui altera produtos, preços,
-- custos, saldos comerciais antigos, lotes existentes ou o menu aprovado.
-- A chave pública sabores_estoque.chave é a identidade unitária; produto_id
-- continua sendo apenas compatibilidade comercial opcional.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sabores_estoque_vinculos (
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('unitario', 'embalagem')),
  fator_unidades integer NOT NULL CHECK (fator_unidades > 0 AND fator_unidades <= 100000),
  ativo boolean NOT NULL DEFAULT true,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  observacao text,
  PRIMARY KEY (chave, produto_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sabores_vinculos_produto_ativo_idx
  ON public.sabores_estoque_vinculos (produto_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS sabores_vinculos_chave_ativo_idx
  ON public.sabores_estoque_vinculos (chave) WHERE ativo;
ALTER TABLE public.sabores_estoque_vinculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sabores_estoque_vinculos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sabores_estoque_vinculos TO authenticated;
DROP POLICY IF EXISTS sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos;
CREATE POLICY sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro')
  );
COMMENT ON TABLE public.sabores_estoque_vinculos IS
  $$Vínculos conferidos entre um sabor unitário oficial e apresentações comerciais. Não contém preço, custo, saldo, lote ou quantidade física.$$;

INSERT INTO public.sabores_estoque_vinculos
  (chave, produto_id, tipo, fator_unidades, ativo, conferido_em, observacao)
SELECT s.chave, s.produto_id, 'unitario', 1, true, now(), 'Vínculo preexistente preservado'
FROM public.sabores_estoque s
WHERE s.produto_id IS NOT NULL
ON CONFLICT (chave, produto_id) DO NOTHING;

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.lotes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lotes_identidade_sabor_ou_produto'
      AND conrelid = 'public.lotes'::regclass
  ) THEN
    ALTER TABLE public.lotes ADD CONSTRAINT lotes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS lotes_sabor_validade_idx ON public.lotes (sabor_chave, validade);
UPDATE public.lotes l SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE l.sabor_chave IS NULL AND (
  s.produto_id = l.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = l.produto_id AND v.ativo
  )
);

ALTER TABLE public.reservas_estoque ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_identidade_sabor_ou_produto'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque ADD CONSTRAINT reservas_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reservas_sabor_idx ON public.reservas_estoque (sabor_chave, status);
UPDATE public.reservas_estoque r SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE r.sabor_chave IS NULL AND (
  s.produto_id = r.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = r.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_movimentacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_movimentacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS est_mov_sabor_idx ON public.estoque_movimentacoes (sabor_chave, created_at DESC);
UPDATE public.estoque_movimentacoes m SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE m.sabor_chave IS NULL AND (
  s.produto_id = m.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = m.produto_id AND v.ativo
  )
);

ALTER TABLE public.reserva_consumos ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.reserva_consumos ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_consumos_identidade_sabor_ou_produto'
      AND conrelid = 'public.reserva_consumos'::regclass
  ) THEN
    ALTER TABLE public.reserva_consumos ADD CONSTRAINT reserva_consumos_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reserva_consumos_sabor_idx ON public.reserva_consumos (sabor_chave);
UPDATE public.reserva_consumos c SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE c.sabor_chave IS NULL AND (
  s.produto_id = c.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = c.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_mov ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov ADD CONSTRAINT estoque_mov_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS estoque_mov_sabor_idx ON public.estoque_mov (sabor_chave, created_at DESC);
UPDATE public.estoque_mov m SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE m.sabor_chave IS NULL AND (
  s.produto_id = m.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = m.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_mov_operacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov_operacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_operacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov_operacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov_operacoes ADD CONSTRAINT estoque_mov_operacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
UPDATE public.estoque_mov_operacoes o SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE o.sabor_chave IS NULL AND (
  s.produto_id = o.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = o.produto_id AND v.ativo
  )
);

CREATE OR REPLACE VIEW public.vw_saldos_sabores_estoque AS
SELECT
  s.chave,
  s.categoria,
  s.nome,
  s.ordem,
  s.produto_id,
  coalesce(l.fisico, 0)::integer AS fisico,
  coalesce(r.reservado, 0)::integer AS reservado,
  (coalesce(l.fisico, 0) - coalesce(r.reservado, 0))::integer AS disponivel,
  coalesce(l.vencidos, 0)::integer AS vencidos,
  l.proxima_validade
FROM public.sabores_estoque s
LEFT JOIN LATERAL (
  SELECT
    coalesce(sum(restante) FILTER (WHERE status = 'ativo'), 0)::bigint AS fisico,
    count(*) FILTER (
      WHERE restante > 0
        AND (status = 'vencido' OR (validade IS NOT NULL AND validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date))
    )::bigint AS vencidos,
    min(validade) FILTER (
      WHERE status = 'ativo' AND restante > 0
        AND validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) AS proxima_validade
  FROM public.lotes
  WHERE sabor_chave = s.chave
) l ON true
LEFT JOIN LATERAL (
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::bigint AS reservado
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa'
    AND (r.sabor_chave = s.chave OR (
      r.sabor_chave IS NULL AND (
        r.produto_id = s.produto_id
        OR EXISTS (
          SELECT 1 FROM public.sabores_estoque_vinculos v
          WHERE v.chave = s.chave AND v.produto_id = r.produto_id AND v.ativo
        )
      )
    ))
) r ON true;
REVOKE ALL ON TABLE public.vw_saldos_sabores_estoque FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vw_saldos_sabores_estoque TO authenticated;

CREATE OR REPLACE FUNCTION public.vincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_fator_unidades integer DEFAULT 1,
  p_tipo text DEFAULT 'unitario',
  p_observacao text DEFAULT NULL,
  p_substituir boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_tipo text := lower(btrim(coalesce(p_tipo, 'unitario')));
  v_atual public.sabores_estoque_vinculos%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL OR p_fator_unidades IS NULL
     OR p_fator_unidades < 1 OR p_fator_unidades > 100000
     OR v_tipo NOT IN ('unitario', 'embalagem') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'sabor_inexistente');
  END IF;
  IF NOT EXISTS (SELECT FROM public.produtos WHERE id = p_produto_id) THEN
    RETURN jsonb_build_object('status', 'produto_inexistente');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  SELECT * INTO v_atual FROM public.sabores_estoque_vinculos
  WHERE chave = p_chave AND produto_id = p_produto_id;
  IF FOUND AND v_atual.ativo
     AND (v_atual.tipo <> v_tipo OR v_atual.fator_unidades <> p_fator_unidades)
     AND NOT coalesce(p_substituir, false) THEN
    RETURN jsonb_build_object('status', 'conflito', 'tipo_atual', v_atual.tipo,
      'fator_atual', v_atual.fator_unidades);
  END IF;
  IF FOUND AND v_atual.ativo AND v_atual.tipo = v_tipo
     AND v_atual.fator_unidades = p_fator_unidades THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;

  BEGIN
    INSERT INTO public.sabores_estoque_vinculos
      (chave, produto_id, tipo, fator_unidades, ativo, conferido_por, conferido_em, observacao)
    VALUES
      (p_chave, p_produto_id, v_tipo, p_fator_unidades, true, v_ator, now(),
        left(btrim(coalesce(p_observacao, '')), 500))
    ON CONFLICT (chave, produto_id) DO UPDATE SET
      tipo = excluded.tipo,
      fator_unidades = excluded.fator_unidades,
      ativo = true,
      conferido_por = excluded.conferido_por,
      conferido_em = excluded.conferido_em,
      observacao = excluded.observacao;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'produto_ja_vinculado', 'produto_id', p_produto_id);
  END;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_gravado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id, 'tipo', v_tipo,
    'fator_unidades', p_fator_unidades, 'substituir', coalesce(p_substituir, false)
  )::text);

  v_resultado := jsonb_build_object('status', 'ok', 'chave', p_chave,
    'produto_id', p_produto_id, 'tipo', v_tipo, 'fator_unidades', p_fator_unidades);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.desvincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  UPDATE public.sabores_estoque_vinculos
     SET ativo = false
   WHERE chave = p_chave AND produto_id = p_produto_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_desativado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id,
    'motivo', left(btrim(coalesce(p_motivo, '')), 500)
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'chave', p_chave, 'produto_id', p_produto_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimento_sabor(
  p_chave text,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_usuario_id uuid,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_mov_id uuid;
  v_tipo_estoque_mov text;
BEGIN
  v_tipo_estoque_mov := CASE p_tipo
    WHEN 'entrada' THEN 'entrada'
    WHEN 'perda' THEN 'perda'
    WHEN 'ajuste' THEN 'ajuste'
    ELSE 'saida'
  END;
  INSERT INTO public.estoque_mov (produto_id, sabor_chave, tipo, quantidade, motivo, created_by)
  VALUES (p_produto_id, p_chave, v_tipo_estoque_mov, abs(p_quantidade),
    left(btrim(coalesce(p_motivo, '')), 200), p_usuario_id)
  RETURNING id INTO v_mov_id;
  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.movimentar_lote_salgado(
  p_sabor text, p_produto uuid, p_tipo text, p_quantidade integer, p_chave uuid,
  p_lote uuid DEFAULT NULL, p_codigo text DEFAULT NULL, p_fabricacao date DEFAULT NULL,
  p_validade date DEFAULT NULL, p_observacao text DEFAULT NULL, p_saldo_esperado integer DEFAULT NULL,
  p_reserva uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sabor public.sabores_estoque%ROWTYPE;
  v_operacao public.estoque_mov_operacoes%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_reserva public.reservas_estoque%ROWTYPE;
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_tipo_operacao text;
  v_tipo_ledger public.tipo_mov_estoque;
  v_motivo text := left(btrim(coalesce(p_observacao, '')), 200);
  v_produto uuid;
  v_fisico integer;
  v_reservado integer;
  v_anterior integer;
  v_posterior integer;
  v_corrente integer;
  v_delta integer;
  v_resto integer;
  v_retira integer;
  v_novo_id uuid;
  v_mov_id uuid;
  v_consumo jsonb;
  v_afeta_saldo boolean := true;
BEGIN
  IF v_autor IS NULL
     OR NOT (public.has_role(v_autor, 'admin') OR public.has_role(v_autor, 'producao'))
     OR (v_tipo = 'ajuste' AND NOT public.has_role(v_autor, 'admin')) THEN
    RAISE EXCEPTION 'Permissão insuficiente para movimentar o estoque';
  END IF;
  IF v_tipo NOT IN ('entrada', 'perda', 'ajuste', 'retirada')
     OR p_quantidade IS NULL
     OR p_quantidade < (CASE WHEN v_tipo = 'ajuste' THEN 0 ELSE 1 END)
     OR p_quantidade > 2147483647
     OR p_chave IS NULL OR p_sabor IS NULL
     OR (p_reserva IS NOT NULL AND v_tipo <> 'retirada') THEN
    RAISE EXCEPTION 'Dados de movimentação inválidos';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:' || p_sabor, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave::text, 0));
  SELECT * INTO v_sabor FROM public.sabores_estoque WHERE chave = p_sabor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sabor oficial inexistente';
  END IF;
  IF p_produto IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.sabores_estoque_vinculos
    WHERE chave = p_sabor AND produto_id = p_produto AND ativo
  ) THEN
    RAISE EXCEPTION 'Produto não vinculado ao sabor oficial';
  END IF;
  v_produto := p_produto;

  v_tipo_operacao := CASE v_tipo WHEN 'retirada' THEN 'saida' ELSE v_tipo END;
  SELECT * INTO v_operacao FROM public.estoque_mov_operacoes
  WHERE chave_idempotencia = p_chave;
  IF FOUND THEN
    IF v_operacao.sabor_chave IS DISTINCT FROM p_sabor
       OR v_operacao.produto_id IS DISTINCT FROM v_produto
       OR v_operacao.tipo IS DISTINCT FROM v_tipo_operacao
       OR v_operacao.quantidade IS DISTINCT FROM p_quantidade
       OR v_operacao.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'Chave de movimentação já utilizada';
    END IF;
    RETURN 'ja_registrado';
  END IF;

  SELECT coalesce(sum(restante), 0)::integer INTO v_fisico
  FROM public.lotes
  WHERE sabor_chave = p_sabor AND status = 'ativo'
    AND (validade IS NULL OR validade >= v_hoje);
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::integer
    INTO v_reservado
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa'
    AND (r.sabor_chave = p_sabor
      OR (r.sabor_chave IS NULL AND (
        r.produto_id = v_sabor.produto_id
        OR EXISTS (
          SELECT 1 FROM public.sabores_estoque_vinculos v
          WHERE v.chave = p_sabor AND v.produto_id = r.produto_id AND v.ativo
        )
      )));
  IF v_fisico < v_reservado THEN
    RAISE EXCEPTION 'Reserva excede o estoque físico do sabor';
  END IF;
  v_anterior := v_fisico;

  IF p_reserva IS NOT NULL THEN
    SELECT * INTO v_reserva FROM public.reservas_estoque
    WHERE id = p_reserva AND status = 'ativa' FOR UPDATE;
    IF NOT FOUND
       OR (v_reserva.sabor_chave IS DISTINCT FROM p_sabor
           AND NOT (v_reserva.sabor_chave IS NULL AND (
             v_reserva.produto_id = v_sabor.produto_id
             OR EXISTS (
               SELECT 1 FROM public.sabores_estoque_vinculos v
               WHERE v.chave = p_sabor AND v.produto_id = v_reserva.produto_id AND v.ativo
             )
           ))) THEN
      RAISE EXCEPTION 'Reserva indisponível para este sabor';
    END IF;
    PERFORM 1 FROM public.pedidos WHERE id = v_reserva.pedido_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido da reserva indisponível';
    END IF;
  END IF;

  IF v_tipo IN ('perda', 'ajuste') THEN
    IF p_lote IS NULL OR p_saldo_esperado IS NULL OR v_motivo = '' THEN
      RAISE EXCEPTION 'Lote, saldo conferido e motivo são obrigatórios';
    END IF;
    SELECT * INTO v_lote FROM public.lotes
    WHERE id = p_lote AND sabor_chave = p_sabor FOR UPDATE;
    IF NOT FOUND OR v_lote.restante IS DISTINCT FROM p_saldo_esperado THEN
      RAISE EXCEPTION 'Lote ou saldo mudou. Confira o saldo e informe o motivo.';
    END IF;
  END IF;

  IF v_tipo = 'entrada' THEN
    IF nullif(btrim(coalesce(p_codigo, '')), '') IS NULL OR length(p_codigo) > 80
       OR p_fabricacao IS NULL OR p_validade IS NULL
       OR p_fabricacao > v_hoje OR p_validade < greatest(p_fabricacao, v_hoje)
       OR EXISTS (
         SELECT FROM public.lotes
         WHERE sabor_chave = p_sabor AND lower(codigo) = lower(btrim(p_codigo))
       ) THEN
      RAISE EXCEPTION 'Código já utilizado ou datas do lote inválidas';
    END IF;
    v_delta := p_quantidade;
    v_tipo_ledger := 'entrada_manual';
  ELSIF v_tipo = 'perda' THEN
    IF p_quantidade > v_lote.restante THEN
      RAISE EXCEPTION 'A perda ultrapassa o saldo do lote';
    END IF;
    v_afeta_saldo := v_lote.status = 'ativo'
      AND (v_lote.validade IS NULL OR v_lote.validade >= v_hoje);
    IF v_afeta_saldo AND v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'A perda compromete as reservas';
    END IF;
    v_delta := CASE WHEN v_afeta_saldo THEN -p_quantidade ELSE 0 END;
    v_tipo_ledger := CASE WHEN v_afeta_saldo THEN 'perda' ELSE 'vencimento' END;
  ELSIF v_tipo = 'ajuste' THEN
    IF p_quantidade = v_lote.restante
       OR v_lote.status NOT IN ('ativo', 'esgotado')
       OR (v_lote.status = 'esgotado' AND v_lote.restante <> 0)
       OR (v_lote.validade IS NOT NULL AND v_lote.validade < v_hoje)
       OR v_fisico + p_quantidade - v_lote.restante < v_reservado THEN
      RAISE EXCEPTION 'Inventário sem diferença válida ou com saldo reservado protegido';
    END IF;
    v_delta := p_quantidade - v_lote.restante;
    v_tipo_ledger := 'ajuste';
  ELSE
    IF p_reserva IS NOT NULL THEN
      IF v_fisico < v_reservado OR v_fisico < p_quantidade THEN
        RAISE EXCEPTION 'Saldo físico insuficiente';
      END IF;
    ELSIF v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'Estoque disponível insuficiente';
    END IF;
    v_delta := -p_quantidade;
    v_tipo_ledger := 'venda';
  END IF;

  v_mov_id := public.registrar_movimento_sabor(
    p_sabor, v_produto, v_tipo_operacao, p_quantidade, v_autor, v_motivo
  );
  v_posterior := v_anterior + v_delta;
  IF v_posterior < 0 OR v_posterior > 2147483647 THEN
    RAISE EXCEPTION 'Saldo do sabor fora do limite permitido';
  END IF;

  IF v_tipo = 'entrada' THEN
    INSERT INTO public.lotes
      (produto_id, sabor_chave, codigo, quantidade, restante, produzido_em, validade, status)
    VALUES (v_produto, p_sabor, btrim(p_codigo), p_quantidade, p_quantidade,
      p_fabricacao, p_validade, 'ativo')
    RETURNING id INTO v_novo_id;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_novo_id, v_tipo_ledger, p_quantidade,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
  ELSIF v_tipo IN ('perda', 'ajuste') THEN
    IF v_tipo = 'perda' THEN
      UPDATE public.lotes
         SET restante = restante - p_quantidade,
             status = CASE WHEN restante = p_quantidade THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
    ELSE
      UPDATE public.lotes
         SET restante = p_quantidade,
             status = CASE WHEN p_quantidade = 0 THEN 'esgotado' ELSE 'ativo' END
       WHERE id = v_lote.id;
    END IF;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_lote.id, v_tipo_ledger,
      CASE WHEN v_delta = 0 THEN p_quantidade ELSE v_delta END,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
  ELSE
    IF p_reserva IS NOT NULL THEN
      SELECT public.registrar_consumo_reserva(
        p_reserva, p_quantidade, p_chave, v_reserva.produto_id, v_motivo
      ) INTO v_consumo;
      IF v_consumo->>'status' IS DISTINCT FROM 'consumido' THEN
        RAISE EXCEPTION 'Consumo da reserva não confirmado';
      END IF;
    END IF;
    v_resto := p_quantidade;
    v_corrente := v_anterior;
    FOR v_lote IN
      SELECT * FROM public.lotes
      WHERE sabor_chave = p_sabor AND status = 'ativo' AND restante > 0
        AND (validade IS NULL OR validade >= v_hoje)
      ORDER BY validade NULLS LAST, created_at, id
      FOR UPDATE
    LOOP
      v_retira := least(v_lote.restante, v_resto);
      UPDATE public.lotes
         SET restante = restante - v_retira,
             status = CASE WHEN restante = v_retira THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
      INSERT INTO public.estoque_movimentacoes
        (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
         referencia_id, referencia_tipo, usuario_id, observacao)
      VALUES (v_lote.produto_id, p_sabor, v_lote.id, v_tipo_ledger, -v_retira,
        v_corrente, v_corrente - v_retira, v_mov_id, 'lote_salgado', v_autor, v_motivo);
      v_corrente := v_corrente - v_retira;
      v_resto := v_resto - v_retira;
      EXIT WHEN v_resto = 0;
    END LOOP;
    IF v_resto <> 0 OR v_corrente <> v_posterior THEN
      RAISE EXCEPTION 'Saldo FEFO mudou';
    END IF;
  END IF;

  INSERT INTO public.estoque_mov_operacoes
    (chave_idempotencia, produto_id, sabor_chave, tipo, quantidade, motivo, movimento_id, actor)
  VALUES (p_chave, v_produto, p_sabor, v_tipo_operacao, p_quantidade, v_motivo, v_mov_id, v_autor);

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_autor, 'movimentacao_lote_salgado', jsonb_build_object(
    'chave_idempotencia', p_chave,
    'sabor', p_sabor,
    'produto_id', v_produto,
    'tipo', v_tipo,
    'quantidade', p_quantidade,
    'lote_id', p_lote,
    'saldo_anterior', v_anterior,
    'saldo_posterior', v_posterior
  )::text);

  RETURN 'registrado';
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  TO authenticated;
REVOKE ALL ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimento_sabor(text, uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261126190000', 'vinculos_operacionais_salgados', ARRAY[$mig$CREATE TABLE IF NOT EXISTS public.sabores_estoque_vinculos (
  chave text NOT NULL REFERENCES public.sabores_estoque(chave) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('unitario', 'embalagem')),
  fator_unidades integer NOT NULL CHECK (fator_unidades > 0 AND fator_unidades <= 100000),
  ativo boolean NOT NULL DEFAULT true,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conferido_em timestamptz NOT NULL DEFAULT now(),
  observacao text,
  PRIMARY KEY (chave, produto_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sabores_vinculos_produto_ativo_idx
  ON public.sabores_estoque_vinculos (produto_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS sabores_vinculos_chave_ativo_idx
  ON public.sabores_estoque_vinculos (chave) WHERE ativo;
ALTER TABLE public.sabores_estoque_vinculos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sabores_estoque_vinculos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sabores_estoque_vinculos TO authenticated;
DROP POLICY IF EXISTS sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos;
CREATE POLICY sabores_vinculos_leitura_equipe ON public.sabores_estoque_vinculos
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'producao')
    OR public.has_role(auth.uid(), 'atendente')
    OR public.has_role(auth.uid(), 'financeiro')
  );
COMMENT ON TABLE public.sabores_estoque_vinculos IS
  $$Vínculos conferidos entre um sabor unitário oficial e apresentações comerciais. Não contém preço, custo, saldo, lote ou quantidade física.$$;

INSERT INTO public.sabores_estoque_vinculos
  (chave, produto_id, tipo, fator_unidades, ativo, conferido_em, observacao)
SELECT s.chave, s.produto_id, 'unitario', 1, true, now(), 'Vínculo preexistente preservado'
FROM public.sabores_estoque s
WHERE s.produto_id IS NOT NULL
ON CONFLICT (chave, produto_id) DO NOTHING;

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.lotes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lotes_identidade_sabor_ou_produto'
      AND conrelid = 'public.lotes'::regclass
  ) THEN
    ALTER TABLE public.lotes ADD CONSTRAINT lotes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS lotes_sabor_validade_idx ON public.lotes (sabor_chave, validade);
UPDATE public.lotes l SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE l.sabor_chave IS NULL AND (
  s.produto_id = l.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = l.produto_id AND v.ativo
  )
);

ALTER TABLE public.reservas_estoque ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservas_identidade_sabor_ou_produto'
      AND conrelid = 'public.reservas_estoque'::regclass
  ) THEN
    ALTER TABLE public.reservas_estoque ADD CONSTRAINT reservas_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reservas_sabor_idx ON public.reservas_estoque (sabor_chave, status);
UPDATE public.reservas_estoque r SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE r.sabor_chave IS NULL AND (
  s.produto_id = r.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = r.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_movimentacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_movimentacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_movimentacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS est_mov_sabor_idx ON public.estoque_movimentacoes (sabor_chave, created_at DESC);
UPDATE public.estoque_movimentacoes m SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE m.sabor_chave IS NULL AND (
  s.produto_id = m.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = m.produto_id AND v.ativo
  )
);

ALTER TABLE public.reserva_consumos ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.reserva_consumos ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserva_consumos_identidade_sabor_ou_produto'
      AND conrelid = 'public.reserva_consumos'::regclass
  ) THEN
    ALTER TABLE public.reserva_consumos ADD CONSTRAINT reserva_consumos_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reserva_consumos_sabor_idx ON public.reserva_consumos (sabor_chave);
UPDATE public.reserva_consumos c SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE c.sabor_chave IS NULL AND (
  s.produto_id = c.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = c.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_mov ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov ADD CONSTRAINT estoque_mov_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS estoque_mov_sabor_idx ON public.estoque_mov (sabor_chave, created_at DESC);
UPDATE public.estoque_mov m SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE m.sabor_chave IS NULL AND (
  s.produto_id = m.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = m.produto_id AND v.ativo
  )
);

ALTER TABLE public.estoque_mov_operacoes ADD COLUMN IF NOT EXISTS sabor_chave text
  REFERENCES public.sabores_estoque(chave) ON DELETE RESTRICT;
ALTER TABLE public.estoque_mov_operacoes ALTER COLUMN produto_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_mov_operacoes_identidade_sabor_ou_produto'
      AND conrelid = 'public.estoque_mov_operacoes'::regclass
  ) THEN
    ALTER TABLE public.estoque_mov_operacoes ADD CONSTRAINT estoque_mov_operacoes_identidade_sabor_ou_produto
      CHECK (produto_id IS NOT NULL OR sabor_chave IS NOT NULL);
  END IF;
END $$;
UPDATE public.estoque_mov_operacoes o SET sabor_chave = s.chave
FROM public.sabores_estoque s
WHERE o.sabor_chave IS NULL AND (
  s.produto_id = o.produto_id
  OR EXISTS (
    SELECT 1 FROM public.sabores_estoque_vinculos v
    WHERE v.chave = s.chave AND v.produto_id = o.produto_id AND v.ativo
  )
);

CREATE OR REPLACE VIEW public.vw_saldos_sabores_estoque AS
SELECT
  s.chave,
  s.categoria,
  s.nome,
  s.ordem,
  s.produto_id,
  coalesce(l.fisico, 0)::integer AS fisico,
  coalesce(r.reservado, 0)::integer AS reservado,
  (coalesce(l.fisico, 0) - coalesce(r.reservado, 0))::integer AS disponivel,
  coalesce(l.vencidos, 0)::integer AS vencidos,
  l.proxima_validade
FROM public.sabores_estoque s
LEFT JOIN LATERAL (
  SELECT
    coalesce(sum(restante) FILTER (WHERE status = 'ativo'), 0)::bigint AS fisico,
    count(*) FILTER (
      WHERE restante > 0
        AND (status = 'vencido' OR (validade IS NOT NULL AND validade < (now() AT TIME ZONE 'America/Sao_Paulo')::date))
    )::bigint AS vencidos,
    min(validade) FILTER (
      WHERE status = 'ativo' AND restante > 0
        AND validade >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) AS proxima_validade
  FROM public.lotes
  WHERE sabor_chave = s.chave
) l ON true
LEFT JOIN LATERAL (
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::bigint AS reservado
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa'
    AND (r.sabor_chave = s.chave OR (
      r.sabor_chave IS NULL AND (
        r.produto_id = s.produto_id
        OR EXISTS (
          SELECT 1 FROM public.sabores_estoque_vinculos v
          WHERE v.chave = s.chave AND v.produto_id = r.produto_id AND v.ativo
        )
      )
    ))
) r ON true;
REVOKE ALL ON TABLE public.vw_saldos_sabores_estoque FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.vw_saldos_sabores_estoque TO authenticated;

CREATE OR REPLACE FUNCTION public.vincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_fator_unidades integer DEFAULT 1,
  p_tipo text DEFAULT 'unitario',
  p_observacao text DEFAULT NULL,
  p_substituir boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_tipo text := lower(btrim(coalesce(p_tipo, 'unitario')));
  v_atual public.sabores_estoque_vinculos%ROWTYPE;
  v_resultado jsonb;
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL OR p_fator_unidades IS NULL
     OR p_fator_unidades < 1 OR p_fator_unidades > 100000
     OR v_tipo NOT IN ('unitario', 'embalagem') THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  IF NOT EXISTS (SELECT FROM public.sabores_estoque WHERE chave = p_chave) THEN
    RETURN jsonb_build_object('status', 'sabor_inexistente');
  END IF;
  IF NOT EXISTS (SELECT FROM public.produtos WHERE id = p_produto_id) THEN
    RETURN jsonb_build_object('status', 'produto_inexistente');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  SELECT * INTO v_atual FROM public.sabores_estoque_vinculos
  WHERE chave = p_chave AND produto_id = p_produto_id;
  IF FOUND AND v_atual.ativo
     AND (v_atual.tipo <> v_tipo OR v_atual.fator_unidades <> p_fator_unidades)
     AND NOT coalesce(p_substituir, false) THEN
    RETURN jsonb_build_object('status', 'conflito', 'tipo_atual', v_atual.tipo,
      'fator_atual', v_atual.fator_unidades);
  END IF;
  IF FOUND AND v_atual.ativo AND v_atual.tipo = v_tipo
     AND v_atual.fator_unidades = p_fator_unidades THEN
    RETURN jsonb_build_object('status', 'ja_registrado', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;

  BEGIN
    INSERT INTO public.sabores_estoque_vinculos
      (chave, produto_id, tipo, fator_unidades, ativo, conferido_por, conferido_em, observacao)
    VALUES
      (p_chave, p_produto_id, v_tipo, p_fator_unidades, true, v_ator, now(),
        left(btrim(coalesce(p_observacao, '')), 500))
    ON CONFLICT (chave, produto_id) DO UPDATE SET
      tipo = excluded.tipo,
      fator_unidades = excluded.fator_unidades,
      ativo = true,
      conferido_por = excluded.conferido_por,
      conferido_em = excluded.conferido_em,
      observacao = excluded.observacao;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'produto_ja_vinculado', 'produto_id', p_produto_id);
  END;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_gravado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id, 'tipo', v_tipo,
    'fator_unidades', p_fator_unidades, 'substituir', coalesce(p_substituir, false)
  )::text);

  v_resultado := jsonb_build_object('status', 'ok', 'chave', p_chave,
    'produto_id', p_produto_id, 'tipo', v_tipo, 'fator_unidades', p_fator_unidades);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.desvincular_sabor_estoque_produto(
  p_chave text,
  p_produto_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ator uuid := auth.uid();
BEGIN
  IF v_ator IS NULL OR NOT public.has_role(v_ator, 'admin') THEN
    RETURN jsonb_build_object('status', 'permissao_negada');
  END IF;
  IF p_chave IS NULL OR p_produto_id IS NULL THEN
    RETURN jsonb_build_object('status', 'dados_invalidos');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:vinculo:' || p_chave, 0));
  UPDATE public.sabores_estoque_vinculos
     SET ativo = false
   WHERE chave = p_chave AND produto_id = p_produto_id AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'sem_alteracao', 'chave', p_chave,
      'produto_id', p_produto_id);
  END IF;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_ator, 'sabor_estoque_vinculo_desativado', jsonb_build_object(
    'chave', p_chave, 'produto_id', p_produto_id,
    'motivo', left(btrim(coalesce(p_motivo, '')), 500)
  )::text);
  RETURN jsonb_build_object('status', 'ok', 'chave', p_chave, 'produto_id', p_produto_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimento_sabor(
  p_chave text,
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_usuario_id uuid,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_mov_id uuid;
  v_tipo_estoque_mov text;
BEGIN
  v_tipo_estoque_mov := CASE p_tipo
    WHEN 'entrada' THEN 'entrada'
    WHEN 'perda' THEN 'perda'
    WHEN 'ajuste' THEN 'ajuste'
    ELSE 'saida'
  END;
  INSERT INTO public.estoque_mov (produto_id, sabor_chave, tipo, quantidade, motivo, created_by)
  VALUES (p_produto_id, p_chave, v_tipo_estoque_mov, abs(p_quantidade),
    left(btrim(coalesce(p_motivo, '')), 200), p_usuario_id)
  RETURNING id INTO v_mov_id;
  RETURN v_mov_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.movimentar_lote_salgado(
  p_sabor text, p_produto uuid, p_tipo text, p_quantidade integer, p_chave uuid,
  p_lote uuid DEFAULT NULL, p_codigo text DEFAULT NULL, p_fabricacao date DEFAULT NULL,
  p_validade date DEFAULT NULL, p_observacao text DEFAULT NULL, p_saldo_esperado integer DEFAULT NULL,
  p_reserva uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_autor uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sabor public.sabores_estoque%ROWTYPE;
  v_operacao public.estoque_mov_operacoes%ROWTYPE;
  v_lote public.lotes%ROWTYPE;
  v_reserva public.reservas_estoque%ROWTYPE;
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_tipo_operacao text;
  v_tipo_ledger public.tipo_mov_estoque;
  v_motivo text := left(btrim(coalesce(p_observacao, '')), 200);
  v_produto uuid;
  v_fisico integer;
  v_reservado integer;
  v_anterior integer;
  v_posterior integer;
  v_corrente integer;
  v_delta integer;
  v_resto integer;
  v_retira integer;
  v_novo_id uuid;
  v_mov_id uuid;
  v_consumo jsonb;
  v_afeta_saldo boolean := true;
BEGIN
  IF v_autor IS NULL
     OR NOT (public.has_role(v_autor, 'admin') OR public.has_role(v_autor, 'producao'))
     OR (v_tipo = 'ajuste' AND NOT public.has_role(v_autor, 'admin')) THEN
    RAISE EXCEPTION 'Permissão insuficiente para movimentar o estoque';
  END IF;
  IF v_tipo NOT IN ('entrada', 'perda', 'ajuste', 'retirada')
     OR p_quantidade IS NULL
     OR p_quantidade < (CASE WHEN v_tipo = 'ajuste' THEN 0 ELSE 1 END)
     OR p_quantidade > 2147483647
     OR p_chave IS NULL OR p_sabor IS NULL
     OR (p_reserva IS NOT NULL AND v_tipo <> 'retirada') THEN
    RAISE EXCEPTION 'Dados de movimentação inválidos';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('salgados:' || p_sabor, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_chave::text, 0));
  SELECT * INTO v_sabor FROM public.sabores_estoque WHERE chave = p_sabor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sabor oficial inexistente';
  END IF;
  IF p_produto IS NOT NULL AND NOT EXISTS (
    SELECT FROM public.sabores_estoque_vinculos
    WHERE chave = p_sabor AND produto_id = p_produto AND ativo
  ) THEN
    RAISE EXCEPTION 'Produto não vinculado ao sabor oficial';
  END IF;
  v_produto := p_produto;

  v_tipo_operacao := CASE v_tipo WHEN 'retirada' THEN 'saida' ELSE v_tipo END;
  SELECT * INTO v_operacao FROM public.estoque_mov_operacoes
  WHERE chave_idempotencia = p_chave;
  IF FOUND THEN
    IF v_operacao.sabor_chave IS DISTINCT FROM p_sabor
       OR v_operacao.produto_id IS DISTINCT FROM v_produto
       OR v_operacao.tipo IS DISTINCT FROM v_tipo_operacao
       OR v_operacao.quantidade IS DISTINCT FROM p_quantidade
       OR v_operacao.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'Chave de movimentação já utilizada';
    END IF;
    RETURN 'ja_registrado';
  END IF;

  SELECT coalesce(sum(restante), 0)::integer INTO v_fisico
  FROM public.lotes
  WHERE sabor_chave = p_sabor AND status = 'ativo'
    AND (validade IS NULL OR validade >= v_hoje);
  SELECT coalesce(sum(greatest(r.quantidade - coalesce(c.consumido, 0), 0)), 0)::integer
    INTO v_reservado
  FROM public.reservas_estoque r
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(quantidade), 0) AS consumido
    FROM public.reserva_consumos
    WHERE reserva_id = r.id
  ) c ON true
  WHERE r.status = 'ativa'
    AND (r.sabor_chave = p_sabor
      OR (r.sabor_chave IS NULL AND (
        r.produto_id = v_sabor.produto_id
        OR EXISTS (
          SELECT 1 FROM public.sabores_estoque_vinculos v
          WHERE v.chave = p_sabor AND v.produto_id = r.produto_id AND v.ativo
        )
      )));
  IF v_fisico < v_reservado THEN
    RAISE EXCEPTION 'Reserva excede o estoque físico do sabor';
  END IF;
  v_anterior := v_fisico;

  IF p_reserva IS NOT NULL THEN
    SELECT * INTO v_reserva FROM public.reservas_estoque
    WHERE id = p_reserva AND status = 'ativa' FOR UPDATE;
    IF NOT FOUND
       OR (v_reserva.sabor_chave IS DISTINCT FROM p_sabor
           AND NOT (v_reserva.sabor_chave IS NULL AND (
             v_reserva.produto_id = v_sabor.produto_id
             OR EXISTS (
               SELECT 1 FROM public.sabores_estoque_vinculos v
               WHERE v.chave = p_sabor AND v.produto_id = v_reserva.produto_id AND v.ativo
             )
           ))) THEN
      RAISE EXCEPTION 'Reserva indisponível para este sabor';
    END IF;
    PERFORM 1 FROM public.pedidos WHERE id = v_reserva.pedido_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido da reserva indisponível';
    END IF;
  END IF;

  IF v_tipo IN ('perda', 'ajuste') THEN
    IF p_lote IS NULL OR p_saldo_esperado IS NULL OR v_motivo = '' THEN
      RAISE EXCEPTION 'Lote, saldo conferido e motivo são obrigatórios';
    END IF;
    SELECT * INTO v_lote FROM public.lotes
    WHERE id = p_lote AND sabor_chave = p_sabor FOR UPDATE;
    IF NOT FOUND OR v_lote.restante IS DISTINCT FROM p_saldo_esperado THEN
      RAISE EXCEPTION 'Lote ou saldo mudou. Confira o saldo e informe o motivo.';
    END IF;
  END IF;

  IF v_tipo = 'entrada' THEN
    IF nullif(btrim(coalesce(p_codigo, '')), '') IS NULL OR length(p_codigo) > 80
       OR p_fabricacao IS NULL OR p_validade IS NULL
       OR p_fabricacao > v_hoje OR p_validade < greatest(p_fabricacao, v_hoje)
       OR EXISTS (
         SELECT FROM public.lotes
         WHERE sabor_chave = p_sabor AND lower(codigo) = lower(btrim(p_codigo))
       ) THEN
      RAISE EXCEPTION 'Código já utilizado ou datas do lote inválidas';
    END IF;
    v_delta := p_quantidade;
    v_tipo_ledger := 'entrada_manual';
  ELSIF v_tipo = 'perda' THEN
    IF p_quantidade > v_lote.restante THEN
      RAISE EXCEPTION 'A perda ultrapassa o saldo do lote';
    END IF;
    v_afeta_saldo := v_lote.status = 'ativo'
      AND (v_lote.validade IS NULL OR v_lote.validade >= v_hoje);
    IF v_afeta_saldo AND v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'A perda compromete as reservas';
    END IF;
    v_delta := CASE WHEN v_afeta_saldo THEN -p_quantidade ELSE 0 END;
    v_tipo_ledger := CASE WHEN v_afeta_saldo THEN 'perda' ELSE 'vencimento' END;
  ELSIF v_tipo = 'ajuste' THEN
    IF p_quantidade = v_lote.restante
       OR v_lote.status NOT IN ('ativo', 'esgotado')
       OR (v_lote.status = 'esgotado' AND v_lote.restante <> 0)
       OR (v_lote.validade IS NOT NULL AND v_lote.validade < v_hoje)
       OR v_fisico + p_quantidade - v_lote.restante < v_reservado THEN
      RAISE EXCEPTION 'Inventário sem diferença válida ou com saldo reservado protegido';
    END IF;
    v_delta := p_quantidade - v_lote.restante;
    v_tipo_ledger := 'ajuste';
  ELSE
    IF p_reserva IS NOT NULL THEN
      IF v_fisico < v_reservado OR v_fisico < p_quantidade THEN
        RAISE EXCEPTION 'Saldo físico insuficiente';
      END IF;
    ELSIF v_fisico - p_quantidade < v_reservado THEN
      RAISE EXCEPTION 'Estoque disponível insuficiente';
    END IF;
    v_delta := -p_quantidade;
    v_tipo_ledger := 'venda';
  END IF;

  v_mov_id := public.registrar_movimento_sabor(
    p_sabor, v_produto, v_tipo_operacao, p_quantidade, v_autor, v_motivo
  );
  v_posterior := v_anterior + v_delta;
  IF v_posterior < 0 OR v_posterior > 2147483647 THEN
    RAISE EXCEPTION 'Saldo do sabor fora do limite permitido';
  END IF;

  IF v_tipo = 'entrada' THEN
    INSERT INTO public.lotes
      (produto_id, sabor_chave, codigo, quantidade, restante, produzido_em, validade, status)
    VALUES (v_produto, p_sabor, btrim(p_codigo), p_quantidade, p_quantidade,
      p_fabricacao, p_validade, 'ativo')
    RETURNING id INTO v_novo_id;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_novo_id, v_tipo_ledger, p_quantidade,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
  ELSIF v_tipo IN ('perda', 'ajuste') THEN
    IF v_tipo = 'perda' THEN
      UPDATE public.lotes
         SET restante = restante - p_quantidade,
             status = CASE WHEN restante = p_quantidade THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
    ELSE
      UPDATE public.lotes
         SET restante = p_quantidade,
             status = CASE WHEN p_quantidade = 0 THEN 'esgotado' ELSE 'ativo' END
       WHERE id = v_lote.id;
    END IF;
    INSERT INTO public.estoque_movimentacoes
      (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
       referencia_id, referencia_tipo, usuario_id, observacao)
    VALUES (v_produto, p_sabor, v_lote.id, v_tipo_ledger,
      CASE WHEN v_delta = 0 THEN p_quantidade ELSE v_delta END,
      v_anterior, v_posterior, v_mov_id, 'lote_salgado', v_autor, v_motivo);
  ELSE
    IF p_reserva IS NOT NULL THEN
      SELECT public.registrar_consumo_reserva(
        p_reserva, p_quantidade, p_chave, v_reserva.produto_id, v_motivo
      ) INTO v_consumo;
      IF v_consumo->>'status' IS DISTINCT FROM 'consumido' THEN
        RAISE EXCEPTION 'Consumo da reserva não confirmado';
      END IF;
    END IF;
    v_resto := p_quantidade;
    v_corrente := v_anterior;
    FOR v_lote IN
      SELECT * FROM public.lotes
      WHERE sabor_chave = p_sabor AND status = 'ativo' AND restante > 0
        AND (validade IS NULL OR validade >= v_hoje)
      ORDER BY validade NULLS LAST, created_at, id
      FOR UPDATE
    LOOP
      v_retira := least(v_lote.restante, v_resto);
      UPDATE public.lotes
         SET restante = restante - v_retira,
             status = CASE WHEN restante = v_retira THEN 'esgotado' ELSE status END
       WHERE id = v_lote.id;
      INSERT INTO public.estoque_movimentacoes
        (produto_id, sabor_chave, lote_id, tipo, quantidade, saldo_anterior, saldo_posterior,
         referencia_id, referencia_tipo, usuario_id, observacao)
      VALUES (v_lote.produto_id, p_sabor, v_lote.id, v_tipo_ledger, -v_retira,
        v_corrente, v_corrente - v_retira, v_mov_id, 'lote_salgado', v_autor, v_motivo);
      v_corrente := v_corrente - v_retira;
      v_resto := v_resto - v_retira;
      EXIT WHEN v_resto = 0;
    END LOOP;
    IF v_resto <> 0 OR v_corrente <> v_posterior THEN
      RAISE EXCEPTION 'Saldo FEFO mudou';
    END IF;
  END IF;

  INSERT INTO public.estoque_mov_operacoes
    (chave_idempotencia, produto_id, sabor_chave, tipo, quantidade, motivo, movimento_id, actor)
  VALUES (p_chave, v_produto, p_sabor, v_tipo_operacao, p_quantidade, v_motivo, v_mov_id, v_autor);

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (v_autor, 'movimentacao_lote_salgado', jsonb_build_object(
    'chave_idempotencia', p_chave,
    'sabor', p_sabor,
    'produto_id', v_produto,
    'tipo', v_tipo,
    'quantidade', p_quantidade,
    'lote_id', p_lote,
    'saldo_anterior', v_anterior,
    'saldo_posterior', v_posterior
  )::text);

  RETURN 'registrado';
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.vincular_sabor_estoque_produto(text, uuid, integer, text, text, boolean)
  TO authenticated;
REVOKE ALL ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.desvincular_sabor_estoque_produto(text, uuid, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimento_sabor(text, uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.movimentar_lote_salgado(text, uuid, text, integer, uuid, uuid, text, date, date, text, integer, uuid)
  TO authenticated;$mig$]::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
