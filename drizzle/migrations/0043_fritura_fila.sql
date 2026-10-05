-- 0043: fritura_fila + tempo configurável por produto
-- Idempotente. Rode APÓS 0042.

-- =============================================
-- 1. Tempo de fritura por produto (base 50un = 3:30)
-- =============================================
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tempo_fritura_base_segundos integer DEFAULT 210 CHECK (tempo_fritura_base_segundos > 0),
  ADD COLUMN IF NOT EXISTS unidade_base_tempo_fritura integer DEFAULT 50 CHECK (unidade_base_tempo_fritura > 0);

-- =============================================
-- 2. Fila de fritura
-- =============================================
CREATE TABLE IF NOT EXISTS public.fritura_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  tempo_previsto_segundos integer NOT NULL CHECK (tempo_previsto_segundos > 0),
  inicio timestamptz,
  fim timestamptz,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_fritura', 'concluido', 'pausado', 'cancelado')),
  funcionario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fritura_fila_pedido_idx ON public.fritura_fila (pedido_id);
CREATE INDEX IF NOT EXISTS fritura_fila_status_idx ON public.fritura_fila (status);
CREATE INDEX IF NOT EXISTS fritura_fila_funcionario_idx ON public.fritura_fila (funcionario_id);

-- NOTA 0049: 1 linha por pedido+produto (reconfirmar nunca frita em dobro).
-- Em bancos já criados, a 0049 deduplica e adiciona a constraint.
DO $$ BEGIN
  ALTER TABLE public.fritura_fila
    ADD CONSTRAINT fritura_fila_pedido_produto_key UNIQUE (pedido_id, produto_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================
-- 3. Função para calcular tempo de fritura
-- =============================================
CREATE OR REPLACE FUNCTION public.calcular_tempo_fritura(p_produto_id uuid, p_quantidade integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base_seg integer;
  v_base_qtd integer;
  v_tempo integer;
BEGIN
  SELECT tempo_fritura_base_segundos, unidade_base_tempo_fritura
  INTO v_base_seg, v_base_qtd
  FROM public.produtos
  WHERE id = p_produto_id;

  IF NOT FOUND THEN
    RETURN 210; -- default 3:30
  END IF;

  -- Proporcional linear: (quantidade / base_qtd) * base_seg
  v_tempo := CEIL(p_quantidade::numeric / v_base_qtd * v_base_seg);
  RETURN v_tempo;
END;
$$;

-- =============================================
-- 4. Trigger: ao confirmar pedido (em_producao), cria itens na fila de fritura
-- =============================================
CREATE OR REPLACE FUNCTION public.trigger_criar_fritura_fila()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_tempo integer;
BEGIN
  IF NEW.status = 'em_producao' AND OLD.status = 'recebido' THEN
    -- Só itens com produto (combo montado tem produto_id NULL: sem este filtro
    -- o INSERT violava NOT NULL e a confirmação de QUALQUER combo abortava).
    FOR v_item IN
      SELECT pi.produto_id, pi.quantidade
      FROM public.pedido_itens pi
      WHERE pi.pedido_id = NEW.id
        AND pi.produto_id IS NOT NULL
    LOOP
      v_tempo := public.calcular_tempo_fritura(v_item.produto_id, v_item.quantidade);
      INSERT INTO public.fritura_fila (pedido_id, produto_id, quantidade, tempo_previsto_segundos)
      VALUES (NEW.id, v_item.produto_id, v_item.quantidade, v_tempo)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_criar_fritura_fila ON public.pedidos;
CREATE TRIGGER trigger_criar_fritura_fila
  AFTER UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_criar_fritura_fila();

-- =============================================
-- 5. RLS
-- =============================================
ALTER TABLE public.fritura_fila ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fritura staff" ON public.fritura_fila;
CREATE POLICY "fritura staff" ON public.fritura_fila FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
  OR public.has_role(auth.uid(), 'atendente')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'producao')
);

COMMENT ON TABLE public.fritura_fila IS 'Fila de fritura por pedido/produto. Tempo calculado proporcional à quantidade (base 50un).';
COMMENT ON COLUMN public.produtos.tempo_fritura_base_segundos IS 'Tempo base em segundos para unidade_base_tempo_fritura unidades (ex: 210s = 3:30 para 50un).';