// Allowlist exata: não altera autenticação, permissões ou rotas operacionais.
export const ROTAS_PREVIEW_ESTOQUES = [
  "/preview/cadastro-produtos",
  "/preview/combos",
  "/preview/estoque-salgados",
  "/preview/estoque-insumos",
  "/preview/estoque-embalagens",
] as const;
export function ehPreviewEstoque(pathname: string) {
  return ROTAS_PREVIEW_ESTOQUES.some((rota) => pathname === rota || pathname === `${rota}/`);
}
