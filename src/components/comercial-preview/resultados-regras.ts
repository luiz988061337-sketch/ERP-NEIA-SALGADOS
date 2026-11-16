import type { ClienteDemo } from "./dados";

export const DATA_REFERENCIA_RESULTADOS = "2026-11-14";

export type SegmentoResultado =
  | "inativos_30"
  | "inativos_60"
  | "inativos_90"
  | "vip"
  | "recorrentes"
  | "queda_frequencia"
  | "reclamacoes";
export type StatusFluxoResultado = "Rascunho" | "Aguardando aprovação" | "Aprovada" | "Rejeitada";
export type FiltroPeriodoResultado = "todos" | "30" | "90" | "365";
export type FiltroDesempenhoResultado =
  | "todos"
  | "com-dados"
  | "sem-dados"
  | "abaixo-comparacao"
  | "conversao-inferior";

export type ComparacaoAnterior = {
  receitaLiquidaCentavos: number;
  margemContribuicaoCentavos: number;
};

export type GrupoControleDemo = {
  alcance: number;
  margemContribuicaoCentavos: number;
  metodo: string;
};

export type DadosResultadoDemo = {
  elegiveis: number;
  alcancados: number;
  pedidosAtribuidos: number;
  receitaBrutaProdutosCentavos: number | null;
  descontosCentavos: number | null;
  reembolsosCentavos: number | null;
  custosVariaveisProdutosCentavos: number | null;
  custosVariaveisAdicionaisCentavos: number | null;
  taxasEntregaTerceirosCentavos: number | null;
  clientesRetornaram: number | null;
  clientesComVinculoCampanhaDemo: number | null;
  grupoControle?: GrupoControleDemo;
  comparacaoAnterior?: ComparacaoAnterior;
};

export type CampanhaResultadoDemo = {
  id: string;
  nome: string;
  segmento: SegmentoResultado;
  inicio: string;
  fim: string;
  statusFluxo: StatusFluxoResultado;
  dados: DadosResultadoDemo | null;
};

export const CAMPANHAS_RESULTADO_DEMO: CampanhaResultadoDemo[] = [
  {
    id: "c5-demo-reativacao-60",
    nome: "Reativação — clientes inativos há 60 dias",
    segmento: "inativos_60",
    inicio: "2026-11-01",
    fim: "2026-11-14",
    statusFluxo: "Aprovada",
    dados: {
      elegiveis: 120,
      alcancados: 100,
      pedidosAtribuidos: 16,
      receitaBrutaProdutosCentavos: 100_000,
      descontosCentavos: 10_000,
      reembolsosCentavos: 0,
      custosVariaveisProdutosCentavos: 54_000,
      custosVariaveisAdicionaisCentavos: 0,
      taxasEntregaTerceirosCentavos: 8_000,
      clientesRetornaram: 14,
      clientesComVinculoCampanhaDemo: 10,
      grupoControle: {
        alcance: 40,
        margemContribuicaoCentavos: 8_400,
        metodo: "Grupo comparável demonstrativo, normalizado pelo alcance",
      },
      comparacaoAnterior: {
        receitaLiquidaCentavos: 82_000,
        margemContribuicaoCentavos: 31_000,
      },
    },
  },
  {
    id: "c5-demo-vip",
    nome: "Benefício de retorno — clientes VIP",
    segmento: "vip",
    inicio: "2026-10-01",
    fim: "2026-10-31",
    statusFluxo: "Aprovada",
    dados: {
      elegiveis: 76,
      alcancados: 70,
      pedidosAtribuidos: 9,
      receitaBrutaProdutosCentavos: 140_000,
      descontosCentavos: 21_000,
      reembolsosCentavos: 0,
      custosVariaveisProdutosCentavos: 78_000,
      custosVariaveisAdicionaisCentavos: 8_000,
      taxasEntregaTerceirosCentavos: 12_000,
      clientesRetornaram: 8,
      clientesComVinculoCampanhaDemo: 5,
      comparacaoAnterior: {
        receitaLiquidaCentavos: 138_000,
        margemContribuicaoCentavos: 35_000,
      },
    },
  },
  {
    id: "c5-demo-recorrentes",
    nome: "Recompra — clientes recorrentes",
    segmento: "recorrentes",
    inicio: "2026-09-01",
    fim: "2026-09-30",
    statusFluxo: "Aprovada",
    dados: {
      elegiveis: 180,
      alcancados: 160,
      pedidosAtribuidos: 18,
      receitaBrutaProdutosCentavos: 130_000,
      descontosCentavos: 20_000,
      reembolsosCentavos: 5_000,
      custosVariaveisProdutosCentavos: 78_000,
      custosVariaveisAdicionaisCentavos: 22_000,
      taxasEntregaTerceirosCentavos: 25_000,
      clientesRetornaram: 7,
      clientesComVinculoCampanhaDemo: 3,
      comparacaoAnterior: {
        receitaLiquidaCentavos: 120_000,
        margemContribuicaoCentavos: 12_000,
      },
    },
  },
  {
    id: "c5-demo-pos-atendimento",
    nome: "Retorno pós-atendimento — dados insuficientes",
    segmento: "reclamacoes",
    inicio: "2026-11-05",
    fim: "2026-11-14",
    statusFluxo: "Rejeitada",
    dados: null,
  },
];

