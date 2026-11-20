/**
 * Fixtures exclusivas do Preview de homologação (H18-A/H18-B).
 * Nenhum dado aqui representa fornecedor, pedido, estoque ou valor real.
 */

export type FornecedorPremiumDemo = {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  prazo_entrega_dias: number;
  condicoes_pagamento: string;
  categoria: string;
  ativo: boolean;
  atrasos_recentes: number;
  aumento_pct: number;
  historico: { data: string; evento: string }[];
};

export const FORNECEDORES_PREMIUM_DEMO: FornecedorPremiumDemo[] = [
  {
    id: "forn-demo-001",
    nome: "Distribuidora Pão Bom (demo)",
    cnpj: "00.000.000/0001-01",
    contato: "(11) 90000-1001",
    prazo_entrega_dias: 3,
    condicoes_pagamento: "7 dias · boleto fictício",
    categoria: "Insumos secos",
    ativo: true,
    atrasos_recentes: 0,
    aumento_pct: 0,
    historico: [
      { data: "12/11/2026", evento: "Pedido OC-DEMO-002 entregue no prazo." },
      { data: "04/11/2026", evento: "Tabela fictícia revisada sem alteração." },
    ],
  },
  {
    id: "forn-demo-002",
    nome: "Embalagens Já (demo)",
    cnpj: "00.000.000/0002-02",
    contato: "(11) 90000-1002",
    prazo_entrega_dias: 7,
    condicoes_pagamento: "14 dias · pix fictício",
    categoria: "Embalagens",
    ativo: true,
    atrasos_recentes: 2,
    aumento_pct: 8,
    historico: [
      { data: "15/11/2026", evento: "Atraso de 2 dias registrado na OC-DEMO-003." },
      { data: "10/11/2026", evento: "Aviso de aumento de 8% em embalagens." },
    ],
  },
  {
    id: "forn-demo-003",
    nome: "Frios & Cia Ltda (demo)",
    cnpj: "00.000.000/0003-03",
    contato: "(11) 90000-1003",
    prazo_entrega_dias: 2,
    condicoes_pagamento: "À vista fictício",
    categoria: "Frios",
    ativo: true,
    atrasos_recentes: 0,
    aumento_pct: 0,
    historico: [
      { data: "17/11/2026", evento: "Pedido OC-DEMO-001 confirmado." },
      { data: "01/11/2026", evento: "Fornecedor fictício habilitado." },
    ],
  },
  {
    id: "forn-demo-004",
    nome: "Óleo & Derivados (demo)",
    cnpj: "00.000.000/0004-04",
    contato: "(11) 90000-1004",
    prazo_entrega_dias: 10,
    condicoes_pagamento: "30 dias fictícios",
    categoria: "Insumos secos",
    ativo: false,
    atrasos_recentes: 1,
    aumento_pct: 12,
    historico: [
      { data: "14/11/2026", evento: "Aumento de 12% simulado em óleo." },
      { data: "08/11/2026", evento: "Fornecedor fictício pausado para análise." },
    ],
  },
];

export type ItemCompraPremiumDemo = {
  id: string;
  insumo: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number;
  recebido: number;
};

export type StatusCompraPremiumDemo =
  | "rascunho"
  | "enviada"
  | "recebida_parcial"
  | "recebida_total"
  | "cancelada";

export type CompraPremiumDemo = {
  id: string;
  codigo: string;
  fornecedor_id: string;
  data_emissao: string;
  data_prevista: string;
  status: StatusCompraPremiumDemo;
  observacao: string;
  itens: ItemCompraPremiumDemo[];
  historico: { data: string; evento: string }[];
};

export const STATUS_COMPRA_PREMIUM_DEMO: Record<StatusCompraPremiumDemo, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  recebida_parcial: "Recebida parcial",
  recebida_total: "Recebida total",
  cancelada: "Cancelada",
};

export const COMPRAS_PREMIUM_DEMO: CompraPremiumDemo[] = [
  {
    id: "comp-demo-001",
    codigo: "OC-DEMO-001",
    fornecedor_id: "forn-demo-001",
    data_emissao: "2026-11-17",
    data_prevista: "2026-11-20",
    status: "enviada",
    observacao: "Reposição fictícia de farinha.",
    itens: [
      { id: "item-demo-001", insumo: "Farinha de trigo (demo)", quantidade: 20, unidade: "kg", preco_unitario: 3.2, recebido: 0 },
      { id: "item-demo-002", insumo: "Açúcar (demo)", quantidade: 10, unidade: "kg", preco_unitario: 4.1, recebido: 0 },
    ],
    historico: [
      { data: "17/11/2026", evento: "Pedido fictício criado." },
      { data: "18/11/2026", evento: "Pedido enviado ao fornecedor fictício." },
    ],
  },
  {
    id: "comp-demo-002",
    codigo: "OC-DEMO-002",
    fornecedor_id: "forn-demo-003",
    data_emissao: "2026-11-14",
    data_prevista: "2026-11-18",
    status: "recebida_parcial",
    observacao: "Recebimento parcial simulado.",
    itens: [
      { id: "item-demo-003", insumo: "Frango (demo)", quantidade: 15, unidade: "kg", preco_unitario: 11.5, recebido: 9 },
    ],
    historico: [
      { data: "14/11/2026", evento: "Pedido fictício criado." },
      { data: "18/11/2026", evento: "Recebidos 9 kg de 15 kg." },
    ],
  },
  {
    id: "comp-demo-003",
    codigo: "OC-DEMO-003",
    fornecedor_id: "forn-demo-002",
    data_emissao: "2026-11-10",
    data_prevista: "2026-11-15",
    status: "recebida_total",
    observacao: "Embalagens fictícias recebidas.",
    itens: [
      { id: "item-demo-004", insumo: "Embalagem individual (demo)", quantidade: 500, unidade: "un", preco_unitario: 0.25, recebido: 500 },
    ],
    historico: [
      { data: "10/11/2026", evento: "Pedido fictício criado." },
      { data: "17/11/2026", evento: "Recebimento total simulado." },
    ],
  },
];

export const REPOSICAO_PREMIUM_DEMO = [
  { insumo: "Farinha de trigo (demo)", estoque: 8, unidade: "kg", minimo: 20, sugerido: 20, fornecedor: "Distribuidora Pão Bom (demo)" },
  { insumo: "Óleo (demo)", estoque: 3, unidade: "l", minimo: 10, sugerido: 10, fornecedor: "Óleo & Derivados (demo)" },
  { insumo: "Embalagem individual (demo)", estoque: 120, unidade: "un", minimo: 300, sugerido: 500, fornecedor: "Embalagens Já (demo)" },
];

export const INSUMOS_COMPRA_PREMIUM_DEMO = [
  "Farinha de trigo (demo)",
  "Açúcar (demo)",
  "Frango (demo)",
  "Óleo (demo)",
  "Embalagem individual (demo)",
];

export const UNIDADES_COMPRA_PREMIUM_DEMO = ["kg", "g", "l", "ml", "un"] as const;

export function totalCompraPremium(compra: CompraPremiumDemo): number {
  return compra.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
}

export function saldoCompraPremium(compra: CompraPremiumDemo): number {
  return compra.itens.reduce((s, i) => s + Math.max(0, i.quantidade - i.recebido) * i.preco_unitario, 0);
}

export function dataCurta(valor: string): string {
  const d = new Date(`${valor}T12:00:00`);
  return Number.isNaN(+d) ? valor : d.toLocaleDateString("pt-BR");
}

export function dinheiroPremium(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
