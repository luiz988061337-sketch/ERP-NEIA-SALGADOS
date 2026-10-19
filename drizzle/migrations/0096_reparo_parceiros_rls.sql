-- 0096: reparo de RLS/GRANT de parceiros (baseline fora de ordem)
--
-- MOTIVO
--   0001_migration.sql e 0002_secure_loyalty_and_partners.sql foram escritas
--   para rodar DEPOIS da 0028 (tabela parceiros) e da 0088 (funcoes de
--   reserva). No replay linear elas rodam antes e falham; depois a 0028 cria
--   policies permissivas ("parceiros read" USING true e "parceiros write"
--   WITH CHECK true), que ficam no estado final.
--
--   Efeito atual: qualquer visitante (anon/public) le a tabela inteira
--   (inclusive e-mail, CNPJ e proposta) e qualquer authenticated atualiza/
--   apaga qualquer linha. O formulario publico de candidatura, por outro
--   lado, nao tem GRANT INSERT para anon.
--
-- ESCOPO
--   - nao altera dados;
--   - nao altera a view parceiros_publicos (0065);
--   - nao concede nada a service_role;
--   - idempotente (pode ser reaplicada).
--
-- ORDEM
--   Aplicar depois de 0028, 0065 e 0095. Em ambiente novo, preferir snapshot
--   canonico; esta migration e o reparo explicito para quem for replay.

-- 1) Remove as policies permissivas criadas pela 0028.
DROP POLICY IF EXISTS "parceiros read" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros write" ON public.parceiros;

-- 2) Leitura direta: somente admin. A leitura publica continua pela view
--    parceiros_publicos (somente aprovada + autoriza_divulgacao).
DROP POLICY IF EXISTS "parceiros admin read" ON public.parceiros;
CREATE POLICY "parceiros admin read" ON public.parceiros
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Candidatura publica: INSERT apenas como 'nova' e com limites de texto.
--    A candidatura nunca pode nascer aprovada/divulgada.
DROP POLICY IF EXISTS "parceiros candidatura" ON public.parceiros;
CREATE POLICY "parceiros candidatura" ON public.parceiros
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'nova'
    AND length(nome) BETWEEN 1 AND 200
    AND coalesce(length(proposta), 0) <= 2000
    AND coalesce(length(descricao), 0) <= 2000
  );

-- 4) Escrita administrativa (insert/update/delete) somente admin.
DROP POLICY IF EXISTS "parceiros admin write" ON public.parceiros;
CREATE POLICY "parceiros admin write" ON public.parceiros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Privilégios de tabela. A policy de INSERT sozinha nao basta: o role
--    anon precisa do GRANT para o formulario publico funcionar.
REVOKE ALL ON public.parceiros FROM anon;
GRANT INSERT ON public.parceiros TO anon, authenticated;
GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;

COMMENT ON POLICY "parceiros admin read" ON public.parceiros IS
  '0096: leitura direta somente admin; publico usa a view parceiros_publicos.';
COMMENT ON POLICY "parceiros candidatura" ON public.parceiros IS
  '0096: candidatura publica somente status=nova e textos limitados.';
COMMENT ON POLICY "parceiros admin write" ON public.parceiros IS
  '0096: update/delete/insert administrativo somente admin.';
