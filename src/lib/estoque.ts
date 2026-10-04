export type TipoMov =
  | "entrada"
  | "saida"
  | "ajuste"
  | "perda"
  | "producao"
  | "reserva"
  | "liberacao_reserva"
  | "cancelamento"
  | "vencimento"
  | "devolucao"
  | "degustacao";

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
  if (tipo === "entrada" || tipo === "producao" || tipo === "ajuste" || tipo === "devolucao") v = a + q;
  else if (tipo === "reserva" || tipo === "saida" || tipo === "perda" || tipo === "vencimento" || tipo === "degustacao") v = a - q;
  else v = a; // liberacao_reserva | cancelamento: devolve via fluxo de reserva, sem mexer aqui
  if (v < 0) return { ok: false, motivo: `Estoque insuficiente (atual ${a}).` };
  return { ok: true, valor: v };
}
