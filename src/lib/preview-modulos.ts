// Allowlist exata das rotas Preview de Estoques e Comercial.
// Não altera autenticação, permissões, RLS ou rotas operacionais.
import { ROTAS_PREVIEW_ESTOQUES } from "./preview-estoques";

export const ROTAS_PREVIEW_COMERCIAL = [
  "/preview/comercial/painel",
  "/preview/comercial/clientes",
] as const;

export const ROTAS_PREVIEW_MODULOS = [
  ...ROTAS_PREVIEW_ESTOQUES,
  ...ROTAS_PREVIEW_COMERCIAL,
] as const;

export function ehPreviewEstoque(pathname: string) {
  return ROTAS_PREVIEW_ESTOQUES.some((rota) => pathname === rota || pathname === `${rota}/`);
}

export function ehPreviewComercial(pathname: string) {
  return ROTAS_PREVIEW_COMERCIAL.some((rota) => pathname === rota || pathname === `${rota}/`);
}

/** Qualquer rota de demonstração com shell administrativo próprio. */
export function ehPreviewModulo(pathname: string) {
  return ehPreviewEstoque(pathname) || ehPreviewComercial(pathname);
}
