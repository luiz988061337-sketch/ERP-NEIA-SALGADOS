import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { calcTotals, taxaEntregaDoPedido } = await import("@/lib/totals.ts");

const casos = [
  ["usa taxa por km válida acima da fixa", { retirada: false, previaKmValida: true, taxaPrevista: 18, fallback: 6 }, 18],
  ["preserva entrega grátis válida", { retirada: false, previaKmValida: true, taxaPrevista: 0, fallback: 6 }, 0],
  ["usa taxa fixa quando não há prévia válida", { retirada: false, previaKmValida: false, taxaPrevista: 18, fallback: 6 }, 6],
  ["usa fallback para prévia inválida", { retirada: false, previaKmValida: true, taxaPrevista: Number.NaN, fallback: 6 }, 6],
  ["não aceita taxa negativa", { retirada: false, previaKmValida: true, taxaPrevista: -1, fallback: 6 }, 6],
  ["retirada não cobra entrega", { retirada: true, previaKmValida: true, taxaPrevista: 18, fallback: 6 }, 0],
];

let falhas = 0;
for (const [nome, entrada, esperado] of casos) {
  const taxa = taxaEntregaDoPedido(entrada);
  const ok = taxa === esperado;
  console.log(`${ok ? "OK" : "FALHOU"} ${nome}`);
  if (!ok) falhas += 1;
}
const total = calcTotals({ subtotal: 40, taxaEntrega: taxaEntregaDoPedido(casos[0][1]) });
const totalOk = total.total === 58 && total.taxaEntrega === 18;
console.log(`${totalOk ? "OK" : "FALHOU"} total do pedido corresponde à taxa por km exibida`);
if (!totalOk) falhas += 1;
if (falhas) process.exitCode = 1;
