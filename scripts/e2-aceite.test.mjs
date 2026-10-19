// Testes E2: aceite da atendente (unitários locais + estáticos da migration).
// Concorrência transacional real e RLS exigem PostgreSQL isolado (staging)
// e estão documentados como E2-PG, não executados aqui.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const A = await import("@/lib/atendente-aceite.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// Estáticos da migration 0084 (correção E2).
const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok(!/CREATE POLICY "pedidos atendente fluxo update"/.test(code), "E2.1 policy UPDATE ampla removida");
ok(/CREATE OR REPLACE FUNCTION public\.aceitar_pedido_atendente\(/.test(code), "E2.2 função de aceite preparada");
ok(/SECURITY DEFINER SET search_path = public/.test(code), "E2.3 definer com search_path seguro");
ok(/has_role\(v_uid, 'atendente'\)/.test(code) && /has_role\(v_uid, 'admin'\)/.test(code), "E2.4 autoriza atendente/admin, nega resto");
ok(/FOR UPDATE/.test(code), "E2.5 trava a linha (serializa concorrência)");
ok(/aceito_em_atendente = now\(\), aceito_por = v_uid/.test(code), "E2.6 grava só as 2 colunas do aceite");
ok(!/pagamento_status\s*=/.test(code) && !/SET\s+status\s*=/.test(code.replace(/v_status public\.order_status;/g, "")), "E2.7 não toca pagamento nem status");
ok(/REVOKE ALL ON FUNCTION/.test(code) && /GRANT EXECUTE .* TO authenticated/.test(code), "E2.8 privilégio mínimo");
ok(/'conflito'/.test(code) && /'inelegivel'/.test(code) && /'inexistente'/.test(code) && /'negado'/.test(code), "E2.9 resultados explícitos");

// Unitários do módulo (flag off por padrão: sem rede).
ok(A.E2_ACEITE_ATENDENTE_ATIVO === false, "E2.10 flag desligada por padrão");
{
  const r = await A.aceitarPedidoAtendente({ rpc: async () => { throw new Error("rede"); } }, "x");
  ok(!r.ok && r.codigo === "flag-desativada", "E2.11 flag off não toca a rede");
}
{
  const e = A.elegivelAceiteLocal({ status: "recebido", aceito_em_atendente: null, pagamento_status: "pendente" });
  ok(e.elegivel, "E2.12 elegível em Novos sem aceite");
  ok(!A.elegivelAceiteLocal({ status: "recebido", aceito_em_atendente: "2026-01-01", pagamento_status: "pago" }).elegivel, "E2.13 duplicado barrado no pré-check");
  ok(!A.elegivelAceiteLocal({ status: "em_producao", aceito_em_atendente: null, pagamento_status: "pago" }).elegivel, "E2.14 fora de Novos barrado");
}
{
  const b = A.bloqueioPagamentoComercial;
  ok(b({ forma_pagamento: "pix", pagamento_modalidade: "online", pagamento_status: "pago" }) === "ok", "E2.15 pix pago libera");
  ok(b({ forma_pagamento: "pix", pagamento_modalidade: "online", pagamento_status: "pendente" }) === "analise", "E2.16 pix pendente vai p/ análise");
  ok(b({ forma_pagamento: "dinheiro", pagamento_modalidade: "na_entrega", pagamento_status: "pendente" }) === "ok", "E2.17 dinheiro na entrega pode pendente");
  ok(b({ forma_pagamento: "credito", pagamento_modalidade: "na_entrega", pagamento_status: "pendente" }) === "ok", "E2.18 cartão na entrega pode pendente");
}

if (falhas > 0) {
  console.error(`E2: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E2: casos passando. E2-PG (concorrência/RLS em PG isolado): pendente de staging.");
