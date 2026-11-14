// ============================================================================
// Reembolsos e Estornos — R2-A: origens das solicitações (dados/regras puras).
// NÃO duplica regras financeiras: cada setor do ERP é mapeado para uma
// DadosNovaOperacao da R1 (validarNovaOperacao / criarOperacao / aplicarAcao).
// Tudo fictício: nenhum dado de cliente real é acessado, nada é gravado.
// ============================================================================

import type { DadosNovaOperacao } from "./dados";

// ---------------------------------------------------------------------------
// Catálogo das origens (mesma sessão demonstrativa; sem integração real).
// ---------------------------------------------------------------------------

export const ORIGEM_CLIENTE = "Meus Pedidos (Cliente)";
export const ORIGEM_ATENDENTE = "Central da Atendente";
export const ORIGEM_MOTOBOY = "App Motoboy";
export const ORIGEM_FUNCIONARIO = "Funcionários";
export const ORIGEM_COMPRAS = "Compras / Fornecedores";

export const ORIGENS_R2 = [
  ORIGEM_CLIENTE,
  ORIGEM_ATENDENTE,
  ORIGEM_MOTOBOY,
  ORIGEM_FUNCIONARIO,
  ORIGEM_COMPRAS,
] as const;

// ---------------------------------------------------------------------------
// Identidade fictícia do cliente da prévia (nada de dados reais).
// ---------------------------------------------------------------------------

export const CLIENTE_DEMO = "Ana Souza (cliente demo)";

/** Pedidos fictícios em que o cliente pode iniciar solicitação na prévia. */
export type PedidoDemo = {
  referencia: string;
  valorOriginal: number;
  formaPagamento: string;
  situacao: string;
};

/** Contexto de pedido autorizado: cliente só solicita nesses pedidos. */
export const PEDIDOS_AUTORIZADOS_CLIENTE: PedidoDemo[] = [
  {
    referencia: "#4598",
    valorOriginal: 180,
    formaPagamento: "Pix",
    situacao: "Entregue com item faltante (demonstrativo)",
  },
  {
    referencia: "#4605",
    valorOriginal: 95,
    formaPagamento: "Cartão de crédito",
    situacao: "Entregue (demonstrativo)",
  },
  {
    referencia: "#4608",
    valorOriginal: 210,
    formaPagamento: "Pix",
    situacao: "Cancelado após pagamento (demonstrativo)",
  },
];

/** Pedido autorizado ou null — pedidos fora desta lista bloqueiam a solicitação. */
export function pedidoAutorizadoCliente(referencia: string): PedidoDemo | null {
  return PEDIDOS_AUTORIZADOS_CLIENTE.find((p) => p.referencia === referencia.trim()) ?? null;
}

export type ProblemaCliente = "produto" | "entrega" | "cobranca";

export const LABEL_PROBLEMA: Record<ProblemaCliente, string> = {
  produto: "Problema com produto",
  entrega: "Problema com entrega",
  cobranca: "Problema com cobrança",
};

// ---------------------------------------------------------------------------
// Pessoas/setores fictícios das demais origens.
// ---------------------------------------------------------------------------

export const MOTOBYS_DEMO = ["Jonas Prado", "Rafael Costa"] as const;

export const TURNOS_DEMO = [
  "Turno Manhã (13/04)",
  "Turno Tarde (12/04)",
  "Turno Noite (12/04)",
  "Turno Noite (05/04)",
] as const;

export const FUNCIONARIOS_DEMO = [
  "Marina Duarte",
  "Tiago Alves",
  "Carlos Prado (produção)",
] as const;

export const GASTOS_FUNCIONARIO_DEMO = [
  "Insumos",
  "Embalagens",
  "Combustível",
  "Equipamento",
] as const;

export const FORNECEDORES_DEMO = [
  "Distribuidora Pão Bom",
  "Embalagens Já",
  "Frios & Cia Ltda",
] as const;

export type GastoMotoboy = "Troco pago com dinheiro próprio" | "Despesa autorizada";
export const GASTOS_MOTOBOY: GastoMotoboy[] = [
  "Troco pago com dinheiro próprio",
  "Despesa autorizada",
];

