/**
 * Etapa K — regras puras de insumos (espelham a migration 0075).
 * Sem banco/React: testável em scripts/insumos.test.mjs.
 * Unidades: massa g<->kg, volume ml<->l; `un` só converte p/ `un`.
 */

export type Unidade = "g" | "kg" | "ml" | "l" | "un";

/** Converte qtd de uma unidade p/ outra. Null se incompatíveis. */
export function converterUnidade(qtd: number, de: string, para: string): number | null {
  const q = Number(qtd);
  if (!Number.isFinite(q)) return null;
  if (de === para) return q;
  const massa = (u: string) => (u === "kg" ? 1000 : u === "g" ? 1 : null);
  const vol = (u: string) => (u === "l" ? 1000 : u === "ml" ? 1 : null);
  const mDe = massa(de);
  const mPara = massa(para);
  if (mDe != null && mPara != null) return (q * mDe) / mPara;
  const vDe = vol(de);
  const vPara = vol(para);
  if (vDe != null && vPara != null) return (q * vDe) / vPara;
  return null;
}

/**
 * Custo médio ponderado na entrada (por unidade_base).
 * Ex.: 10 kg a R$ 5,00 + 10 kg a R$ 7,00 → R$ 6,00/kg.
 */
export function custoMedioPonderado(
  saldo: number,
  custoAtual: number,
  qtdEntrada: number,
  custoEntrada: number,
): number {
  const s = Math.max(0, Number(saldo) || 0);
  const q = Math.max(0, Number(qtdEntrada) || 0);
  if (q <= 0) return Number(custoAtual) || 0;
  if (s <= 0) return Number(custoEntrada) || 0;
  return (s * (Number(custoAtual) || 0) + q * (Number(custoEntrada) || 0)) / (s + q);
}

export type ItemFicha = {
  quantidade: number;
  unidade: string;
};

/**
 * Consumo de UM insumo da ficha p/ uma quantidade de produto (em unidade_base).
 * porCento: ficha por cento (qtd do item = centos). Null se unidade inválida.
 * Ex.: 100 coxinhas, ficha 25 g frango/un, perda 4% → 2600 g (2,6 kg).
 */
export function consumoPorInsumo(
  qtdProduto: number,
  ficha: ItemFicha,
  perdaPct: number,
  porCento: boolean,
  unidadeBase: string,
): number | null {
  const qtd = Number(qtdProduto) || 0;
  if (qtd <= 0) return 0;
  const base = porCento ? (qtd / 100) * ficha.quantidade : qtd * ficha.quantidade;
  const emBase = converterUnidade(base, ficha.unidade, unidadeBase);
  if (emBase == null) return null;
  return emBase * (1 + (Number(perdaPct) || 0) / 100);
}

/**
 * Sugestão de compra = (consumo médio diário × (prazo + cobertura)) − estoque.
 * Nunca negativa. Unidades: as mesmas do consumo/estoque (base).
 */
export function sugestaoCompra(
  consumoMedioDiario: number,
  prazoFornecedorDias: number,
  estoqueAtual: number,
  coberturaDias = 7,
): number {
  const v =
    (Number(consumoMedioDiario) || 0) * ((Number(prazoFornecedorDias) || 0) + coberturaDias) -
    (Number(estoqueAtual) || 0);
  return Math.max(0, Math.round(v * 1000) / 1000);
}
