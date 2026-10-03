export function brl(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function hora(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const STATUS_LABEL: Record<string, string> = {
  recebido: "Pedido Recebido",
  em_producao: "Em Produção",
  pronto: "Pronto para Entrega",
  aguardando_motoboy: "Aguardando Motoboy",
  em_rota: "Em Rota",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** Rótulo amigável p/ o dono (sem trocar o enum do banco). */
export const STATUS_EXIBICAO: Record<string, string> = {
  recebido: "Novo",
  em_producao: "Confirmado / Em produção",
  pronto: "Pronto",
  aguardando_motoboy: "Saiu para entrega (aguard. motoboy)",
  em_rota: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const STATUS_FLOW = [
  "recebido",
  "em_producao",
  "pronto",
  "aguardando_motoboy",
  "em_rota",
  "entregue",
] as const;

/** Retirada não passa por motoboy: some com as etapas de rota. */
export const STATUS_FLOW_RETIRADA = ["recebido", "em_producao", "pronto", "entregue"] as const;

export type TipoEntrega = "entrega" | "retirada";

export function statusFlow(tipoEntrega?: string | null): readonly string[] {
  return tipoEntrega === "retirada" ? STATUS_FLOW_RETIRADA : STATUS_FLOW;
}

/** Rótulo do status já considerando retirada (evita "Saiu para entrega" na retirada). */
export function statusLabel(status: string, tipoEntrega?: string | null): string {
  if (tipoEntrega === "retirada") {
    if (status === "pronto") return "Pronto para retirada";
    if (status === "entregue") return "Retirado na loja";
  }
  return STATUS_LABEL[status] ?? status;
}

/** Pagamento é outro conceito: nunca casar com o status do pedido. */
export const PAGAMENTO_STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  falhou: "Pagamento não aprovado",
  reembolsado: "Reembolsado",
};

export const PAGAMENTO_STATUS_FLOW = ["pendente", "pago"] as const;

export type OrderStatus =
  | "recebido"
  | "em_producao"
  | "pronto"
  | "aguardando_motoboy"
  | "em_rota"
  | "entregue"
  | "cancelado";

export type ProdStatus = "aguardando" | "produzindo" | "finalizado";

export const PAGAMENTO_LABEL: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  credito: "Cartão de Crédito",
  debito: "Cartão de Débito",
};

export const PROD_LABEL: Record<string, string> = {
  aguardando: "Aguardando Produção",
  produzindo: "Produzindo",
  finalizado: "Finalizado",
};

export const TAXA_ENTREGA = 6;

export function mensagemStatus(status: string, cliente: string, numero: number): string {
  const base: Record<string, string> = {
    recebido: `Olá ${cliente}, seu pedido nº ${numero} foi recebido com sucesso.`,
    em_producao: `Olá ${cliente}, seu pedido nº ${numero} está em produção.`,
    pronto: `Olá ${cliente}, seu pedido nº ${numero} foi finalizado e aguarda coleta.`,
    aguardando_motoboy: `Olá ${cliente}, seu pedido nº ${numero} está aguardando o motoboy.`,
    em_rota: `Olá ${cliente}, o motoboy já saiu para entrega do pedido nº ${numero}.`,
    entregue: `Olá ${cliente}, seu pedido nº ${numero} foi entregue. Obrigado pela preferência.`,
    cancelado: `Olá ${cliente}, seu pedido nº ${numero} foi cancelado.`,
  };
  return base[status] ?? "";
}

export function whatsappLink(telefone: string, texto: string): string {
  const digits = telefone.replace(/\D/g, "");
  const numero = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
