/**
 * Fritura + sons da cozinha (§13-14).
 * Tempo base: 50un = 210s (3:30). Configurável por produto.
 */

export const SEGUNDOS_POR_50_PADRAO = 210;

export function tempoFritura(qtd: number, segundosPor50 = SEGUNDOS_POR_50_PADRAO): number {
  const blocos = Math.max(1, Math.ceil(Math.max(0, qtd) / 50));
  return blocos * segundosPor50;
}

/**
 * Pedido misto: cada sabor frita no seu tempo; a fritadeira trabalha em
 * paralelo, então o pedido fica pronto quando o LOTE MAIS LONGO termina.
 * seg50 nulo/inválido = padrão 210s.
 */
export function tempoFrituraPedido(itens: { quantidade: number; seg50?: number | null }[]): number {
  let max = 0;
  for (const i of itens) {
    const seg = Number(i.seg50) > 0 ? Number(i.seg50) : SEGUNDOS_POR_50_PADRAO;
    max = Math.max(max, tempoFritura(Number(i.quantidade ?? 0), seg));
  }
  return max;
}

export function formatarTempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const SONS_COZINHA = [
  "novo_pedido",
  "pedido_urgente",
  "pedido_proximo",
  "pedido_atrasado",
  "inicio_preparacao",
  "necessidade_fritura",
  "pedido_pronto",
  "estoque_critico",
  "problema_operacional",
  "motoboy_retornando",
] as const;

export type AlertaSonoro = { id: string; tipo: (typeof SONS_COZINHA)[number]; em: string };

/** Nunca repete evento já tocado (id único), mesmo após reload. */
export function filtrarNovos(recebidos: AlertaSonoro[], jaTocados: Set<string>): AlertaSonoro[] {
  return recebidos.filter((a) => !jaTocados.has(a.id));
}
