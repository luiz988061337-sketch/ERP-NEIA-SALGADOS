/**
 * Bebidas (§28): recomendação única, sem spam. Mostra 1x por sessão se carrinho
 * tem salgado e zero bebida. Registra eventos visualização/adicionar/dispensar.
 */
const KEY = "neia-bebida-upsell";

export function deveSugerirBebida(itens: { categoria?: string; nome: string }[]): boolean {
  const temSalgado = itens.some((i) => !/bebida|refrigerante|suco/i.test(i.categoria ?? "") && !/bebida|refrigerante|coca|guaran/i.test(i.nome));
  const temBebida = itens.some((i) => /bebida|refrigerante|suco/i.test(i.categoria ?? "") || /bebida|refrigerante|coca|guaran|suco/i.test(i.nome));
  if (!temSalgado || temBebida) return false;
  try {
    if (sessionStorage.getItem(KEY)) return false;
  } catch { /* ssr */ }
  return true;
}

export function dispensarSugestao(): void {
  try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}
