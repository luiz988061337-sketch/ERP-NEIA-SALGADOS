import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "drizzle/migrations";
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

const guardType = (name, values) =>
  `DO $t$\nBEGIN\n  CREATE TYPE public.${name} AS ENUM (${values});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND\n$t$;`;

const primeira = files[0];
const ultima = files[files.length - 1];
let out = `-- ============================================================================
-- PASSO 4 - BOOTSTRAP COMPLETO (gerado por scripts/gerar-bootstrap.mjs)
-- Aplica drizzle/migrations/${primeira.slice(0, 4)}..${ultima.slice(0, 4)} nessa ordem.
-- Cada arquivo roda em uma sub-transacao propria: se um falhar, os OUTROS
-- continuam e o erro aparece como WARNING no painel de mensagens.
-- Pode rodar quantas vezes quiser.
-- ============================================================================
`;

let aplicadas = 0;
for (const f of files) {
  aplicadas += 1;
  let sql = readFileSync(join(dir, f), "utf8");

  // ALTER TYPE ... ADD VALUE nao roda dentro de transaction (limite do SQL Editor).
  // O enum app_role ja nasce completo em 0000, entao removemos essas linhas.
  sql = sql.replace(
    /^\s*ALTER TYPE\s+[\w.]+\s+ADD VALUE\s+[^;]*;[^\S\n]*\n?/gim,
    "-- [gerador] ALTER TYPE ADD VALUE removido: app_role ja e criado com todos os valores em 0000\n",
  );

  // CREATE TYPE guardado contra duplicate_object
  sql = sql.replace(/CREATE TYPE public\.(\w+) AS ENUM \(([^)]*)\);/gi, (_m, name, values) => {
    const v =
      name === "app_role"
        ? "'admin', 'producao', 'motoboy', 'cliente', 'atendente', 'financeiro'"
        : values.trim().replace(/\s*,\s*/g, ", ").replace(/,$/, "");
    return guardType(name, v);
  });

  out += `
-- ----------------------------------------------------------------------------
-- ${f}
-- ----------------------------------------------------------------------------
DO $mig$
BEGIN
  EXECUTE $body$${sql}$body$;
  RAISE NOTICE 'APLICADO ${f}';
EXCEPTION WHEN others THEN
  RAISE WARNING 'FALHOU ${f} -> %', SQLERRM;
END
$mig$;
`;
}

out += `
-- ============================================================================
-- RESUMO: cole isto num New query e me envie a linha que aparecer.
-- ============================================================================
SELECT
  (SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','user_roles','produtos','categorias','pedidos','pedido_itens',
        'cupons','favoritos','avaliacoes','enderecos','crm_settings','hero_carousel',
        'calculadora_config','motoboys','metas','despesas','estoque_mov','admin_logs',
        'crm_customers','crm_campaigns','orcamentos','pedidos_recorrentes','pedido_notas',
        'campanha_cliques')) AS "TABELAS_CRIADAS",
  (SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role') AS "APP_ROLE",
  (SELECT string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ', ' ORDER BY proname)
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS "FUNCOES",
  (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pedidos' AND column_name = 'tipo_entrega') AS "TIPO_ENTREGA";
`;

writeFileSync(join(dir, "PASSO-4-bootstrap-completo.sql"), out);
console.log(`gerado: PASSO-4-bootstrap-completo.sql com ${aplicadas} migrations (${out.length} bytes)`);