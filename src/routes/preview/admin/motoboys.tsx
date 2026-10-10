import { createFileRoute } from "@tanstack/react-router";
import { Bike, User, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/preview/admin/motoboys")({
  head: () => ({ meta: [{ title: "Motoboys — Preview" }] }),
  component: PreviewMotoboys,
});

const MOTOBOYS = [
  { nome: "Carlos Alberto", tel: "(11) 98765-4321", status: "em_rota", entregas: 8, rota: "Pinheiros, Centro" },
  { nome: "José Silva", tel: "(11) 97654-3210", status: "disponivel", entregas: 5, rota: "Bela Vista" },
  { nome: "Maria Oliveira", tel: "(11) 96543-2109", status: "offline", entregas: 2, rota: "-" },
];

function badge(s: string) {
  if (s === "disponivel") return "bg-success/10 text-success border-success/20";
  if (s === "em_rota") return "bg-primary/10 text-primary border-primary/20";
  return "bg-muted text-muted-foreground";
}
const lab: Record<string, string> = { disponivel: "Disponível", em_rota: "Em Rota", offline: "Offline" };

export function PreviewMotoboys() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8"><h1 className="font-display text-2xl sm:text-3xl">Motoboys</h1></div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="space-y-3">
            {MOTOBOYS.map(m => (
              <div key={m.nome} className="rounded-lg border border-border p-3 flex items-center gap-4 hover:bg-accent/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{m.nome}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${badge(m.status)}`}>{lab[m.status]}</span>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="size-3" /> {m.tel} • <Bike className="size-3" /> {m.entregas} entregas • Rota: {m.rota}</p>
                </div>
                <Button size="sm" variant="outline">Detalhes</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}