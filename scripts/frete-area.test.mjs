import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { normalizarResultadoTaxa, previsaoTaxaUtilizavel } = await import("@/lib/config-entrega.ts");

const valida = normalizarResultadoTaxa({
  modo: "config",
  taxa: 0,
  distancia_km: 4.5,
  valor_por_km: 2,
  fonte: "rota",
  entrega_gratis: true,
  fora_da_area: false,
  aceitar_entregas: true,
});
assert.equal(valida.taxa, 0);
assert.equal(previsaoTaxaUtilizavel(valida), true, "taxa zero explícita permanece válida");

for (const taxa of [undefined, null, "", Number.NaN, Number.POSITIVE_INFINITY, -1]) {
  const resultado = normalizarResultadoTaxa({ modo: "config", taxa, fora_da_area: false });
  assert.equal(previsaoTaxaUtilizavel(resultado), false, `taxa inválida bloqueada: ${String(taxa)}`);
}

const fora = normalizarResultadoTaxa({ modo: "config", taxa: 6, fora_da_area: true });
assert.equal(fora.foraDaArea, true);
assert.equal(previsaoTaxaUtilizavel(fora), false, "fora da área permanece bloqueado");
const erro = normalizarResultadoTaxa({ modo: "config", erro: "temporário", fora_da_area: false });
assert.equal(erro.taxa < 0 && !previsaoTaxaUtilizavel(erro), true, "falha não vira frete grátis");
const legado = normalizarResultadoTaxa({ modo: "legado", taxa: 6 });
assert.equal(previsaoTaxaUtilizavel(legado), false, "modo legado não finge validação por quilômetro");

const { readFileSync } = await import("node:fs");
const configSource = readFileSync("src/lib/config-entrega.ts", "utf8");
const checkoutSource = readFileSync("src/routes/checkout.tsx", "utf8");
const atendenteSource = readFileSync("src/routes/atendente.tsx", "utf8");
assert.match(configSource, /if \(error\) throw error/);
assert.match(checkoutSource, /erroConfigEntrega \|\| carregandoConfigEntrega/);
assert.match(atendenteSource, /erroConfigEntrega \|\| carregandoConfigEntrega/);

console.log("F5: testes de validação da taxa e da área passaram.");