const inteiroNaoNegativo = (valor: number | null | undefined): valor is number =>
  Number.isSafeInteger(valor) && (valor as number) >= 0;

export function calcularResultadoCampanha(campanha: CampanhaResultadoDemo) {
  const d = campanha.dados;
  if (!d) return null;
  const contagensValidas =
    inteiroNaoNegativo(d.elegiveis) && inteiroNaoNegativo(d.alcancados) &&
    inteiroNaoNegativo(d.pedidosAtribuidos) && d.alcancados <= d.elegiveis &&
    d.pedidosAtribuidos <= d.alcancados;
  if (!contagensValidas) return null;

  const financeiroValido =
    inteiroNaoNegativo(d.receitaBrutaProdutosCentavos) &&
    inteiroNaoNegativo(d.descontosCentavos) &&
    inteiroNaoNegativo(d.reembolsosCentavos) &&
    (d.descontosCentavos as number) + (d.reembolsosCentavos as number) <=
      (d.receitaBrutaProdutosCentavos as number);
  const receitaLiquidaCentavos = financeiroValido
    ? (d.receitaBrutaProdutosCentavos as number) - (d.descontosCentavos as number) -
      (d.reembolsosCentavos as number)
    : null;
  const custosConhecidos = inteiroNaoNegativo(d.custosVariaveisProdutosCentavos) &&
    inteiroNaoNegativo(d.custosVariaveisAdicionaisCentavos);
  const margemContribuicaoCentavos = receitaLiquidaCentavos !== null && custosConhecidos
    ? receitaLiquidaCentavos - (d.custosVariaveisProdutosCentavos as number) -
      (d.custosVariaveisAdicionaisCentavos as number)
    : null;
  const margemPercentual = margemContribuicaoCentavos !== null && receitaLiquidaCentavos! > 0
    ? margemContribuicaoCentavos / receitaLiquidaCentavos! * 100
    : null;
  const conversaoPercentual = d.alcancados > 0
    ? d.pedidosAtribuidos / d.alcancados * 100
    : null;
  const ticketMedioCentavos = receitaLiquidaCentavos !== null && d.pedidosAtribuidos > 0
    ? receitaLiquidaCentavos / d.pedidosAtribuidos
    : null;

  let incrementalCentavos: number | null = null;
  if (margemContribuicaoCentavos !== null && d.grupoControle &&
      inteiroNaoNegativo(d.grupoControle.alcance) && d.grupoControle.alcance > 0 &&
      inteiroNaoNegativo(d.grupoControle.margemContribuicaoCentavos)) {
    const margemEsperadaControle = Math.round(
      d.grupoControle.margemContribuicaoCentavos / d.grupoControle.alcance * d.alcancados,
    );
    incrementalCentavos = margemContribuicaoCentavos - margemEsperadaControle;
  }

  const variacaoMargemAnteriorCentavos = margemContribuicaoCentavos !== null && d.comparacaoAnterior &&
    inteiroNaoNegativo(d.comparacaoAnterior.margemContribuicaoCentavos)
    ? margemContribuicaoCentavos - d.comparacaoAnterior.margemContribuicaoCentavos
    : null;
  const taxasTerceirosValidas = inteiroNaoNegativo(d.taxasEntregaTerceirosCentavos);

  return {
    receitaBrutaCentavos: financeiroValido ? d.receitaBrutaProdutosCentavos : null,
    descontosCentavos: financeiroValido ? d.descontosCentavos : null,
    reembolsosCentavos: financeiroValido ? d.reembolsosCentavos : null,
    receitaLiquidaCentavos,
    custosProdutosCentavos: custosConhecidos ? d.custosVariaveisProdutosCentavos : null,
    custosAdicionaisCentavos: custosConhecidos ? d.custosVariaveisAdicionaisCentavos : null,
    custosVariaveisCentavos: custosConhecidos
      ? (d.custosVariaveisProdutosCentavos as number) + (d.custosVariaveisAdicionaisCentavos as number)
      : null,
    margemContribuicaoCentavos,
    margemPercentual,
    conversaoPercentual,
    ticketMedioCentavos,
    incrementalCentavos,
    variacaoMargemAnteriorCentavos,
    taxasEntregaTerceirosCentavos: taxasTerceirosValidas ? d.taxasEntregaTerceirosCentavos : null,
    dadosFinanceirosValidos: financeiroValido,
    custosConhecidos,
  };
}

