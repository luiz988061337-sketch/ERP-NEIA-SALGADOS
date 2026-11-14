// ============================================================================
// Reembolsos e Estornos — R1 (módulo demonstrativo, estado 100% local).
// Nenhuma gravação no Supabase; fixtures fictícias ancoradas em Abril/2025.
// Regras puras (transições, aprovação, duplicidade, auditoria, status
// financeiro x fiscal) para uso na interface e nos testes automatizados.
// ============================================================================

export const DATA_REFERENCIA = "2025-04-13";
export const HORA_PADRAO = "2025-04-13T12:00";
export const PERIODO_PADRAO = "2025-04";

/** Responsável autorizado demonstrativo: único perfil que pode aprovar/recusar. */
export const RESPONSAVEL_AUTORIZADO = "Neia (dono)";

// ---------------------------------------------------------------------------
// Tipos de operação — direção do dinheiro e classificação contábil futura.
// ---------------------------------------------------------------------------

export type TipoOperacao =
  | "estorno_cliente"
  | "reembolso_motoboy"
  | "reembolso_funcionario"
  | "credito_fornecedor";

export type DirecaoCaixa = "saida" | "entrada" | "credito";

export const TIPOS_OPERACAO: {
  valor: TipoOperacao;
  label: string;
  direcao: DirecaoCaixa;
  /** Classificação demonstrativa — NADA é gravado no Financeiro real. */
  classificacao: string;
}[] = [
  {
    valor: "estorno_cliente",
    label: "Estorno ao cliente",
    direcao: "saida",
    classificacao: "Futura redução da receita líquida vinculada ao pedido (não gerar despesa).",
  },
  {
    valor: "reembolso_motoboy",
    label: "Reembolso ao motoboy",
    direcao: "saida",
    classificacao: "Ressarcimento operacional: não duplicar despesa já contabilizada.",
  },
  {
    valor: "reembolso_funcionario",
    label: "Reembolso a funcionário",
    direcao: "saida",
    classificacao: "Ressarcimento de compra/despesa: não gerar segunda despesa igual.",
  },
  {
    valor: "credito_fornecedor",
    label: "Devolução / crédito de fornecedor",
    direcao: "entrada",
    classificacao: "Recuperação de valor: entrada ou crédito com fornecedor (não é nova venda).",
  },
];

export function dadosTipo(tipo: TipoOperacao) {
  const t = TIPOS_OPERACAO.find((x) => x.valor === tipo);
  if (!t) throw new Error(`Tipo de operação desconhecido: ${tipo}`);
  return t;
}

// ---------------------------------------------------------------------------
// Fluxo de status (11 estados) — sem saltos incoerentes.
// ---------------------------------------------------------------------------

export const STATUS_FLUXO = [
  "rascunho",
  "solicitado",
  "em_analise",
  "aguardando_aprovacao",
  "aprovado",
  "aguardando_pagamento",
  "pago_devolvido",
  "aguardando_comprovacao",
  "concluido",
  "recusado",
  "cancelado",
] as const;

export type StatusFluxo = (typeof STATUS_FLUXO)[number];

