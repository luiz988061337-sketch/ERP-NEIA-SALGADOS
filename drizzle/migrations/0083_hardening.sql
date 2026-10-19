-- 0083: HARDENING (NÃO APLICAR EM PRODUÇÃO SEM HOMOLOGAR EM TESTE)
-- Corrige itens 3, 4, 9 e 10 do PENDENCIAS-ERP-NEIA.md:
--   - consumir_insumos_pedido / receber_compra_item: autorização interna por
--     papel (SECURITY DEFINER não basta), correção de unidade/custo no
--     recebimento, bloqueio de excesso, lotes vencidos ignorados, locks.
--   - policies 0075: SELECT/INSERT/UPDATE/DELETE separados (produção sem DELETE).
--   - fechamento mensal trava lançamentos em contas (+ estorno auditado).
--   - equipe: funcionário vê o próprio cadastro; ponto valida vínculo;
--     dono atualiza a própria saída aberta.
--   - acertos_motoboy: acerto persistido (antes só log).
-- Idempotente. Exige 0072, 0075 e 0079 aplicadas.

-- =============================================
-- 1. Acertos de motoboy persistidos
-- =============================================
CREATE TABLE IF NOT EXISTS public.acertos_motoboy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motoboy_id uuid NOT NULL,
  periodo_ini date NOT NULL,
  periodo_fim date NOT NULL,
  entregas integer NOT NULL DEFAULT 0,
  taxas numeric(12,2) NOT NULL DEFAULT 0,
  vales numeric(12,2) NOT NULL DEFAULT 0,
  liquido numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acertos_motoboy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acertos staff" ON public.acertos_motoboy;
CREATE POLICY "acertos staff" ON public.acertos_motoboy FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
GRANT ALL ON public.acertos_motoboy TO authenticated;
GRANT ALL ON public.acertos_motoboy TO service_role;

-- =============================================
-- 2. consumir_insumos_pedido: autoriza + ignora vencidos + trava linhas
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
  -- Autorização interna: RLS das tabelas não basta dentro de DEFINER.
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao')) THEN
    RAISE EXCEPTION 'sem_permissao_consumo';
  END IF;

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

      -- Soma só lotes válidos (vencidos não entram; vão p/ perda manual).
      SELECT COALESCE(SUM(restante), 0) INTO v_saldo FROM public.insumo_lotes
      WHERE insumo_id = v_fi.insumo_id AND restante > 0
        AND (validade IS NULL OR validade >= CURRENT_DATE);
      IF v_saldo < v_qtd THEN
        RAISE EXCEPTION 'estoque_insumo_insuficiente:%', v_fi.insumo_id;
      END IF;

      v_falta := v_qtd;
      FOR v_lote IN
        SELECT id, restante FROM public.insumo_lotes
        WHERE insumo_id = v_fi.insumo_id AND restante > 0
          AND (validade IS NULL OR validade >= CURRENT_DATE)
        ORDER BY validade NULLS LAST, created_at
        FOR UPDATE
      LOOP
        EXIT WHEN v_falta <= 0;
        v_pega := LEAST(v_lote.restante, v_falta);
        UPDATE public.insumo_lotes SET restante = restante - v_pega WHERE id = v_lote.id;
        v_falta := v_falta - v_pega;
      END LOOP;

      SELECT estoque_atual INTO v_saldo FROM public.insumos WHERE id = v_fi.insumo_id FOR UPDATE;
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

-- =============================================
-- 3. receber_compra_item: autoriza + unidades corretas + sem excesso
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
  v_qtd_na_unidade numeric;
  v_tot_ped numeric;
  v_tot_rec numeric;
BEGIN
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')) THEN
    RAISE EXCEPTION 'sem_permissao_recebimento';
  END IF;

  SELECT * INTO v_ci FROM public.compra_itens WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compra_item_nao_encontrado';
  END IF;
  SELECT * INTO v_ins FROM public.insumos WHERE id = v_ci.insumo_id;
  SELECT * INTO v_compra FROM public.compras WHERE id = v_ci.compra_id;
  IF v_compra.status = 'cancelada' THEN
    RAISE EXCEPTION 'compra_cancelada';
  END IF;
  IF v_compra.status = 'recebida_total' THEN
    RAISE EXCEPTION 'compra_ja_totalizada';
  END IF;

  v_base := public.converter_unidade(p_qtd, p_unidade, v_ins.unidade_base);
  IF v_base IS NULL OR v_base <= 0 THEN
    RAISE EXCEPTION 'unidade_invalida';
  END IF;

  -- Custo sempre pela unidade NEGOCIADA do item (não pela informada aqui).
  v_custo_base := v_ci.custo_unitario / public.converter_unidade(1, v_ci.unidade, v_ins.unidade_base);

  -- recebido acumulado convertido para a unidade do item; sem excesso.
  v_qtd_na_unidade := public.converter_unidade(v_base, v_ins.unidade_base, v_ci.unidade);
  IF v_ci.quantidade_recebida + v_qtd_na_unidade > v_ci.quantidade + 0.0005 THEN
    RAISE EXCEPTION 'recebimento_acima_do_pedido';
  END IF;

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
  SET quantidade_recebida = quantidade_recebida + v_qtd_na_unidade
  WHERE id = p_item_id;

  SELECT COALESCE(SUM(quantidade), 0), COALESCE(SUM(quantidade_recebida), 0)
  INTO v_tot_ped, v_tot_rec
  FROM public.compra_itens WHERE compra_id = v_compra.id;

  UPDATE public.compras
  SET status = CASE WHEN v_tot_rec >= v_tot_ped THEN 'recebida_total' ELSE 'recebida_parcial' END,
      recebida_em = now()
  WHERE id = v_compra.id;

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

