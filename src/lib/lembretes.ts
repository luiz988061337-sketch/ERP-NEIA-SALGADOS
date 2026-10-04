/**
 * Lembretes 7d/3d/24h/dia (§8): calcula devidos no cliente (fallback sem cron).
 * O cron/Edge cria as linhas; aqui só mostramos WhatsApp pronto. Nunca auto-cancela.
 */
import { TPL, renderTemplate } from "./whatsapp";

export type PedidoAgendado = {
  id: string; numero: number; cliente_nome: string; telefone: string;
  agendado_para: string; status: string;
  lembretes?: { tipo: string; status: string }[];
};

export function tiposDevidos(agendadoPara: string, agora = Date.now()): ("7d" | "3d" | "24h" | "dia")[] {
  const d = (+new Date(agendadoPara) - agora) / 86400000;
  if (d <= 7.5 && d > 6.5) return ["7d"];
  if (d <= 3.5 && d > 2.5) return ["3d"];
  if (d <= 1.5 && d > 0.5) return ["24h"];
  if (d <= 0.5 && d > -0.2) return ["dia"];
  return [];
}

export function mensagemLembrete(tipo: string, p: { numero: number; cliente: string; agendamento: string }): string {
  const tpl = tipo === "7d" ? TPL.lembrete7d : tipo === "3d" ? TPL.lembrete3d : tipo === "24h" ? TPL.lembrete24h : TPL.dia;
  return renderTemplate(tpl, { pedido: p.numero, cliente: p.cliente, agendamento: p.agendamento });
}

/** Filtra agendados sem lembrete daquele tipo ainda enviado. */
export function lembretesPendentes(pedidos: PedidoAgendado[], agora = Date.now()): { pedido: PedidoAgendado; tipo: string }[] {
  const out: { pedido: PedidoAgendado; tipo: string }[] = [];
  for (const p of pedidos) {
    if (!p.agendado_para || ["cancelado", "entregue"].includes(p.status)) continue;
    for (const t of tiposDevidos(p.agendado_para, agora)) {
      const ja = (p.lembretes ?? []).some((l) => l.tipo === t && l.status !== "cancelado");
      if (!ja) out.push({ pedido: p, tipo: t });
    }
  }
  return out;
}
