export const LOTE = 50;
export const LOTE_MAXIMO = 10_000;
export const MARGEM_MINIMA = 25;
export const CONVERSAO_DEMO = 10;

export function quantidadeValida(qtd: number) {
  return Number.isSafeInteger(qtd) && qtd >= LOTE && qtd <= LOTE_MAXIMO && qtd % LOTE === 0;
}

export function simularPromocao({
  elegiveis, quantidade, precoUnitario, custoUnitario, desconto,
}: {
  elegiveis: number;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number | null;
  desconto: number;
}) {
  // Valores monetários em centavos. A conversão é hipótese, não previsão.
  const bruto = quantidade * precoUnitario;
  if (!quantidadeValida(quantidade) || !Number.isSafeInteger(bruto) || bruto <= 0 ||
    !Number.isSafeInteger(desconto) || desconto <= 0 || desconto > bruto ||
    !Number.isSafeInteger(elegiveis) || elegiveis < 0) return null;
  const pedidos = Math.floor(elegiveis * CONVERSAO_DEMO / 100);
  const liquido = bruto - desconto;
  const custo = custoUnitario !== null && Number.isSafeInteger(custoUnitario) && custoUnitario > 0
    ? custoUnitario * quantidade : null;
  const margem = custo === null || liquido === 0 ? null : (liquido - custo) / liquido * 100;
  return {
    pedidos, desconto, liquido, receita: liquido * pedidos, custoCampanha: desconto * pedidos,
    margem, recomendada: elegiveis > 0 && custo !== null &&
      (liquido - custo) * 100 >= liquido * MARGEM_MINIMA && liquido > 0,
  };
}
