import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CentralPedidos } from "@/components/central-pedidos";
import type { AvisoCozinha, PedidoCentral } from "@/lib/central-pedidos";

/**
 * PRÉVIA ISOLADA DA CENTRAL DE PEDIDOS DA ATENDENTE.
 *
 * Dados 100% fictícios e locais (nenhum acesso de escrita): serve para
 * conferir interface, filtros, alerta sonoro e reconhecimento sem tocar no
 * Supabase da Production.
 */

function ha(min: number): string {
  return new Date(Date.now() - min * 60000).toISOString();
}
function emMin(min: number): string {
  return new Date(Date.now() + min * 60000).toISOString();
}

const PEDIDOS: PedidoCentral[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    numero: 4598,
    cliente_nome: "Ana Costa",
    status: "recebido",
    tipo_entrega: "entrega",
    total: 280,
    created_at: ha(6),
    aceito_em_atendente: null,
    observacoes: "Agendado 18:30 — Evento empresarial",
    pagamento_status: "pendente",
    forma_pagamento: "pix",
    endereco: "Rua Ataliba Leonel, 55",
    bairro: "Centro",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 100 },
      { nome: "Kibe", quantidade: 50 },
      { nome: "Risole", quantidade: 50 },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    numero: 4599,
    cliente_nome: "Carlos Santos",
    status: "recebido",
    tipo_entrega: "retirada",
    total: 96,
    created_at: ha(11),
    aceito_em_atendente: null,
    observacoes: "Cliente recorrente",
    pagamento_status: "pago",
    forma_pagamento: "pix",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 30 },
      { nome: "Risole", quantidade: 20 },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    numero: 4600,
    cliente_nome: "Mariana Lima",
    status: "recebido",
    tipo_entrega: "entrega",
    total: 154.9,
    created_at: ha(3),
    aceito_em_atendente: null,
    observacoes: "Sem cebola",
    pagamento_status: "pendente",
    forma_pagamento: "credito",
    endereco: "Rua Pedro Lessa, 300",
    bairro: "Centro",
    pedido_itens: [
      { nome: "Kibe", quantidade: 50 },
      { nome: "Esfiha", quantidade: 50 },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    numero: 4592,
    cliente_nome: "João Silva",
    status: "recebido",
    tipo_entrega: "entrega",
    total: 125,
    created_at: ha(22),
    aceito_em_atendente: ha(20),
    liberado_em: ha(19),
    observacoes: "Sem piments",
    pagamento_status: "pago",
    forma_pagamento: "pix",
    endereco: "Av. Ipanema, 1200",
    bairro: "Centro",
    pedido_itens: [{ nome: "Coxinha", quantidade: 40 }],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    numero: 4593,
    cliente_nome: "Fernanda Alves",
    status: "em_producao",
    tipo_entrega: "retirada",
    total: 64,
    created_at: ha(28),
    aceito_em_atendente: ha(26),
    liberado_em: ha(25),
    producao_status: "produzindo",
    observacoes: "Confirmar troco: R$ 100,00",
    pagamento_status: "pago",
    forma_pagamento: "credito",
    pedido_itens: [
      { nome: "Risole", quantidade: 20 },
      { nome: "Esfiha", quantidade: 20 },
    ],
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    numero: 4595,
    cliente_nome: "Marcos Lima",
    status: "em_producao",
    tipo_entrega: "entrega",
    total: 198,
    created_at: ha(35),
    aceito_em_atendente: ha(33),
    liberado_em: ha(32),
    producao_status: "produzindo",
    observacoes: "Cliente recorrente",
    pagamento_status: "pago",
    forma_pagamento: "pix",
    endereco: "Rua Sete, 88",
    bairro: "Jardim Sorocaba",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 60 },
      { nome: "Bolinha", quantidade: 60 },
    ],
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    numero: 4586,
    cliente_nome: "Pedro Lima",
    status: "pronto",
    tipo_entrega: "entrega",
    total: 110,
    created_at: ha(52),
    aceito_em_atendente: ha(50),
    liberado_em: ha(49),
    conferido_em: ha(20),
    pronto_em: ha(20),
    observacoes: "Rota Centro — Prioridade",
    pagamento_status: "pago",
    forma_pagamento: "pix",
    endereco: "Rua Ipanema, 45",
    bairro: "Centro",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 40 },
      { nome: "Kibe", quantidade: 20 },
    ],
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    numero: 4587,
    cliente_nome: "Luciana Melo",
    status: "pronto",
    tipo_entrega: "retirada",
    total: 52,
    created_at: ha(58),
    aceito_em_atendente: ha(56),
    liberado_em: ha(55),
    conferido_em: ha(25),
    pronto_em: ha(25),
    observacoes: "Aguardando retirada no balcão",
    pagamento_status: "pago",
    forma_pagamento: "credito",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 20 },
      { nome: "Risole", quantidade: 20 },
    ],
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    numero: 4588,
    cliente_nome: "Ricardo Souza",
    status: "pronto",
    tipo_entrega: "entrega",
    total: 187.5,
    created_at: ha(64),
    aceito_em_atendente: ha(62),
    liberado_em: ha(61),
    conferido_em: ha(30),
    pronto_em: ha(30),
    observacoes: "Rota Centro — Prioridade",
    pagamento_status: "pago",
    forma_pagamento: "pix",
    endereco: "Rua Principal, 45",
    bairro: "Centro",
    pedido_itens: [
      { nome: "Coxinha", quantidade: 50 },
      { nome: "Kibe", quantidade: 50 },
      { nome: "Esfiha", quantidade: 25 },
    ],
  },
];

const AVISOS: AvisoCozinha[] = [
  {
    id: "a1",
    tipo: "pedido_pronto_caixa",
    titulo: "Pedido #4586 pronto para entrega",
    detalhe: "Cliente: Pedro Lima • Modalidade: entrega",
    link: "/central-entregas?pedido=77777777-7777-4777-8777-777777777777",
    lida: false,
    created_at: ha(20),
  },
  {
    id: "a2",
    tipo: "pedido_liberado_retirada",
    titulo: "Pedido #4587 liberado para retirada",
    detalhe: "Cliente: Luciana Melo • Modalidade: retirada no balcão",
    link: "/central-entregas?pedido=88888888-8888-4888-8888-888888888888",
    lida: false,
    created_at: ha(25),
  },
];

export const Route = createFileRoute("/preview-l2-atendente")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Central da Atendente (dados fictícios)" }],
  }),
  component: PreviewL2Atendente,
});

function PreviewL2Atendente() {
  return (
    <AdminShell
      aba="pedidos"
      onAba={() => {}}
      onRefresh={() => {}}
      usuario="neia@neiasalgados.com"
      modoPreview
    >
      <AdminTopbar usuario="neia@neiasalgados.com" acesso="Atendente" />
      <div className="border-b border-[#D4A94A]/45 bg-[#141310] px-4 py-2 text-xs text-[#F2CE6B]">
        PRÉVIA L2 — Central de Pedidos da Atendente. Dados fictícios locais; nenhuma
        escrita, nenhum pedido real, nenhum pagamento real.
      </div>
      <CentralPedidos preview pedidosInjetados={PEDIDOS} avisosInjetados={AVISOS} />
    </AdminShell>
  );
}
