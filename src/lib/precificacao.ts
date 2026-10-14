/**
 * Etapa L — regras puras de precificação (espelham a migration 0076).
 * Sem banco/React: testável em scripts/precificacao.test.mjs.
 * Valores em R$; percentuais em 0-100.
 */

/** Custo direto por unidade: insumos + embalagem + mão de obra + gás. */
export function custoDireto(p: {
  custoInsumos: number;
  embalagem: number;
  tempoMaoObraMin: number;
  maoObraHora: number;
  rendimento: number;
  tempoFrituraS: number;
  gasHora: number;
}): number {
  const rend = Number(p.rendimento) > 0 ? Number(p.rendimento) : 1;
  const maoObra = ((Number(p.tempoMaoObraMin) || 0) / 60) * (Number(p.maoObraHora) || 0) / rend;
  const gas = ((Number(p.tempoFrituraS) || 0) / 3600) * (Number(p.gasHora) || 0) / rend;
  return (Number(p.custoInsumos) || 0) + (Number(p.embalagem) || 0) + maoObra + gas;
}

/** Rateio do fixo por unidade = fixos mensais ÷ unidades do mês. */
export function rateioFixoPorUnidade(custosFixosMensais: number, unidadesMes: number): number {
  const u = Number(unidadesMes) || 0;
  if (u <= 0) return 0;
  return (Number(custosFixosMensais) || 0) / u;
}

/**
 * Preço sugerido (markup divisor) = custo ÷ (1 − margem − taxa).
 * Ex.: custo R$ 0,60, margem 40%, taxa 5% → R$ 1,09.
 * Null quando margem+taxa ≥ 100% (divisor inválido).
 */
export function precoSugerido(custoTotal: number, margemPct: number, taxaPct: number): number | null {
  const divisor = 1 - (Number(margemPct) || 0) / 100 - (Number(taxaPct) || 0) / 100;
  if (divisor <= 0) return null;
  const c = Number(custoTotal) || 0;
  if (c < 0) return null;
  return Math.round((c / divisor) * 100) / 100;
}

/** Margem real = (preço − custo − preço×taxa) ÷ preço. Null sem preço. */
export function margemReal(preco: number, custoTotal: number, taxaPct: number): number | null {
  const p = Number(preco) || 0;
  if (p <= 0) return null;
  return (p - (Number(custoTotal) || 0) - (p * (Number(taxaPct) || 0)) / 100) / p;
}

export type SeloMargem = "prejuizo" | "margem_baixa" | "saudavel";

/** Selo: prejuízo < 0; baixa < limite configurável (padrão 15%). */
export function seloMargem(margem: number | null, margemBaixaPct = 15): SeloMargem {
  if (margem == null) return "margem_baixa";
  if (margem < 0) return "prejuizo";
  if (margem * 100 < (Number(margemBaixaPct) || 0)) return "margem_baixa";
  return "saudavel";
}

/** Kit/combo: custo = soma dos itens + embalagem do kit. */
export function custoKit(custosItens: number[], embalagemKit: number): number {
  return (custosItens ?? []).reduce((s, v) => s + (Number(v) || 0), 0) + (Number(embalagemKit) || 0);
}

/** Desconto efetivo do kit frente aos avulsos (0-1). Null sem base. */
export function descontoEfetivoKit(precoKit: number, somaAvulsos: number): number | null {
  const s = Number(somaAvulsos) || 0;
  if (s <= 0) return null;
  return 1 - (Number(precoKit) || 0) / s;
}
