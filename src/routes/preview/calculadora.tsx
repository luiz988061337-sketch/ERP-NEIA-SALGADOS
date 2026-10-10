import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Calculator, Users, Clock, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/calculadora")({
  head: () => ({ meta: [{ title: "Calculadora — Preview V4 DEMO" }] }),
  component: PreviewCalc,
});

const OCASIOES = ["Aniversário", "Casamento", "Empresa", "Confraternização", "Outro"];

export function PreviewCalc() {
  const [pessoas, setPessoas] = useState(50);
  const [ocasio, setOcasio] = useState("Aniversário");
  const [duracao, setDuracao] = useState(4);

  const calc = useMemo(() => {
    const porPessoa = duracao >= 5 ? 8 : duracao >= 3 ? 6 : 5;
    const totalSalgados = pessoas * porPessoa;
    const combos50 = Math.ceil(totalSalgados / 50) * 50;
    const bebidasLitros = Math.ceil(pessoas * 0.6);
    return { porPessoa, totalSalgados, combos50, bebidasLitros };
  }, [pessoas, duracao]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/preview"><ArrowLeft className="size-5" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-2xl">Quanto preciso comprar? — DEMO</h1>
            <p className="text-sm text-muted-foreground">Estimativa visual, sem cálculo real da loja</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-6 pb-28">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] animate-fade-in">
          <h2 className="flex items-center gap-2 font-display text-lg"><Users className="size-5 text-primary" /> Seu evento (DEMO)</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pessoas">Quantidade de pessoas</Label>
              <Input id="pessoas" type="number" min={10} max={500} value={pessoas} onChange={(e) => setPessoas(Math.max(0, Number(e.target.value) || 0))} className="min-h-12 text-lg font-bold" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duracao">Duração (horas)</Label>
              <Input id="duracao" type="number" min={1} max={12} value={duracao} onChange={(e) => setDuracao(Math.max(1, Number(e.target.value) || 1))} className="min-h-12 text-lg font-bold" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Label>Ocasião</Label>
            <div className="flex flex-wrap gap-2">
              {OCASIOES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOcasio(o)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                    ocasio === o ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/40",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="brand-gradient rounded-2xl p-6 text-black animate-fade-in">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide opacity-80"><Sparkles className="size-4" /> Estimativa DEMO — {ocasio} • {pessoas} pessoas • {duracao}h</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-black/15 p-3 backdrop-blur">
              <p className="font-display text-2xl">{calc.porPessoa}</p>
              <p className="text-xs font-medium">salgados / pessoa</p>
            </div>
            <div className="rounded-xl bg-black/15 p-3 backdrop-blur">
              <p className="font-display text-2xl">{calc.totalSalgados}</p>
              <p className="text-xs font-medium">salgados no total</p>
            </div>
            <div className="rounded-xl bg-black/15 p-3 backdrop-blur">
              <p className="font-display text-2xl">{calc.bebidasLitros}L</p>
              <p className="text-xs font-medium">bebidas sugeridas</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-black/20 p-4 backdrop-blur">
            <p className="flex items-center gap-2 font-bold"><Clock className="size-4" /> Combinação recomendada (DEMO)</p>
            <p className="mt-1 text-sm">Arredonde para <strong>{calc.combos50} un</strong> (múltiplo de 50) + {calc.bebidasLitros}L de bebidas.</p>
            <p className="mt-2 text-xs opacity-80">Valor: R$ XX,XX — DEMO • Sem pedido real</p>
          </div>
          <Button asChild className="mt-4 w-full min-h-12 bg-black font-bold text-white hover:bg-black/80">
            <Link to="/preview/combo">Montar combo de {calc.combos50} un <ArrowRight className="size-4" /></Link>
          </Button>
        </section>

        <p className="flex items-center gap-2 text-center text-xs text-muted-foreground"><Calculator className="size-4" /> Preview V4 — cálculo ilustrativo. A calculadora real não foi alterada.</p>
      </div>
    </div>
  );
}
