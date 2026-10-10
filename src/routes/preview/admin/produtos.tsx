import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/preview/admin/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Preview" }] }),
  component: PreviewProdutos,
});

const PRODS = [
  { id: 1, nome: "Coxinha de Frango c/ Catupiry", cat: "coxinhas", preco: 7.50, estoque: 245, disp: true, destaque: true },
  { id: 2, nome: "Bolinho de Queijo", cat: "bolinhos", preco: 6.50, estoque: 180, disp: true, destaque: false },
  { id: 3, nome: "Risol de Presunto e Queijo", cat: "risoles", preco: 7.00, estoque: 32, disp: true, destaque: true },
  { id: 4, nome: "Kibe de Carne", cat: "kibes", preco: 6.50, estoque: 0, disp: false, destaque: false },
];

export function PreviewProdutos() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8 flex items-center justify-between">
          <h1 className="font-display text-2xl sm:text-3xl">Produtos</h1>
          <Button size="sm" className="brand-gradient text-black"><Plus className="size-3.5 mr-1" /> Novo Produto</Button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="space-y-3">
            {PRODS.map(p => (
              <div key={p.id} className="rounded-lg border border-border p-3 flex items-center gap-4 hover:bg-accent/50">
                <div className="flex-1">
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-sm text-muted-foreground">{p.cat} • Estoque: {p.estoque} • {p.disp ? "Disponível" : "Indisponível"} {p.destaque && "• Destaque"}</p>
                </div>
                <span className="font-medium text-primary">{p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                <Button size="sm" variant="outline">Editar</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}