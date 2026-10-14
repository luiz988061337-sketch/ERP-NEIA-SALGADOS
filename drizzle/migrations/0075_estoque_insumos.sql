-- 0075: ETAPA K — estoque de insumos (tabelas, FEFO, baixa automática)
-- Tabelas: insumos, insumo_lotes (FEFO), fichas_tecnicas, ficha_itens,
-- fornecedores, compras, compra_itens, insumo_movimentacoes.
-- Regras do prompt K:
--   kg<->g, l<->ml; custo médio ponderado na entrada;
--   baixa FEFO ao ir p/ em_producao (qtd × ficha × (1+perda));
--   nunca negativo (bloqueia a transição e avisa); sem ficha = sem baixa.
-- Compra recebida gera conta a pagar (integra 0072) e movimento de entrada.
-- Idempotente.

-- =============================================
-- 1. Tabelas
-- =============================================
CREATE TABLE IF NOT EXISTS public.insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT '',
  unidade_base text NOT NULL DEFAULT 'g' CHECK (unidade_base IN ('g','kg','ml','l','un')),
  estoque_atual numeric(14,3) NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
  estoque_minimo numeric(14,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  custo_medio numeric(14,4) NOT NULL DEFAULT 0 CHECK (custo_medio >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insumos_nome_idx ON public.insumos (nome);
CREATE INDEX IF NOT EXISTS insumos_ativo_idx ON public.insumos (ativo) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.insumo_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
  restante numeric(14,3) NOT NULL CHECK (restante >= 0),
  custo_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0),
  validade date,
  fornecedor_id uuid,
  compra_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insumo_lotes_insumo_idx ON public.insumo_lotes (insumo_id);
CREATE INDEX IF NOT EXISTS insumo_lotes_validade_idx ON public.insumo_lotes (validade);

CREATE TABLE IF NOT EXISTS public.fichas_tecnicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL UNIQUE REFERENCES public.produtos(id) ON DELETE CASCADE,
  rendimento numeric(14,3) NOT NULL DEFAULT 1 CHECK (rendimento > 0),
  perda_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (perda_pct >= 0 AND perda_pct <= 100),
  por_cento boolean NOT NULL DEFAULT false,
  obs text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ficha_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_tecnicas(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  quantidade numeric(14,4) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'g',
  UNIQUE (ficha_id, insumo_id)
);
CREATE INDEX IF NOT EXISTS ficha_itens_ficha_idx ON public.ficha_itens (ficha_id);

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text NOT NULL DEFAULT '',
  contato text NOT NULL DEFAULT '',
  prazo_entrega_dias integer NOT NULL DEFAULT 7 CHECK (prazo_entrega_dias >= 0),
  condicoes_pagamento text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fornecedores_nome_idx ON public.fornecedores (nome);

-- FK de lote->fornecedor/compra adicionadas após criar as tabelas (evita ordem).
DO $$ BEGIN
  ALTER TABLE public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_fornecedor_fk FOREIGN KEY (fornecedor_id)
    REFERENCES public.fornecedores(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','enviada','recebida_parcial','recebida_total','cancelada')),
  observacao text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  recebida_em timestamptz
);
CREATE INDEX IF NOT EXISTS compras_status_idx ON public.compras (status);

CREATE TABLE IF NOT EXISTS public.compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE RESTRICT,
  quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL DEFAULT 'kg',
  custo_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0),
  quantidade_recebida numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0)
);
CREATE INDEX IF NOT EXISTS compra_itens_compra_idx ON public.compra_itens (compra_id);

