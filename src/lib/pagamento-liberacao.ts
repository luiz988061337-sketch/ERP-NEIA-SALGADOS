/**
 * E7 — Compatibilidade de pagamentos (somente leitura de regras + pré-checks).
 *
 * Regra comercial vigente (atendente.tsx:205-210 + J.1/0073):
 * retirada→online; dinheiro→na_entrega; pix/crédito/débito→online.
 * Online exige pago; na_entrega pode permanecer pendente.
 * Este módulo nunca confirma pagamento nem altera checkout.
 */

export type DecisaoPagamento = "liberar" | "analise" | "bloquear";

export type SituacaoPagamento = {
  forma_pagamento: string;
  pagamento_modalidade: string;
  pagamento_status: string;
  cancelado: boolean;
};

/** Matriz de liberação operacional (pré-check; o banco não decide pagamento). */
export function decisaoPagamento(p: SituacaoPagamento): DecisaoPagamento {
  if (p.cancelado) return "bloquear";
  if (p.pagamento_status === "pago") return "liberar";
  if (p.pagamento_status === "falhou" || p.pagamento_status === "reembolsado") return "analise";
  if (p.pagamento_status === "pendente") {
    if (p.pagamento_modalidade === "na_entrega") return "liberar";
    return "analise";
  }
  return "analise";
}

/** Cupom de agendado deve ser adiado (espelha o trigger E7 §12). */
export function deveAdiarCupom(agendadoParaIso: string | null, agoraMs: number): boolean {
  if (!agendadoParaIso) return false;
  return new Date(agendadoParaIso).getTime() > agoraMs;
}