/** Rotulagem exclusivamente contextual; não define piso empresarial de margem. */
export type SituacaoMargemDemo = "Boa margem" | "Atenção à margem" | "Margem baixa" | "Dados insuficientes" | "Sem comparação";

export function classificarMargemDemo(
  campanha: CampanhaResultadoDemo,
  comparaveis: CampanhaResultadoDemo[],
): SituacaoMargemDemo {
  const atual = calcularResultadoCampanha(campanha);
  if (atual?.margemContribuicaoCentavos === null || atual?.margemPercentual === null || !atual) {
    return "Dados insuficientes";
  }
  if (atual.margemContribuicaoCentavos <= 0) return "Margem baixa";

  const anterior = campanha.dados?.comparacaoAnterior;
  if (anterior && anterior.receitaLiquidaCentavos > 0 && Number.isFinite(anterior.margemContribuicaoCentavos)) {
    const margemAnteriorPercentual = anterior.margemContribuicaoCentavos / anterior.receitaLiquidaCentavos * 100;
    return atual.margemPercentual >= margemAnteriorPercentual ? "Boa margem" : "Atenção à margem";
  }

  const pares = comparaveis
    .filter((item) => item.id !== campanha.id)
    .map((item) => calcularResultadoCampanha(item)?.margemPercentual)
    .filter((valor): valor is number => valor !== null && valor !== undefined && Number.isFinite(valor));
  if (!pares.length) return "Sem comparação";
  const mediaPares = pares.reduce((total, valor) => total + valor, 0) / pares.length;
  return atual.margemPercentual >= mediaPares ? "Boa margem" : "Atenção à margem";
}

