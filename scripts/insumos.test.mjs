// Teste puro das regras K de insumos (sem banco).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { converterUnidade, custoMedioPonderado, consumoPorInsumo, sugestaoCompra } = await import(
  "@/lib/insumos.ts"
);
const { alertaEstoque } = await import("@/lib/lotes.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Conversão de unidades
ok(converterUnidade(1, "kg", "g") === 1000, "kg→g");
ok(converterUnidade(2500, "g", "kg") === 2.5, "g→kg");
ok(converterUnidade(2, "l", "ml") === 2000, "l→ml");
ok(converterUnidade(500, "ml", "l") === 0.5, "ml→l");
ok(converterUnidade(3, "un", "un") === 3, "un→un");
ok(converterUnidade(1, "kg", "l") === null, "massa×volume incompatível");
ok(converterUnidade(1, "g", "un") === null, "massa×un incompatível");

// Custo médio ponderado (exemplo do prompt K)
ok(perto(custoMedioPonderado(10, 5, 10, 7), 6), "custo médio 10kg@5 + 10kg@7 = 6");
ok(perto(custoMedioPonderado(0, 0, 5, 4), 4), "sem saldo assume custo da entrada");
ok(perto(custoMedioPonderado(10, 5, 0, 99), 5), "sem entrada mantém custo");

// Consumo da ficha (exemplo do prompt K: 100 coxinhas, 25g/un, perda 4% → 2600g)
const c = consumoPorInsumo(100, { quantidade: 25, unidade: "g" }, 4, false, "g");
ok(c !== null && perto(c, 2600), "consumo 100un × 25g + 4% = 2600g", String(c));
ok(
  consumoPorInsumo(100, { quantidade: 25, unidade: "g" }, 4, false, "kg") !== null &&
    perto(consumoPorInsumo(100, { quantidade: 25, unidade: "g" }, 4, false, "kg"), 2.6),
  "consumo em kg = 2,6",
);
// Ficha por cento: 2 centos, ficha 3 kg de farinha/cento → 6 kg
ok(
  perto(consumoPorInsumo(200, { quantidade: 3, unidade: "kg" }, 0, true, "kg"), 6),
  "ficha por cento",
);
ok(consumoPorInsumo(10, { quantidade: 1, unidade: "g" }, 0, false, "l") === null, "unidade inválida");

// Sugestão de compra: cmd 2 kg/dia, prazo 5, estoque 8 → 2×12−8 = 16
ok(perto(sugestaoCompra(2, 5, 8), 16), "sugestão de compra");
ok(sugestaoCompra(1, 2, 50) === 0, "sugestão nunca negativa");

// Status (reuso de lotes.ts)
ok(alertaEstoque(0, 10) === "zerado", "status zerado");
ok(alertaEstoque(4, 10) === "critico", "status crítico ≤50% mínimo");
ok(alertaEstoque(9, 10) === "baixo", "status baixo");
ok(alertaEstoque(50, 10) === "ok", "status ok");

const codigoInsumos = readFileSync("src/components/admin/estoque/insumos-admin.tsx", "utf8");
ok(codigoInsumos.split('.eq("estoque_atual", antes)').length - 1 >= 2, "perda e inventário usam estoque esperado");
ok(codigoInsumos.includes(".select(\"id\")"), "ajuste de insumo confirma linha atualizada");
const movimentosSemErro = codigoInsumos.replace(/const \{ error: e2 \} = await supabase\.from\("insumo_movimentacoes"\)\.insert\(\{/g, "");
ok(!/await supabase\.from\("insumo_movimentacoes"\)\.insert\(\{/.test(movimentosSemErro), "movimento de insumo sempre verifica erro");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\ninsumos: todas as regras K passando.");
