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
  const limiteInteiro = 2_147_483_647;
  if (!Number.isSafeInteger(atual) || atual < 0 || atual > limiteInteiro) {
    return { ok: false, motivo: "Saldo atual inválido. Atualize os dados antes de movimentar." };
  }
  if (!Number.isSafeInteger(qtd) || qtd <= 0 || qtd > limiteInteiro) {
    return { ok: false, motivo: "Quantidade deve ser um número inteiro positivo." };
  }
  const a = atual;
  const q = qtd;
  let v = a;
  if (tipo === "entrada" || tipo === "producao" || tipo === "ajuste" || tipo === "devolucao")
    v = a + q;
  else if (
    tipo === "reserva" ||
    tipo === "saida" ||
    tipo === "perda" ||
    tipo === "vencimento" ||
    tipo === "degustacao"
  )
    v = a - q;
  else v = a; // liberacao_reserva | cancelamento: devolve via fluxo de reserva, sem mexer aqui
  if (v < 0) return { ok: false, motivo: `Estoque insuficiente (atual ${a}).` };
  if (v > limiteInteiro)
    return { ok: false, motivo: "Movimentação excede o limite de estoque permitido." };
  return { ok: true, valor: v };
}
