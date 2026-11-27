export type RecebimentoRetirada =
  | { status: "quitado" }
  | { status: "pendente"; forma: string; saldo_centavos: number; pago_centavos: number; pode_receber: boolean }
  | { status: "nao_autorizado" | "pedido_indisponivel" | "revisao_necessaria" };

export function centavosInformados(texto: string): number | null {
  const valor = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(valor)) return null;
  const [reais, centavos = ""] = valor.split(".");
  const total = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

export function confirmarValorRecebido(valor: number | null, entregue: number | null, saldo: number, dinheiro: boolean) {
  if (valor === null || valor > saldo || (dinheiro && (entregue === null || entregue < valor))) return null;
  return { valor, troco: dinheiro ? entregue! - valor : 0 };
}
