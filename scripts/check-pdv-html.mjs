import fs from "node:fs";
const c = fs.readFileSync(process.env.TEMP + "\\pv-pdv.html", "utf8");
console.log("len", c.length);
for (const t of [
  "PDV — ATENDIMENTO E CAIXA",
  "Finalizar Pedido",
  "Finalizar Venda",
  "Comanda Atual",
  "Registro de pedidos",
  "Buscar produto por nome",
  "SidebarProvider",
  "NÉIA SALGADOS",
  "Neia Salgados",
]) {
  console.log((t + "                              ").slice(0, 32), "=>", c.includes(t));
}
