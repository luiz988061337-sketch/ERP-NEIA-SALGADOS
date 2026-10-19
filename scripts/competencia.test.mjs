// Teste de competência mensal + DRE sem dedução dupla (Etapa P, itens 6-7).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { faixaCompetencia, hojeSP } = await import("@/lib/competencia.ts");
const { montarDRE } = await import("@/lib/financeiro.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// Fevereiro (28 dias) e abril (30 dias): fim = dia 1 do mês seguinte 03:00Z.
let f = faixaCompetencia("2026-02");
ok(
  f.ini === "2026-02-01T03:00:00.000Z" && f.fim === "2026-03-01T03:00:00.000Z",
  "fevereiro exato",
  `${f.ini}..${f.fim}`,
);
f = faixaCompetencia("2026-04");
ok(f.fim === "2026-05-01T03:00:00.000Z", "abril sem dia 31", f.fim);
f = faixaCompetencia("2026-12");
ok(f.fim === "2027-01-01T03:00:00.000Z", "virada de ano", f.fim);
// 31/01 23:59 SP = 01/02 02:59Z → dentro de janeiro; 01/02 00:30 SP = 03:30Z → fevereiro.
ok(
  new Date("2026-01-31T23:59:00-03:00").toISOString() < faixaCompetencia("2026-01").fim,
  "31/01 23:59 cai em janeiro",
);
ok(
  new Date("2026-02-01T00:30:00-03:00").toISOString() >= faixaCompetencia("2026-02").ini,
  "01/02 00:30 cai em fevereiro",
);
ok(/^\d{4}-\d{2}-\d{2}$/.test(hojeSP()), "hojeSP formato");

// Exemplo do diagnóstico: venda total 90 com desconto 10 → bruta 100, líquida 90 (não 80).
const d = montarDRE(
  [
    { total: 90, desconto: 10, status: "entregue" },
    { total: 50, desconto: 0, status: "cancelado" },
  ],
  [{ tipo: "pagar", categoria: "insumos", valor: 20 }],
);
ok(
  d.bruta === 150 && d.descontos === 10 && d.liquida === 90,
  "sem dedução dupla",
  JSON.stringify(d),
);
ok(d.cancelamentos === 50, "cancelado só na própria linha");
ok(d.cmv === 20 && d.resultado === 70, "DRE com CMV", String(d.resultado));

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\ncompetencia+DRE: fronteiras e sem-dedução-dupla passando.");
