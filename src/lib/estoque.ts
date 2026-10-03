export type TipoMov = "entrada" | "saida" | "ajuste" | "perda" | "producao";

/** Aplica movimentação ao estoque. Nunca permite negativo. */
export function novoEstoque(
  atual: number,
  tipo: TipoMov,
  qtd: number,
): { ok: true; valor: number } | { ok: false; motivo: string } {
  const a = Math.max(0, Math.floor(Number(atual) || 0));
  const q = Math.floor(Number(qtd) || 0);
  if (q <= 0) return { ok: false, motivo: "Quantidade deve ser maior que zero." };
  let v = a;
  if (tipo === "entrada" || tipo === "producao" || tipo === "ajuste") v = a + q;
  else v = a - q; // saida | perda
  if (v < 0) return { ok: false, motivo: `Estoque insuficiente (atual ${a}).` };
  return { ok: true, valor: v };
}
