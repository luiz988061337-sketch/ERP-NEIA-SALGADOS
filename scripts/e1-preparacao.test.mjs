// Testes E1: preparação local da integração (estáticos + unitários, sem remoto).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const S = await import("@/lib/pedido-status.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
ok(existsSync(SQL), "E1.1 migration 0084 existe (não aplicada)");
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const sqlCode = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// Estáticos: aditiva e segura.
ok(!/ALTER\s+TYPE/i.test(sql), "E1.2 sem ALTER TYPE (enum intacto)");
ok(!/ADD\s+VALUE/i.test(sql), "E1.3 sem ADD VALUE ao enum");
ok(!/DROP\s+TABLE/i.test(sqlCode) && !/DROP\s+COLUMN/i.test(sqlCode), "E1.4 sem DROP TABLE/COLUMN");
ok(!/^\s*DELETE\s+/im.test(sqlCode), "E1.5 sem DELETE de dados");
const foraFuncao = sqlCode.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, "");
ok(!/^\s*UPDATE\s+/im.test(foraFuncao), "E1.5b UPDATE só dentro da função de aceite");
ok(/SET aceito_em_atendente = now\(\), aceito_por = v_uid/.test(sqlCode), "E1.5c função grava só as 2 colunas");
const cols = ["aceito_em_atendente", "aceito_por", "liberado_em", "liberado_por", "conferido_em", "conferido_por", "retirado_em", "retirado_por", "reserva_motoboy_em"];
ok(cols.every((c) => sql.includes(c)), "E1.6 9 colunas do prompt mestre presentes");
ok(!sql.includes("aceito_atendente_em"), "E1.7 sem nome divergente (aceito_em_atendente)");
ok((sql.match(/IF NOT EXISTS/g) || []).length >= 10, "E1.8 idempotente (IF NOT EXISTS)");
ok(sql.includes("has_role(auth.uid(), 'atendente')"), "E1.9 RLS mínima por papel");
ok(sql.includes("pagamento_status") && /NÃO é tocado|nunca confirma pagamento/i.test(sql), "E1.10 pagamento separado documentado");
ok(/NÃO APLICADA|Não rodar sem autorização/i.test(sql), "E1.11 marcada como não aplicada");

// Unitários: mapa compatível, runtime antigo intacto.
const SETE = ["recebido", "em_producao", "pronto", "aguardando_motoboy", "em_rota", "entregue", "cancelado"];
ok(Object.values(S.ETAPAS_OPERACIONAIS).every((v) => SETE.includes(v)), "E1.12 etapas mapeadas só p/ os 7 status");
ok(S.etapaDb("aceito_atendente") === "recebido" && S.etapaDb("reserva_motoboy") === "aguardando_motoboy" && S.etapaDb("retirado") === "entregue", "E1.13 resolução de etapas");
ok(S.etapaDb("inexistente") === null, "E1.14 etapa desconhecida → null");
ok(S.podeTransitar("novo", "aguardando_pagamento") && !S.podeTransitar("entregue", "em_preparacao"), "E1.15 runtime antigo inalterado");
ok(S.STATUS_MAP_DB["novo"] === "recebido" && S.FLUXO_COMPLETO.length === 14, "E1.16 exports originais intactos");

if (falhas > 0) {
  console.error(`E1: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E1: casos passando.");
