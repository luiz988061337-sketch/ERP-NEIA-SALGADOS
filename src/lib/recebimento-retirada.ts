/** Formas aceitas no recebimento efetivo (a preferência original não é obrigatória). */
export const FORMAS_EFETIVAS = ["dinheiro", "pix", "credito", "debito"] as const;
export type FormaEfetiva = (typeof FORMAS_EFETIVAS)[number];

export function ehFormaEfetiva(valor: string | null | undefined): valor is FormaEfetiva {
  return FORMAS_EFETIVAS.includes((valor ?? "") as FormaEfetiva);
}

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

/** Regra antiga, preservada: parcial e troco em dinheiro. */
export function confirmarValorRecebido(valor: number | null, entregue: number | null, saldo: number, dinheiro: boolean) {
  if (valor === null || valor > saldo || (dinheiro && (entregue === null || entregue < valor))) return null;
  return { valor, troco: dinheiro ? entregue! - valor : 0 };
}

/**
 * Regra da Fase 1: forma efetiva escolhida no ato do recebimento.
 * Pix/cartão exigem confirmação explícita — selecionar a modalidade não basta.
 * O excedente entregue em dinheiro vira troco, nunca receita.
 */
export function validarRecebimentoBalcao(args: {
  valor: number | null;
  entregue: number | null;
  saldo: number;
  forma: string | null | undefined;
  confirmado: boolean;
}): {
  valor: number;
  troco: number;
  forma: FormaEfetiva;
  valorEntregue: number | null;
  confirmado: boolean;
} | null {
  if (!ehFormaEfetiva(args.forma)) return null;
  const dinheiro = args.forma === "dinheiro";
  if (!dinheiro && !args.confirmado) return null;
  const apurado = confirmarValorRecebido(args.valor, args.entregue, args.saldo, dinheiro);
  if (!apurado) return null;
  return {
    valor: apurado.valor,
    troco: apurado.troco,
    forma: args.forma,
    valorEntregue: dinheiro ? args.entregue : null,
    confirmado: true,
  };
}
