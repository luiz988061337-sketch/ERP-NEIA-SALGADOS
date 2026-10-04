/**
 * CRM/Fidelidade/Financeiro (§29-39): origem, jornada, abandono, indicação, margem, simulador.
 */

export const ORIGENS = [
  "instagram", "google", "whatsapp", "indicacao_amigo", "indicacao_parceiro",
  "anuncio", "ja_conhecia", "pessoalmente", "outro",
] as const;

export const JORNADA = [
  "visitou", "visualizou", "favoritou", "adicionou_carrinho", "iniciou_checkout",
  "comprou", "recebeu", "avaliou", "voltou",
] as const;

export function diasInativo(ultimaCompra: string | null, ref = new Date()): number | null {
  if (!ultimaCompra) return null;
  return Math.floor((ref.getTime() - +new Date(ultimaCompra)) / 86400000);
}

/** Indicação: +100 indicador, +50 novo — só após pedido válido não cancelado, sem autoindicação. */
export function pontosIndicacao(novoPedidoValido: boolean, autoindicacao: boolean): { indicador: number; novo: number } {
  if (!novoPedidoValido || autoindicacao) return { indicador: 0, novo: 0 };
  return { indicador: 100, novo: 50 };
}

export type CustoPedido = {
  precoVenda: number; custoProduto: number; embalagem: number; taxas: number;
  impostos: number; desconto: number; pontosValor: number;
};

export function margem(p: CustoPedido): { bruto: number; liquido: number; margemPct: number; lucro: number } {
  const bruto = p.precoVenda;
  const custos = p.custoProduto + p.embalagem + p.taxas + p.impostos + p.desconto + p.pontosValor;
  const liquido = bruto - custos;
  const margemPct = bruto > 0 ? (liquido / bruto) * 100 : 0;
  return { bruto, liquido, margemPct, lucro: liquido };
}

export function simularCampanhas(base: CustoPedido, descontos: number[]): { desconto: number; liquido: number; margemPct: number }[] {
  return descontos.map((d) => {
    const m = margem({ ...base, desconto: d });
    return { desconto: d, liquido: m.liquido, margemPct: m.margemPct };
  });
}
