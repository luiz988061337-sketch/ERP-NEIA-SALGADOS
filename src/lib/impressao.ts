/**
 * Fila de impressão (§16-18,21-22): payload térmico + anti-duplicidade.
 * A impressão física acontece no AGENTE Windows (print-agent/), nunca no browser.
 * Papel 80mm: linhas curtas (<=42 col), tudo MAIÚSCULO, separadores fortes
 * e SOMENTE ASCII — acento derruba driver térmico.
 */

export type ImpressaoStatus = "pendente" | "enviando" | "impresso" | "erro" | "cancelado";

export const LARGURA_CUPOM = 42;

/** Tira acentos p/ ASCII de impressora térmica. */
export function semAcento(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function lin(s: string): string {
  return semAcento(s).toUpperCase().slice(0, LARGURA_CUPOM);
}

function centro(s: string): string {
  const t = lin(s);
  const esq = Math.max(0, Math.floor((LARGURA_CUPOM - t.length) / 2));
  return " ".repeat(esq) + t;
}

const BARRA = "=".repeat(LARGURA_CUPOM);
const TRACO = "-".repeat(LARGURA_CUPOM);

export function textoCupom(p: {
  numero: number; dataHora: string; cliente: string; telefone: string;
  itens: { qtd: number; nome: string }[]; totalUnidades: number;
  entregaRetirada: string; horario: string; endereco: string;
  pagamento: string; observacoes: string; status: string;
}): string {
  const L = [
    BARRA,
    centro("NEIA SALGADOS"),
    centro(`PEDIDO #${p.numero}`),
    BARRA,
    lin(`DATA: ${p.dataHora}`),
    lin(`CLIENTE: ${p.cliente}`),
    lin(`TEL: ${p.telefone}`),
    TRACO,
    centro("ITENS"),
    ...p.itens.map((i) => lin(`${i.qtd}x ${i.nome}`)),
    TRACO,
    centro(`*** TOTAL: ${p.totalUnidades} UN ***`),
    TRACO,
    lin(p.entregaRetirada),
    lin(`HORARIO: ${p.horario}`),
    lin(`END: ${p.endereco}`),
    lin(`PGTO: ${p.pagamento}`),
    lin(`OBS: ${p.observacoes || "-"}`),
    TRACO,
    centro(`STATUS: ${p.status}`),
    BARRA,
    centro("O SABOR QUE FAZ A DIFERENCA"),
    BARRA,
  ];
  return L.join("\n");
}

export function textoTeste(): string {
  return ["NEIA SALGADOS", "TESTE DE IMPRESSAO", "Tanca TP-550", new Date().toLocaleString("pt-BR"), "Impressao funcionando."].join("\n");
}

/** uuid do trabalho: pedido + evento + tentativa (reimpressão = novo uuid com ref). */
export function idTrabalho(pedidoId: string, evento: string): string {
  return `${pedidoId}:${evento}`;
}
