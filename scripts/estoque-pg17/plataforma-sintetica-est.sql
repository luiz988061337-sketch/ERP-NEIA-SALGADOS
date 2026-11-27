-- Extensão do cluster exclusivamente descartável do Estoque de Salgados.
-- Não é migration do produto e não representa o Supabase completo.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  statements text[] NOT NULL DEFAULT '{}'
);
GRANT USAGE ON SCHEMA supabase_migrations TO authenticated;
-- O Supabase concede leitura de auth.users ao papel authenticated; o cluster
-- sintético precisa do mesmo acesso para os ensaios de auth.uid().
GRANT SELECT ON auth.users TO authenticated;
