/**
 * Núcleo de domínio puro para pagamentos parciais.
 *
 * Não acessa banco nem substitui RPC transacional. A aplicação só deve usar
 * estas regras após a migração do ledger e o cutover coordenado dos writes.
 * Todos os valores recebidos pelas operações são centavos inteiros.
 */

export type EstadoContaParcial = "pendente" | "parcial" | "paga" | "vencida" | "cancelada";

export type EventoPagamento =
  | {
      id: string;
      tipo: "pagamento";
      valorCentavos: number;
      chaveIdempotencia: string;
    }
  | {
      id: string;
      tipo: "estorno";
      valorCentavos: number;
      pagamentoId: string;
      chaveIdempotencia: string;
      motivo: string;
    };

export type ContaParcial = {
  valorOriginalCentavos: number;
  saldoPagoLegadoCentavos: number;
  estado: EstadoContaParcial;
  eventos: EventoPagamento[];
  pedidoJaPago?: boolean;
};

export type ResumoContaParcial = {
  totalPagoCentavos: number;
  saldoCentavos: number;
  estado: EstadoContaParcial | "revisao_necessaria";
};

export type ResultadoOperacao<T> =
  { ok: true; conta: ContaParcial; valor: T; repetida?: boolean } | { ok: false; motivo: string };

function centavosValidos(valor: number): boolean {
  return Number.isSafeInteger(valor) && valor >= 0;
}

/** Converte valor monetário em reais para centavos sem arredondamento silencioso. */
export function reaisParaCentavos(valor: string | number): number | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    const centavos = Math.round(valor * 100);
    if (!Number.isSafeInteger(centavos) || Math.abs(valor * 100 - centavos) > 1e-7) return null;
    return centavos;
  }
  const texto = valor.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(texto)) return null;
  const [inteiro, fracao = ""] = texto.replace(",", ".").split(".");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

function valoresContaValidos(conta: ContaParcial): boolean {
  return (
    centavosValidos(conta.valorOriginalCentavos) &&
    centavosValidos(conta.saldoPagoLegadoCentavos) &&
    conta.saldoPagoLegadoCentavos <= conta.valorOriginalCentavos
  );
}

export function resumirContaParcial(conta: ContaParcial): ResumoContaParcial {
  if (!valoresContaValidos(conta) || conta.valorOriginalCentavos === 0) {
    return {
      totalPagoCentavos: 0,
      saldoCentavos: conta.valorOriginalCentavos,
      estado: "revisao_necessaria",
    };
  }

  const pagamentos = new Map<string, number>();
  const ids = new Set<string>();
  const chaves = new Set<string>();
  let totalEventos = conta.saldoPagoLegadoCentavos;
  for (const evento of conta.eventos) {
    if (
      !evento.id.trim() ||
      !evento.chaveIdempotencia.trim() ||
      ids.has(evento.id) ||
      chaves.has(evento.chaveIdempotencia) ||
      !Number.isSafeInteger(evento.valorCentavos) ||
      evento.valorCentavos <= 0
    ) {
      return {
        totalPagoCentavos: 0,
        saldoCentavos: conta.valorOriginalCentavos,
        estado: "revisao_necessaria",
      };
    }
    ids.add(evento.id);
    chaves.add(evento.chaveIdempotencia);
    if (evento.tipo === "pagamento") {
      pagamentos.set(evento.id, evento.valorCentavos);
      totalEventos += evento.valorCentavos;
      continue;
    }
    const valorPagamento = pagamentos.get(evento.pagamentoId);
    if (valorPagamento == null) {
      return {
        totalPagoCentavos: 0,
        saldoCentavos: conta.valorOriginalCentavos,
        estado: "revisao_necessaria",
      };
    }
    const jaEstornado = conta.eventos
      .slice(0, conta.eventos.indexOf(evento))
      .reduce(
        (soma, anterior) =>
          soma +
          (anterior.tipo === "estorno" && anterior.pagamentoId === evento.pagamentoId
            ? anterior.valorCentavos
            : 0),
        0,
      );
    if (jaEstornado + evento.valorCentavos > valorPagamento || !evento.motivo.trim()) {
      return {
        totalPagoCentavos: 0,
        saldoCentavos: conta.valorOriginalCentavos,
        estado: "revisao_necessaria",
      };
    }
    totalEventos -= evento.valorCentavos;
  }
  if (
    !Number.isSafeInteger(totalEventos) ||
    totalEventos < 0 ||
    totalEventos > conta.valorOriginalCentavos
  ) {
    return {
      totalPagoCentavos: 0,
      saldoCentavos: conta.valorOriginalCentavos,
      estado: "revisao_necessaria",
    };
  }

  const saldoCentavos = conta.valorOriginalCentavos - totalEventos;
  if (
    (conta.estado === "paga" && saldoCentavos !== 0) ||
    (conta.estado === "cancelada" && totalEventos !== 0) ||
    (conta.estado === "parcial" && (totalEventos === 0 || saldoCentavos === 0))
  ) {
    return { totalPagoCentavos: totalEventos, saldoCentavos, estado: "revisao_necessaria" };
  }
  const estado =
    conta.estado === "cancelada"
      ? "cancelada"
      : saldoCentavos === 0
        ? "paga"
        : totalEventos > 0
          ? "parcial"
          : conta.estado === "vencida"
            ? "vencida"
            : "pendente";
  return { totalPagoCentavos: totalEventos, saldoCentavos, estado };
}

