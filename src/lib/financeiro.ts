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

/**
 * Monta a DRE a partir dos dados brutos (Etapa P, item 7 — centralizado).
 * pedidos.total já é líquido de desconto, então a bruta recompõe
 * (total + desconto) dos não cancelados; cancelados entram só na linha
 * própria. Chamar com os mesmos critérios em todas as telas.
 */
export function montarDRE(
  pedidos: {
    total?: number | null;
    desconto?: number | null;
    status?: string | null;
  }[],
  contasPagas: { tipo?: string | null; categoria?: string | null; valor?: number | null }[],
): LinhaDRE {
  let bruta = 0;
  let cancelamentos = 0;
  let descontos = 0;
  for (const p of pedidos ?? []) {
    const t = Number(p.total ?? 0) || 0;
    if (p.status === "cancelado") {
      bruta += t;
      cancelamentos += t;
    } else {
      bruta += t + (Number(p.desconto ?? 0) || 0);
      descontos += Number(p.desconto ?? 0) || 0;
    }
  }
  let cmv = 0;
  let despesas = 0;
  for (const c of contasPagas ?? []) {
    if (c.tipo !== "pagar") continue;
    if (c.categoria === "insumos") cmv += Number(c.valor ?? 0) || 0;
    else despesas += Number(c.valor ?? 0) || 0;
  }
  return dreMensal({ bruta, cancelamentos, descontos, cmv, despesas });
}

export type LinhaDRE = {
  bruta: number;
  cancelamentos: number;
  descontos: number;
  liquida: number;
  cmv: number;
  lucroBruto: number;
  despesas: number;
  resultado: number;
  margemPct: number;
};

/**
 * DRE mensal simplificada com dados reais (Etapa M):
 * bruta = pedidos não cancelados; cancelamentos à parte; descontos;
 * líquida = bruta − cancelados − descontos; CMV = insumos pagos;
 * lucro bruto = líquida − CMV; despesas = demais contas pagas;
 * resultado = lucro bruto − despesas.
 * Ex. prompt: 20000 − 1400 (aqui: cancel+desc) − 7000 − 6500 → 5100 (25,5%).
 */
export function dreMensal(p: {
  bruta: number;
  cancelamentos: number;
  descontos: number;
  cmv: number;
  despesas: number;
}): LinhaDRE {
  const bruta = Number(p.bruta) || 0;
  const cancelamentos = Number(p.cancelamentos) || 0;
  const descontos = Number(p.descontos) || 0;
  const cmv = Number(p.cmv) || 0;
  const despesas = Number(p.despesas) || 0;
  const liquida = bruta - cancelamentos - descontos;
  const lucroBruto = liquida - cmv;
  const resultado = lucroBruto - despesas;
  return {
    bruta,
    cancelamentos,
    descontos,
    liquida,
    cmv,
    lucroBruto,
    despesas,
    resultado,
    margemPct: bruta > 0 ? (resultado / bruta) * 100 : 0,
  };
}

/**
 * Ponto de equilíbrio = custos fixos ÷ margem de contribuição (0-1).
 * Ex.: fixos 6000, MC 40% → R$ 15.000/mês. Null sem margem.
 */
export function pontoEquilibrio(custosFixos: number, margemContribuicao: number): number | null {
  const mc = Number(margemContribuicao) || 0;
  if (mc <= 0) return null;
  return (Number(custosFixos) || 0) / mc;
}

/**
 * 0103 — Split Produtos × Entrega dos pedidos não cancelados.
 * A taxa de entrega já entra no total do pedido; esta função apenas
 * separa as partes para exibição (Produtos + Entrega = Total).
 */
export function splitProdutosEntrega(pedidos: {
  subtotal?: number | null;
  taxa_entrega?: number | null;
  total?: number | null;
  status?: string | null;
}[]): { produtos: number; entrega: number; total: number } {
  let produtos = 0;
  let entrega = 0;
  let total = 0;
  for (const p of pedidos ?? []) {
    if (p.status === "cancelado") continue;
    produtos += Number(p.subtotal ?? 0) || 0;
    entrega += Number(p.taxa_entrega ?? 0) || 0;
    total += Number(p.total ?? 0) || 0;
  }
  return {
    produtos: Math.round(produtos * 100) / 100,
    entrega: Math.round(entrega * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}
