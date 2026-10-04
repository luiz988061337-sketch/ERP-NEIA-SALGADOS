-- 0041: Endurecer RLS pedido_itens + transições de status
-- Idempotente. Rode APÓS 0040.

-- =============================================
-- 1. Endurecer RLS de pedido_itens (valida ownership/papel)
-- =============================================
DROP POLICY IF EXISTS "itens select" ON public.pedido_itens;
DROP POLICY IF EXISTS "itens insert" ON public.pedido_itens;

CREATE POLICY "itens select" ON public.pedido_itens FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND (
        p.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'producao')
        OR (public.has_role(auth.uid(), 'motoboy') AND (p.motoboy_id = auth.uid() OR (p.motoboy_id IS NULL AND p.status IN ('pronto', 'aguardando_motoboy'))))
      )
  )
);

CREATE POLICY "itens insert" ON public.pedido_itens FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = pedido_id
      AND p.user_id = auth.uid()
  )
);

-- =============================================
-- 2. Tabela de transições permitidas + trigger
-- =============================================
CREATE TABLE IF NOT EXISTS public.pedido_status_transicoes (
  de_status public.order_status NOT NULL,
  para_status public.order_status NOT NULL,
  PRIMARY KEY (de_status, para_status)
);

-- Transições válidas padrão
INSERT INTO public.pedido_status_transicoes (de_status, para_status) VALUES
  -- Fluxo normal
  ('recebido', 'em_producao'),
  ('recebido', 'cancelado'),
  ('em_producao', 'pronto'),
  ('em_producao', 'cancelado'),
  ('pronto', 'aguardando_motoboy'),
  ('pronto', 'cancelado'),
  ('aguardando_motoboy', 'em_rota'),
  ('aguardando_motoboy', 'cancelado'),
  ('em_rota', 'entregue'),
  ('em_rota', 'cancelado'),
  -- Retirada
  ('pronto', 'entregue'),
  -- Permitir voltar um passo (override admin com justificativa)
  ('em_producao', 'recebido'),
  ('pronto', 'em_producao'),
  ('aguardando_motoboy', 'pronto'),
  ('em_rota', 'aguardando_motoboy')
ON CONFLICT DO NOTHING;

-- Trigger para validar transição
CREATE OR REPLACE FUNCTION public.validar_transicao_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eh_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  -- Se não mudou, ignora
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admin pode tudo (com auditoria posterior)
  IF eh_admin THEN
    RETURN NEW;
  END IF;

  -- Verifica se transição é permitida
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_status_transicoes
    WHERE de_status = OLD.status AND para_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'Transição de status não permitida: % → %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica trigger
DROP TRIGGER IF EXISTS trigger_validar_transicao ON public.pedidos;
CREATE TRIGGER trigger_validar_transicao
  BEFORE UPDATE OF status ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_transicao_status();

-- Comentários
COMMENT ON TABLE public.pedido_status_transicoes IS 'Transições de status permitidas (admin ignora via role).';