export function registrarPagamentoParcial(
  conta: ContaParcial,
  valorCentavos: number,
  chaveIdempotencia: string,
  eventoId: string,
): ResultadoOperacao<EventoPagamento> {
  if (!valoresContaValidos(conta)) return { ok: false, motivo: "conta_inconsistente" };
  if (resumirContaParcial(conta).estado === "revisao_necessaria") {
    return { ok: false, motivo: "revisao_necessaria" };
  }
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, motivo: "valor_deve_ser_centavos_positivos" };
  }
  if (!chaveIdempotencia.trim() || !eventoId.trim())
    return { ok: false, motivo: "identidade_obrigatoria" };
  const existente = conta.eventos.find((evento) => evento.chaveIdempotencia === chaveIdempotencia);
  if (existente) {
    if (existente.tipo !== "pagamento" || existente.valorCentavos !== valorCentavos) {
      return { ok: false, motivo: "chave_idempotencia_conflitante" };
    }
    return { ok: true, conta, valor: existente, repetida: true };
  }
  if (conta.eventos.some((evento) => evento.id === eventoId)) {
    return { ok: false, motivo: "identidade_evento_duplicada" };
  }

  const resumo = resumirContaParcial(conta);
  if (resumo.estado === "revisao_necessaria") return { ok: false, motivo: "revisao_necessaria" };
  if (resumo.estado === "paga" || resumo.estado === "cancelada") {
    return { ok: false, motivo: "conta_sem_saldo_pagavel" };
  }
  if (conta.pedidoJaPago) return { ok: false, motivo: "pedido_ja_pago_requer_revisao" };
  if (valorCentavos > resumo.saldoCentavos)
    return { ok: false, motivo: "pagamento_superior_ao_saldo" };

  const evento: EventoPagamento = {
    id: eventoId,
    tipo: "pagamento",
    valorCentavos,
    chaveIdempotencia,
  };
  const atualizada = { ...conta, eventos: [...conta.eventos, evento] };
  const estado = resumirContaParcial({
    ...atualizada,
    estado: conta.estado === "vencida" ? "vencida" : "pendente",
  }).estado;
  if (estado === "revisao_necessaria") return { ok: false, motivo: "revisao_necessaria" };
  return {
    ok: true,
    conta: { ...atualizada, estado },
    valor: evento,
  };
}

export function estornarPagamentoParcial(
  conta: ContaParcial,
  pagamentoId: string,
  valorCentavos: number,
  motivo: string,
  chaveIdempotencia: string,
  eventoId: string,
): ResultadoOperacao<EventoPagamento> {
  if (!valoresContaValidos(conta)) return { ok: false, motivo: "conta_inconsistente" };
  if (resumirContaParcial(conta).estado === "revisao_necessaria") {
    return { ok: false, motivo: "revisao_necessaria" };
  }
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, motivo: "valor_deve_ser_centavos_positivos" };
  }
  if (!motivo.trim() || !chaveIdempotencia.trim() || !eventoId.trim()) {
    return { ok: false, motivo: "motivo_e_identidade_obrigatorios" };
  }
  const repetido = conta.eventos.find((evento) => evento.chaveIdempotencia === chaveIdempotencia);
  if (repetido) {
    if (
      repetido.tipo !== "estorno" ||
      repetido.pagamentoId !== pagamentoId ||
      repetido.valorCentavos !== valorCentavos
    ) {
      return { ok: false, motivo: "chave_idempotencia_conflitante" };
    }
    return { ok: true, conta, valor: repetido, repetida: true };
  }
  if (conta.eventos.some((evento) => evento.id === eventoId)) {
    return { ok: false, motivo: "identidade_evento_duplicada" };
  }

  const pagamento = conta.eventos.find(
    (evento) => evento.id === pagamentoId && evento.tipo === "pagamento",
  );
  if (!pagamento || pagamento.tipo !== "pagamento")
    return { ok: false, motivo: "pagamento_nao_encontrado" };
  const jaEstornado = conta.eventos.reduce(
    (soma, evento) =>
      soma +
      (evento.tipo === "estorno" && evento.pagamentoId === pagamentoId ? evento.valorCentavos : 0),
    0,
  );
  if (jaEstornado + valorCentavos > pagamento.valorCentavos) {
    return { ok: false, motivo: "estorno_superior_ao_pagamento" };
  }

  const evento: EventoPagamento = {
    id: eventoId,
    tipo: "estorno",
    valorCentavos,
    pagamentoId,
    chaveIdempotencia,
    motivo: motivo.trim(),
  };
  const atualizada = { ...conta, eventos: [...conta.eventos, evento] };
  const estado = resumirContaParcial({
    ...atualizada,
    estado: conta.estado === "vencida" ? "vencida" : "pendente",
  }).estado;
  if (estado === "revisao_necessaria") return { ok: false, motivo: "revisao_necessaria" };
  return { ok: true, conta: { ...atualizada, estado }, valor: evento };
}

export function cancelarContaParcial(conta: ContaParcial): ResultadoOperacao<null> {
  const resumo = resumirContaParcial(conta);
  if (resumo.estado === "revisao_necessaria") return { ok: false, motivo: "revisao_necessaria" };
  if (resumo.totalPagoCentavos > 0) return { ok: false, motivo: "historico_pago_exige_estorno" };
  if (conta.estado === "cancelada") return { ok: true, conta, valor: null, repetida: true };
  return { ok: true, conta: { ...conta, estado: "cancelada" }, valor: null };
}
