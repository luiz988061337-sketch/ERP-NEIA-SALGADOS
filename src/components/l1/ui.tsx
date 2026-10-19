import type { ReactNode } from "react";
import { Crown, type LucideIcon } from "lucide-react";

/**
 * L1 — primitivos visuais do tema claro (somente previews /preview/l1-*).
 * 100% presentacional, sem dados, sem Supabase, sem regras operacionais.
 */

export function L1Root({ children }: { children: ReactNode }) {
  return (
    <div className="l1">
      <p className="l1-demo">PRÉVIA L1 — tema claro em avaliação. Dados fictícios, nada é gravado.</p>
      {children}
    </div>
  );
}

export function L1Shell({
  nav,
  ativo,
  titulo,
  icone: Icone,
  subtitulo,
  topo,
  children,
}: {
  nav: Array<{ grupo?: string; rotulo: string; icone: LucideIcon }>;
  ativo: string;
  titulo: string;
  icone: LucideIcon;
  subtitulo: string;
  topo?: ReactNode;
  children: ReactNode;
}) {
  let ultimoGrupo = "";
  return (
    <div className="l1-shell">
      <aside className="l1-side" aria-label="Navegação L1">
        <div className="l1-brand">
          <Crown size={20} color="#B48A36" aria-hidden />
          <b>Néia</b>
          <span>SALGADOS</span>
          <small>O sabor que faz a diferença</small>
        </div>
        <nav>
          {nav.map((n) => {
            const cab = n.grupo && n.grupo !== ultimoGrupo ? ((ultimoGrupo = n.grupo), true) : false;
            const I = n.icone;
            return (
              <span key={n.rotulo}>
                {cab ? <p className="l1-nav-title">{n.grupo}</p> : null}
                <span className={`l1-nav-item${n.rotulo === ativo ? " on" : ""}`} aria-current={n.rotulo === ativo ? "page" : undefined}>
                  <I aria-hidden />
                  {n.rotulo}
                </span>
              </span>
            );
          })}
        </nav>
        <div className="l1-side-foot">
          Sistema Online
          <b>18:53</b>
          Prévia visual L1
        </div>
      </aside>
      <div className="l1-main">
        <header className="l1-top">
          <div>
            <h1>
              <Icone aria-hidden />
              {titulo}
            </h1>
            <p>{subtitulo}</p>
          </div>
          <div className="l1-top-right">{topo}</div>
        </header>
        {children}
        <p className="l1-foot">Prévia L1 com dados fictícios — aguardando aprovação do tema claro.</p>
      </div>
    </div>
  );
}

export function L1Btn({
  children,
  cor = "gold",
  tam,
  bloco,
  onClick,
  label,
}: {
  children: ReactNode;
  cor?: "gold" | "dark" | "green" | "red" | "blue" | "ghost";
  tam?: "sm";
  bloco?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`l1-btn ${cor}${tam === "sm" ? " sm" : ""}${bloco ? " block" : ""}`}
    >
      {children}
    </button>
  );
}

export function L1Badge({ cor, children }: { cor: "gold" | "green" | "yellow" | "red" | "blue" | "purple" | "gray"; children: ReactNode }) {
  return <span className={`l1-badge ${cor}`}>{children}</span>;
}

export function L1Stat({ numero, texto, icone: Icone, fundo }: { numero: string; texto: string; icone: LucideIcon; fundo: string }) {
  return (
    <div className="l1-stat">
      <span className="ic" style={{ background: fundo }} aria-hidden>
        <Icone />
      </span>
      <span>
        <span className="n">{numero}</span>
        <br />
        <span className="t">{texto}</span>
      </span>
    </div>
  );
}

export function L1Alert({ cor, children }: { cor: "red" | "yellow" | "green" | "blue"; children: ReactNode }) {
  return (
    <div className={`l1-alert ${cor}`} role="status">
      {children}
    </div>
  );
}

export function L1Section({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section className="l1-section" aria-label={titulo}>
      <h2>{titulo}</h2>
      {sub ? <p className="sub">{sub}</p> : null}
      {children}
    </section>
  );
}
