-- 0011: admin gerencia papéis (atribuir/remover atendente, produção, motoboy, financeiro)
-- Rode no SQL Editor do Supabase APÓS 0000–0010. Idempotente.
-- ATENÇÃO: rode primeiro em staging/homologação.
-- Sem isso, papéis só podem ser atribuídos pelo dashboard do Supabase.

DROP POLICY IF EXISTS "roles admin manage" ON public.user_roles;
CREATE POLICY "roles admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
