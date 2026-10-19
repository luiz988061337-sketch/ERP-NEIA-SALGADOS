// Testes E10.0.1: bloqueadores corrigidos (estáticos locais). PG: staging.
import { readFileSync, existsSync } from "node:fs";

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const F84 = "drizzle/migrations/0084_etapas_operacionais.sql";
const F85 = "drizzle/migrations/0085_guard_pedidos_correcao.sql";
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).filter((l) => !l.trim().startsWith("COMMENT ON")).join("\n");
const code = strip(existsSync(F84) ? readFileSync(F84, "utf8") : "");
const g85 = existsSync(F85) ? readFileSync(F85, "utf8") : "";
const gcode = strip(g85);

// 1. Ordem CREATE antes de REVOKE (sem janela de exposição fora de transação).
{
  const creates = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  const preRevokes = [...code.matchAll(/REVOKE ALL ON FUNCTION public\.(\w+)\([^)]*\) FROM PUBLIC;\s*\nCREATE OR REPLACE FUNCTION public\.\1\(/g)].map((m) => m[1]);
  ok(creates.length >= 12 && preRevokes.length === 0, "E10.1.1 CREATE antes do REVOKE", `${creates.length} funções, ${preRevokes.length} pré-REVOKES`);
}
// 2. Saneamento documentado, sem execução automática.
ok(/pedidos em >1 rota ativa/.test(g85.includes("SELECT") ? g85 : "") || /pedidos em >1 rota ativa/.test(readFileSync(F84, "utf8")), "E10.1.2 saneamento documentado");
// 3. Janela: NULL/negativo/excesso tratados.
ok(/COALESCE\(p_antecedencia_min, 60\)/.test(code) && /LEAST\(GREATEST\(COALESCE/.test(code) && /1440/.test(code), "E10.1.3 NULL→60, negativos→0, teto 1440");
// 4. Reimpressão por chave, sem relógio.
ok(/p_idempotencia/.test(code) && !/clock_timestamp/.test(code), "E10.1.4 chave de idempotência, sem clock");
ok(/solicitacao ja registrada/.test(code), "E10.1.5 retry retorna conflito explícito");
ok(/ORDER BY f\.created_at DESC LIMIT 1/.test(code), "E10.1.6 contador em linha inequívoca");
// 5. Rota sem escolha arbitrária.
ok(/rotas duplicadas — sanear/.test(code) && /ORDER BY r\.created_at LIMIT 1/.test(code), "E10.1.7 duplicata conflita, seleção ordenada");
// 6. Guard 0085.
ok(existsSync(F85), "E10.1.8 migration corretiva preparada (não aplicada)");
ok(/service_role/.test(gcode) && /motoboy_nao_pode_roubar_pedido/.test(gcode), "E10.1.9 bypass servidor + anti-roubo");
// 0074:35-38 invertido só vale no freeze de valores do motoboy; no cliente,
// IS NOT DISTINCT é uso correto (exige inalterado). Checa o bloco do RAISE.
{
  const i = gcode.indexOf("motoboy_nao_pode_alterar_valores");
  const bloco = i < 0 ? "" : gcode.slice(Math.max(0, i - 900), i);
  ok(bloco.includes("IS DISTINCT FROM OLD.subtotal") && !bloco.includes("IS NOT DISTINCT FROM OLD.subtotal"), "E10.1.10 freeze de valores sem inversão");
}
ok(/IS DISTINCT FROM OLD\.(user_id|subtotal)/.test(gcode), "E10.1.11 congelamento correto");
// 7. Sem remetimento a GUC de autorização.
ok(!/neia\.etapa_rpc/.test(code) && !/neia\.etapa_rpc/.test(gcode), "E10.1.12 sem GUC de autorização");

if (falhas > 0) {
  console.error(`E10.0.1: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("E10.0.1: casos passando. PG real: pendente de staging.");
