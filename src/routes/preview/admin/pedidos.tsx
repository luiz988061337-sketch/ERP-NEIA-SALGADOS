import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Filter, CheckCircle2, Clock, Package, Bike, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/admin/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Preview" }] }),
  component: PreviewPedidos,
});

const STATUS = [
  { key: "todos", label: "Todos" },
  { key: "novo", label: "Novos" },
  { key: "em_producao", label: "Em Produção" },
  { key: "pronto", label: "Prontos" },
  { key: "em_entrega", label: "Em Entrega" },
  { key: "entregue", label: "Entregues" },
  { key: "cancelado", label: "Cancelados" },
];

const PEDIDOS = [
  { num: 124, cliente: "João Silva", tel: "(11) 99999-9999", status: "em_producao", valor: 46.50, entrega: "entrega", hora: "14:32", itens: 3 },
  { num: 125, cliente: "Maria Santos", tel: "(11) 98888-8888", status: "pronto", valor: 58.00, entrega: "entrega", hora: "14:38", itens: 4 },
  { num: 126, cliente: "Pedro Lima", tel: "(11) 97777-7777", status: "em_rota", valor: 38.00, entrega: "entrega", hora: "14:42", itens: 2 },
  { num: 127, cliente: "Ana Paula", tel: "(11) 96666-6666", status: "recebido", valor: 65.00, entrega: "retirada", hora: "14:45", itens: 5 },
  { num: 128, cliente: "Carlos Silva", tel: "(11) 95555-5555", status: "entregue", valor: 42.00, entrega: "entrega", hora: "14:15", itens: 3 },
];

function badge(s: string) {
  const map: Record<string, string> = {
    recebido: "bg-secondary text-secondary-foreground",
    em_producao: "bg-primary/10 text-primary border-primary/20",
    pronto: "bg-primary/10 text-primary border-primary/20",
    em_rota: "bg-primary/10 text-primary border-primary/20",
    entregue: "bg-success/10 text-success border-success/20",
    cancelado: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const lab: Record<string, string> = {
    recebido: "Novo",
    em_producao: "Em Produção",
    pronto: "Pronto",
    em_rota: "Em Entrega",
    entregue: "Entregue",
    cancelado: "Cancelado",
  };
  return { s: map[s], l: lab[s] };
}

export function PreviewPedidos() {
  const [f, setF] = useState("todos");
  const lista = f === "todos" ? PEDIDOS : PEDIDOS.filter(p => p.status === (f === "novo" ? "recebido" : f === "em_entrega" ? "em_rota" : f));
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8">
          <h1 className="font-display text-2xl sm:text-3xl">Gestão de Pedidos</h1>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {STATUS.map(s => (
            <Button key={s.key} variant={f === s.key ? "default" : "outline"} size="sm" onClick={() => setF(s.key)} className="shrink-0">{s.label}</Button>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="space-y-3">
            {lista.map(p => {
              const b = badge(p.status);
              return (
                <div key={p.num} className="rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">#{p.num}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs", b.s)}>{b.l}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{p.entrega === "retirada" ? "Retirada" : "Entrega"}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.cliente} • {p.tel}</p>
                    <p className="text-xs text-muted-foreground">{p.itens} itens • {p.hora}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-primary">{p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline">Ver Detalhes</Button>
                      <Button size="sm" variant="outline">Imprimir</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}