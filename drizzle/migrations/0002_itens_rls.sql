-- 0002: endurece RLS de pedido_itens (leitura só dono/staff do pedido)
-- Rode no SQL Editor do Supabase APÓS 0000/0001.

DROP POLICY IF EXISTS "itens select" ON public.pedido_itens;

CREATE POLICY "itens select owner staff" ON public.pedido_itens FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = pedido_itens.pedido_id AND (
      p.user_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'producao')
      OR (public.has_role(auth.uid(),'motoboy') AND (p.motoboy_id = auth.uid() OR (p.motoboy_id IS NULL AND p.status IN ('pronto','aguardando_motoboy'))))
    )
  )
);
