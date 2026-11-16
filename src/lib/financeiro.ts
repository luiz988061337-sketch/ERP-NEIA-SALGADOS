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
  contas: { tipo?: string | null; valor?: number | null; valor_pago?: number | null; status?: string | null }[],
  tipo: "pagar" | "receber",
): number {
  return (contas ?? [])
    .filter((c) => c.tipo === tipo && c.status !== "cancelada")
    .reduce((s, c) => {
      const valor = Math.max(0, Number(c.valor ?? 0) || 0);
      const pago = Math.max(0, Number(c.valor_pago ?? 0) || 0);
      return s + Math.max(0, valor - Math.min(valor, pago));
    }, 0);
}

export type EventoPagamentoCaixa = {
  conta_id: string;
  tipo: "pagamento" | "estorno";
  valor_centavos: number;
  created_at: string;
};

export type ContaCaixaLegada = {
  id: string;
  tipo?: string | null;
  categoria?: string | null;
  meio?: string | null;
  pedido_id?: string | null;
  status?: string | null;
  valor?: number | null;
  valor_pago?: number | null;
  pagamento_abertura_centavos?: number | null;
  pago_em?: string | null;
};

export type PedidoRecebidoCaixa = {
  id: string;
  total?: number | null;
  forma_pagamento?: string | null;
  pagamento_status?: string | null;
  status?: string | null;
  pagamento_em?: string | null;
};

export type EventoPagamentoPedidoCaixa = {
  pedido_id: string;
  tipo: "pagamento" | "estorno";
  valor_centavos: number;
  forma_pagamento?: string | null;
  created_at: string;
};

export type FluxoCaixaMensal = {
  competencia: string;
  entradasCentavos: number;
  saidasCentavos: number;
  entradasPedidosCentavos: number;
  entradasContasCentavos: number;
  saidasContasCentavos: number;
  /** Entradas de operação, excluindo suprimentos internos de caixa. */
  entradasOperacionaisCentavos: number;
  porMeioCentavos: Record<string, number>;
  eventosSemData: number;
  eventosContaMeioDesconhecido: number;
  pagamentos: number;
  estornos: number;
};

