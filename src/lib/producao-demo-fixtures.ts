/**
 * Pedidos fictícios da Produção / Cozinha (H03).
 *
 * Fonte única usada por:
 *  - /preview-l2-producao (conferência visual, sem escrita);
 *  - /producao quando VITE_DEMO_PREVIEW=1 (modo demonstração isolado).
 *
 * 100% local: nenhum acesso ao Supabase real, nenhuma mutação persistida.
 * Quantidades respeitam o mínimo de 50 salgados e remessas em múltiplos de 50.
 */

/** Minutos atrás — mistura níveis: atrasado, risco, atenção e normais. */
function ha(minutos: number) {
  return new Date(Date.now() - minutos * 60_000).toISOString();
}

let sequenciaItem = 0;
function item(nome: string, quantidade: number, categoria: string) {
  return {
    id: `demo-item-${++sequenciaItem}`,
    nome,
    quantidade,
    preco_unitario: 8,
    produtos: { categoria_id: categoria, tempo_fritura_s: 180 },
  };
}

const CAT_F = "cat-fritos";
const CAT_A = "cat-assados";
const CAT_P = "cat-pasteis";

export const PEDIDOS_DEMO_PRODUCAO = [
  {
    id: "pd1",
    numero: 4589,
    status: "recebido",
    producao_status: "pendente",
    tipo_entrega: "entrega",
    cliente_nome: "Marina Alves",
    telefone: "(11) 98765-4321",
    endereco: "Rua Los Angeles, 249 — Jardim Parada do Alto",
    total: 800,
    created_at: ha(48),
    observacoes: "Sem cebola. Separar em duas bandejas de 50 unidades.",
    pedido_itens: [item("Coxinha de Frango", 50, CAT_F), item("Bolinha de Queijo", 50, CAT_A)],
  },
  {
    id: "pd2",
    numero: 4592,
    status: "recebido",
    producao_status: "pendente",
    tipo_entrega: "retirada",
    cliente_nome: "Retirada no balcão",
    telefone: "(11) 97654-3210",
    total: 400,
    created_at: ha(15),
    observacoes: "Cliente recorrente — retirada no balcão.",
    pedido_itens: [item("Risole de Queijo", 50, CAT_A)],
  },
  {
    id: "pd3",
    numero: 4595,
    status: "recebido",
    producao_status: "pendente",
    tipo_entrega: "entrega",
    cliente_nome: "João Pereira",
    telefone: "(11) 96543-2109",
    endereco: "Av. Ipanema, 1200 — Centro",
    total: 1200,
    created_at: ha(8),
    observacoes: "Conferir os sabores antes de fechar a remessa.",
    pedido_itens: [item("Coxinha de Frango", 100, CAT_F), item("Pastel de Queijo", 50, CAT_P)],
  },
  {
    id: "pd4",
    numero: 4586,
    status: "em_producao",
    producao_status: "em_producao",
    tipo_entrega: "entrega",
    cliente_nome: "Ana Costa",
    telefone: "(11) 95321-0987",
    endereco: "Rua Principal, 45 — Centro",
    total: 800,
    created_at: ha(56),
    observacoes: "Sem pimenta — conferir antes de finalizar.",
    pedido_itens: [item("Kibe de Carne", 50, CAT_F), item("Empada de Frango", 50, CAT_A)],
  },
  {
    id: "pd5",
    numero: 4588,
    status: "em_producao",
    producao_status: "em_producao",
    tipo_entrega: "entrega",
    cliente_nome: "Bruno Lima",
    telefone: "(11) 94432-0876",
    endereco: "Rua Sete, 88 — Jardim Sorocaba",
    total: 400,
    created_at: ha(72),
    observacoes: "Pedido atrasado — priorizar a finalização.",
    pedido_itens: [item("Coxinha de Frango", 50, CAT_F)],
  },
  {
    id: "pd6",
    conferido_em: ha(14),
    conferido_por: null,
    pronto_em: ha(12),
    numero: 4583,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "entrega",
    cliente_nome: "Fernanda Alves",
    telefone: "(11) 93321-0765",
    endereco: "Rua Pedro Lessa, 300 — Centro",
    total: 400,
    created_at: ha(10),
    observacoes: "Conferência final concluída.",
    pedido_itens: [item("Bolinha de Queijo", 50, CAT_A)],
  },
  {
    id: "pd7",
    conferido_em: ha(10),
    conferido_por: null,
    pronto_em: ha(8),
    numero: 4584,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "entrega",
    cliente_nome: "Carla Mendes",
    telefone: "(11) 92210-0654",
    endereco: "Rua Ataliba Leonel, 55 — Centro",
    total: 800,
    created_at: ha(6),
    observacoes: "Aguardando aviso ao caixa.",
    pedido_itens: [item("Coxinha de Frango", 100, CAT_F)],
  },
  {
    id: "pd8",
    conferido_em: ha(6),
    conferido_por: null,
    pronto_em: ha(4),
    numero: 4585,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "retirada",
    cliente_nome: "Retirada no balcão",
    telefone: "(11) 91109-0543",
    total: 400,
    created_at: ha(3),
    observacoes: "Retirada liberada após a conferência.",
    pedido_itens: [item("Kibe de Carne", 50, CAT_F)],
  },
] as const;
