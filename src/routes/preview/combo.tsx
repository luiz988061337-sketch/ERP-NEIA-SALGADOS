import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/combo")({
  head: () => ({ meta: [{ title: "Montar Combo — Preview V4 DEMO" }] }),
  component: PreviewCombo,
});

const SABORES_DEMO = [
  { id: "coxinha", nome: "Coxinha", qtd: 20 },
  { id: "bolinho", nome: "Bolinho de Queijo", qtd: 15 },
  { id: "risole", nome: "Risol Presunto e Queijo", qtd: 10 },
  { id: "kibe", nome: "Kibe", qtd: 5 },
];

const MARCOS = [50, 100, 150, 200];

export function PreviewCombo() {
  const [total, setTotal] = useState(50);
  const [sabores, setSabores] = useState<Record<string, number>>({
    coxinha: 20,
    bolinho: 15,
    risole: 10,
    kibe: 5,
  });

  const somaSabores = useMemo(
    () => Object.values(sabores).reduce((a, b) => a + b, 0),
    [sabores],
  );

  const status = total < 50 ? "abaixo" : total % 50 !== 0 ? "ajuste" : "completo";
  const falta = Math.max(0, 50 - total);
  const proximoMultiplo = Math.ceil((total + 1) / 50) * 50;

  function ajustarSabor(id: string, delta: number) {
    setSabores((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta);
      const novaSomaOutros = Object.entries(prev)
        .filter(([k]) => k !== id)
        .reduce((a, [, v]) => a + v, 0);
      const permitido = Math.max(0, total - novaSomaOutros);
      return { ...prev, [id]: Math.min(next, permitido) };
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/preview"><ArrowLeft className="size-5" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl">Monte sua festa — DEMO</h1>
            <p className="text-sm text-muted-foreground">Mínimo 50 por categoria • múltiplos de 50 • R$ XX,XX DEMO</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-6 pb-28">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Package className="size-3.5" /> Passo 1 — Quantidade total
          </span>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {MARCOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTotal(m)}
                className={cn(
                  "rounded-xl border px-2 py-3 text-center transition-all",
                  total === m
                    ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-card)]"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                <span className="block font-display text-lg leading-none">{m}</span>
                <span className="mt-1 block text-[11px] opacity-80">un</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTotal((t) => Math.max(0, t - 10))}>-10</Button>
            <div className="flex-1 text-center font-display text-3xl text-primary">{total}</div>
            <Button variant="outline" size="sm" onClick={() => setTotal((t) => t + 10)}>+10</Button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", status === "completo" ? "bg-success" : status === "ajuste" ? "bg-primary" : "bg-destructive")}
              style={{ width: `${Math.min(100, (total / 200) * 100)}%` }}
            />
          </div>
          {status === "abaixo" && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> Faltam {falta} un para o mínimo de 50.
            </p>
          )}
          {status === "ajuste" && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
              <Sparkles className="size-4 shrink-0" /> Ajuste para {proximoMultiplo} un (múltiplo de 50).
            </p>
          )}
          {status === "completo" && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="size-4 shrink-0" /> Combo válido — {total} un em múltiplo de 50.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> Passo 2 — Distribua os sabores (DEMO)
          </span>
          <div className="mt-4 space-y-3">
            {SABORES_DEMO.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="flex-1">
                  <p className="font-medium">{s.nome}</p>
                  <p className="text-xs text-muted-foreground">{sabores[s.id] ?? 0} un de {total} un</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => ajustarSabor(s.id, -5)}>-5</Button>
                  <span className="w-10 text-center font-bold">{sabores[s.id] ?? 0}</span>
                  <Button size="sm" variant="outline" onClick={() => ajustarSabor(s.id, 5)}>+5</Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Distribuído: {somaSabores} / {total} un (DEMO, sem pedido real).</p>
        </section>

        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6 animate-fade-in">
          <h2 className="font-display text-lg">Resumo DEMO</h2>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total do combo</span>
            <span className="font-display text-2xl text-primary">R$ XX,XX — DEMO</span>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/preview/cardapio">Continuar escolhendo</Link>
            </Button>
            <Button asChild className="flex-1 gap-2" disabled={status !== "completo"}>
              <Link to="/preview/carrinho">Adicionar ao carrinho <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
