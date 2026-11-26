export type LoteSituacaoSalgado = { restante: number; status: string; validade: string | null };

type EstoqueSalgado = {
  fisico: number;
  reservado: number;
  minimo: number;
  temMovimento: boolean;
  lotesTodos: LoteSituacaoSalgado[];
};

export const situacoesSalgados = {
  vencido: { texto: "Lote vencido", tom: "vermelho" },
  excedente: { texto: "Reserva acima do físico", tom: "vermelho" },
  zerado: { texto: "Estoque zerado", tom: "vermelho" },
  abaixo: { texto: "Abaixo do mínimo", tom: "vermelho" },
  vencendo: { texto: "Vence em até 7 dias", tom: "ouro" },
  semEstoque: { texto: "Não cadastrado", tom: "azul" },
  semMinimo: { texto: "Mínimo não definido", tom: "ouro" },
  normal: { texto: "Estoque normal", tom: "verde" },
} as const;

export function diasDaValidade(validade: string, hoje: string) {
  return (Date.parse(validade) - Date.parse(hoje)) / 86_400_000;
}

export function loteVencidoComSaldo(lote: LoteSituacaoSalgado, hoje: string) {
  return (
    lote.restante > 0 && (lote.status === "vencido" || (!!lote.validade && lote.validade < hoje))
  );
}

export function lerSituacaoSalgado(produto: EstoqueSalgado | undefined, hoje: string) {
  const temEstoque =
    !!produto && (produto.temMovimento || produto.lotesTodos.length > 0 || produto.reservado > 0);
  const fisico = temEstoque ? produto.fisico : null;
  const reservado = temEstoque ? produto.reservado : null;
  const disponivel = fisico !== null && reservado !== null ? fisico - reservado : null;
  const minimo = produto && produto.minimo > 0 ? produto.minimo : null;
  const lotesComSaldo = produto?.lotesTodos.filter((lote) => lote.restante > 0) ?? [];
  const vencido = lotesComSaldo.some((lote) => loteVencidoComSaldo(lote, hoje));
  const validadesAtivas = lotesComSaldo
    .filter((lote) => lote.status === "ativo")
    .flatMap((lote) => (lote.validade && lote.validade >= hoje ? [lote.validade] : []))
    .sort();
  const vencendo = validadesAtivas.filter((validade) => diasDaValidade(validade, hoje) <= 7).length;
  const proximaValidade = validadesAtivas[0] ?? null;
  const abaixo = disponivel !== null && minimo !== null && disponivel < minimo;
  const alertas: (keyof typeof situacoesSalgados)[] = [];
  if (vencido) alertas.push("vencido");
  if (disponivel !== null && disponivel < 0) alertas.push("excedente");
  if (fisico === 0) alertas.push("zerado");
  if (abaixo) alertas.push("abaixo");
  if (vencendo) alertas.push("vencendo");
  if (!temEstoque) alertas.push("semEstoque");
  if (minimo === null && temEstoque) alertas.push("semMinimo");
  if (!alertas.length) alertas.push("normal");
  return { fisico, reservado, disponivel, minimo, proximaValidade, alertas, vencendo, abaixo };
}
