// Teste puro das regras L de precificação (sem banco).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const {
  custoDireto,
  rateioFixoPorUnidade,
  precoSugerido,
  margemReal,
  seloMargem,
  custoKit,
  descontoEfetivoKit,
} = await import("@/lib/precificacao.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}
const perto = (a, b, tol = 0.005) => a !== null && Math.abs(a - b) <= tol;

// Exemplo do prompt L: custo R$ 0,60, margem 40%, taxa 5% → R$ 1,09
ok(perto(precoSugerido(0.6, 40, 5), 1.09), "preço sugerido 0,60/40%/5% = 1,09");
ok(precoSugerido(1, 60, 50) === null, "margem+taxa ≥ 100% inválido");
ok(precoSugerido(1, 100, 0) === null, "margem 100% inválida");

// Custo direto: insumos 0,40 + embalagem 0,10 + MO (30min×R$25/h÷100) + gás (210s×R$8/h÷100)
const cd = custoDireto({
  custoInsumos: 0.4,
  embalagem: 0.1,
  tempoMaoObraMin: 30,
  maoObraHora: 25,
  rendimento: 100,
  tempoFrituraS: 210,
  gasHora: 8,
});
ok(perto(cd, 0.4 + 0.1 + 0.125 + 0.00467), "custo direto soma 4 parcelas", String(cd));

// Rateio: fixos 6000 ÷ 10000 un = 0,60/un
ok(perto(rateioFixoPorUnidade(6000, 10000), 0.6), "rateio fixo");
ok(rateioFixoPorUnidade(6000, 0) === 0, "sem volume, sem rateio");

// Margem real do exemplo: preço 1,09, custo 0,60, taxa 5% → ~40%
ok(perto((margemReal(1.09, 0.6, 5) ?? 0) * 100, 40, 0.5), "margem real ~40%");
ok(margemReal(0, 1, 5) === null, "sem preço, sem margem");

// Selos
ok(seloMargem(-0.01) === "prejuizo", "selo prejuízo");
ok(seloMargem(0.1, 15) === "margem_baixa", "selo margem baixa <15%");
ok(seloMargem(0.4, 15) === "saudavel", "selo saudável");
ok(seloMargem(null) === "margem_baixa", "sem margem pede atenção");

// Kit: 50×0,60 + 50×0,55 + embalagem 2,00 = 59,50; avulsos 65 → desconto ~8,5%
ok(perto(custoKit(Array(50).fill(0.6).concat(Array(50).fill(0.55)), 2), 59.5), "custo do kit");
ok(perto(descontoEfetivoKit(59.5, 65) ?? 0, 1 - 59.5 / 65), "desconto efetivo do kit");
ok(descontoEfetivoKit(10, 0) === null, "sem base, sem desconto");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nprecificacao: todas as regras L passando.");
