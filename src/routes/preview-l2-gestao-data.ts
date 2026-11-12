/**
 * Fixtures LOCAIS e fictícios para conferência visual do Painel de Gestão.
 * Nenhum dado real: nada é lido do Supabase nem gravado.
 */

const hoje = new Date();
export function iso(h: number, m: number) {
  const d = new Date(hoje);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export const PRODUTOS = [
  { nome: "Coxinha de Frango", imagem_url: null, categorias: { slug: "fritos" }, estoque: 90, estoque_minimo: 40 },
  { nome: "Kibe de Carne", imagem_url: null, categorias: { slug: "fritos" }, estoque: 70, estoque_minimo: 40 },
  { nome: "Risol de Queijo", imagem_url: null, categorias: { slug: "assados" }, estoque: 60, estoque_minimo: 30 },
  { nome: "Bolinha de Queijo", imagem_url: null, categorias: { slug: "assados" }, estoque: 45, estoque_minimo: 25 },
  { nome: "Empada de Frango", imagem_url: null, categorias: { slug: "assados" }, estoque: 12, estoque_minimo: 20 },
  { nome: "Mini Pizza Calabresa", imagem_url: null, categorias: { slug: "congelados" }, estoque: 30, estoque_minimo: 15 },
];

export const PEDIDOS = [
  {
    id: "p1",
    numero: 4594,
    status: "pronto",
    tipo_entrega: "entrega",
    total: 150,
    created_at: iso(10, 36),
    cliente_nome: "Marina Alves",
    pedido_itens: [{ nome: "Coxinha de Frango", quantidade: 12, preco_unitario: 6.5 }],
  },
  {
    id: "p2",
    numero: 4593,
    status: "pronto",
    tipo_entrega: "balcao",
    total: 62,
    created_at: iso(10, 28),
    cliente_nome: "Retirada no balcão",
    pedido_itens: [{ nome: "Kibe de Carne", quantidade: 8, preco_unitario: 7.75 }],
  },
  {
    id: "p3",
    numero: 4592,
    status: "em_producao",
    tipo_entrega: "entrega",
    total: 86,
    created_at: iso(10, 20),
    cliente_nome: "João Pereira",
    pedido_itens: [{ nome: "Risol de Queijo", quantidade: 10, preco_unitario: 8.6 }],
  },
  {
    id: "p4",
    numero: 4591,
    status: "em_rota",
    tipo_entrega: "encomenda",
    total: 120,
    created_at: iso(10, 12),
    cliente_nome: "Ana Costa",
    pedido_itens: [{ nome: "Bolinha de Queijo", quantidade: 15, preco_unitario: 8 }],
  },
  {
    id: "p5",
    numero: 4590,
    status: "recebido",
    tipo_entrega: "entrega",
    total: 42.8,
    created_at: iso(9, 58),
    cliente_nome: "Bruno Lima",
    pedido_itens: [{ nome: "Empada de Frango", quantidade: 5, preco_unitario: 8.56 }],
  },
  {
    id: "p6",
    numero: 4589,
    status: "recebido",
    tipo_entrega: "balcao",
    total: 31,
    created_at: iso(9, 41),
    cliente_nome: "Retirada no balcão",
    pedido_itens: [{ nome: "Mini Pizza Calabresa", quantidade: 2, preco_unitario: 15.5 }],
  },
];

export const CLIENTES_STATS = [
  { nome: "João Silva", dias_sem_comprar: 3, telefone: "(11) 98765-4321" },
  { nome: "Ana Costa", dias_sem_comprar: 5, telefone: "(11) 97654-3210" },
  { nome: "Marcos Lima", dias_sem_comprar: 8, telefone: "(11) 96543-2109" },
  { nome: "Fernanda Alves", dias_sem_comprar: 12, telefone: "(11) 95321-0987" },
];
