/**
 * Entrega / motoboy (§23-27): estados, rotas, atrasos, condomínio.
 */

export const MOTOBOY_STATUS = [
  "disponivel_base",
  "preparando_saida",
  "em_rota",
  "retornando_base",
  "aguardando_nova_rota",
  "offline",
] as const;

export const MOTIVO_ATRASO = [
  "transito",
  "chuva",
  "veiculo",
  "endereco",
  "cliente_ausente",
  "espera",
  "acidente_bloqueio",
  "outro",
] as const;

/** Rótulos PT-BR (espelham o enum atraso_motivo da migration 0044). */
export const MOTIVO_ATRASO_LABEL: Record<string, string> = {
  transito: "Trânsito",
  chuva: "Chuva",
  veiculo: "Problema no veículo",
  endereco: "Endereço difícil",
  cliente_ausente: "Cliente ausente",
  espera: "Espera",
  acidente_bloqueio: "Acidente / bloqueio",
  outro: "Outro (descrever)",
};

export function mensagemPortaria(podeSubir: boolean): string {
  if (podeSubir) return "";
  return "🛵 Seu pedido já saiu para entrega! Se possível, pedimos que aguarde o motoboy na portaria no momento da chegada. 😊 Isso ajuda a agilizar sua entrega e também as próximas entregas da nossa rota. Obrigado pela compreensão! ❤️";
}

export type RotaPedido = { pedidoId: string; ordem: number; endereco: string; cliente: string };

export function ordenarRota(pedidos: RotaPedido[], novaOrdem: string[]): RotaPedido[] {
  const pos = new Map(novaOrdem.map((id, i) => [id, i]));
  return [...pedidos].sort((a, b) => (pos.get(a.pedidoId) ?? 999) - (pos.get(b.pedidoId) ?? 999)).map((p, i) => ({ ...p, ordem: i + 1 }));
}
