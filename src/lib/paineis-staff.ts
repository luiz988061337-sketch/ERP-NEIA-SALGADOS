const abasAdmin = new Set([
  "dashboard", "pedidos", "produtos", "clientes", "motoboys",
  "cupons", "dono", "metas", "financeiro", "impressao", "comercial", "estoque-salgados", "insumos", "embalagens",
  "fichas", "fornecedores", "compras", "precificacao", "usuarios", "logs",
  "hero", "calculadora", "loja", "entregas", "avaliacoes", "neia-inteligencia",
]);

export function normalizarHash(hash: string) {
  return hash.replace(/^#/, "");
}

export function abaAdministrativa(hash: string) {
  const aba = normalizarHash(hash);
  if (aba === "central-atendente") return "pedidos";
  return abasAdmin.has(aba) ? aba : "dashboard";
}

export function ehAbaAdministrativa(aba: string) {
  return abasAdmin.has(aba);
}
