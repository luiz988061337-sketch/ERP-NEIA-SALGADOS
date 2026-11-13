// Série FIXA e explicitamente fictícia para a demonstração visual.
// Não é histórico da empresa, não consulta o Supabase e não produz comparações reais.
export const historicoDemonstrativo = [
  { mes: "Nov/24", receita: 40500, variaveis: 19000, fixos: 12000 },
  { mes: "Dez/24", receita: 45800, variaveis: 21300, fixos: 12200 },
  { mes: "Jan/25", receita: 50200, variaveis: 23400, fixos: 12600 },
  { mes: "Fev/25", receita: 53300, variaveis: 25000, fixos: 13200 },
  { mes: "Mar/25", receita: 56100, variaveis: 26700, fixos: 14100 },
];

export const coresCategoria = ["#ffcc00", "#00d849", "#00baff", "#ff3b45", "#973fff", "#ff891b"];
export const dataDemonstracao = "2025-04-13";

export function percentual(valor: number) {
  return Number.isFinite(valor) ? `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
}

export function calcularResumo(receita: number, variaveis: number, fixos: number) {
  const margem = receita - variaveis;
  const perc = receita > 0 ? margem / receita : 0;
  const pe = perc > 0 ? fixos / perc : Infinity;
  const margemSeg = receita > 0 && Number.isFinite(pe) ? (receita - pe) / receita : 0;
  return { receita, variais: variaveis, fixos, margem, perc, pe, margemSeg, resultado: margem - fixos };
}