export const LABEL_STATUS: Record<StatusFluxo, string> = {
  rascunho: "Rascunho",
  solicitado: "Solicitado",
  em_analise: "Em análise",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  aguardando_pagamento: "Aguardando pagamento/devolução",
  pago_devolvido: "Pago/devolvido",
  aguardando_comprovacao: "Aguardando comprovação",
  concluido: "Concluído",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

const TERMINAIS: StatusFluxo[] = ["concluido", "recusado", "cancelado"];

export const TRANSICOES: Record<StatusFluxo, StatusFluxo[]> = {
  rascunho: ["solicitado", "cancelado"],
  solicitado: ["em_analise", "aguardando_aprovacao", "recusado", "cancelado"],
  em_analise: ["aguardando_aprovacao", "recusado", "cancelado"],
  aguardando_aprovacao: ["aprovado", "recusado", "cancelado"],
  aprovado: ["aguardando_pagamento", "aguardando_comprovacao", "cancelado"],
  aguardando_pagamento: ["pago_devolvido", "cancelado"],
  pago_devolvido: ["aguardando_comprovacao", "concluido"],
  aguardando_comprovacao: ["concluido"],
  concluido: [],
  recusado: [],
  cancelado: [],
};

export function podeTransicionar(de: StatusFluxo, para: StatusFluxo): boolean {
  return (TRANSICOES[de] ?? []).includes(para);
}

export function transicoesDisponiveis(de: StatusFluxo): StatusFluxo[] {
  return [...(TRANSICOES[de] ?? [])];
}

export function ehTerminal(status: StatusFluxo): boolean {
  return TERMINAIS.includes(status);
}

// ---------------------------------------------------------------------------
// Status financeiro e documental/fiscal — conceitos SEPARADOS.
// ---------------------------------------------------------------------------

export type StatusFinanceiro = "pendente" | "pago" | "devolvido" | "cancelado";
export type StatusFiscal =
  | "nao_aplicavel"
  | "aguardando_documento"
  | "em_conferencia"
  | "conferido"
  | "requer_atencao";

export const LABEL_FINANCEIRO: Record<StatusFinanceiro, string> = {
  pendente: "Pendente",
  pago: "Pago",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

export const LABEL_FISCAL: Record<StatusFiscal, string> = {
  nao_aplicavel: "Não aplicável",
  aguardando_documento: "Aguardando documento",
  em_conferencia: "Em conferência",
  conferido: "Conferido",
  requer_atencao: "Requer atenção",
};

export const STATUS_FISCAL_VALIDOS: StatusFiscal[] = [
  "nao_aplicavel",
  "aguardando_documento",
  "em_conferencia",
  "conferido",
  "requer_atencao",
];

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export type Comprovante = {
  id: string;
  nome: string;
  tipo: "pix" | "recibo" | "nota" | "foto" | "outro";
  observacao?: string | undefined;
  conferido: boolean;
};

export type EventoAuditoria = {
  id: string;
  dataHora: string;
  usuario: string;
  acao: string;
  detalhe?: string | undefined;
  valorAnterior?: number | undefined;
  valorNovo?: number | undefined;
};

export type Operacao = {
  id: string;
  tipo: TipoOperacao;
  status: StatusFluxo;
  origem: string;
  criadoEm: string;
  atualizadoEm: string;
  concluidoEm?: string | undefined;
  pagoEm?: string | undefined;
  /** Cliente, motoboy, funcionário ou fornecedor. */
  pessoa: string;
  referenciaTipo: string;
  referencia: string;
  /** Estorno: valor original do pedido. */
  valorOriginal?: number | undefined;
  /** Limite disponível (estorno) ou valor da compra/despesa (reembolso). */
  valorDisponivel: number;
  valorSolicitado: number;
  alcance?: "total" | "parcial" | undefined;
  motivo: string;
  formaPagamentoOriginal?: string | undefined;
  situacaoPedido?: string | undefined;
  turno?: string | undefined;
  tipoGasto?: string | undefined;
  solicitante: string;
  autorizadoPor?: string | undefined;
  aprovador?: string | undefined;
  aprovadoEm?: string | undefined;
  valorAprovado?: number | undefined;
  /** Verdadeiro quando houve alteração relevante após aprovação. */
  requerNovaAprovacao?: boolean | undefined;
  financeiro: StatusFinanceiro;
  fiscal: StatusFiscal;
  pagamentoReferencia?: string | undefined;
  /** Fornecedor: dinheiro devolvido ou crédito para compras futuras. */
  resolucao?: "dinheiro" | "credito_futuro" | undefined;
  comprovantes: Comprovante[];
  observacoes?: string | undefined;
  /** Histórico demonstrativo imutável na interface. */
  historico: EventoAuditoria[];
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

export function brl(v: number): string {
  return Number.isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

export function formatarDataHora(iso: string): string {
  const [data = "", hora = ""] = iso.split("T");
  if (!data) return "—";
  const [ano = "", mes = "", dia = ""] = data.split("-");
  return hora ? `${dia}/${mes}/${ano} ${hora}` : `${dia}/${mes}/${ano}`;
}

// ---------------------------------------------------------------------------
// Validação de nova solicitação — controle contra duplicidade.
// ---------------------------------------------------------------------------

export type DadosNovaOperacao = {
  tipo: TipoOperacao;
  pessoa: string;
  referenciaTipo: string;
  referencia: string;
  valor: number;
  valorOriginal?: number | undefined;
  motivo: string;
  formaPagamentoOriginal?: string | undefined;
  turno?: string | undefined;
  resolucao?: "dinheiro" | "credito_futuro" | undefined;
  origem: string;
  solicitante: string;
};

/** Mensagem de erro quando a solicitação é inválida/duplicada; null quando ok. */
export function validarNovaOperacao(
  existentes: Operacao[],
  nova: DadosNovaOperacao,
): string | null {
  if (!nova.pessoa.trim()) return "Informe a pessoa/empresa relacionada.";
  if (!(nova.valor > 0)) return "Informe um valor maior que zero.";
  if (nova.tipo === "estorno_cliente") {
    const original = nova.valorOriginal ?? 0;
    if (!(original > 0)) return "Informe o valor original do pedido.";
    if (nova.valor > original) {
      return `Estorno de ${brl(nova.valor)} é maior que o valor original do pedido (${brl(original)}).`;
    }
    const anteriores = existentes.filter(
      (o) =>
        o.tipo === "estorno_cliente" &&
        o.referencia === nova.referencia &&
        o.status !== "recusado" &&
        o.status !== "cancelado",
    );
    if (anteriores.some((o) => o.alcance === "total")) {
      return "Este pedido já possui estorno total registrada — segundo estorno total bloqueado.";
    }
    const devolvido = anteriores
      .filter((o) => o.financeiro === "devolvido" || o.financeiro === "pago")
      .reduce((s, o) => s + o.valorSolicitado, 0);
    const disponivel = original - devolvido;
    if (nova.valor > disponivel) {
      return `Estorno ultrapassa o valor disponível para devolução: restam ${brl(disponivel)} após devoluções já registradas.`;
    }
    const emAndamento = anteriores
      .filter((o) => !ehTerminal(o.status) && o.financeiro !== "pago" && o.financeiro !== "devolvido")
      .reduce((s, o) => s + o.valorSolicitado, 0);
    if (devolvido + emAndamento + nova.valor > original + 0.001) {
      return "A soma dos estornos (parciais e totais) ultrapassa o valor permitido do pedido.";
    }
    return null;
  }
  if (nova.tipo === "reembolso_motoboy" || nova.tipo === "reembolso_funcionario") {
    const duplicado = existentes.some(
      (o) =>
        o.tipo === nova.tipo &&
        o.pessoa === nova.pessoa &&
        o.referencia === nova.referencia &&
        Math.abs(o.valorSolicitado - nova.valor) < 0.005 &&
        !ehTerminal(o.status),
    );
    if (duplicado) {
      return "Já existe solicitação igual para esta pessoa e referência — possível pagamento duplicado bloqueado.";
    }
  }
  return null;
}

/** Cria a operação (estado local) após validação, com auditoria de criação. */
export function criarOperacao(
  existentes: Operacao[],
  nova: DadosNovaOperacao,
  agora = HORA_PADRAO,
): { ok: true; operacao: Operacao } | { ok: false; erro: string } {
  const erro = validarNovaOperacao(existentes, nova);
  if (erro) return { ok: false, erro };
  const tipo = dadosTipo(nova.tipo);
  const proximo = existentes.length + 1;
  const operacao: Operacao = {
    id: `RE-${String(proximo).padStart(4, "0")}`,
    tipo: nova.tipo,
    status: "solicitado",
    origem: nova.origem,
    criadoEm: agora,
    atualizadoEm: agora,
    pessoa: nova.pessoa.trim(),
    referenciaTipo: nova.referenciaTipo,
    referencia: nova.referencia.trim() || "—",
    valorOriginal: nova.valorOriginal,
    valorDisponivel:
      nova.tipo === "estorno_cliente" ? (nova.valorOriginal ?? nova.valor) : nova.valor,
    valorSolicitado: nova.valor,
    alcance: nova.tipo === "estorno_cliente" ? (nova.valor === nova.valorOriginal ? "total" : "parcial") : undefined,
    motivo: nova.motivo.trim(),
    formaPagamentoOriginal: nova.formaPagamentoOriginal,
    turno: nova.turno,
    resolucao: nova.resolucao,
    solicitante: nova.solicitante.trim() || "Equipe",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    financeiro: "pendente",
    fiscal:
      nova.tipo === "credito_fornecedor" && nova.resolucao === "credito_futuro"
        ? "nao_aplicavel"
        : "aguardando_documento",
    comprovantes: [],
    historico: [
      {
        id: "ev-1",
        dataHora: agora,
        usuario: nova.solicitante.trim() || "Equipe",
        acao: "Criação",
        detalhe: `Solicitação de ${tipo.label.toLowerCase()} criada na prévia (dados locais).`,
      },
      {
        id: "ev-2",
        dataHora: agora,
        usuario: nova.solicitante.trim() || "Equipe",
        acao: "Solicitação",
        detalhe: `Enviada para aprovação de ${RESPONSAVEL_AUTORIZADO}.`,
      },
    ],
  };
  return { ok: true, operacao };
}

// ---------------------------------------------------------------------------
// Ações sobre uma operação existente — redução pura com auditoria.
// ---------------------------------------------------------------------------

export type Acao =
  | { tipo: "solicitar"; usuario: string }
  | { tipo: "enviar_analise"; usuario: string }
  | { tipo: "enviar_aprovacao"; usuario: string }
  | { tipo: "aprovar"; usuario: string; autorizado: boolean }
  | { tipo: "recusar"; usuario: string; autorizado: boolean; motivo: string }
  | { tipo: "enviar_pagamento"; usuario: string }
  | { tipo: "registrar_pagamento"; usuario: string; referencia: string }
  | { tipo: "solicitar_comprovacao"; usuario: string }
  | { tipo: "incluir_comprovante"; usuario: string; comprovante: { nome: string; tipo: Comprovante["tipo"]; observacao?: string | undefined } }
  | { tipo: "conferir_comprovante"; usuario: string; id: string; conferido: boolean }
  | { tipo: "atualizar_fiscal"; usuario: string; status: StatusFiscal }
  | { tipo: "alterar_valor"; usuario: string; valor: number }
  | { tipo: "concluir"; usuario: string }
  | { tipo: "cancelar"; usuario: string; motivo: string };

export type ResultadoAcao =
  | { ok: true; operacao: Operacao; mensagem?: string | undefined }
  | { ok: false; erro: string };

/** Pagamento/devolução a registrar conforme o tipo da operação. */
export function statusFinanceiroDoPagamento(tipo: TipoOperacao): "pago" | "devolvido" {
  return tipo === "reembolso_motoboy" || tipo === "reembolso_funcionario" ? "pago" : "devolvido";
}

export function aplicarAcao(op: Operacao, acao: Acao, agora = HORA_PADRAO): ResultadoAcao {
  const falha = (erro: string): ResultadoAcao => ({ ok: false, erro });
  const base: Operacao = {
    ...op,
    comprovantes: [...op.comprovantes],
    historico: [...op.historico],
  };
  const registrar = (
    usuario: string,
    acaoNome: string,
    detalhe?: string,
    valores?: { anterior: number; novo: number },
  ) => {
    base.historico.push({
      id: `ev-${base.historico.length + 1}`,
      dataHora: agora,
      usuario,
      acao: acaoNome,
      detalhe,
      valorAnterior: valores?.anterior,
      valorNovo: valores?.novo,
    });
  };
  const ok = (mensagem?: string): ResultadoAcao => ({
    ok: true,
    operacao: { ...base, atualizadoEm: agora },
    mensagem,
  });

  switch (acao.tipo) {
    case "solicitar": {
      if (op.status !== "rascunho") return falha("Somente rascunhos podem ser solicitados.");
      base.status = "solicitado";
      registrar(acao.usuario, "Solicitação", "Enviada para análise do responsável.");
      return ok();
    }
    case "enviar_analise": {
      if (!podeTransicionar(op.status, "em_analise")) {
        return falha("Transição inválida: solicitação não está aguardando análise.");
      }
      base.status = "em_analise";
      registrar(acao.usuario, "Envio para análise");
      return ok();
    }
    case "enviar_aprovacao": {
      if (!podeTransicionar(op.status, "aguardando_aprovacao")) {
        return falha("Transição inválida: apenas solicitações em análise vão para aprovação.");
      }
      base.status = "aguardando_aprovacao";
      base.autorizadoPor = base.autorizadoPor ?? RESPONSAVEL_AUTORIZADO;
      registrar(acao.usuario, "Envio para aprovação", `Responsável: ${base.autorizadoPor}.`);
      return ok();
    }
    case "aprovar": {
      if (op.status !== "aguardando_aprovacao") {
        return falha("Aprovação disponível apenas para solicitações aguardando aprovação.");
      }
      if (!acao.autorizado) {
        return falha("Somente um responsável autorizado pode aprovar.");
      }
      base.status = "aprovado";
      base.aprovador = acao.usuario;
      base.aprovadoEm = agora;
      base.valorAprovado = base.valorSolicitado;
      base.requerNovaAprovacao = false;
      registrar(acao.usuario, "Aprovação", `Valor aprovado: ${brl(base.valorSolicitado)}.`);
      return ok();
    }
    case "recusar": {
      if (op.status !== "aguardando_aprovacao") {
        return falha("Recusa disponível apenas para solicitações aguardando aprovação.");
      }
      if (!acao.autorizado) {
        return falha("Somente um responsável autorizado pode recusar.");
      }
      base.status = "recusado";
      registrar(acao.usuario, "Recusa", `Motivo: ${acao.motivo || "não informado"}.`);
      return ok();
    }
    case "enviar_pagamento": {
      if (!podeTransicionar(op.status, "aguardando_pagamento")) {
        return falha("Envio para pagamento disponível apenas para operações aprovadas.");
      }
      base.status = "aguardando_pagamento";
      registrar(
        acao.usuario,
        "Envio para pagamento/devolução",
        `Aguardando registro de ${statusFinanceiroDoPagamento(op.tipo) === "pago" ? "pagamento" : "devolução"}.`,
      );
      return ok();
    }
    case "registrar_pagamento": {
      if (op.financeiro === "pago" || op.financeiro === "devolvido") {
        return falha("Pagamento/devolução já registrada — pagamento duplicado bloqueado.");
      }
      if (!podeTransicionar(op.status, "pago_devolvido")) {
        return falha("Pagamento disponível apenas quando a operação aguarda pagamento/devolução.");
      }
      const situacao = statusFinanceiroDoPagamento(op.tipo);
      base.financeiro = situacao;
      base.status = "pago_devolvido";
      base.pagoEm = agora;
      base.pagamentoReferencia = acao.referencia.trim() || "—";
      registrar(
        acao.usuario,
        situacao === "pago" ? "Pagamento" : "Devolução",
        `Referência: ${base.pagamentoReferencia}. Valor: ${brl(base.valorSolicitado)}.`,
      );
      return ok();
    }
    case "solicitar_comprovacao": {
      if (!podeTransicionar(op.status, "aguardando_comprovacao")) {
        return falha("Comprovação só pode ser solicitada após aprovação ou pagamento/devolução.");
      }
      base.status = "aguardando_comprovacao";
      registrar(acao.usuario, "Solicitação de comprovação");
      return ok();
    }
    case "incluir_comprovante": {
      const permitidos: StatusFluxo[] = [
        "aprovado",
        "aguardando_pagamento",
        "pago_devolvido",
        "aguardando_comprovacao",
      ];
      if (!permitidos.includes(op.status)) {
        return falha("Comprovantes podem ser incluídos após a aprovação da operação.");
      }
      if (!acao.comprovante.nome.trim()) return falha("Informe a identificação do comprovante.");
      base.comprovantes.push({
        id: `cp-${base.comprovantes.length + 1}`,
        nome: acao.comprovante.nome.trim(),
        tipo: acao.comprovante.tipo,
        observacao: acao.comprovante.observacao,
        conferido: false,
      });
      if (base.fiscal === "nao_aplicavel") base.fiscal = "aguardando_documento";
      else if (base.fiscal === "aguardando_documento") base.fiscal = "em_conferencia";
      registrar(acao.usuario, "Inclusão de comprovante", acao.comprovante.nome.trim());
      return ok();
    }
    case "conferir_comprovante": {
      const alvo = base.comprovantes.find((c) => c.id === acao.id);
      if (!alvo) return falha("Comprovante não encontrado.");
      alvo.conferido = acao.conferido;
      const todos = base.comprovantes.length > 0 && base.comprovantes.every((c) => c.conferido);
      if (todos) base.fiscal = "conferido";
      else if (base.fiscal === "conferido" || base.fiscal === "nao_aplicavel") {
        base.fiscal = "em_conferencia";
      }
      registrar(
        acao.usuario,
        acao.conferido ? "Conferência documental" : "Conferência reaberta",
        `${alvo.nome}: ${acao.conferido ? "conferido" : "pendente"}.`,
      );
      return ok();
    }
    case "atualizar_fiscal": {
      if (!STATUS_FISCAL_VALIDOS.includes(acao.status)) return falha("Status documental inválido.");
      const anterior = base.fiscal;
      base.fiscal = acao.status;
      registrar(
        acao.usuario,
        "Atualização documental/fiscal",
        `${LABEL_FISCAL[anterior]} → ${LABEL_FISCAL[acao.status]}.`,
      );
      return ok();
    }
    case "alterar_valor": {
      if (!(acao.valor > 0)) return falha("Informe um valor maior que zero.");
      if (acao.valor > base.valorDisponivel) {
        return falha(
          `Valor de ${brl(acao.valor)} ultrapassa o limite disponível (${brl(base.valorDisponivel)}).`,
        );
      }
      if (base.financeiro === "pago" || base.financeiro === "devolvido") {
        return falha("Valor não pode ser alterado após pagamento/devolução registrada.");
      }
      const anterior = base.valorSolicitado;
      if (acao.valor === anterior) return ok("Valor informado igual ao atual — nada alterado.");
      base.valorSolicitado = acao.valor;
      base.alcance = acao.valor === (base.valorOriginal ?? base.valorDisponivel) ? "total" : "parcial";
      let mensagem: string | undefined;
      if (base.aprovadoEm && acao.valor !== base.valorAprovado) {
        base.requerNovaAprovacao = true;
        base.status = "aguardando_aprovacao";
        mensagem =
          "Alteração relevante após aprovação: nova aprovação do responsável autorizado exigida.";
      }
      registrar(
        acao.usuario,
        "Edição de valor",
        mensagem ?? `Valor atualizado para ${brl(acao.valor)}.`,
        { anterior, novo: acao.valor },
      );
      return ok(mensagem);
    }
    case "concluir": {
      if (!podeTransicionar(op.status, "concluido")) {
        return falha("Conclusão disponível apenas após pagamento/devolução ou comprovação.");
      }
      if (base.financeiro !== "pago" && base.financeiro !== "devolvido") {
        return falha(
          "Conclusão exige pagamento/devolução registrada — não há segundo registro financeiro para a mesma conclusão.",
        );
      }
      base.status = "concluido";
      base.concluidoEm = agora;
      const pendenciaDocumental =
        base.fiscal === "aguardando_documento" ||
        base.fiscal === "em_conferencia" ||
        base.fiscal === "requer_atencao";
      registrar(
        acao.usuario,
        "Conclusão",
        pendenciaDocumental
          ? "Concluída financeiramente; pendência documental/fiscal permanece em aberto."
          : "Concluída financeira e documentalmente.",
      );
      return ok(
        pendenciaDocumental
          ? "Operação concluída financeiramente. Pendência documental permanece registrada — nada é declarado como regularidade fiscal."
          : undefined,
      );
    }
    case "cancelar": {
      if (!podeTransicionar(op.status, "cancelado")) {
        return falha("Operações concluídas, recusadas ou pagas não podem ser canceladas.");
      }
      if (base.financeiro === "pago" || base.financeiro === "devolvido") {
        return falha("Operação com pagamento/devolução registrada não pode ser cancelada.");
      }
      base.status = "cancelado";
      registrar(acao.usuario, "Cancelamento", `Motivo: ${acao.motivo || "não informado"}.`);
      return ok();
    }
  }
}

// ---------------------------------------------------------------------------
// Indicadores e filtros
// ---------------------------------------------------------------------------

export type Indicadores = {
  abertas: number;
  aguardandoAprovacao: number;
  aguardandoPagamento: number;
  pendenciasComprovacao: number;
  concluidasPeriodo: number;
  totalReembolsado: number;
};

export function calcularIndicadores(ops: Operacao[], periodo: string): Indicadores {
  const noPeriodo = (iso?: string) => Boolean(iso) && (iso as string).slice(0, 7) === periodo;
  const exigeDocumento = (o: Operacao) =>
    o.fiscal === "aguardando_documento" ||
    o.fiscal === "em_conferencia" ||
    o.fiscal === "requer_atencao";
  return {
    abertas: ops.filter((o) => !ehTerminal(o.status)).length,
    aguardandoAprovacao: ops.filter(
      (o) => o.status === "aguardando_aprovacao" || (o.status === "aprovado" && o.requerNovaAprovacao),
    ).length,
    aguardandoPagamento: ops.filter((o) => o.status === "aguardando_pagamento").length,
    pendenciasComprovacao: ops.filter(
      (o) => o.status === "aguardando_comprovacao" || (exigeDocumento(o) && (o.financeiro === "pago" || o.financeiro === "devolvido")),
    ).length,
    concluidasPeriodo: ops.filter((o) => o.status === "concluido" && noPeriodo(o.concluidoEm ?? o.atualizadoEm))
      .length,
    totalReembolsado: ops
      .filter(
        (o) =>
          (o.financeiro === "pago" || o.financeiro === "devolvido") &&
          noPeriodo(o.pagoEm ?? o.atualizadoEm),
      )
      .reduce((s, o) => s + o.valorSolicitado, 0),
  };
}

export type Filtros = {
  periodo: string;
  tipo: string;
  status: string;
  responsavel: string;
  origem: string;
  busca: string;
};

export function filtrarOperacoes(ops: Operacao[], f: Filtros): Operacao[] {
  const termo = f.busca.trim().toLowerCase();
  return ops.filter((o) => {
    if (f.periodo !== "todos" && o.criadoEm.slice(0, 7) !== f.periodo) return false;
    if (f.tipo !== "todos" && o.tipo !== f.tipo) return false;
    if (f.status !== "todos" && o.status !== f.status) return false;
    if (f.origem !== "todos" && o.origem !== f.origem) return false;
    if (f.responsavel !== "todos" && o.solicitante !== f.responsavel && o.aprovador !== f.responsavel) {
      return false;
    }
    if (
      termo &&
      ![o.id, o.pessoa, o.referencia, o.motivo].some((campo) =>
        campo.toLowerCase().includes(termo),
      )
    ) {
      return false;
    }
    return true;
  });
}

export function origensExistentes(ops: Operacao[]): string[] {
  return [...new Set(ops.map((o) => o.origem))].sort();
}

export function responsaveisExistentes(ops: Operacao[]): string[] {
  return [
    ...new Set(ops.flatMap((o) => [o.solicitante, o.aprovador].filter(Boolean) as string[])),
  ].sort();
}

/** Estornos já registrados por pedido — usado para limites e conferência. */
export function devolvidoDoPedido(existentes: Operacao[], referencia: string): number {
  return existentes
    .filter(
      (o) =>
        o.tipo === "estorno_cliente" &&
        o.referencia === referencia &&
        (o.financeiro === "pago" || o.financeiro === "devolvido"),
    )
    .reduce((s, o) => s + o.valorSolicitado, 0);
}

// ---------------------------------------------------------------------------
// Fixtures demonstrativas (10 operações, todos os tipos e estados-chave)
// ---------------------------------------------------------------------------

function ev(
  id: string,
  dataHora: string,
  usuario: string,
  acao: string,
  detalhe?: string,
  valores?: { anterior: number; novo: number },
): EventoAuditoria {
  return { id, dataHora, usuario, acao, detalhe, valorAnterior: valores?.anterior, valorNovo: valores?.novo };
}

export const OPERACOES_INICIAIS: Operacao[] = [
  {
    id: "RE-0001",
    tipo: "estorno_cliente",
    status: "aguardando_aprovacao",
    origem: "Atendimento",
    criadoEm: "2025-04-12T09:30",
    atualizadoEm: "2025-04-12T18:40",
    pessoa: "Ana Souza",
    referenciaTipo: "Pedido",
    referencia: "#4598",
    valorOriginal: 180,
    valorDisponivel: 180,
    valorSolicitado: 80,
    alcance: "parcial",
    motivo: "Item faltante na entrega (coca-cola 2L não acompanhada).",
    formaPagamentoOriginal: "Pix",
    situacaoPedido: "Entregue com item faltante",
    solicitante: "Beatriz (Atendimento)",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    financeiro: "pendente",
    fiscal: "aguardando_documento",
    comprovantes: [],
    observacoes: "Cliente pediu devolução parcial via Pix.",
    historico: [
      ev("ev-1", "2025-04-12T09:30", "Beatriz (Atendimento)", "Criação", "Estorno parcial aberto após contato do cliente."),
      ev("ev-2", "2025-04-12T10:05", "Beatriz (Atendimento)", "Solicitação", "Enviada para aprovação de Neia (dono)."),
      ev("ev-3", "2025-04-12T18:40", "Sistema", "Envio para aprovação", "Aguardando responsável autorizado."),
    ],
  },
  {
    id: "RE-0002",
    tipo: "estorno_cliente",
    status: "pago_devolvido",
    origem: "PDV",
    criadoEm: "2025-04-08T14:00",
    atualizadoEm: "2025-04-10T14:20",
    pessoa: "Carlos Lima",
    referenciaTipo: "Pedido",
    referencia: "#4512",
    valorOriginal: 96,
    valorDisponivel: 96,
    valorSolicitado: 96,
    alcance: "total",
    motivo: "Pedido cancelado após aprovação — mercadoria não disponível.",
    formaPagamentoOriginal: "Cartão de crédito",
    situacaoPedido: "Cancelado antes do envio",
    solicitante: "Beatriz (Atendimento)",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    aprovador: RESPONSAVEL_AUTORIZADO,
    aprovadoEm: "2025-04-08T16:10",
    valorAprovado: 96,
    financeiro: "devolvido",
    fiscal: "em_conferencia",
    pagoEm: "2025-04-10T14:20",
    pagamentoReferencia: "PIX-99812",
    comprovantes: [
      { id: "cp-1", nome: "Comprovante Pix de devolução (demonstrativo)", tipo: "pix", conferido: false },
      { id: "cp-2", nome: "Registro do cancelamento no pedido (demonstrativo)", tipo: "outro", conferido: false },
    ],
    historico: [
      ev("ev-1", "2025-04-08T14:00", "Beatriz (Atendimento)", "Criação", "Estorno total solicitado pelo cliente."),
      ev("ev-2", "2025-04-08T16:10", RESPONSAVEL_AUTORIZADO, "Aprovação", "Valor aprovado: R$ 96,00."),
      ev("ev-3", "2025-04-10T14:20", RESPONSAVEL_AUTORIZADO, "Devolução", "Referência: PIX-99812. Valor: R$ 96,00."),
      ev("ev-4", "2025-04-10T14:21", "Sistema", "Inclusão de comprovante", "Comprovante Pix de devolução."),
    ],
  },
  {
    id: "RE-0003",
    tipo: "reembolso_motoboy",
    status: "concluido",
    origem: "Central de Entregas",
    criadoEm: "2025-04-05T22:10",
    atualizadoEm: "2025-04-07T11:00",
    pessoa: "Jonas Prado",
    referenciaTipo: "Rota/Entrega",
    referencia: "Rota Centro #312",
    valorDisponivel: 47.5,
    valorSolicitado: 47.5,
    motivo: "Troco pago com dinheiro próprio em entrega do turno da noite.",
    turno: "Noite (05/04)",
    tipoGasto: "Troco pago com dinheiro próprio",
    solicitante: "Jonas Prado",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    aprovador: RESPONSAVEL_AUTORIZADO,
    aprovadoEm: "2025-04-06T09:00",
    valorAprovado: 47.5,
    financeiro: "pago",
    fiscal: "conferido",
    pagoEm: "2025-04-06T15:30",
    pagamentoReferencia: "PIX-99501",
    comprovantes: [
      { id: "cp-1", nome: "Recibo assinado pelo motoboy (demonstrativo)", tipo: "recibo", conferido: true },
    ],
    observacoes: "Fechamento do turno confirmou diferença de troco de R$ 47,50.",
    historico: [
      ev("ev-1", "2025-04-05T22:10", "Jonas Prado", "Criação", "Reembolso de troco do turno noite."),
      ev("ev-2", "2025-04-06T09:00", RESPONSAVEL_AUTORIZADO, "Aprovação", "Valor aprovado: R$ 47,50."),
      ev("ev-3", "2025-04-06T15:30", RESPONSAVEL_AUTORIZADO, "Pagamento", "Referência: PIX-99501. Valor: R$ 47,50."),
      ev("ev-4", "2025-04-07T11:00", "Contador (demo)", "Conferência documental", "Recibo conferido."),
      ev("ev-5", "2025-04-07T11:05", "Contador (demo)", "Conclusão", "Concluída financeira e documentalmente."),
    ],
  },
  {
    id: "RE-0004",
    tipo: "reembolso_motoboy",
    status: "aguardando_aprovacao",
    origem: "Central de Entregas",
    criadoEm: "2025-04-12T20:15",
    atualizadoEm: "2025-04-12T20:20",
    pessoa: "Rafael Costa",
    referenciaTipo: "Turno",
    referencia: "Turno Tarde 12/04",
    valorDisponivel: 60,
    valorSolicitado: 60,
    motivo: "Despesa autorizada: conserto de pneu da moto durante a rota.",
    turno: "Tarde (12/04)",
    tipoGasto: "Despesa autorizada",
    solicitante: "Rafael Costa",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    financeiro: "pendente",
    fiscal: "aguardando_documento",
    comprovantes: [
      { id: "cp-1", nome: "Foto do recibo do borracheiro (demonstrativo)", tipo: "foto", conferido: false },
    ],
    historico: [
      ev("ev-1", "2025-04-12T20:15", "Rafael Costa", "Criação", "Despesa autorizada informada pelo supervisor."),
      ev("ev-2", "2025-04-12T20:20", "Supervisão", "Envio para aprovação", "Aguardando Neia (dono)."),
    ],
  },
  {
    id: "RE-0005",
    tipo: "reembolso_funcionario",
    status: "aguardando_comprovacao",
    origem: "Operacional",
    criadoEm: "2025-04-09T08:40",
    atualizadoEm: "2025-04-11T10:15",
    pessoa: "Marina Duarte",
    referenciaTipo: "Compra",
    referencia: "Compra emergencial #1048",
    valorDisponivel: 38.9,
    valorSolicitado: 38.9,
    motivo: "Compra emergencial de fermento para produção do dia.",
    tipoGasto: "Insumos",
    solicitante: "Marina Duarte",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    aprovador: RESPONSAVEL_AUTORIZADO,
    aprovadoEm: "2025-04-09T12:00",
    valorAprovado: 38.9,
    financeiro: "pago",
    fiscal: "aguardando_documento",
    pagoEm: "2025-04-10T09:00",
    pagamentoReferencia: "PIX-99730",
    comprovantes: [],
    observacoes: "Despesa já contabilizada como insumo — reembolso é ressarcimento, não nova despesa.",
    historico: [
      ev("ev-1", "2025-04-09T08:40", "Marina Duarte", "Criação", "Reembolso de compra emergencial."),
      ev("ev-2", "2025-04-09T12:00", RESPONSAVEL_AUTORIZADO, "Aprovação", "Valor aprovado: R$ 38,90."),
      ev("ev-3", "2025-04-10T09:00", RESPONSAVEL_AUTORIZADO, "Pagamento", "Referência: PIX-99730. Valor: R$ 38,90."),
      ev("ev-4", "2025-04-11T10:15", "Contador (demo)", "Solicitação de comprovação", "Aguardando nota fiscal."),
    ],
  },
  {
    id: "RE-0006",
    tipo: "reembolso_funcionario",
    status: "recusado",
    origem: "Operacional",
    criadoEm: "2025-04-03T17:20",
    atualizadoEm: "2025-04-04T09:10",
    pessoa: "Tiago Alves",
    referenciaTipo: "Despesa",
    referencia: "Combustível entregas extras",
    valorDisponivel: 85,
    valorSolicitado: 85,
    motivo: "Combustível usado em entregas extras do fim de semana.",
    tipoGasto: "Despesa autorizada",
    solicitante: "Tiago Alves",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    financeiro: "pendente",
    fiscal: "nao_aplicavel",
    comprovantes: [],
    observacoes: "Sem comprovante e sem autorização prévia da supervisão.",
    historico: [
      ev("ev-1", "2025-04-03T17:20", "Tiago Alves", "Criação", "Reembolso informado sem comprovante."),
      ev("ev-2", "2025-04-04T09:10", RESPONSAVEL_AUTORIZADO, "Recusa", "Motivo: sem comprovante e sem autorização prévia."),
    ],
  },
  {
    id: "RE-0007",
    tipo: "credito_fornecedor",
    status: "em_analise",
    origem: "Compras",
    criadoEm: "2025-04-11T15:45",
    atualizadoEm: "2025-04-11T17:00",
    pessoa: "Distribuidora Pão Bom",
    referenciaTipo: "Compra",
    referencia: "Compra #1042",
    valorDisponivel: 120,
    valorSolicitado: 120,
    motivo: "Farinha 25kg devolvida por avaria na embalagem.",
    resolucao: "dinheiro",
    solicitante: "Compras (Diego)",
    financeiro: "pendente",
    fiscal: "aguardando_documento",
    comprovantes: [],
    observacoes: "Aguardando posicionamento do fornecedor sobre devolução em dinheiro.",
    historico: [
      ev("ev-1", "2025-04-11T15:45", "Compras (Diego)", "Criação", "Devolução de insumo avariado."),
      ev("ev-2", "2025-04-11T17:00", "Supervisão", "Envio para análise", "Conferindo recolhimento e crédito."),
    ],
  },
  {
    id: "RE-0008",
    tipo: "credito_fornecedor",
    status: "concluido",
    origem: "Compras",
    criadoEm: "2025-03-28T10:30",
    atualizadoEm: "2025-04-02T16:45",
    pessoa: "Embalagens Já",
    referenciaTipo: "Compra",
    referencia: "Compra #1035",
    valorDisponivel: 95,
    valorSolicitado: 95,
    motivo: "Caixas entregues em formato errado — crédito para próxima compra.",
    resolucao: "credito_futuro",
    solicitante: "Compras (Diego)",
    autorizadoPor: RESPONSAVEL_AUTORIZADO,
    aprovador: RESPONSAVEL_AUTORIZADO,
    aprovadoEm: "2025-03-28T14:00",
    valorAprovado: 95,
    financeiro: "pendente",
    fiscal: "conferido",
    concluidoEm: "2025-04-02T16:45",
    comprovantes: [
      { id: "cp-1", nome: "E-mail do fornecedor confirmando crédito (demonstrativo)", tipo: "outro", conferido: true },
    ],
    observacoes: "Crédito futuro: não é entrada de dinheiro — abaterá na compra #1050.",
    historico: [
      ev("ev-1", "2025-03-28T10:30", "Compras (Diego)", "Criação", "Crédito solicitado ao fornecedor."),
      ev("ev-2", "2025-03-28T14:00", RESPONSAVEL_AUTORIZADO, "Aprovação", "Crédito de R$ 95,00 aprovado."),
      ev("ev-3", "2025-04-02T16:45", "Compras (Diego)", "Conclusão", "Crédito registrado; sem movimento de caixa."),
    ],
  },
  {
    id: "RE-0009",
    tipo: "estorno_cliente",
    status: "rascunho",
    origem: "Atendimento",
    criadoEm: "2025-04-13T08:20",
    atualizadoEm: "2025-04-13T08:20",
    pessoa: "Pedro Ramos",
    referenciaTipo: "Pedido",
    referencia: "#4601",
    valorOriginal: 145,
    valorDisponivel: 145,
    valorSolicitado: 145,
    alcance: "total",
    motivo: "Cliente alegou produto frio — em verificação interna.",
    formaPagamentoOriginal: "Pix",
    situacaoPedido: "Entregue",
    solicitante: "Beatriz (Atendimento)",
    financeiro: "pendente",
    fiscal: "nao_aplicavel",
    comprovantes: [],
    observacoes: "Rascunho: aguardando conferência do chat de entrega antes de solicitar.",
    historico: [
      ev("ev-1", "2025-04-13T08:20", "Beatriz (Atendimento)", "Criação", "Rascunho salvo localmente."),
    ],
  },
  {
    id: "RE-0010",
    tipo: "reembolso_motoboy",
    status: "cancelado",
    origem: "Central de Entregas",
    criadoEm: "2025-04-06T21:00",
    atualizadoEm: "2025-04-06T21:30",
    pessoa: "Jonas Prado",
    referenciaTipo: "Rota/Entrega",
    referencia: "Rota Centro #312",
    valorDisponivel: 47.5,
    valorSolicitado: 47.5,
    motivo: "Registro duplicado do troco do turno da noite.",
    turno: "Noite (05/04)",
    tipoGasto: "Troco pago com dinheiro próprio",
    solicitante: "Supervisão",
    financeiro: "pendente",
    fiscal: "nao_aplicavel",
    comprovantes: [],
    observacoes: "Duplicidade detectada contra RE-0003 — registro cancelado.",
    historico: [
      ev("ev-1", "2025-04-06T21:00", "Supervisão", "Criação", "Registro duplicado aberto por engano."),
      ev("ev-2", "2025-04-06T21:30", RESPONSAVEL_AUTORIZADO, "Cancelamento", "Motivo: duplicidade com RE-0003."),
    ],
  },
];
