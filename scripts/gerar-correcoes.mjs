import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "drizzle/migrations";

// Migrations que faltam (tabelas reportadas como ausentes na 1a execucao).
const faltando = [
  "0001_neia_tipos_crm.sql",
  "0003_operacao.sql",
  "0004_inteligencia.sql",
  "0008_atendimento.sql",
  "0012_recorrencia.sql",
];

const esperado = [
  "crm_events",
  "crm_recipients",
  "admin_logs",
  "despesas",
  "estoque_mov",
  "carrinho_eventos",
  "notificacoes",
  "orcamentos",
  "pedido_notas",
  "pedidos_recorrentes",
];

const banner = (t) => `-- ============================================================================\n-- ${t}\n-- RODE CADA ARQUIVO EM UM "New query" SEPARADO (um Run por arquivo).\n-- ============================================================================\n\n`;

// 5a: enum (precisa de transacao propria: app_role ja foi commitado antes)
writeFileSync(
  join(dir, "PASSO-5a-enum.sql"),
  `${banner("PASSO 5a - completa o enum app_role (atendente, financeiro)")}
-- Se rodar tudo junto com outra migration, o ALTER TYPE falha.
DO $add$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'atendente') THEN
    ALTER TYPE public.app_role ADD VALUE 'atendente';
    RAISE NOTICE 'papel atendente adicionado';
  ELSE
    RAISE NOTICE 'atendente ja existia';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname = 'app_role' AND e.enumlabel = 'financeiro') THEN
    ALTER TYPE public.app_role ADD VALUE 'financeiro';
    RAISE NOTICE 'papel financeiro adicionado';
  ELSE
    RAISE NOTICE 'financeiro ja existia';
  END IF;
END
$add$;

SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) AS app_role
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role';
`,
);

// 5b..5f: uma migration por arquivo, sem o ALTER TYPE (ja tratado em 5a)
const letras = ["b", "c", "d", "e", "f"];
faltando.forEach((f, i) => {
  let sql = readFileSync(join(dir, f), "utf8");
  sql = sql.replace(
    /^\s*ALTER TYPE\s+[\w.]+\s+ADD VALUE\s+[^;]*;[^\S\n]*\n?/gim,
    "-- [gerador] ALTER TYPE removido: roda em PASSO-5a\n",
  );
  const tag = `PASSO-5${letras[i]}`;
  writeFileSync(join(dir, `${tag}-${f}`), `${banner(`${tag} - ${f} (rode sozinho)`)}\n${sql}\n`);
});

// 5z: verificacao final, tudo numa unica celula
writeFileSync(
  join(dir, "PASSO-5z-verificacao.sql"),
  `${banner("PASSO 5z - verificacao final (rode depois de 5a..5f)")}
SELECT
  (SELECT string_agg(enumlabel, '/' ORDER BY enumsortorder) FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'app_role') AS "1_APP_ROLE",
  (SELECT coalesce(string_agg(x, ', '), 'TODAS OK') FROM unnest(ARRAY[${esperado
    .map((t) => `'${t}'`)
    .join(", ")}]) AS x
   WHERE to_regclass('public.' || x) IS NULL) AS "2_TABELAS_AINDA_FALTANDO",
  (SELECT count(*)::text FROM pg_tables WHERE schemaname = 'public') AS "3_TOTAL_TABELAS";
`,
);

console.log("gerados: PASSO-5a-enum.sql + " + faltando.map((f, i) => `PASSO-5${String.fromCharCode(98 + i)}-${f}`).join(" + ") + " + PASSO-5z-verificacao.sql");
console.log(readdirSync(dir).filter((f) => f.startsWith("PASSO-5")).sort().join("\n"));