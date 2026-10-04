/**
 * Fritura + sons da cozinha (§13-14).
 * Tempo base: 50un = 210s (3:30). Configurável por produto.
 */

export function tempoFritura(qtd: number, segundosPor50 = 210): number {
  const blocos = Math.max(1, Math.ceil(Math.max(0, qtd) / 50));
  return blocos * segundosPor50;
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
