/**
 * WhatsApp (§49) + lembretes (§8): templates com variáveis reais.
 * Variáveis permitidas: numero,total,total_com_taxa,cliente,pagamento,agendamento,
 * taxa_entrega,taxa_motoboy,endereco,entrega,pedido. Total 40+6=46 (taxa 1x).
 */
import { brl, calcTotalsSafe } from "./whatsapp-total";

export const VARIAVEIS_PERMITIDAS = [
  "numero", "total", "total_com_taxa", "cliente", "pagamento", "agendamento",
  "taxa_entrega", "taxa_motoboy", "endereco", "entrega", "pedido",
] as const;

export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

export const TPL = {
  novo: "🆕 Novo pedido {{pedido}} — {{cliente}} — {{total_com_taxa}} ({{pagamento}})",
  confirmacao: "✅ Pedido {{pedido}} confirmado, {{cliente}}! Total {{total_com_taxa}}.",
  agendamento: "📅 Pedido {{pedido}} agendado para {{agendamento}}.",
  preparacao: "👨‍🍳 Pedido {{pedido}} entrou em preparação, {{cliente}}!",
  pronto: "🔔 Pedido {{pedido}} está pronto! {{entrega}}",
  saida: "🛵 Pedido {{pedido}} saiu para entrega! {{endereco}}",
  entrega: "📦 Pedido {{pedido}} entregue. Obrigado, {{cliente}}!",
  atraso: "⏰ Pedido {{pedido}} atrasou um pouco. Já estamos cuidando.",
  cancelamento: "❌ Pedido {{pedido}} cancelado.",
  avaliacao: "⭐ Como foi seu pedido {{pedido}}, {{cliente}}? Avalie aqui!",
  lembrete7d: "⏳ Faltam 7 dias para seu pedido {{pedido}} ({{agendamento}}).",
  lembrete3d: "⏳ Faltam 3 dias para seu pedido {{pedido}} ({{agendamento}}).",
  lembrete24h: "⏰ Amanhã é seu pedido {{pedido}} ({{agendamento}}). Confirma?",
  dia: "👨‍🍳 Hoje preparamos seu pedido {{pedido}}!",
};

export { brl as brlWhatsapp, calcTotalsSafe };
