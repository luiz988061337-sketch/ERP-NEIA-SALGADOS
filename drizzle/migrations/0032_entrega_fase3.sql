-- 0032: entrega fase 3 — vínculo motoboy×usuário, endereço completo, avisos.
-- Idempotente. Rode no SQL Editor APÓS 0031.

-- 1) motoboys.user_id: o app grava status por usuário logado (retornando_base etc.)
ALTER TABLE public.motoboys ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS motoboys_user_idx ON public.motoboys (user_id);

DROP POLICY IF EXISTS "motoboys self read" ON public.motoboys;
CREATE POLICY "motoboys self read" ON public.motoboys FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "motoboys self insert" ON public.motoboys;
CREATE POLICY "motoboys self insert" ON public.motoboys FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "motoboys self status" ON public.motoboys;
CREATE POLICY "motoboys self status" ON public.motoboys FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) endereço apartamento/condomínio completo (§59)
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS andar text,
  ADD COLUMN IF NOT EXISTS torre text;

-- 3) avisos: motoboy precisa inserir (retorno à base); staff lê; grants faltavam
GRANT ALL ON public.notificacoes TO authenticated;

DROP POLICY IF EXISTS "notificacoes motoboy insert" ON public.notificacoes;
CREATE POLICY "notificacoes motoboy insert" ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "notificacoes motoboy read" ON public.notificacoes;
CREATE POLICY "notificacoes motoboy read" ON public.notificacoes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'atendente')
    OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'motoboy')
    OR public.has_role(auth.uid(),'financeiro')
  );