DO $$ BEGIN
  ALTER TABLE public.insumo_lotes
    ADD CONSTRAINT insumo_lotes_compra_fk FOREIGN KEY (compra_id)
    REFERENCES public.compras(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.insumo_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  tipo text NOT NULL
    CHECK (tipo IN ('entrada','saida','perda','ajuste','inventario','consumo')),
  quantidade numeric(14,3) NOT NULL CHECK (quantidade >= 0),
  saldo_antes numeric(14,3) NOT NULL DEFAULT 0,
  saldo_depois numeric(14,3) NOT NULL DEFAULT 0,
  custo numeric(14,4),
  referencia text NOT NULL DEFAULT '',
  usuario uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insumo_mov_insumo_idx ON public.insumo_movimentacoes (insumo_id);
CREATE INDEX IF NOT EXISTS insumo_mov_tipo_idx ON public.insumo_movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS insumo_mov_ref_idx ON public.insumo_movimentacoes (referencia);

-- =============================================
-- 2. Conversão de unidades (espelha src/lib/insumos.ts)
-- =============================================
CREATE OR REPLACE FUNCTION public.converter_unidade(p_qtd numeric, p_de text, p_para text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_de = p_para THEN
    RETURN p_qtd;
  END IF;
  IF p_de IN ('g','kg') AND p_para IN ('g','kg') THEN
    RETURN p_qtd * CASE p_de WHEN 'kg' THEN 1000 ELSE 1 END
                  / CASE p_para WHEN 'kg' THEN 1000 ELSE 1 END;
  END IF;
  IF p_de IN ('ml','l') AND p_para IN ('ml','l') THEN
    RETURN p_qtd * CASE p_de WHEN 'l' THEN 1000 ELSE 1 END
                  / CASE p_para WHEN 'l' THEN 1000 ELSE 1 END;
  END IF;
  RETURN NULL; -- massa/volume/un não se misturam
END;
$$;

-- =============================================
-- 3. Baixa FEFO ao entrar em produção
-- consumo = qtd_item × ficha × (1 + perda); por_cento: qtd_item/100 × ficha.
-- Idempotente por pedido (retransição não consome em dobro).
-- Sem ficha no produto: pula (não bloqueia a produção).
-- Insuficiente: RAISE (bloqueia a transição, produção é avisada).
-- =============================================
CREATE OR REPLACE FUNCTION public.consumir_insumos_pedido(p_pedido_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_ficha record;
  v_fi record;
  v_qtd numeric;
  v_saldo numeric;
  v_falta numeric;
  v_lote record;
  v_pega numeric;
  v_n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.insumo_movimentacoes
             WHERE tipo = 'consumo' AND referencia = p_pedido_id::text) THEN
    RETURN 'ja consumido';
  END IF;

  FOR v_item IN
    SELECT produto_id, quantidade FROM public.pedido_itens
    WHERE pedido_id = p_pedido_id AND produto_id IS NOT NULL
  LOOP
    SELECT * INTO v_ficha FROM public.fichas_tecnicas WHERE produto_id = v_item.produto_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    FOR v_fi IN
      SELECT fi.quantidade, fi.unidade, fi.insumo_id, i.unidade_base
      FROM public.ficha_itens fi JOIN public.insumos i ON i.id = fi.insumo_id
      WHERE fi.ficha_id = v_ficha.id
    LOOP
      IF COALESCE(v_ficha.por_cento, false) THEN
        v_qtd := v_item.quantidade / 100.0 * v_fi.quantidade;
      ELSE
        v_qtd := v_item.quantidade * v_fi.quantidade;
      END IF;
      v_qtd := public.converter_unidade(v_qtd, v_fi.unidade, v_fi.unidade_base);
      IF v_qtd IS NULL OR v_qtd <= 0 THEN
        CONTINUE;
      END IF;
      v_qtd := v_qtd * (1 + COALESCE(v_ficha.perda_pct, 0) / 100.0);

      SELECT COALESCE(SUM(restante), 0) INTO v_saldo FROM public.insumo_lotes
      WHERE insumo_id = v_fi.insumo_id AND restante > 0;
      IF v_saldo < v_qtd THEN
        RAISE EXCEPTION 'estoque_insumo_insuficiente:%', v_fi.insumo_id;
      END IF;

      v_falta := v_qtd;
      FOR v_lote IN
        SELECT id, restante FROM public.insumo_lotes
        WHERE insumo_id = v_fi.insumo_id AND restante > 0
        ORDER BY validade NULLS LAST, created_at
      LOOP
        EXIT WHEN v_falta <= 0;
        v_pega := LEAST(v_lote.restante, v_falta);
        UPDATE public.insumo_lotes SET restante = restante - v_pega WHERE id = v_lote.id;
        v_falta := v_falta - v_pega;
      END LOOP;

      SELECT estoque_atual INTO v_saldo FROM public.insumos WHERE id = v_fi.insumo_id;
      UPDATE public.insumos
      SET estoque_atual = estoque_atual - v_qtd, updated_at = now()
      WHERE id = v_fi.insumo_id;

      INSERT INTO public.insumo_movimentacoes
        (insumo_id, tipo, quantidade, saldo_antes, saldo_depois, referencia, usuario)
      VALUES
        (v_fi.insumo_id, 'consumo', v_qtd, v_saldo, v_saldo - v_qtd, p_pedido_id::text, auth.uid());

      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'insumos_consumo',
          'pedido ' || p_pedido_id::text || ': ' || v_n::text || ' baixa(s) FEFO');

  RETURN 'consumidos ' || v_n::text || ' itens de insumo';
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_insumos_pedido_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.consumir_insumos_pedido(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_consumir_insumos_producao ON public.pedidos;
CREATE TRIGGER trigger_consumir_insumos_producao
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'em_producao')
  EXECUTE FUNCTION public.consumir_insumos_pedido_trigger();

COMMENT ON FUNCTION public.consumir_insumos_pedido(uuid) IS
  'K: baixa FEFO de insumos ao produzir. Idempotente por pedido; sem ficha não bloqueia; insuficiente aborta.';

-- =============================================
-- 4. Recebimento de compra: lote + custo médio + conta a pagar
-- =============================================
CREATE OR REPLACE FUNCTION public.receber_compra_item(
  p_item_id uuid, p_qtd numeric, p_unidade text, p_validade date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ci record;
  v_ins record;
  v_compra record;
  v_forn record;
  v_base numeric;
  v_custo_base numeric;
  v_novo_custo numeric;
  v_saldo numeric;
  v_tot_ped numeric;
  v_tot_rec numeric;
BEGIN
  SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_item_nao_encontrado';
  END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = v_ci.insumo_id;
  SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id;
  IF v_compra.status = 'cancelada' THEN
    RAISE EXCEPTION 'compra_cancelada';
  END IF;

  v_base := public.converter_unidade(p_qtd, p_unidade, v_ins.unidade_base);
  IF v_base IS NULL OR v_base <= 0 THEN
    RAISE EXCEPTION 'unidade_invalida';
  END IF;

  -- custo por unidade_base: ex. R$7/kg -> 0.007/g
  v_custo_base := v_ci.custo_unitario / public.converter_unidade(1, p_unidade, v_ins.unidade_base);

  v_saldo := v_ins.estoque_atual;
  IF v_saldo > 0 THEN
    v_novo_custo := (v_saldo * v_ins.custo_medio + v_base * v_custo_base) / (v_saldo + v_base);
  ELSE
    v_novo_custo := v_custo_base;
  END IF;

  INSERT INTO public.insumo_lotes
    (insumo_id, quantidade, restante, custo_unitario, validade, fornecedor_id, compra_id)
  VALUES
    (v_ins.id, v_base, v_base, v_custo_base, p_validade, v_compra.fornecedor_id, v_compra.id);

  UPDATE public.insumos
  SET estoque_atual = estoque_atual + v_base, custo_medio = v_novo_custo, updated_at = now()
  WHERE id = v_ins.id;

  INSERT INTO public.insumo_movimentacoes
    (insumo_id, tipo, quantidade, saldo_antes, saldo_depois, custo, referencia, usuario)
  VALUES
    (v_ins.id, 'entrada', v_base, v_saldo, v_saldo + v_base, v_custo_base,
     'compra:' || v_compra.id::text, auth.uid());

  UPDATE public.compra_itens
  SET quantidade_recebida = quantidade_recebida + p_qtd
  WHERE id = p_item_id;

  SELECT COALESCE(SUM(quantidade), 0), COALESCE(SUM(quantidade_recebida), 0)
  INTO v_tot_ped, v_tot_rec
  FROM public.compra_itens WHERE compra_id = v_compra.id;

  UPDATE public.compras
  SET status = CASE WHEN v_tot_rec >= v_tot_ped THEN 'recebida_total' ELSE 'recebida_parcial' END,
      recebida_em = now()
  WHERE id = v_compra.id;

  -- Conta a pagar (integra financeiro 0072): valor na unidade negociada.
  SELECT * INTO v_forn FROM public.fornecedores WHERE id = v_compra.fornecedor_id;
  INSERT INTO public.contas (tipo, descricao, categoria, fornecedor, valor, meio, status)
  VALUES ('pagar',
          'Compra ' || substring(v_compra.id::text, 1, 8) || ' — ' || v_ins.nome,
          'insumos',
          COALESCE(v_forn.nome, ''),
          p_qtd * v_ci.custo_unitario,
          'outro',
          'pendente');

  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'compra_recebida',
          v_ins.nome || ' +' || v_base::text || v_ins.unidade_base);
END;
$$;

COMMENT ON FUNCTION public.receber_compra_item(uuid, numeric, text, date) IS
  'K: recebe item de compra (lote FEFO + custo médio + conta a pagar). Parcial ou total.';

-- =============================================
-- 5. RLS: admin/financeiro tudo; produção lê + registra perda/consumo
-- =============================================
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_tecnicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ficha_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumo_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insumos staff" ON public.insumos;
CREATE POLICY "insumos staff" ON public.insumos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "insumo_lotes staff" ON public.insumo_lotes;
CREATE POLICY "insumo_lotes staff" ON public.insumo_lotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fichas staff" ON public.fichas_tecnicas;
CREATE POLICY "fichas staff" ON public.fichas_tecnicas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "ficha_itens staff" ON public.ficha_itens;
CREATE POLICY "ficha_itens staff" ON public.ficha_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fornecedores staff" ON public.fornecedores;
CREATE POLICY "fornecedores staff" ON public.fornecedores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "compras staff" ON public.compras;
CREATE POLICY "compras staff" ON public.compras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "compra_itens staff" ON public.compra_itens;
CREATE POLICY "compra_itens staff" ON public.compra_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- Movimentações: produção registra perda/consumo (o resto é só leitura p/ ela).
DROP POLICY IF EXISTS "insumo_mov read" ON public.insumo_movimentacoes;
CREATE POLICY "insumo_mov read" ON public.insumo_movimentacoes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));