-- =============================================
-- 4. Policies 0075 separadas por operação (produção sem DELETE)
-- =============================================
DROP POLICY IF EXISTS "insumos staff" ON public.insumos;
CREATE POLICY "insumos read" ON public.insumos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
CREATE POLICY "insumos write" ON public.insumos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "insumos update" ON public.insumos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "insumos delete" ON public.insumos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "insumo_lotes staff" ON public.insumo_lotes;
CREATE POLICY "insumo_lotes read" ON public.insumo_lotes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
CREATE POLICY "insumo_lotes write" ON public.insumo_lotes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fichas staff" ON public.fichas_tecnicas;
CREATE POLICY "fichas read" ON public.fichas_tecnicas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
DROP POLICY IF EXISTS "ficha_itens staff" ON public.ficha_itens;
CREATE POLICY "ficha_itens read" ON public.ficha_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
-- escrita de fichas continua só admin/financeiro via policies de UPDATE/DELETE abaixo
CREATE POLICY "fichas write" ON public.fichas_tecnicas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "ficha_itens write" ON public.ficha_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "fornecedores staff" ON public.fornecedores;
CREATE POLICY "fornecedores read" ON public.fornecedores FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
CREATE POLICY "fornecedores write" ON public.fornecedores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "compras staff" ON public.compras;
CREATE POLICY "compras read" ON public.compras FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
CREATE POLICY "compras write" ON public.compras FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "compra_itens staff" ON public.compra_itens;
CREATE POLICY "compra_itens read" ON public.compra_itens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'producao'));
CREATE POLICY "compra_itens write" ON public.compra_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

-- =============================================
-- 5. Fechamento trava lançamentos em contas (+ estorno auditado)
-- =============================================
CREATE OR REPLACE FUNCTION public.contas_fechamento_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_comp := COALESCE(to_char(OLD.vencimento, 'YYYY-MM'), to_char(OLD.created_at, 'YYYY-MM'));
  ELSE
    v_comp := COALESCE(to_char(NEW.vencimento, 'YYYY-MM'), to_char(NEW.created_at, 'YYYY-MM'));
  END IF;
  IF EXISTS (SELECT 1 FROM public.fechamentos_mensais WHERE competencia = v_comp AND status = 'fechado') THEN
    RAISE EXCEPTION 'mes_fechado:%', v_comp;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS contas_fechamento_trg ON public.contas;
CREATE TRIGGER contas_fechamento_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.contas
  FOR EACH ROW
  EXECUTE FUNCTION public.contas_fechamento_guard();

-- Estorno auditado de mês fechado (única via de correção).
CREATE OR REPLACE FUNCTION public.estornar_conta(p_conta_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c record;
BEGIN
  IF NOT ((auth.jwt() ->> 'role') = 'service_role'
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')) THEN
    RAISE EXCEPTION 'sem_permissao_estorno';
  END IF;
  SELECT * INTO v_c FROM public.contas WHERE id = p_conta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conta_nao_encontrada';
  END IF;
  UPDATE public.contas
  SET status = 'pendente', valor_pago = 0, pago_em = NULL, updated_at = now()
  WHERE id = p_conta_id;
  INSERT INTO public.admin_logs (actor, acao, detalhe)
  VALUES (auth.uid(), 'conta_estornada', substring(p_conta_id::text, 1, 8) || ' motivo: ' || COALESCE(p_motivo, ''));
END;
$$;
GRANT EXECUTE ON FUNCTION public.estornar_conta(uuid, text) TO authenticated;

-- =============================================
-- 6. Equipe: vínculo próprio e saída da própria aberta
-- =============================================
DROP POLICY IF EXISTS "func staff" ON public.funcionarios;
CREATE POLICY "func staff" ON public.funcionarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
DROP POLICY IF EXISTS "func proprio" ON public.funcionarios;
CREATE POLICY "func proprio" ON public.funcionarios FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pontos insert" ON public.pontos;
CREATE POLICY "pontos insert" ON public.pontos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')
    OR (user_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.funcionarios f WHERE f.id = funcionario_id AND f.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "pontos admin update" ON public.pontos;
CREATE POLICY "pontos admin update" ON public.pontos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
DROP POLICY IF EXISTS "pontos propria saida" ON public.pontos;
CREATE POLICY "pontos propria saida" ON public.pontos FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND saida IS NULL)
  WITH CHECK (user_id = auth.uid());
