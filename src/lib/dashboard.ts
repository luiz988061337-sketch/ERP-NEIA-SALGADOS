/**
 * Dashboard (§45-48): atenção, preparar agora, acontecendo agora, gargalos.
 */

export type PedidoMini = {
  status: string; atrasado?: boolean; problema?: string | null;
  agendado_para?: string | null; created_at: string;
  itens?: { nome: string; quantidade: number }[];
};

export function oQuePrecisaAtencao(pedidos: PedidoMini[], estoqueCritico: string[]): string[] {
  const out: string[] = [];
  const atrasados = pedidos.filter((p) => p.atrasado).length;
  if (atrasados) out.push(`${atrasados} pedido(s) atrasado(s)`);
  const problemas = pedidos.filter((p) => p.problema).length;
  if (problemas) out.push(`${problemas} com problema operacional`);
  if (estoqueCritico.length) out.push(`Estoque crítico: ${estoqueCritico.join(", ")}`);
  const prontos = pedidos.filter((p) => p.status === "pronto").length;
  if (prontos) out.push(`${prontos} pedido(s) pronto(s) aguardando coleta`);
  return out;
}

/** Agrega sabores: Coxinha — 100, Kibe — 50… */
export function oQuePrepararAgora(pedidos: PedidoMini[]): { nome: string; qtd: number }[] {
  const mapa = new Map<string, number>();
  for (const p of pedidos) {
    if (["entregue", "cancelado"].includes(p.status)) continue;
    for (const i of p.itens ?? []) mapa.set(i.nome, (mapa.get(i.nome) ?? 0) + i.quantidade);
  }
  return [...mapa.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
}

export function acontecendoAgora(pedidos: PedidoMini[], motoboysEmRota: number, motoboyRetornando: number): string {
  const emAndamento = pedidos.filter((p) => !["entregue", "cancelado"].includes(p.status)).length;
  const atrasados = pedidos.filter((p) => p.atrasado).length;
  return `${emAndamento} pedidos em andamento. ${atrasados} atrasado(s). ${motoboysEmRota} motoboys em rota. ${motoboyRetornando} retornando.`;
}

/** Gargalo: maior tempo médio entre separação/fritura/montagem/entrega. */
export function gargalo(tempos: { separacao: number; fritura: number; montagem: number; entrega: number }): string {
  const e = Object.entries(tempos).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : "nenhum";
}