export function agregarResultados(campanhas: CampanhaResultadoDemo[]) {
  const resultados = campanhas.map((campanha) => ({ campanha, resultado: calcularResultadoCampanha(campanha) }));
  const comDados = resultados.filter(({ resultado }) => resultado !== null);
  const financeiros = comDados.filter(({ resultado }) => resultado!.dadosFinanceirosValidos);
  const margensConhecidas = financeiros.filter(({ resultado }) => resultado!.margemContribuicaoCentavos !== null);
  const soma = (valores: (number | null | undefined)[]) => valores.reduce<number>((total, valor) => total + (valor ?? 0), 0);
  const receitaBrutaCentavos = financeiros.length
    ? soma(financeiros.map(({ resultado }) => resultado!.receitaBrutaCentavos)) : null;
  const descontosCentavos = financeiros.length
    ? soma(financeiros.map(({ resultado }) => resultado!.descontosCentavos)) : null;
  const reembolsosCentavos = financeiros.length
    ? soma(financeiros.map(({ resultado }) => resultado!.reembolsosCentavos)) : null;
  const receitaLiquidaCentavos = financeiros.length
    ? soma(financeiros.map(({ resultado }) => resultado!.receitaLiquidaCentavos)) : null;
  const custosVariaveisCentavos = margensConhecidas.length
    ? soma(margensConhecidas.map(({ resultado }) => resultado!.custosVariaveisCentavos)) : null;
  const margemContribuicaoCentavos = margensConhecidas.length
    ? soma(margensConhecidas.map(({ resultado }) => resultado!.margemContribuicaoCentavos)) : null;
  const receitaBaseMargemCentavos = margensConhecidas.length
    ? soma(margensConhecidas.map(({ resultado }) => resultado!.receitaLiquidaCentavos)) : null;
  const pedidos = soma(comDados.map(({ campanha }) => campanha.dados!.pedidosAtribuidos));
  const pedidosComReceitaConhecida = soma(financeiros.map(({ campanha }) => campanha.dados!.pedidosAtribuidos));
  const alcancados = soma(comDados.map(({ campanha }) => campanha.dados!.alcancados));
  const incrementais = resultados.filter(({ resultado }) => resultado?.incrementalCentavos !== null && resultado?.incrementalCentavos !== undefined);
  const incrementalCentavos = incrementais.length
    ? soma(incrementais.map(({ resultado }) => resultado!.incrementalCentavos)) : null;

  return {
    campanhasComDados: comDados.length,
    campanhasComMargem: margensConhecidas.length,
    elegiveis: soma(comDados.map(({ campanha }) => campanha.dados!.elegiveis)),
    alcancados,
    pedidos,
    receitaBrutaCentavos,
    descontosCentavos,
    reembolsosCentavos,
    receitaLiquidaCentavos,
    custosVariaveisCentavos,
    margemContribuicaoCentavos,
    receitaBaseMargemCentavos,
    margemPercentual: margemContribuicaoCentavos !== null && receitaBaseMargemCentavos !== null && receitaBaseMargemCentavos > 0
      ? margemContribuicaoCentavos / receitaBaseMargemCentavos * 100 : null,
    conversaoPercentual: alcancados > 0 ? pedidos / alcancados * 100 : null,
    ticketMedioCentavos: pedidosComReceitaConhecida > 0 && receitaLiquidaCentavos !== null
      ? receitaLiquidaCentavos / pedidosComReceitaConhecida : null,
    incrementalCentavos,
    gruposControle: incrementais.length,
    dadosInsuficientes: campanhas.length - comDados.length,
  };
}

export type FiltrosResultados = {
  periodo: FiltroPeriodoResultado;
  campanha: string;
  segmento: "todos" | SegmentoResultado;
  status: "todos" | StatusFluxoResultado;
  desempenho: FiltroDesempenhoResultado;
};

const subtrairDias = (iso: string, dias: number) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - dias);
  return date.toISOString().slice(0, 10);
};

export function filtrarResultados(
  campanhas: CampanhaResultadoDemo[],
  filtros: FiltrosResultados,
  dataReferencia = DATA_REFERENCIA_RESULTADOS,
) {
  const dias = filtros.periodo === "todos" ? null : Number(filtros.periodo);
  const dataMinima = dias === null ? null : subtrairDias(dataReferencia, dias);
  const todasMetricas = campanhas.map((campanha) => calcularResultadoCampanha(campanha));
  const conversoes = todasMetricas.map((m) => m?.conversaoPercentual).filter((v): v is number => v !== null && v !== undefined);
  const conversaoMedia = conversoes.length ? conversoes.reduce((a,b) => a+b, 0) / conversoes.length : null;

  return campanhas.filter((campanha) => {
    const metricas = calcularResultadoCampanha(campanha);
    if (dataMinima && (campanha.fim < dataMinima || campanha.inicio > dataReferencia)) return false;
    if (filtros.campanha !== "todas" && campanha.id !== filtros.campanha) return false;
    if (filtros.segmento !== "todos" && campanha.segmento !== filtros.segmento) return false;
    if (filtros.status !== "todos" && campanha.statusFluxo !== filtros.status) return false;
    switch (filtros.desempenho) {
      case "com-dados": return metricas !== null;
      case "sem-dados": return metricas === null;
      case "abaixo-comparacao": return metricas?.variacaoMargemAnteriorCentavos !== null &&
        metricas?.variacaoMargemAnteriorCentavos !== undefined && metricas.variacaoMargemAnteriorCentavos < 0;
      case "conversao-inferior": return metricas?.conversaoPercentual !== null &&
        metricas?.conversaoPercentual !== undefined && conversaoMedia !== null && metricas.conversaoPercentual < conversaoMedia;
      default: return true;
    }
  });
}

