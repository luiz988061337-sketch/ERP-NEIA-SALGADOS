import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { novoEstoque } = await import("@/lib/estoque.ts");

assert.deepEqual(novoEstoque(80, "entrada", 20), { ok: true, valor: 100 });
assert.deepEqual(novoEstoque(80, "saida", 30), { ok: true, valor: 50 });
assert.deepEqual(novoEstoque(0, "perda", 1), {
  ok: false,
  motivo: "Estoque insuficiente (atual 0).",
});
assert.deepEqual(novoEstoque(10, "perda", 10), { ok: true, valor: 0 });

for (const quantidade of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
  assert.equal(novoEstoque(10, "entrada", quantidade).ok, false, `qtd inválida: ${quantidade}`);
}
for (const saldo of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
  assert.equal(novoEstoque(saldo, "saida", 1).ok, false, `saldo inválido: ${saldo}`);
}
assert.equal(
  novoEstoque(2_147_483_640, "entrada", 10).ok,
  false,
  "não ultrapassa o integer do PostgreSQL",
);

console.log("estoque-movimento: inteiros, limites e estoque não negativo OK.");
