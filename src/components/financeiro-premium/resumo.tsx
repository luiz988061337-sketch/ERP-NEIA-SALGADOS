import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Moedas } from "./icones";
import "./premium.css";

export function FinanceiroResumo({
  subtitulo,
  acoes,
  indicadores,
}: {
  subtitulo: string;
  acoes: ReactNode;
  indicadores: {
    label: string;
    valor: ReactNode;
    icon: LucideIcon;
    complemento?: ReactNode;
  }[];
}) {
  return (
    <section className="fp-overview fp-frame" aria-label="Indicadores financeiros">
      <header className="fp-page-heading">
        <Moedas aria-hidden />
        <div>
          <h1>FINANCEIRO — GESTÃO COMPLETA</h1>
          <p>{subtitulo}</p>
        </div>
        <div className="fp-heading-tools">{acoes}</div>
      </header>
      <div className="fp-kpis">
        {indicadores.map(({ label, valor, icon: Icone, complemento }) => (
          <article key={label} className="fp-kpi" data-kpi={label}>
            <Icone aria-hidden />
            <div className="fp-kpi-content">
              <div className="fp-kpi-label">{label}</div>
              <strong>{valor}</strong>
              {complemento}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
