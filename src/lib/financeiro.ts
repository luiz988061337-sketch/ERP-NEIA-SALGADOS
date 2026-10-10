/**
 * Regras financeiras puras (Fase F): caixa, contas e conciliação.
 * Sem Supabase/React: testável em scripts/auditoria.test.mjs.
 * Convenções: valores em R$ (number); datas ISO (dia = slice 0,10).
 * Faturamento (soma de pedidos) NUNCA é confundido com recebido: só
 * pagamento_status 'pago' conta como recebido; 'pendente' é a receber.
 */

export type StatusConta = "pendente" | "paga" | "vencida" | "cancelada";

/** Esperado do caixa: inicial + entradas − saídas. */
export function saldoCaixaEsperado(inicial: number, entradas: number, saidas: number): number {
  return Number(inicial || 0) + Number(entradas || 0) - Number(saidas || 0);
}

/** Diferença da conferência: informado − esperado (0 = exato). */
export function diferencaCaixa(informado: number, esperado: number): number {
  return Number(informado || 0) - Number(esperado || 0);
}

/**
 * Status efetivo da conta: paga/cancelada prevalecem; pendente com
 * vencimento passado vira vencida. Sem vencimento = pendente.
 */
export function statusConta(
  conta: { status: string; vencimento?: string | null },
  hojeISO: string,
): StatusConta {
  if (conta.status === "paga" || conta.status === "cancelada") return conta.status;
  const hoje = String(hojeISO ?? "").slice(0, 10);
  const venc = String(conta.vencimento ?? "").slice(0, 10);
  if (venc && hoje && venc < hoje) return "vencida";
  return "pendente";
}

export type ResumoConciliacao = {
  recebido: number;
  pendente: number;
  cancelado: number;
  porMeio: Record<string, number>;
  qtdRecebido: number;
  qtdPendente: number;
};

/**
 * Conciliação por pagamento_status (nunca por existência do pedido):
 * recebido = pago (não cancelado); pendente = pendente (não cancelado);
 * cancelado soma à parte e não entra em recebido/pendente.
 */
export function resumoConciliacao(
  pedidos: {
    total?: number | null;
    pagamento_status?: string | null;
    status?: string | null;
    forma_pagamento?: string | null;
  }[],
): ResumoConciliacao {
  const r: ResumoConciliacao = {
    recebido: 0,
    pendente: 0,
    cancelado: 0,
    porMeio: {},
    qtdRecebido: 0,
    qtdPendente: 0,
  };
  for (const p of pedidos ?? []) {
    const v = Number(p.total ?? 0) || 0;
    if (p.status === "cancelado") {
      r.cancelado += v;
      continue;
    }
    if (p.pagamento_status === "pago") {
      r.recebido += v;
      r.qtdRecebido += 1;
      const meio = String(p.forma_pagamento ?? "outro");
      r.porMeio[meio] = (r.porMeio[meio] ?? 0) + v;
    } else {
      r.pendente += v;
      r.qtdPendente += 1;
    }
  }
  return r;
}

/** Soma contas por tipo, ignorando canceladas. */
export function totalContas(
  contas: { tipo?: string | null; valor?: number | null; status?: string | null }[],
  tipo: "pagar" | "receber",
): number {
  return (contas ?? [])
    .filter((c) => c.tipo === tipo && c.status !== "cancelada")
    .reduce((s, c) => s + (Number(c.valor ?? 0) || 0), 0);
}
