-- 0008: atendimento — notas do pedido + leitura de pedidos/clientes pelo atendente
-- Rode no SQL Editor do Supabase APÓS 0000–0007. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.

-- ---------- pedido_notas (timeline; interna vs visível ao cliente) ----------
CREATE TABLE IF NOT EXISTS public.pedido_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  autor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  texto text NOT NULL DEFAULT '',
  visivel_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedido_notas_pedido_idx ON public.pedido_notas (pedido_id, created_at);

ALTER TABLE public.pedido_notas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedido_notas TO service_role;
GRANT ALL ON public.pedido_notas TO authenticated;

DROP POLICY IF EXISTS "notas staff" ON public.pedido_notas;
CREATE POLICY "notas staff" ON public.pedido_notas FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'financeiro')
    OR (public.has_role(auth.uid(),'motoboy') AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notas.pedido_id AND (p.motoboy_id = auth.uid() OR p.motoboy_id IS NULL)
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'atendente')
  );

DROP POLICY IF EXISTS "notas cliente visiveis" ON public.pedido_notas;
CREATE POLICY "notas cliente visiveis" ON public.pedido_notas FOR SELECT TO authenticated
  USING (
    visivel_cliente = true AND EXISTS (
      SELECT 1 FROM public.pedidos p WHERE p.id = pedido_notas.pedido_id AND p.user_id = auth.uid()
    )
  );

-- ---------- atendente: leitura de pedidos e perfis (SEM escrita além do que já tem) ----------
-- Atendente registra pedidos (insert próprio já permitido) e precisa buscar clientes/pedidos.
DROP POLICY IF EXISTS "pedidos atendente read" ON public.pedidos;
CREATE POLICY "pedidos atendente read" ON public.pedidos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'atendente') OR public.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "profiles atendente read" ON public.profiles;
CREATE POLICY "profiles atendente read" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'atendente'));
