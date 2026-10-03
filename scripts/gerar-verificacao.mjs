import { readFileSync, writeFileSync } from "node:fs";

// Extrai tabelas/colunas de src/integrations/supabase/types.ts (fonte de verdade do app).
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

const linhasTypes = types.split(/\r?\n/);
const iTables = linhasTypes.findIndex((l) => l.trim() === "Tables: {");
const iViews = linhasTypes.findIndex((l, i) => i > iTables && l.trim() === "Views: {");

const esperado = [];
let atual = null;
let dentroRow = false;
for (let i = iTables + 1; i < (iViews > 0 ? iViews : linhasTypes.length); i += 1) {
  const linha = linhasTypes[i];
  const mTabela = linha.match(/^ {6}(\w+): \{$/);
  if (mTabela) {
    atual = { tabela: mTabela[1], cols: [] };
    dentroRow = false;
    esperado.push(atual);
    continue;
  }
  if (/^ {6}\},?$/.test(linha)) {
    atual = null;
    dentroRow = false;
    continue;
  }
  if (/^ {8}Row: \{$/.test(linha)) {
    dentroRow = true;
    continue;
  }
  if (/^ {8}\},?$/.test(linha)) {
    dentroRow = false;
    continue;
  }
  const mCol = linha.match(/^ {10}(\w+):/);
  if (mCol && atual && dentroRow) atual.cols.push(mCol[1]);
}

const valores = esperado.flatMap((t) => t.cols.map((c) => `    ('${t.tabela}','${c}')`));

const sql = `-- ============================================================================
-- PASSO 7 - VERIFICACAO COMPLETA (gerado por scripts/gerar-verificacao.mjs)
-- Compara o banco com TUDO que o app usa: ${esperado.length} tabelas / ${valores.length} colunas.
-- Rode em UM New query.
-- "1_O_QUE_FALTA" deve vir como TUDO OK.
-- ============================================================================

WITH e(tabela, coluna) AS (
  VALUES
${valores.join(",\n")}
),
chk AS (
  SELECT e.tabela,
         e.coluna,
         (to_regclass('public.' || e.tabela) IS NOT NULL) AS tabela_existe,
         EXISTS (
           SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = e.tabela
             AND c.column_name = e.coluna
         ) AS coluna_existe
  FROM e
),
faltando AS (
  SELECT DISTINCT
         CASE WHEN NOT tabela_existe THEN 'TABELA ' || tabela ELSE tabela || '.' || coluna END AS falta
  FROM chk
  WHERE NOT tabela_existe OR NOT coluna_existe
)
SELECT
  coalesce((SELECT string_agg(falta, '; ' ORDER BY falta) FROM faltando), 'TUDO OK') AS "1_O_QUE_FALTA",
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public') AS "2_TOTAL_TABELAS",
  (SELECT coalesce(string_agg(id, ', ' ORDER BY id), 'NENHUM') FROM storage.buckets) AS "3_BUCKETS",
  (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS "4_FUNCOES";

-- 2) detalhe: tabelas do app que NAO existem no banco
SELECT DISTINCT e.tabela AS tabela_ausente
FROM (VALUES
${esperado.map((t) => `  ('${t.tabela}')`).join(",\n")}
) AS e(tabela)
WHERE to_regclass('public.' || e.tabela) IS NULL
ORDER BY e.tabela;
`;

writeFileSync("drizzle/migrations/PASSO-7-verificacao.sql", sql);
console.log(`PASSO-7-verificacao.sql gerado: ${esperado.length} tabelas / ${valores.length} colunas verificadas.`);