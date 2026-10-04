/**
 * Fila de impressão (§16-18,21-22): payload térmico + anti-duplicidade.
 * A impressão física acontece no AGENTE Windows (print-agent/), nunca no browser.
 */

export type ImpressaoStatus = "pendente" | "enviando" | "impresso" | "erro" | "cancelado";

export function textoCupom(p: {
  numero: number; dataHora: string; cliente: string; telefone: string;
  itens: { qtd: number; nome: string }[]; totalUnidades: number;
  entregaRetirada: string; horario: string; endereco: string;
  pagamento: string; observacoes: string; status: string;
}): string {
  const L = [
    "NEIA SALGADOS", "",
    `PEDIDO #${p.numero}`, p.dataHora, "",
    `CLIENTE: ${p.cliente}`, `TELEFONE: ${p.telefone}`, "",
    "--- ITENS ---",
    ...p.itens.map((i) => `${i.qtd}x ${i.nome}`),
    "", `TOTAL DE UNIDADES: ${p.totalUnidades}`, "",
    `${p.entregaRetirada}`, `HORARIO: ${p.horario}`, `ENDERECO: ${p.endereco}`,
    `PAGAMENTO: ${p.pagamento}`, `OBS: ${p.observacoes || "-"}`, "",
    `STATUS: ${p.status}`, "",
    "NEIA SALGADOS", "O sabor que faz a diferenca.",
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
