import assert from 'node:assert/strict';
import { calcularResumo, historicoDemonstrativo, percentual } from '../src/components/financeiro-premium/dados.ts';

const inicial = calcularResumo(58480, 28610, 14500);
assert.equal(inicial.resultado, 15370);
assert.equal(inicial.variais + inicial.fixos, 43110);
assert.ok(Math.abs(inicial.pe - 28388.3495145631) < .00001);
assert.equal(percentual(inicial.margemSeg * 100), '51,5%');
assert.equal(calcularResumo(100, 100, 50).pe, Infinity);
assert.equal(calcularResumo(100, 200, 50).resultado, -150);
assert.equal(calcularResumo(100, 20, 0).pe, 0);
assert.equal(calcularResumo(0, 0, 50).margemSeg, 0);
assert.equal(percentual(NaN), '—');
assert.equal(percentual(Infinity), '—');
assert.equal(calcularResumo(58480, 28610+100, 14500).resultado, inicial.resultado-100);
for (const mes of historicoDemonstrativo) {
  const r = calcularResumo(mes.receita, mes.variaveis, mes.fixos);
  assert.ok(Number.isFinite(r.pe));
  assert.equal(r.resultado, mes.receita-mes.variaveis-mes.fixos);
}
console.log('Financeiro Premium: totais, PE, zero, prejuízo, percentual pt-BR e série fictícia OK.');
