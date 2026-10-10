import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart3, TrendingUp, Package, Clock, Bike, CheckCircle2, AlertTriangle, DollarSign, Users, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard Admin — Néia Salgados Preview" },
      { name: "description", content: "Dashboard administrativo Néia Salgados" },
    ],
  }),
  component: PreviewAdminDashboard,
});

const CARDS = [
  { title: "Vendas do Dia", value: "R$ 2.450,00", change: "+12%", trend: "up", icon: DollarSign, color: "text-success" },
  { title: "Pedidos do Dia", value: "42", change: "+8%", trend: "up", icon: Package, color: "text-primary" },
  { title: "Faturamento Mês", value: "R$ 48.250,00", change: "+15%", trend: "up", icon: TrendingUp, color: "text-primary" },
  { title: "Em Preparação", value: "12", change: "0%", trend: "neutral", icon: Clock, color: "text-primary" },
  { title: "Aguardando Entrega", value: "5", change: "0%", trend: "neutral", icon: Package, color: "text-primary" },
  { title: "Em Rota", value: "8", change: "+3%", trend: "up", icon: Bike, color: "text-primary" },
  { title: "Entregues Hoje", value: "26", change: "+15%", trend: "up", icon: CheckCircle2, color: "text-success" },
  { title: "Clientes Ativos", value: "1.248", change: "+5%", trend: "up", icon: Users, color: "text-primary" },
];

const ALERTAS = [
  { icon: AlertTriangle, title: "2 pedidos há +60min sem concluir", tipo: "primary", link: "/preview/admin/pedidos" },
  { icon: Package, title: "5 produtos com estoque abaixo do mínimo", tipo: "primary", link: "/preview/admin/produtos" },
];

const PEDIDOS_RECENTES = [
  { num: 124, cliente: "João Silva", status: "em_producao", valor: 46.50, hora: "14:32", entrega: "entrega" },
  { num: 125, cliente: "Maria Santos", status: "pronto", valor: 58.00, hora: "14:38", entrega: "entrega" },
  { num: 126, cliente: "Pedro Lima", status: "em_rota", valor: 38.00, hora: "14:42", entrega: "entrega" },
  { num: 127, cliente: "Ana Paula", status: "recebido", valor: 65.00, hora: "14:45", entrega: "retirada" },
  { num: 128, cliente: "Carlos Silva", status: "entregue", valor: 42.00, hora: "14:15", entrega: "entrega" },
];

const PRODUTOS_TOP = [
  { nome: "Coxinha de Frango c/ Catupiry", qtd: 156, total: 1170.00 },
  { nome: "Bolinho de Queijo", qtd: 128, total: 832.00 },
  { nome: "Risol de Presunto e Queijo", qtd: 98, total: 686.00 },
  { nome: "Kibe de Carne", qtd: 87, total: 565.50 },
  { nome: "Mini Pizza Calabresa", qtd: 72, total: 540.00 },
];

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    recebido: "bg-secondary text-secondary-foreground",
    em_producao: "bg-primary/10 text-primary border-primary/20",
    pronto: "bg-primary/10 text-primary border-primary/20",
    em_rota: "bg-primary/10 text-primary border-primary/20",
    entregue: "bg-success/10 text-success border-success/20",
    cancelado: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const labels: Record<string, string> = {
    recebido: "Recebido",
    em_producao: "Em Produção",
    pronto: "Pronto",
    em_rota: "Em Rota",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  return { style: styles[status] || styles["recebido"], label: labels[status] || status };
}

function PreviewAdminDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Visão geral da operação Néia Salgados</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="size-3.5" /> Atualizar</Button>
              <Button size="sm" className="brand-gradient gap-1 text-black"><Plus className="size-3.5" /> Novo Pedido</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-8">
        {ALERTAS.length > 0 && (
          <section className="space-y-2 animate-fade-in">
            {ALERTAS.map((alert, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 p-4">
                <alert.icon className="size-5 text-primary" />
                <span className="text-sm flex-1">{alert.title}</span>
                <Button variant="outline" size="sm" asChild>
                  <Link to={alert.link}>Ver</Link>
                </Button>
              </div>
            ))}
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {CARDS.map((card, i) => (
            <div key={card.title} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-all hover:border-primary/30 hover:shadow-[var(--shadow-float)] animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center justify-between">
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10", card.color)}>
                  <card.icon className="size-6" />
                </div>
                {card.trend !== "neutral" && (
                  <span className={cn("text-xs font-medium rounded-full px-2 py-1", card.trend === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{card.change}</span>
                )}
              </div>
              <h3 className="mt-4 text-sm text-muted-foreground">{card.title}</h3>
              <p className="mt-1 font-display text-2xl text-foreground">{card.value}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg flex items-center gap-2"><Package className="size-5 text-primary" /> Pedidos Recentes</h2>
              <Button variant="outline" size="sm" asChild><Link to="/preview/admin/pedidos">Ver todos</Link></Button>
            </div>
            <div className="space-y-2">
              {PEDIDOS_RECENTES.map((p) => {
                const sb = getStatusBadge(p.status);
                return (
                  <Link key={p.num} to="/preview/admin/pedidos" className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">#{p.num}</span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs", sb.style)}>{sb.label}</span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{p.entrega === "retirada" ? "Retirada" : "Entrega"}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{p.cliente} • {p.hora}</p>
                    </div>
                    <span className="font-medium text-primary">{p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg flex items-center gap-2"><BarChart3 className="size-5 text-primary" /> Mais Vendidos (Hoje)</h2>
              <Button variant="outline" size="sm">Ver relatório</Button>
            </div>
            <div className="space-y-3">
              {PRODUTOS_TOP.map((prod, i) => (
                <div key={prod.nome} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{prod.nome}</p>
                    <p className="text-sm text-muted-foreground">{prod.qtd} unidades vendidas</p>
                  </div>
                  <span className="font-medium text-primary">{prod.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

