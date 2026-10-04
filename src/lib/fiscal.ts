/**
 * Fiscal (§24-52): máquina de status, validações e idempotência.
 * NÃO transmite para SEFAZ direto: a transmissão passa pelo provedor configurado
 * em empresa_fiscal (camada desacoplada). Sem provedor, o documento fica
 * pendente e a UI orienta — nunca marca autorizado sem retorno fiscal válido.
 */

export const STATUS_FISCAL = [
  "nao_emitida",
  "em_processamento",
  "autorizada",
  "rejeitada",
  "cancelada",
  "inutilizada",
  "contingencia",
  "pendente",
  "erro_comunicacao",
] as const;

export type StatusFiscal = (typeof STATUS_FISCAL)[number];

const STATUS_LABEL: Record<StatusFiscal, string> = {
  nao_emitida: "Não emitida",
  em_processamento: "Em processamento",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
  inutilizada: "Inutilizada",
  contingencia: "Contingência",
  pendente: "Pendente",
  erro_comunicacao: "Erro de comunicação",
};

export function rotuloFiscal(s: string): string {
  return (STATUS_LABEL as Record<string, string>)[s] ?? s;
}

/** Finais: não saem mais daí (só via correção/contingência administrativa). */
const FINAIS: StatusFiscal[] = ["autorizada", "cancelada", "inutilizada"];

export function podeTransitarFiscal(de: string, para: string): boolean {
  if (de === para) return false;
  if ((FINAIS as string[]).includes(de)) return false;
  if (para === "autorizada" && !["em_processamento", "contingencia"].includes(de)) return false;
  return (STATUS_FISCAL as readonly string[]).includes(para);
}

export type EmpresaFiscal = {
  razao_social: string;
  cnpj: string;
  ambiente: "homologacao" | "producao";
  modelo_padrao: "" | "55" | "65";
  provedor: string;
  [k: string]: unknown;
};

export function empresaConfigurada(e: Partial<EmpresaFiscal> | null | undefined): { ok: boolean; faltando: string[] } {
  const faltando: string[] = [];
  if (!e?.razao_social) faltando.push("razão social");
  if (!e?.cnpj) faltando.push("CNPJ");
  if (!e?.modelo_padrao) faltando.push("modelo do documento (55/65)");
  if (!e?.provedor) faltando.push("provedor/API fiscal");
  return { ok: faltando.length === 0, faltando };
}

export type ProdutoFiscal = {
  ncm?: string | null;
  cfop_padrao?: string | null;
  cst?: string | null;
  csosn?: string | null;
};

export function produtoFiscalOk(p: ProdutoFiscal): boolean {
  return Boolean(p.ncm && (p.cst || p.csosn));
}
