import fs from "node:fs";
const c = fs.readFileSync(process.env.TEMP + "\\adm.html", "utf8");
console.log("len", c.length);
for (const t of [
  "Painel de Gestão",
  "Vendas do Dia",
  "Produtos Mais Vendidos",
  'href="/pdv"',
  'href="/producao"',
  'href="/central-entregas"',
  'href="/equipe"',
  "Operação em detalhes",
  "Clientes Ativos",
  "data-sidebar=\"content\"",
]) {
  console.log((t + "                              ").slice(0, 30), "=>", c.includes(t));
}
console.log("--- rotas no menu ---");
console.log([...c.matchAll(/href="(\/[a-z0-9-]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).join(", "));
