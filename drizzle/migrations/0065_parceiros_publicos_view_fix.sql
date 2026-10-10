-- 0065_parceiros_publicos_view_fix.sql (FASE A — corretiva, idempotente, NÃO aplicada ainda)
-- Problema: a view filtrava status = 'aprovado', mas o CHECK de public.parceiros
-- (0028_crm_experiencia.sql:52) só aceita 'aprovada' -> a view nunca retornava linha.
-- Correção: alinhar a view ao valor real do CHECK ('aprovada').
-- Risco: baixo (somente leitura pública). Sem alteração de tabela/coluna/RLS.
-- Rollback: reaplicar a definição anterior com 'aprovado' (ver 0001_migration.sql:10-14).
-- Aplicar via SQL Editor do Supabase após autorização da Fase B.

CREATE OR REPLACE VIEW public.parceiros_publicos AS
  SELECT id, nome, categoria, cidade, bairro, instagram, site, descricao, logo_url
  FROM public.parceiros
  WHERE status = 'aprovada' AND autoriza_divulgacao;

GRANT SELECT ON public.parceiros_publicos TO anon, authenticated;
