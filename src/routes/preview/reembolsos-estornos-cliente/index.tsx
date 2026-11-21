import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Package, RotateCcw, ShieldAlert, Store, Truck, Wallet } from "lucide-react";
import { AjudaCliente, FidelidadeCliente } from "@/components/reembolsos-estornos/cliente-publico";
import { SolicitacoesCliente } from "@/components/reembolsos-estornos/cliente-sessao";
import { cn } from "@/lib/utils";
import { brl, PAGAMENTO_STATUS_LABEL, statusLabel } from "@/lib/format";
import { MEUS_PEDIDOS_CLIENTE_DEMO } from "@/lib/pedidos-demo-cliente";
import React from "react";

/**
 * PRÉVIA R2-B — Meus Pedidos (cliente).
 * Página pública do cliente: lista de pedidos, filtro por status,
 * ações de repetir pedido e solicitação de reembolso.
 * Usa layout público PreviewPublicLayout (sem AdminShell).
 * Dados locais/fictícios para demonstração.
 */
export const Route = createFileRoute("/preview/reembolsos-estornos-cliente/")({
  head: () => ({
    meta: [{ title: "Meus Pedidos — Néia Salgados" }],
  }),
  component: MeusPedidos,
});

// Fonte única dos pedidos fictícios (lista e detalhe compartilham status,
// modalidade e pagamento). Nenhum valor é inventado fora da demonstração.
const MEUS_PEDIDOS = MEUS_PEDIDOS_CLIENTE_DEMO;

const STATUS_COLORS: Record<string, string> = {
  recebido: "bg-amber-100 text-amber-800 border-amber-200",
  em_producao: "bg-blue-100 text-blue-800 border-blue-200",
  pronto: "bg-green-100 text-green-800 border-green-200",
  aguardando_motoboy: "bg-orange-100 text-orange-800 border-orange-200",
  em_rota: "r2b-badge-amber",
  entregue: "r2b-badge-green",
  cancelado: "r2b-badge-red",
  aguardando_pagamento: "bg-red-100 text-red-800 border-red-200",
};

const MODALIDADE_LABEL: Record<string, string> = {
  entrega: "Entrega",
  retirada: "Retirada na loja",
};

const PAGAMENTO_LABEL_EXT: Record<string, string> = {
  ...PAGAMENTO_STATUS_LABEL,
  pago: "Pago e confirmado",
  reembolsado: "Pagamento estornado",
};

export function MeusPedidos() {
  const [filtro, setFiltro] = React.useState<"todos" | "andamento" | "concluidos" | "cancelados">("todos");

  const pedidosFiltrados = MEUS_PEDIDOS.filter((p) => {
    if (filtro === "andamento")
      return p.status !== "entregue" && p.status !== "cancelado";
    if (filtro === "concluidos") return p.status === "entregue";
    if (filtro === "cancelados") return p.status === "cancelado";
    return true;
  });

  return (
    <div className="r2b-content" data-testid="r2b-meus-pedidos">
      {/* Título e Plano Fidelidade lado a lado */}
      <section className="r2b-intro">
        <div className="r2b-page-title"><Package size={34} /><div>
          <h1>Meus Pedidos</h1>
          <p>Acompanhe, repita ou solicite ajuda sobre suas compras.</p>
        </div></div>
        <FidelidadeCliente />
      </section>

      {/* Filtros */}
      <section aria-label="Filtrar pedidos">
        <div className="r2b-filters">
          <FilterChip
            label="Todos"
            count={MEUS_PEDIDOS.length}
            active={filtro === "todos"}
            onClick={() => setFiltro("todos")}
          />
          <FilterChip
            label="Em andamento"
            count={MEUS_PEDIDOS.filter((p) => p.status !== "entregue" && p.status !== "cancelado").length}
            active={filtro === "andamento"}
            onClick={() => setFiltro("andamento")}
          />
          <FilterChip
            label="Concluídos"
            count={MEUS_PEDIDOS.filter((p) => p.status === "entregue").length}
            active={filtro === "concluidos"}
            onClick={() => setFiltro("concluidos")}
          />
          <FilterChip
            label="Cancelados"
            count={MEUS_PEDIDOS.filter((p) => p.status === "cancelado").length}
            active={filtro === "cancelados"}
            onClick={() => setFiltro("cancelados")}
          />
        </div>
      </section>

      {/* Lista de pedidos */}
      <section aria-label="Seus pedidos" className="r2b-orders">
        {pedidosFiltrados.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[#5D4037]">Nenhum pedido encontrado neste filtro.</p>
          </div>
        ) : (
          <div className="r2b-orders-list">
            {pedidosFiltrados.map((pedido) => (
              <PedidoCard key={pedido.id} pedido={pedido} />
            ))}
          </div>
        )}
      </section>

      {/* Banner de ajuda */}
      <AjudaCliente />
      <SolicitacoesCliente />

    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("r2b-filter", active && "is-active")}
    >
      <span className="flex items-center gap-1">
        {label === "Todos" && <Package className="size-4 shrink-0" />}
        {label === "Em andamento" && <Truck className="size-4 shrink-0" />}
        {label === "Concluídos" && <Wallet className="size-4 shrink-0" />}
        {label === "Cancelados" && <ShieldAlert className="size-4 shrink-0" />}
        {label}
      </span>
      <span className="r2b-filter-count">{count}</span>
    </button>
  );
}

function PedidoCard({ pedido }: { pedido: (typeof MEUS_PEDIDOS)[number] }) {
  const statusInfo = statusLabel(pedido.status, pedido.modalidade);
  const statusColor = STATUS_COLORS[pedido.status] ?? "bg-muted";
  const pagamentoInfo = PAGAMENTO_LABEL_EXT[pedido.pagamento] ?? pedido.pagamento;
  const modalidadeInfo = MODALIDADE_LABEL[pedido.modalidade];

  return (
    <article className="r2b-order-card" data-testid="r2b-pedido" data-pedido={pedido.id}>
        <div className="r2b-order-info">
          <div className="r2b-order-icon">
            <Package size={23} />
          </div>
          <div>
            <h2>Pedido nº {pedido.numero}</h2>
            <p>
              {new Date(pedido.data).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
              {` às ${new Date(pedido.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </p>
            <p>
              {pedido.itens} item{pedido.itens > 1 ? "s" : ""} • {modalidadeInfo}
            </p>
          </div>
        </div>

        <div className="r2b-order-status">
          <span className={cn("r2b-badge", statusColor)}>
            {pedido.modalidade === "retirada" ? <Store size={14} aria-hidden /> : <Truck size={14} aria-hidden />}
            {statusInfo}
          </span>
          <span className={cn(
            "r2b-payment",
            pedido.pagamento === "pago" && "r2b-payment-good",
            pedido.pagamento === "reembolsado" && "r2b-payment-refunded",
            (pedido.pagamento === "pendente" || pedido.pagamento === "falhou") && "r2b-payment-pending",
          )}>
            <span aria-hidden="true">●</span> {pagamentoInfo}
          </span>
        </div>
        <div className="r2b-order-actions">
          <strong className="r2b-order-value">{brl(pedido.valor)}</strong>
          <div>
            <Link to="/pedido/$id" params={{ id: pedido.id }} className="r2b-button r2b-button-primary"><Eye size={15} />Ver pedido</Link>
            {pedido.podeRepetir && <Link to="/pedido/$id" params={{ id: pedido.id }} search={{ repetir: true }} className="r2b-button r2b-button-outline"><RotateCcw size={15} />Repetir pedido</Link>}
          </div>
        </div>
    </article>
  );
}