/** Determina competência pelo instante real, no fuso comercial da loja. */
export function competenciaSaoPaulo(instante: string | null | undefined): string | null {
  if (!instante) return null;
  const data = new Date(instante);
  if (!Number.isFinite(data.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(data);
  const ano = partes.find((parte) => parte.type === "year")?.value;
  const mes = partes.find((parte) => parte.type === "month")?.value;
  return ano && mes ? `${ano}-${mes}` : null;
}

/**
 * Fluxo de caixa por competência: ledger de pagamentos/estornos tem precedência
 * sobre o agregado da conta. Para pedidos legados usa pagamento_em (nunca
 * created_at). Saldos sem timestamp confiável são contados como não atribuíveis.
 */
export function montarFluxoCaixaMensal(args: {
  competencias: string[];
  eventos: EventoPagamentoCaixa[];
  eventosPedidos?: EventoPagamentoPedidoCaixa[];
  contas: ContaCaixaLegada[];
  pedidosPagos: PedidoRecebidoCaixa[];
  pedidosPagosSemData?: number;
  aPartirDe?: string | null;
  meiosIncluidos?: string[];
}): FluxoCaixaMensal[] {
  const fluxo = new Map<string, FluxoCaixaMensal>(args.competencias.map((competencia) => [competencia, {
    competencia, entradasCentavos: 0, saidasCentavos: 0,
    entradasPedidosCentavos: 0, entradasContasCentavos: 0, saidasContasCentavos: 0,
    entradasOperacionaisCentavos: 0,
    porMeioCentavos: {},
    eventosSemData: args.pedidosPagosSemData ?? 0, eventosContaMeioDesconhecido: 0,
    pagamentos: 0, estornos: 0,
  }]));
  const contas = new Map(args.contas.map((conta) => [conta.id, conta]));
  const contasComLedger = new Set(args.eventos.map((evento) => evento.conta_id));
  const pedidosComLedger = new Set((args.eventosPedidos ?? []).map((evento) => evento.pedido_id));
  const pedidosComContaReceber = new Set(args.contas
    .filter((conta) => conta.tipo === "receber" && conta.pedido_id &&
      (contasComLedger.has(conta.id) || conta.status === "paga" || Number(conta.valor_pago ?? 0) > 0))
    .map((conta) => conta.pedido_id as string));
  const pedidosComContaLedger = new Set(args.contas
    .filter((conta) => conta.tipo === "receber" && conta.pedido_id && contasComLedger.has(conta.id))
    .map((conta) => conta.pedido_id as string));

  for (const evento of args.eventos) {
    const conta = contas.get(evento.conta_id);
    const valor = evento.valor_centavos;
    const competencia = competenciaSaoPaulo(evento.created_at);
    if (!conta || !Number.isSafeInteger(valor) || valor <= 0) continue;
    if (args.aPartirDe && Date.parse(evento.created_at) < Date.parse(args.aPartirDe)) continue;
    if (!competencia) {
      for (const periodo of fluxo.values()) periodo.eventosSemData += 1;
      continue;
    }
    const periodo = fluxo.get(competencia);
    if (!periodo) continue;
    // O ledger geral não registra o meio efetivo. Os movimentos criados pela
    // RPC específica são exceção: sangria/suprimento ficam sempre em dinheiro.
    if (args.meiosIncluidos?.length) {
      const movimentoInternoEmDinheiro =
        (conta.categoria === "sangria" || conta.categoria === "suprimento") &&
        (conta.meio ?? "outro") === "dinheiro";
      if (movimentoInternoEmDinheiro) {
        // Meio conhecido: não entra em relatórios filtrados sem dinheiro.
        if (!args.meiosIncluidos.includes("dinheiro")) continue;
      } else {
        periodo.eventosContaMeioDesconhecido += 1;
        continue;
      }
    }
    const sinal = evento.tipo === "pagamento" ? 1 : evento.tipo === "estorno" ? -1 : 0;
    if (!sinal) continue;
    const cents = sinal * valor;
    if (conta.tipo === "receber") {
      periodo.entradasCentavos += cents;
      periodo.entradasContasCentavos += cents;
      // Suprimento é entrada física, mas transferência interna, não receita.
      if (conta.categoria !== "suprimento") {
        periodo.entradasOperacionaisCentavos += cents;
        periodo.porMeioCentavos["outro"] = (periodo.porMeioCentavos["outro"] ?? 0) + cents;
        if (evento.tipo === "pagamento") periodo.pagamentos += 1;
        else periodo.estornos += 1;
      }
    }
    else if (conta.tipo === "pagar") {
      periodo.saidasCentavos += cents;
      periodo.saidasContasCentavos += cents;
    }
    else continue;
  }

  for (const conta of args.contas) {
    const temSaldoHistorico = Number(conta.pagamento_abertura_centavos ?? 0) > 0;
    if (contasComLedger.has(conta.id)) {
      if (temSaldoHistorico) {
        for (const periodo of fluxo.values()) periodo.eventosSemData += 1;
      }
      continue;
    }
    if (args.meiosIncluidos?.length && !args.meiosIncluidos.includes(conta.meio ?? "outro")) continue;
    const valorPago = conta.valor_pago == null ? 0 : Number(conta.valor_pago);
    const centavosInformados = Number.isFinite(valorPago) && valorPago > 0
      ? Math.round(valorPago * 100)
      : conta.status === "paga" ? Math.round(Number(conta.valor ?? 0) * 100) : 0;
    // Um agregado legado não informa a data de cada pagamento parcial. Mesmo
    // com pago_em, não atribuir todo o acumulado ao último evento conhecido.
    if (temSaldoHistorico || conta.status === "paga" ||
        (Number.isSafeInteger(centavosInformados) && centavosInformados > 0)) {
      for (const periodo of fluxo.values()) periodo.eventosSemData += 1;
    }
  }

  for (const evento of args.eventosPedidos ?? []) {
    // Conta a receber vinculada é a fonte financeira dessa venda. Se ambos
    // os caminhos existem, contar o ledger da conta evita duplicidade.
    if (pedidosComContaLedger.has(evento.pedido_id)) continue;
    const valor = evento.valor_centavos;
    const competencia = competenciaSaoPaulo(evento.created_at);
    if (!Number.isSafeInteger(valor) || valor <= 0) continue;
    if (args.meiosIncluidos?.length && !args.meiosIncluidos.includes(evento.forma_pagamento ?? "outro")) continue;
    if (args.aPartirDe && Date.parse(evento.created_at) < Date.parse(args.aPartirDe)) continue;
    if (!competencia) {
      for (const periodo of fluxo.values()) periodo.eventosSemData += 1;
      continue;
    }
    const periodo = fluxo.get(competencia);
    if (!periodo) continue;
    const sinal = evento.tipo === "pagamento" ? 1 : -1;
    periodo.entradasCentavos += sinal * valor;
    periodo.entradasOperacionaisCentavos += sinal * valor;
    const meio = String(evento.forma_pagamento ?? "outro");
    periodo.porMeioCentavos[meio] = (periodo.porMeioCentavos[meio] ?? 0) + sinal * valor;
    if (evento.tipo === "pagamento") periodo.pagamentos += 1;
    else periodo.estornos += 1;
  }

  for (const pedido of args.pedidosPagos) {
    if (pedido.pagamento_status !== "pago" || pedido.status === "cancelado" ||
        pedidosComContaReceber.has(pedido.id) || pedidosComLedger.has(pedido.id)) continue;
    if (args.meiosIncluidos?.length && !args.meiosIncluidos.includes(pedido.forma_pagamento ?? "outro")) continue;
    const centavos = Math.round(Number(pedido.total ?? 0) * 100);
    const competencia = competenciaSaoPaulo(pedido.pagamento_em);
    if (args.aPartirDe && Date.parse(pedido.pagamento_em ?? "") < Date.parse(args.aPartirDe)) continue;
    const periodo = competencia ? fluxo.get(competencia) : undefined;
    if (!Number.isSafeInteger(centavos) || centavos <= 0) continue;
    if (periodo) {
      periodo.entradasCentavos += centavos;
      periodo.entradasOperacionaisCentavos += centavos;
      periodo.entradasPedidosCentavos += centavos;
      const meio = String(pedido.forma_pagamento ?? "outro");
      periodo.porMeioCentavos[meio] = (periodo.porMeioCentavos[meio] ?? 0) + centavos;
      periodo.pagamentos += 1;
    } else if (!competencia) {
      for (const item of fluxo.values()) item.eventosSemData += 1;
    }
  }
  return args.competencias.map((competencia) => fluxo.get(competencia) as FluxoCaixaMensal);
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
  contasPagas: {
    tipo?: string | null;
    categoria?: string | null;
    valor?: number | null;
    valor_pago?: number | null;
    status?: string | null;
  }[],
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
    if (c.tipo !== "pagar" || c.status === "cancelada" ||
        c.categoria === "sangria" || c.categoria === "suprimento") continue;
    const original = Math.max(0, Number(c.valor ?? 0) || 0);
    const informado = Number(c.valor_pago);
    // Linhas antigas pagas sem valor_pago detalhado continuam compatíveis.
    const pago = Number.isFinite(informado) && informado > 0
      ? Math.min(original, informado)
      : c.status === "paga" || c.valor_pago == null
        ? original
        : 0;
    if (c.categoria === "insumos") cmv += pago;
    else despesas += pago;
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
