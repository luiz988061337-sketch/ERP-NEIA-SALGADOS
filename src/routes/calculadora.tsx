import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arredondarCombo, DEFAULT_CALCULADORA_CONFIG, useCalculadoraConfig } from "@/lib/calculadora-salgados";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora de Salgados — Néia Salgados" },
      { name: "description", content: "Calcule a quantidade ideal de salgados para seu evento." },
    ],
  }),
  component: Calculadora,
});

function Calculadora() {
  const { data: config } = useCalculadoraConfig();
  const cfg = config ?? DEFAULT_CALCULADORA_CONFIG;
  const [pessoas, setPessoas] = useState(10);
  const [porPessoa, setPorPessoa] = useState<number | "personalizado">(cfg.por_pessoa_padrao);
  const [personalizado, setPersonalizado] = useState(cfg.por_pessoa_padrao);

  const porPessoaFinal = porPessoa === "personalizado" ? personalizado : porPessoa;
  const total = Math.max(0, pessoas) * porPessoaFinal;
  const arredondado = arredondarCombo(total);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Voltar ao cardápio
      </Link>
      <h1 className="font-display text-3xl">Calculadora de Salgados</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Informe quantas pessoas vão comer e quantos salgados por pessoa.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label htmlFor="pessoas">Quantas pessoas?</Label>
          <Input id="pessoas" type="number" min={1} value={pessoas} onChange={(e) => setPessoas(Math.max(0, Number(e.target.value) || 0))} />
        </div>
        <div className="space-y-1.5">
          <Label>Quantos salgados por pessoa?</Label>
          <div className="flex flex-wrap gap-2">
            {[15, 20, 25, 30].map((op) => (
              <Button key={op} type="button" size="sm" variant={porPessoa === op ? "default" : "outline"} onClick={() => setPorPessoa(op)}>
                {op}
              </Button>
            ))}
            {cfg.permitir_personalizado ? (
              <Button type="button" size="sm" variant={porPessoa === "personalizado" ? "default" : "outline"} onClick={() => setPorPessoa("personalizado")}>
                Outro
              </Button>
            ) : null}
          </div>
          {porPessoa === "personalizado" ? (
            <Input
              type="number"
              className="mt-2"
              min={cfg.minimo_por_pessoa}
              max={cfg.maximo_por_pessoa}
              value={personalizado}
              onChange={(e) => setPersonalizado(Math.min(cfg.maximo_por_pessoa, Math.max(cfg.minimo_por_pessoa, Number(e.target.value) || cfg.minimo_por_pessoa)))}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground"><Calculator className="size-4" /> Sugestão</div>
        <p className="mt-2 font-display text-2xl">{total} salgados</p>
        <p className="text-sm text-muted-foreground">
          Para comprar em combos (múltiplos de 50), sugerimos <strong>{arredondado} unidades</strong>.
        </p>
        <Button asChild className="mt-4">
          <Link to="/combo">Montar combo</Link>
        </Button>
      </div>
    </div>
  );
}
