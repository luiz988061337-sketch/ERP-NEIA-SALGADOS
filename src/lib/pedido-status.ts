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

/**
 * Mapa de status (E1, prompt mestre §3 — somente leitura, sem ativar fluxos).
 * Etapas operacionais finas dos três painéis → 7 valores do enum do banco.
 * Estratégia B: nenhum literal novo no `order_status`; o runtime continua
 * usando STATUS_MAP_DB/podeTransitar acima. Este mapa serve à futura
 * integração (E2+) e à auditoria, sem mudar nenhum comportamento atual.
 */
export const ETAPAS_OPERACIONAIS: Record<string, string> = {
  aceito_atendente: "recebido",
  aguardando_janela: "recebido",
  liberado_cozinha: "recebido",
  em_preparo: "em_producao",
  conferencia_ok: "pronto",
  aguardando_cliente: "pronto",
  reserva_motoboy: "aguardando_motoboy",
  motoboy_atribuido: "aguardando_motoboy",
  em_rota: "em_rota",
  entregue: "entregue",
  retirado: "entregue",
};

/** Resolve a etapa operacional para o status de banco (E1, sem efeito colateral). */
export function etapaDb(etapa: string): string | null {
  return ETAPAS_OPERACIONAIS[etapa] ?? STATUS_MAP_DB[etapa] ?? null;
}

/**
 * Mensagens claras para as proteções financeiras da 0094 (gatilho
 * `trigger_proteger_consistencia_financeira`). O gatilho levanta P0001 com texto
 * técnico; aqui traduzimos para operador/cliente, sem prometer fluxo inexistente.
 */
export const MENSAGENS_PROTECAO_FINANCEIRA = {
  pagamento_rebaixado:
    "Pagamento já confirmado não pode voltar para pendente nem para falhou. Registre um reembolso (reembolsado) ou use o fluxo de correção auditado.",
  cancelado_pago:
    "Pedido cancelado não pode receber confirmação de pagamento. O valor recebido deve ir para conciliação financeira.",
  reabertura:
    "Pedido cancelado não pode ser reaberto diretamente. Use um fluxo de correção auditado.",
  inconsistente:
    "Operação bloqueada: o pedido ficaria com estado financeiro inconsistente (cancelado e pago ao mesmo tempo).",
} as const;

/**
 * Reconhece os erros da 0094 e devolve a mensagem clara correspondente.
 * Retorna string vazia quando não é um erro de proteção financeira (o chamador
 * segue com a tradução padrão).
 */
export function mensagemProtecaoFinanceira(entrada: unknown): string {
  const texto = entrada instanceof Error ? entrada.message : String(entrada ?? "");
  if (!texto) return "";
  if (/pagamento_confirmado_nao_rebaixavel/i.test(texto)) {
    return MENSAGENS_PROTECAO_FINANCEIRA.pagamento_rebaixado;
  }
  if (/reabertura_nao_permitida/i.test(texto)) {
    return MENSAGENS_PROTECAO_FINANCEIRA.reabertura;
  }
  if (/cancelado e pago/i.test(texto)) {
    return MENSAGENS_PROTECAO_FINANCEIRA.inconsistente;
  }
  if (/estava cancelado/i.test(texto) || /pagamento recebido deve ir para conciliacao/i.test(texto)) {
    return MENSAGENS_PROTECAO_FINANCEIRA.cancelado_pago;
  }
  return "";
}