// ---------------------------------------------------------------------------
// Construtores puros — cada solicitação carrega origem + vínculo e usa o
// modelo DadosNovaOperacao da R1 sem nenhuma regra nova de dinheiro.
// ---------------------------------------------------------------------------

/** Cliente — Meus Pedidos: estorno em pedido autorizado (identidade fictícia). */
export function dadosCliente(entrada: {
  pedido: PedidoDemo;
  problema: ProblemaCliente;
  valor: number;
  motivo: string;
}): DadosNovaOperacao {
  return {
    tipo: "estorno_cliente",
    pessoa: CLIENTE_DEMO,
    referenciaTipo: "Pedido",
    referencia: entrada.pedido.referencia,
    valorOriginal: entrada.pedido.valorOriginal,
    valor: entrada.valor,
    motivo: `${LABEL_PROBLEMA[entrada.problema]}: ${entrada.motivo.trim()}`,
    formaPagamentoOriginal: entrada.pedido.formaPagamento,
    origem: ORIGEM_CLIENTE,
    solicitante: CLIENTE_DEMO,
  };
}

/** Central da Atendente: registra o motivo do cliente e encaminha ao responsável. */
export function dadosAtendente(entrada: {
  pedido: PedidoDemo;
  motivoCliente: string;
  valor: number;
}): DadosNovaOperacao {
  return {
    tipo: "estorno_cliente",
    pessoa: CLIENTE_DEMO,
    referenciaTipo: "Pedido",
    referencia: entrada.pedido.referencia,
    valorOriginal: entrada.pedido.valorOriginal,
    valor: entrada.valor,
    motivo: `Motivo informado pelo cliente: ${entrada.motivoCliente.trim()}`,
    formaPagamentoOriginal: entrada.pedido.formaPagamento,
    origem: ORIGEM_ATENDENTE,
    solicitante: "Central da Atendente",
  };
}

/** App Motoboy: turno/entrega, dinheiro próprio ou despesa autorizada, motivo e valor. */
export function dadosMotoboy(entrada: {
  motoboy: string;
  vinculoTipo: "Turno" | "Rota/Entrega";
  vinculo: string;
  gasto: GastoMotoboy;
  valor: number;
  motivo: string;
}): DadosNovaOperacao {
  return {
    tipo: "reembolso_motoboy",
    pessoa: entrada.motoboy.trim(),
    referenciaTipo: entrada.vinculoTipo,
    referencia: entrada.vinculo.trim(),
    valor: entrada.valor,
    motivo: `${entrada.gasto}: ${entrada.motivo.trim()}`,
    turno: entrada.vinculoTipo === "Turno" ? entrada.vinculo.trim() : undefined,
    origem: ORIGEM_MOTOBOY,
    solicitante: entrada.motoboy.trim(),
  };
}

/** Funcionários: compra/despesa da empresa, valor adiantado e justificativa. */
export function dadosFuncionario(entrada: {
  funcionario: string;
  referenciaTipo: "Compra" | "Despesa";
  referencia: string;
  tipoGasto: string;
  valor: number;
  justificativa: string;
}): DadosNovaOperacao {
  return {
    tipo: "reembolso_funcionario",
    pessoa: entrada.funcionario.trim(),
    referenciaTipo: entrada.referenciaTipo,
    referencia: entrada.referencia.trim(),
    valor: entrada.valor,
    motivo: `${entrada.tipoGasto}: ${entrada.justificativa.trim()}`,
    origem: ORIGEM_FUNCIONARIO,
    solicitante: entrada.funcionario.trim(),
  };
}

/** Compras/Fornecedores: compra relacionada, devolução/crédito, valor e motivo. */
export function dadosFornecedor(entrada: {
  fornecedor: string;
  compra: string;
  resolucao: "dinheiro" | "credito_futuro";
  valor: number;
  motivo: string;
}): DadosNovaOperacao {
  return {
    tipo: "credito_fornecedor",
    pessoa: entrada.fornecedor.trim(),
    referenciaTipo: "Compra",
    referencia: entrada.compra.trim(),
    valor: entrada.valor,
    motivo: entrada.motivo.trim(),
    resolucao: entrada.resolucao,
    origem: ORIGEM_COMPRAS,
    solicitante: "Compras (Diego)",
  };
}
