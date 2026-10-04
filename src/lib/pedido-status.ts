/**
 * Fluxo completo do pedido (prompt mestre §5).
 * O enum do banco (`order_status`) continua com 7 valores para não quebrar RLS;
 * as etapas finas (separação/preparo/montagem/agendado) vivem em `producao_status`
 * + flags `atrasado`/`problema`. Aqui centralizamos transição + timeline.
 */

export const FLUXO_COMPLETO = [
  "novo",
  "aguardando_pagamento",
  "confirmado",
  "agendado",
  "aguardando_preparacao",
  "em_separacao",
  "em_preparacao",
  "em_montagem",
  "pronto",
  "aguardando_retirada",
  "aguardando_entrega",
  "saiu_para_entrega",
  "entregue",
  "retirado",
] as const;

export const STATUS_MAP_DB: Record<string, string> = {
  novo: "recebido",
  aguardando_pagamento: "recebido",
  confirmado: "em_producao",
  agendado: "recebido",
  aguardando_preparacao: "em_producao",
  em_separacao: "em_producao",
  em_preparacao: "em_producao",
  em_montagem: "em_producao",
  pronto: "pronto",
  aguardando_retirada: "pronto",
  aguardando_entrega: "aguardando_motoboy",
  saiu_para_entrega: "em_rota",
  entregue: "entregue",
  retirado: "entregue",
  cancelado: "cancelado",
};

const ORDEM = [...FLUXO_COMPLETO, "cancelado"];

/** Bloqueia transições impossíveis (ex: entregue → em_preparacao). */
export function podeTransitar(de: string, para: string): boolean {
  if (de === para) return false;
  if (de === "cancelado" || de === "entregue" || de === "retirado") return false;
  if (para === "cancelado") return !["entregue", "retirado"].includes(de);
  const i = ORDEM.indexOf(de as never);
  const j = ORDEM.indexOf(para as never);
  if (i < 0 || j < 0) return false;
  // Permite avançar e voltar 1 etapa (correção operacional), nunca pular para trás longe.
  return j === i + 1 || j === i - 1 || j > i;
}

export type Transicao = {
  de: string;
  para: string;
  por: string;
  em: string;
  motivo?: string;
  override?: boolean;
};

export function registrarTransicao(
  historico: Transicao[],
  t: Omit<Transicao, "em"> & { em?: string },
): Transicao[] {
  return [...historico, { em: new Date().toISOString(), ...t } as Transicao];
}
