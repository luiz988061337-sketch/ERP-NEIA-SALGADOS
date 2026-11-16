import assert from "node:assert/strict";
import { calcularPublico } from "../src/components/comercial-preview/campanhas-regras.ts";
import { quantidadeValida, simularPromocao } from "../src/components/comercial-preview/sugestoes-regras.ts";

const base = { id: "a", nome: "Cliente demo", diasSemComprar: 18, vip: true, recorrente: true, reclamacao: false, optOut: false, diasDesdeContato: null, recompra: true };
const publico = calcularPublico([
  base,
  { ...base, id: "b", optOut: true },
  { ...base, id: "c", diasDesdeContato: 2 },
  { ...base, id: "d", recompra: false },
], "recompra", 7);
assert.deepEqual(publico.elegiveis.map((c) => c.id), ["a"]);
assert.match(publico.excluidos[0].motivos[0], /opt-out/i);
assert.match(publico.excluidos[1].motivos[0], /intervalo mínimo/i);

for (const qtd of [0, 49, 51, -50, 50.1, NaN, Infinity, 10050]) assert.equal(quantidadeValida(qtd), false);
for (const qtd of [50, 100, 150, 10000]) assert.equal(quantidadeValida(qtd), true);
const entrada = { elegiveis: 25, quantidade: 100, precoUnitario: 180, custoUnitario: 105, desconto: 1800 };
const resultado = simularPromocao(entrada);
assert.equal(resultado.pedidos, 2);
assert.equal(resultado.receita, 32400);
assert.equal(resultado.custoCampanha, 3600);
assert.equal(resultado.recomendada, true);
assert.equal(simularPromocao({ ...entrada, desconto: 4000 }).margem, 25);
assert.equal(simularPromocao({ ...entrada, desconto: 4000 }).recomendada, true);
assert.equal(simularPromocao({ ...entrada, desconto: 4001 }).recomendada, false);
assert.equal(simularPromocao({ ...entrada, custoUnitario: null }).margem, null);
assert.equal(simularPromocao({ ...entrada, custoUnitario: null }).recomendada, false);
assert.equal(simularPromocao({ ...entrada, elegiveis: 0 }).recomendada, false);
assert.equal(simularPromocao({ ...entrada, desconto: 18000 }).recomendada, false);
assert.equal(simularPromocao({ ...entrada, desconto: 18001 }), null);
assert.equal(simularPromocao({ ...entrada, quantidade: 75 }), null);
console.log("C3: recompra, exclusões, múltiplos, receita, custo e bloqueios de margem validados.");
