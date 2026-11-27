export type PrazoPedido = {
  agendado_para?: string | null;
  prazo_prometido_inicio_em?: string | null;
  prazo_prometido_em?: string | null;
};

function horarioValido(valor: string | null | undefined): valor is string {
  return !!valor && Number.isFinite(Date.parse(valor));
}

/** Agendamentos usam o compromisso definido no pedido. */
export function limitePrometido(pedido: PrazoPedido): string | null {
  const horario = pedido.agendado_para ?? pedido.prazo_prometido_em;
  return horarioValido(horario) ? horario : null;
}

export function janelaPrometida(pedido: PrazoPedido): { inicio: string; limite: string } | null {
  const limite = limitePrometido(pedido);
  const inicio = pedido.agendado_para ?? pedido.prazo_prometido_inicio_em;
  if (!limite || !horarioValido(inicio) || Date.parse(inicio) > Date.parse(limite)) return null;
  return { inicio, limite };
}

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

export function horaPrometida(horario: string): string {
  return formatoHora.format(new Date(horario));
}

export function categoriaTemAssadoComercial(
  slug: string | undefined,
  tipoVenda?: string | null,
): boolean {
  return (
    !!slug &&
    /(assad|pizza|empad)/.test(slug) &&
    !/congel/.test(slug) &&
    !/congel/.test(tipoVenda ?? "")
  );
}

export function passouDoPrazo(pedido: PrazoPedido, agoraMs: number): boolean {
  const limite = limitePrometido(pedido);
  return limite !== null && agoraMs > Date.parse(limite);
}
