import { createFileRoute } from "@tanstack/react-router";
import { Producao } from "@/routes/producao";

/**
 * PRÉVIA VISUAL DA PRODUÇÃO / COZINHA (L2 — referência preto/dourado).
 *
 * Renderiza o painel REAL com pedidos fictícios LOCAIS. Modo conferência:
 * nenhuma escrita no Supabase (status, impressão e reservas bloqueados),
 * nenhum pedido criado ou alterado.
 */

function iso(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Minutos atrás (para misturar níveis: urgente 40-60min, atenção <40min, normal). */
function ha(anos: number) {
  return new Date(Date.now() - anos * 60000).toISOString();
}

function item(nome: string, quantidade: number, categoria: string) {
  return {
    id: Math.random().toString(36).slice(2),
    nome,
    quantidade,
    preco_unitario: 8,
    produtos: { categoria_id: categoria, tempo_fritura_s: 180 },
  };
}

const CAT_F = "cat-fritos";
const CAT_A = "cat-assados";
const CAT_P = "cat-pasteis";

const PEDIDOS = [
  {
    id: "pd1",
    numero: 4589,
    status: "recebido",
    producao_status: "pendente",
    tipo_entrega: "entrega",
    cliente_nome: "Marina Alves",
    telefone: "(11) 98765-4321",
    endereco: "Rua Los Angeles, 249 — Jardim Parada do Alto",
    total: 150,
    created_at: ha(48),
    observacoes: "Sem cebola. Separar em duas bandejas.",
    pedido_itens: [item("Coxinha de Frango", 10, CAT_F), item("Bolinha de Queijo", 20, CAT_A)],
  },
  {
    id: "pd2",
    numero: 4592,
    status: "recebido",
    producao_status: "pendente",
    tipo_entrega: "retirada",
    cliente_nome: "Retirada no balcão",
    telefone: "(11) 97654-3210",
    total: 86,
    created_at: ha(15),
    pedido_itens: [item("Risol de Queijo", 10, CAT_A)],
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
    total: 260,
    created_at: ha(8),
    pedido_itens: [item("Coxinha de Frango", 30, CAT_F), item("Pastel de Queijo", 20, CAT_P)],
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
    total: 100,
    created_at: ha(30),
    pedido_itens: [item("Kibe de Carne", 12, CAT_F), item("Empada de Frango", 10, CAT_A)],
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
    total: 75,
    created_at: ha(52),
    pedido_itens: [item("Coxinha de Frango", 15, CAT_F)],
  },
  {
    id: "pd6", conferido_em: ha(14), conferido_por: null,
    pronto_em: ha(12),
    numero: 4583,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "entrega",
    cliente_nome: "Fernanda Alves",
    telefone: "(11) 93321-0765",
    endereco: "Rua Pedro Lessa, 300 — Centro",
    total: 50,
    created_at: ha(10),
    pedido_itens: [item("Bolinha de Queijo", 10, CAT_A)],
  },
  {
    id: "pd7", conferido_em: ha(10), conferido_por: null,
    pronto_em: ha(8),
    numero: 4584,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "entrega",
    cliente_nome: "Carla Mendes",
    telefone: "(11) 92210-0654",
    endereco: "Rua Ataliba Leonel, 55 — Centro",
    total: 120,
    created_at: ha(6),
    pedido_itens: [item("Coxinha de Frango", 20, CAT_F)],
  },
  {
    id: "pd8", conferido_em: ha(6), conferido_por: null,
    pronto_em: ha(4),
    numero: 4585,
    status: "pronto",
    producao_status: "finalizado",
    tipo_entrega: "retirada",
    cliente_nome: "Retirada no balcão",
    telefone: "(11) 91109-0543",
    total: 90,
    created_at: ha(3),
    pedido_itens: [item("Kibe de Carne", 10, CAT_F)],
  },
];

export const Route = createFileRoute("/preview-l2-producao")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Produção/Cozinha (dados fictícios)" }],
  }),
  component: PreviewL2Producao,
});

function PreviewL2Producao() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 border-b border-[#D4A94A]/45 bg-[#141310] px-4 py-2 text-xs text-[#F2CE6B]">
        PRÉVIA L2 — Produção/Cozinha. Pedidos fictícios locais; nenhum status é alterado, nada é
        impresso.
      </div>
      <Producao preview pedidosInjetados={PEDIDOS} />
    </div>
  );
}
