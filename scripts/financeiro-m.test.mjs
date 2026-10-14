// Teste das regras M de DRE e ponto de equilíbrio (sem banco).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { dreMensal, pontoEquilibrio, statusConta } = await import("@/lib/financeiro.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}
const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// Exemplo do prompt M: bruta 20000; deduções 1400; CMV 7000; despesas 6500 → lucro 5100 (25,5%)
const d = dreMensal({ bruta: 20000, cancelamentos: 1000, descontos: 400, cmv: 7000, despesas: 6500 });
ok(perto(d.liquida, 18600), "receita líquida", String(d.liquida));
ok(perto(d.lucroBruto, 11600), "lucro bruto", String(d.lucroBruto));
ok(perto(d.resultado, 5100), "lucro líquido 5100", String(d.resultado));
ok(perto(d.margemPct, 25.5), "margem 25,5%", String(d.margemPct));

// Ponto de equilíbrio: fixos 6000, MC 40% → R$ 15.000
ok(perto(pontoEquilibrio(6000, 0.4) ?? 0, 15000), "ponto de equilíbrio 15000");
ok(pontoEquilibrio(6000, 0) === null, "sem margem, sem PE");
ok(pontoEquilibrio(0, 0.4) === 0, "sem fixos, PE zero");

// Vencida continua valendo (regressão da Fase F)
ok(statusConta({ status: "pendente", vencimento: "2020-01-01" }, "2026-10-14") === "vencida", "conta vencida");
ok(statusConta({ status: "paga", vencimento: "2020-01-01" }, "2026-10-14") === "paga", "paga prevalece");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nfinanceiro M: DRE e ponto de equilíbrio passando.");