export type CandidatoRecuperacaoDemo = {
  vip: boolean;
  recorrente: boolean;
};

function pertenceAoSegmentoRecuperacao(
  cliente: ClienteDemo,
  candidato: CandidatoRecuperacaoDemo,
  segmento: SegmentoResultado,
) {
  switch (segmento) {
    case "inativos_30": return cliente.diasSemComprar >= 30 && cliente.diasSemComprar < 60;
    case "inativos_60": return cliente.diasSemComprar >= 60 && cliente.diasSemComprar < 90;
    case "inativos_90": return cliente.diasSemComprar >= 90;
    case "vip": return candidato.vip;
    case "recorrentes": return candidato.recorrente;
    case "queda_frequencia": return cliente.segmento === "risco";
    case "reclamacoes": return cliente.origem === "Reclamação";
  }
}

export function resumirRecuperacao(
  clientes: ClienteDemo[],
  candidatos: Map<string, CandidatoRecuperacaoDemo>,
  segmentos: SegmentoResultado[],
) {
  return segmentos.map((segmento) => {
    const publico = clientes.filter((cliente) => {
      const candidato = candidatos.get(cliente.id);
      return candidato && pertenceAoSegmentoRecuperacao(cliente, candidato, segmento);
    });
    const retornaram = publico.filter((cliente) => cliente.status === "Recuperado");
    const comVinculo = retornaram.filter((cliente) =>
      cliente.historico.some((evento) => evento.tipo === "Campanha") &&
      cliente.historico.some((evento) => evento.tipo === "Retorno"),
    );
    const diasAntesRetorno = retornaram.length
      ? retornaram.reduce((total, cliente) => total + cliente.diasSemComprar, 0) / retornaram.length : null;
    return {
      segmento,
      clientesNoSegmento: publico.length,
      retornaram: retornaram.length,
      retornoComVinculoDemo: comVinculo.length,
      frequenciaQuatroMais: publico.length
        ? publico.filter((cliente) => cliente.totalPedidos >= 4).length / publico.length * 100 : null,
      mediaDiasInatividadeAntesRetorno: diasAntesRetorno,
    };
  });
}

/** Contagem única da base C1; o histórico temporal não prova causalidade. */
export function contarRecuperacaoUnica(clientes: ClienteDemo[]) {
  const retornaram = clientes.filter((cliente) => cliente.status === "Recuperado");
  const comVinculoDemo = retornaram.filter((cliente) =>
    cliente.historico.some((evento) => evento.tipo === "Campanha") &&
    cliente.historico.some((evento) => evento.tipo === "Retorno"),
  );
  return {
    retornaram: new Set(retornaram.map((cliente) => cliente.id)).size,
    comVinculoDemo: new Set(comVinculoDemo.map((cliente) => cliente.id)).size,
  };
}

/** Une os segmentos ativos nos filtros antes de contar IDs; segmentos podem se sobrepor. */
export function contarRecuperacaoPorSegmentos(
  clientes: ClienteDemo[],
  candidatos: Map<string, CandidatoRecuperacaoDemo>,
  segmentos: SegmentoResultado[],
) {
  const idsDoPublico = new Set(clientes.filter((cliente) => {
    const candidato = candidatos.get(cliente.id);
    return candidato && segmentos.some((segmento) => pertenceAoSegmentoRecuperacao(cliente, candidato, segmento));
  }).map((cliente) => cliente.id));
  return contarRecuperacaoUnica(clientes.filter((cliente) => idsDoPublico.has(cliente.id)));
}