DROP POLICY IF EXISTS "insumo_mov write" ON public.insumo_movimentacoes;
CREATE POLICY "insumo_mov write" ON public.insumo_movimentacoes FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
    OR (public.has_role(auth.uid(),'producao') AND tipo IN ('perda','consumo'))
  );

DROP POLICY IF EXISTS "insumo_mov admin update" ON public.insumo_movimentacoes;
CREATE POLICY "insumo_mov admin update" ON public.insumo_movimentacoes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- GRANT amplo + RLS restritiva (padrão do repo: a policy é quem filtra).
GRANT ALL ON public.insumos TO authenticated;
GRANT ALL ON public.insumo_lotes TO authenticated;
GRANT ALL ON public.fichas_tecnicas TO authenticated;
GRANT ALL ON public.ficha_itens TO authenticated;
GRANT ALL ON public.fornecedores TO authenticated;
GRANT ALL ON public.compras TO authenticated;
GRANT ALL ON public.compra_itens TO authenticated;
GRANT ALL ON public.insumo_movimentacoes TO authenticated;
GRANT ALL ON public.insumos TO service_role;
GRANT ALL ON public.insumo_lotes TO service_role;
GRANT ALL ON public.fichas_tecnicas TO service_role;
GRANT ALL ON public.ficha_itens TO service_role;
GRANT ALL ON public.fornecedores TO service_role;
GRANT ALL ON public.compras TO service_role;
GRANT ALL ON public.compra_itens TO service_role;
GRANT ALL ON public.insumo_movimentacoes TO service_role;
GRANT EXECUTE ON FUNCTION public.converter_unidade(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_insumos_pedido(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_compra_item(uuid, numeric, text, date) TO authenticated;
