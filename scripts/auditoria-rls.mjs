/**
 * Auditoria RLS/GRANTs: cada tabela criada em drizzle/migrations/00*.sql precisa de
 *   1) ENABLE ROW LEVEL SECURITY, e
 *   2) ao menos um GRANT (sem GRANT o PostgREST nega tudo mesmo com policy permissiva
 *      — foi assim que a seção Provedor do /fiscal nasceu quebrada, corrigida na 0051).
 *
 * Uso: node scripts/auditoria-rls.mjs (exit 1 se houver gap).
 * Rode a partir da raiz do projeto.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "drizzle/migrations";
const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const all = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

const tables = new Set(
  [...all.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/gi)].map((m) => m[1]),
);

const grants = {};
for (const m of all.matchAll(/GRANT\s+[\s\S]*?ON\s+([\s\S]*?)\s+TO\s+([\w,\s]+?);/gi)) {
  const tbls = [...m[1].matchAll(/(?:public\.)?(\w+)/g)].map((x) => x[1]);
  const roles = m[2].split(",").map((r) => r.trim());
  for (const t of tbls) {
    grants[t] = grants[t] || new Set();
    for (const r of roles) grants[t].add(r);
  }
}

let fail = 0;
for (const t of [...tables].sort()) {
  const problemas = [];
  if (!new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`, "i").test(all)) {
    problemas.push("sem RLS");
  }
  if (!grants[t] || grants[t].size === 0) {
    problemas.push("sem GRANT");
  }
  if (problemas.length > 0) {
    fail++;
    console.log(`FALHOU - ${t}: ${problemas.join(", ")}`);
  }
}

console.log(fail === 0 ? `\nTUDO OK (${tables.size} tabelas com RLS+GRANT).` : `\n${fail} tabela(s) com gap.`);
process.exit(fail === 0 ? 0 : 1);
