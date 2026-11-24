const abasAdmin = new Set([
  "dashboard", "pedidos", "central-atendente", "produtos", "clientes", "motoboys",
  "cupons", "dono", "metas", "financeiro", "impressao", "comercial", "insumos", "embalagens",
  "fichas", "fornecedores", "compras", "precificacao", "usuarios", "logs",
  "hero", "calculadora", "loja", "entregas", "avaliacoes",
]);

export function normalizarHash(hash: string) {
  return hash.replace(/^#/, "");
}

export function abaAdministrativa(hash: string) {
  const aba = normalizarHash(hash);
  return abasAdmin.has(aba) ? aba : "dashboard";
}

export function ehAbaAdministrativa(aba: string) {
  return abasAdmin.has(aba);
}
