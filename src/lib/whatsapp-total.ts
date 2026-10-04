/** Garante taxa somada 1x: 40 + 6 = 46, nunca 52. */
export function calcTotalsSafe(subtotal: number, taxa: number, desconto = 0): number {
  return Math.max(0, subtotal - Math.min(desconto, subtotal)) + Math.max(0, taxa);
}
export function brl(v: number): string {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
