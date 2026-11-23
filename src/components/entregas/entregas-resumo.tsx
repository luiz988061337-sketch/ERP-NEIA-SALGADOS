import type { ReactNode } from "react";
import { Bike, CheckCircle2, Navigation, Package, User } from "lucide-react";

export function EntregasResumo({
  aguardando,
  atribuidos,
  emRota,
  entregues,
  disponiveis,
  acoes,
}: {
  aguardando: ReactNode;
  atribuidos: ReactNode;
  emRota: ReactNode;
  entregues: ReactNode;
  disponiveis: ReactNode;
  acoes?: ReactNode;
}) {
  const indicadores = [
    { label: "Pedidos aguardando", valor: aguardando, icone: Package },
    { label: "Atribuídos", valor: atribuidos, icone: User },
    { label: "Em rota", valor: emRota, icone: Navigation },
    { label: "Entregues hoje", valor: entregues, icone: CheckCircle2 },
    { label: "Motoboys disponíveis", valor: disponiveis, icone: Bike },
  ];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-[#D4A94A]/40 bg-[#D4A94A]/10 text-[#F2CE6B]">
            <Bike className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-extrabold uppercase tracking-tight text-[#F2CE6B] sm:text-[28px]">
              Central de Entregas — Rotas
            </h1>
            <p className="text-sm text-muted-foreground">Distribuição e acompanhamento das entregas</p>
          </div>
        </div>
        {acoes}
      </header>

      <section aria-label="Indicadores de entregas" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {indicadores.map(({ label, valor, icone: Icone }) => (
          <article key={label} className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4 shadow-card">
            <div className="flex items-start gap-2 text-xs font-semibold uppercase tracking-wide text-[#F2CE6B]">
              <Icone className="size-4 shrink-0" aria-hidden /> {label}
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight">{valor}</div>
          </article>
        ))}
      </section>
    </>
  );
}
