// Testes E9.2: P1 + fechamento (estáticos + unidade). PG real: staging.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const R = await import("@/lib/realtime-resiliente.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const SQL = "drizzle/migrations/0084_etapas_operacionais.sql";
const sql = existsSync(SQL) ? readFileSync(SQL, "utf8") : "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// 1. GUC removida como prova (bypass era trivial via SET).
ok(!/neia\.etapa_rpc/.test(code), "E9.2.1 sem GUC de autorização");
ok(/congelar_colunas_protegidas/.test(code) && /service_role/.test(code), "E9.2.2 guard sem isenção fraca + service_role");
// 2. Reserva exclusiva.
ok(/rotas_preparando_motoboy_uniq/.test(code) && /WHERE status = 'preparando'/.test(code), "E9.2.3 UNIQUE parcial por motoboy");
// 3. Autoria do aceite.
ok(/aceito_motoboy_por/.test(code), "E9.2.4 coluna de autoria criada");
ok(/aceito_motoboy_por = v_uid/.test(code), "E9.2.5 autoria = autenticado validado");
// 4. Conferência obrigatória (direção segura).
ok(/exigir_conferencia_para_pronto/.test(code) && /neia\.fluxo_novo/.test(code), "E9.2.6 gate com flag de endurecimento");
ok(/Conferencia obrigatoria antes de pronto/.test(code), "E9.2.7 mensagem explícita");
// 5. RLS itens com escopo.
ok(/itens staff operacional select/.test(code) && /IN \('recebido', 'em_producao', 'pronto', 'aguardando_motoboy', 'em_rota', 'entregue'\)/.test(code), "E9.2.8 itens com escopo de fluxo");
// 7. Verificação documentada.
ok(/pg_get_functiondef\('public\.pedidos_guard_update/.test(sql), "E9.2.9 queries de verificação embutidas");
// Resiliência pura.
ok(R.proximoRetryMs(0, () => 0) === 500 && R.proximoRetryMs(0, () => 1) === 1000, "E9.2.10 backoff base");
ok(R.proximoRetryMs(99, () => 1) === 30000, "E9.2.11 teto respeitado");
ok(R.deveUsarPolling(3) && !R.deveUsarPolling(2), "E9.2.12 fallback após 3 falhas");
ok(R.registrarSubscription(["a"], "a").length === 1 && R.registrarSubscription(["a"], "b").length === 2, "E9.2.13 sem duplicar channel");
ok(R.removerSubscription(["a", "b"], "a").join() === "b", "E9.2.14 cleanup");
ok(R.gpsDesatualizado(null, 1) && R.gpsDesatualizado(0, 11 * 60 * 1000) && !R.gpsDesatualizado(0, 5 * 60 * 1000), "E9.2.15 GPS velho sinalizado");
ok(R.chaveDebounce("q", 5000, 12000) === R.chaveDebounce("q", 5000, 14000), "E9.2.16 debounce por janela");

if (falhas > 0) {
  console.error(`E9.2: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E9.2: casos passando. PG/Realtime reais: pendente de staging.");
