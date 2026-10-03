/** Lógica única de totais — usar em carrinho, checkout, WhatsApp e admin. */
export type TotalsInput = {
  subtotal: number;
  taxaEntrega?: number | null | undefined;
  desconto?: number | null | undefined;
};

export type Totals = {
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  total: number;
};

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number | null | undefined) ?? 0;
  return Number.isFinite(n) ? n : 0;
}

/** total = subtotal + taxa - desconto (taxa somada 1x, total nunca negativo). */
export function calcTotals(input: TotalsInput): Totals {
  const subtotal = Math.max(0, num(input.subtotal));
  const taxaEntrega = Math.max(0, num(input.taxaEntrega));
  const desconto = Math.min(Math.max(0, num(input.desconto)), subtotal);
  const total = Math.max(0, subtotal + taxaEntrega - desconto);
  return { subtotal, desconto, taxaEntrega, total };
}

export const PASSO_COMBO = 50;
export const MINIMO_COMBO = 50;

export function isMultiploCombo(qtd: number): boolean {
  return qtd >= MINIMO_COMBO && qtd % PASSO_COMBO === 0;
}

export function quantoFaltaCombo(qtd: number): number {
  if (qtd <= 0) return MINIMO_COMBO;
  const resto = qtd % PASSO_COMBO;
  return resto === 0 ? 0 : PASSO_COMBO - resto;
}

/** Detecta linha de combo (flag ou id legado `combo-...`). */
export function isComboItem(i: { id: string; combo?: boolean | null | undefined }): boolean {
  return i.combo === true || i.id.startsWith("combo-");
}
