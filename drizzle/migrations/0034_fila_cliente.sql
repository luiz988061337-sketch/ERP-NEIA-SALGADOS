-- 0034: impressão automática — cliente enfileira o próprio pedido.
-- O checkout insere em fila_impressao como o cliente logado; a policy 0025
-- só permitia staff, então o insert caía em silêncio e nada imprimia.
-- Regra mínima: só o dono, só tipo pedido, só pendente, só uuid do evento confirmado.
-- Idempotente.

DROP POLICY IF EXISTS "fila dono insert" ON public.fila_impressao;
CREATE POLICY "fila dono insert" ON public.fila_impressao FOR INSERT TO authenticated
  WITH CHECK (
    tipo = 'pedido'
    AND status = 'pendente'
    AND trabalho_uuid = pedido_id::text || ':confirmado'
    AND EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
  );

-- Histórico do nascimento do pedido (recebido): mesmo motivo, mesmo remédio.
DROP POLICY IF EXISTS "hist dono insert" ON public.pedido_status_historico;
CREATE POLICY "hist dono insert" ON public.pedido_status_historico FOR INSERT TO authenticated
  WITH CHECK (
    de_status IS NULL
    AND para_status = 'recebido'
    AND EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = pedido_id AND p.user_id = auth.uid())
  );
