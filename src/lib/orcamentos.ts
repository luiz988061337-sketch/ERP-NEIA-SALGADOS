import { brl } from "@/lib/format";
import { calcTotals } from "@/lib/totals";

export type OrcamentoMixItem = {
  produto_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
};

export type OrcamentoDoc = {
  id?: string;
  cliente_nome: string;
  telefone: string;
  tipo_evento: string;
  pessoas: number;
  data_evento: string | null;
  horario: string;
  validade: string | null;
  mix: OrcamentoMixItem[];
  observacoes: string;
  subtotal: number;
  desconto: number;
  taxa_entrega: number;
  total: number;
  status: string;
  created_at?: string;
};

export function totaisOrcamento(mix: OrcamentoMixItem[], taxaEntrega: number, desconto: number) {
  const subtotal = mix.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0);
  return calcTotals({ subtotal, taxaEntrega, desconto });
}

/** Texto do WhatsApp com valores reais do orçamento. */
export function textoOrcamento(o: OrcamentoDoc): string {
  const linhas = o.mix.map((i) => `* ${i.quantidade}x ${i.nome} — ${brl(i.preco_unitario * i.quantidade)}`).join("\n");
  const ev = [o.tipo_evento || "Evento", o.data_evento ? new Date(`${o.data_evento}T12:00:00`).toLocaleDateString("pt-BR") : "", o.horario].filter(Boolean).join(" • ");
  return `🧾 *ORÇAMENTO Néia Salgados*\n\nCliente: ${o.cliente_nome}\nTelefone: ${o.telefone}\nEvento: ${ev}${o.pessoas ? `\nPessoas: ${o.pessoas}` : ""}\n\nItens:\n${linhas}\n\nSubtotal: ${brl(o.subtotal)}\nDesconto: ${brl(o.desconto)}\nEntrega: ${brl(o.taxa_entrega)}\n*Total: ${brl(o.total)}*\n\n${o.observacoes ? `Obs.: ${o.observacoes}\n` : ""}${o.validade ? `Válido até ${new Date(`${o.validade}T12:00:00`).toLocaleDateString("pt-BR")}\n` : ""}_Orçamento, não é pedido confirmado._`;
}

const h = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML imprimível do orçamento (nova janela → PDF do navegador). */
export function htmlOrcamento(o: OrcamentoDoc): string {
  const linhas = o.mix.map((i) => `<tr><td>${h(i.nome)}</td><td style="text-align:center">${h(i.quantidade)}</td><td style="text-align:right">${brl(i.preco_unitario)}</td><td style="text-align:right">${brl(i.preco_unitario * i.quantidade)}</td></tr>`).join("");
  const ev = [o.tipo_evento || "Evento", o.data_evento ? new Date(`${o.data_evento}T12:00:00`).toLocaleDateString("pt-BR") : "", o.horario].filter(Boolean).map(h).join(" • ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento Néia Salgados</title><style>body{font-family:Arial,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#222}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ddd;padding:6px 8px;font-size:14px}.tot p{display:flex;justify-content:space-between;margin:2px 0}.tot .t{font-size:18px;font-weight:bold}</style></head><body><h1>NÉIA SALGADOS</h1><p>Orçamento${o.id ? ` #${h(o.id.slice(0, 8))}` : ""} • ${h(o.status)}</p><p><strong>Cliente:</strong> ${h(o.cliente_nome)} • ${h(o.telefone)}</p><p><strong>Evento:</strong> ${ev}${o.pessoas ? ` • ${h(o.pessoas)} pessoas` : ""}</p><table><thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table><div class="tot"><p><span>Subtotal</span><span>${brl(o.subtotal)}</span></p><p><span>Desconto</span><span>${brl(o.desconto)}</span></p><p><span>Entrega</span><span>${brl(o.taxa_entrega)}</span></p><p class="t"><span>Total</span><span>${brl(o.total)}</span></p></div>${o.observacoes ? `<p><strong>Observações:</strong> ${h(o.observacoes)}</p>` : ""}${o.validade ? `<p><strong>Validade:</strong> ${new Date(`${o.validade}T12:00:00`).toLocaleDateString("pt-BR")}</p>` : ""}<p><em>Orçamento — não é pedido confirmado.</em></p><script>window.onload=()=>window.print()</script></body></html>`;
}
