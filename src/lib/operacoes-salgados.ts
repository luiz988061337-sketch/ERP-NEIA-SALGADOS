export const operacoesSalgados = {
  entrada: "Entrada de estoque",
  perda: "Registrar perda",
  ajuste: "Inventário físico",
  retirada: "Retirada do freezer",
  reserva: "Reservar estoque",
  liberar: "Liberar reservas não consumidas",
} as const;

export type OperacaoSalgados = keyof typeof operacoesSalgados;

export function validarMovimentoSalgados(input: {
  tipo: OperacaoSalgados;
  quantidade: string;
  codigo: string;
  fabricacao: string;
  validade: string;
  motivo: string;
  hoje: string;
  lote: { restante: number; inutilizavel?: boolean } | undefined;
  disponivel: number;
  reserva: { pendente: number } | undefined;
  pedido: string;
}) {
  const { tipo, codigo, fabricacao, validade, motivo, hoje, lote, disponivel, reserva, pedido } =
    input;
  const quantidade = Number(input.quantidade);
  if (
    tipo !== "liberar" &&
    (!input.quantidade ||
      !Number.isInteger(quantidade) ||
      quantidade > 2147483647 ||
      quantidade < (tipo === "ajuste" ? 0 : 1))
  )
    return "Informe uma quantidade inteira válida.";
  if (
    tipo === "entrada" &&
    (!codigo ||
      !fabricacao ||
      !validade ||
      fabricacao > hoje ||
      validade < hoje ||
      validade < fabricacao)
  )
    return "Informe o código do lote e datas válidas de fabricação e validade.";
  if ((tipo === "perda" || tipo === "ajuste") && (!lote || !motivo))
    return "Selecione o lote e informe o motivo ou a justificativa.";
  if (tipo === "perda" && lote && quantidade > lote.restante)
    return "A perda ultrapassa o saldo do lote selecionado.";
  if (tipo === "perda" && lote && !lote.inutilizavel && quantidade > disponivel)
    return "A perda reduziria o estoque protegido por reservas.";
  if (
    tipo === "ajuste" &&
    lote &&
    (quantidade === lote.restante || quantidade - lote.restante + disponivel < 0)
  )
    return "A contagem precisa gerar uma diferença e preservar o saldo reservado.";
  if (tipo === "retirada" && quantidade > (reserva?.pendente ?? disponivel))
    return "A retirada ultrapassa o saldo disponível ou o restante da reserva.";
  if ((tipo === "reserva" || tipo === "liberar") && !pedido) return "Selecione um pedido.";
  if (tipo === "reserva" && quantidade > disponivel)
    return "A quantidade ultrapassa o estoque disponível.";
  return null;
}
