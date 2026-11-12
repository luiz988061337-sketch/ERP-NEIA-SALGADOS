import fs from "node:fs";
for (const f of [
  "docs/preview-captures/mirror/__html___preview-l2-gestao.html",
  "docs/preview-captures/mirror/__html___preview-l2-pdv.html",
]) {
  if (!fs.existsSync(f)) {
    console.log(f, "-> NAO EXISTE");
    continue;
  }
  const c = fs.readFileSync(f, "utf8");
  console.log(f.split("/").pop(), "len", c.length);
  for (const t of [
    "Painel de Gestão",
    "Vendas do Dia",
    "Finalizar Pedido",
    "PDV — ATENDIMENTO E CAIXA",
    "Operação em detalhes",
    "Produtos Mais Vendidos",
  ]) {
    console.log("   ", (t + "                              ").slice(0, 30), "=>", c.includes(t));
  }
}
