// Testes E7: pagamentos (unitários + estáticos). PG isolado (E7-PG): staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const P = await import("@/lib/pagamento-liberacao.ts");
const F2 = await import("@/lib/atendente-aceite.ts");
const F3 = await import("@/lib/cozinha-liberacao.ts");
const F4 = await import("@/lib/central-atribuicao.ts");
const F5 = await import("@/lib/motoboy-finalizacao.ts");
const F6 = await import("@/lib/impressao-etapas.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// Estáticos: 0084 nunca escreve pagamento.
const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const sets = [...code.matchAll(/SET\s+([^;]+?)\s+WHERE\s+id\s*=/gi)].map((m) => m[1]);
ok(sets.length > 0 && sets.every((s) => !/pagamento_status|pagamento_em|pago_em|forma_pagamento|subtotal|total|desconto/.test(s)), "E7.1 nenhuma função toca pagamento/valores");
ok(!/confirmar|pago\s*=\s*true|dar_baixa/i.test(code), "E7.2 sem confirmação de pagamento");
ok(/adiar_cupom_agendado/.test(code) && /imprimir_apos/.test(code), "E7.3 adiamento de agendado preparado");
ok(/RETURN NEW;/.test(code) && !/RAISE EXCEPTION/.test(code.split("adiar_cupom_agendado")[1] || ""), "E7.4 adiamento nunca bloqueia");
// Matriz.
{
  const d = P.decisaoPagamento;
  const on = (f, m, s) => ({ forma_pagamento: f, pagamento_modalidade: m, pagamento_status: s, cancelado: false });
  ok(d(on("pix", "online", "pendente")) === "analise", "E7.5 pix pendente → análise");
  ok(d(on("pix", "online", "pago")) === "liberar", "E7.6 pix confirmado libera");
  ok(d(on("dinheiro", "na_entrega", "pendente")) === "liberar", "E7.7 dinheiro na entrega não bloqueia");
  ok(d(on("credito", "na_entrega", "pendente")) === "liberar", "E7.8 cartão na entrega não bloqueia");
  ok(d(on("pix", "online", "falhou")) === "analise", "E7.9 falha → análise");
  ok(d(on("pix", "online", "reembolsado")) === "analise", "E7.10 reembolso → análise");
  ok(d({ ...on("pix", "online", "pago"), cancelado: true }) === "bloquear", "E7.11 cancelado bloqueia");
  ok(P.deveAdiarCupom(new Date(Date.now() + 3600000).toISOString(), Date.now()), "E7.12 agendado adia cupom");
  ok(!P.deveAdiarCupom(null, Date.now()), "E7.13 sem agendamento não adia");
}
// Todas as flags desligadas (nada ativado).
ok(!F2.E2_ACEITE_ATENDENTE_ATIVO && !F3.E3_LIBERACAO_ATIVA && !F3.E3_CONFERENCIA_ATIVA && !F4.E4_ATRIBUICAO_ATIVA && !F5.E5_RETIRADA_ATIVA && !F5.E5_FLUXO_MOTOBOY_ATIVO && !F6.E6_IMPRESSAO_ATIVA, "E7.14 todas as flags desligadas");

if (falhas > 0) {
  console.error(`E7: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E7: casos passando. E7-PG (RLS/pagamento em PG isolado): pendente de staging.");