export function alertasResultados(campanhas: CampanhaResultadoDemo[]) {
  const completas = campanhas
    .map((campanha) => ({ campanha, metricas: calcularResultadoCampanha(campanha) }))
    .filter(({ metricas }) => metricas?.dadosFinanceirosValidos);
  const alertas: { id: string; titulo: string; descricao: string; nivel: "atencao" | "info" | "critico" }[] = [];
  campanhas.filter((campanha) => campanha.dados === null).forEach((campanha) => {
    alertas.push({ id: `${campanha.id}-insuficiente`, titulo: "Dados insuficientes", descricao: `${campanha.nome}: faltam dados rastreáveis para estimar desempenho.`, nivel: "info" });
  });
  if (!completas.length) return alertas;
  const mediaDesconto = completas.reduce((soma, item) => {
    const metricas = item.metricas!;
    return soma + (metricas.receitaBrutaCentavos! > 0 ? metricas.descontosCentavos! / metricas.receitaBrutaCentavos! : 0);
  }, 0) / completas.length;
  const conversoes = completas.map((item) => item.metricas!.conversaoPercentual).filter((v): v is number => v !== null);
  const mediaConversao = conversoes.length ? conversoes.reduce((a,b) => a+b,0) / conversoes.length : null;

  for (const { campanha, metricas } of completas) {
    if (metricas!.margemContribuicaoCentavos !== null && metricas!.margemContribuicaoCentavos < 0) {
      alertas.push({ id: `${campanha.id}-margem-negativa`, titulo: "Margem de contribuição negativa", descricao: `${campanha.nome}: o valor após custos variáveis ficou negativo na simulação.`, nivel: "critico" });
    } else if (metricas!.variacaoMargemAnteriorCentavos !== null && metricas!.variacaoMargemAnteriorCentavos! < 0) {
      alertas.push({ id: `${campanha.id}-abaixo-periodo`, titulo: "Margem de contribuição abaixo da comparação", descricao: `${campanha.nome}: variação de contribuição ${formatarCentavos(metricas!.variacaoMargemAnteriorCentavos!)} frente ao período comparável demonstrativo.`, nivel: "atencao" });
    }
    if (metricas!.receitaBrutaCentavos! > 0 && metricas!.descontosCentavos! / metricas!.receitaBrutaCentavos! > mediaDesconto) {
      alertas.push({ id: `${campanha.id}-desconto`, titulo: "Desconto acima da média demonstrativa", descricao: `${campanha.nome}: ${formatarPercentual(metricas!.descontosCentavos! / metricas!.receitaBrutaCentavos! * 100)} do bruto, acima da média do conjunto.`, nivel: "atencao" });
    }
    if (mediaConversao !== null && metricas!.conversaoPercentual !== null && metricas!.conversaoPercentual < mediaConversao) {
      alertas.push({ id: `${campanha.id}-conversao`, titulo: "Conversão abaixo da média demonstrativa", descricao: `${campanha.nome}: ${formatarPercentual(metricas!.conversaoPercentual)} frente à média de ${formatarPercentual(mediaConversao)}.`, nivel: "info" });
    }
  }
  return alertas;
}

export function formatarCentavos(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "Dados insuficientes";
  return (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarPercentual(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "Dados insuficientes";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

export const EVOLUCAO_DEMO = [
  { periodo: "Set", receitaCentavos: 180_000, descontosCentavos: 18_000, margemCentavos: 68_000, recuperados: 9 },
  { periodo: "Out", receitaCentavos: 240_000, descontosCentavos: 26_000, margemCentavos: 86_000, recuperados: 12 },
  { periodo: "Nov", receitaCentavos: 100_000, descontosCentavos: 10_000, margemCentavos: 36_000, recuperados: 14 },
] as const;
