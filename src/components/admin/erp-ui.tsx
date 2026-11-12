import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Componentes estruturais compartilhados do ERP dark (reforma estrutural).
 * Uso exclusivo do painel interno — a loja pública não importa nada daqui.
 * Todos seguem a paleta oficial: grafite + dourado + cores de status.
 */

export const ERP_COLORS = {
  gold: "#D29034",
  goldStrong: "#E5A63A",
  goldBright: "#F4B942",
  green: "#11B96A",
  blue: "#1687C8",
  orange: "#F28A1A",
  red: "#E34835",
  gray: "#7A8387",
} as const;

/** Cabeçalho de módulo: ícone dourado + título grande + subtítulo + status à direita. */
export function ModuleHeader({
  icone: Icone,
  titulo,
  subtitulo,
  status,
  acoes,
}: {
  icone: LucideIcon;
  titulo: string;
  subtitulo?: string;
  status?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(226,160,52,.45)] bg-[rgba(244,185,66,.08)]">
          <Icone className="size-5 text-[#F4B942]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-foreground">
            {titulo}
          </h1>
          {subtitulo ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">{subtitulo}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status ? <div className="flex items-center gap-2">{status}</div> : null}
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </div>
    </div>
  );
}

/** Indicador de status ● texto, com cor. */
export function StatusDot({
  label,
  cor = "#11B96A",
}: {
  label: string;
  cor?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,.1)] bg-[#1A1E20] px-2.5 py-1 text-xs font-medium text-[#C7CCCE]">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: cor }}
        aria-hidden
      />
      {label}
    </span>
  );
}

/** Badge pill pequeno com cor de status. */
export type BadgeTom = "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra";

export const BADGE_TOM_STYLE: Record<BadgeTom, { bg: string; texto: string }> = {
  ok: { bg: "rgba(17,185,106,.12)", texto: "#2ED988" },
  info: { bg: "rgba(22,135,200,.14)", texto: "#4DA9E0" },
  atencao: { bg: "rgba(242,138,26,.14)", texto: "#F5A34A" },
  perigo: { bg: "rgba(227,72,53,.14)", texto: "#F08374" },
  neutro: { bg: "rgba(255,255,255,.06)", texto: "#90989C" },
  extra: { bg: "rgba(150,110,220,.14)", texto: "#B294E8" },
};

export function StatusBadge({
  tom = "neutro",
  children,
  className,
}: {
  tom?: BadgeTom;
  children: ReactNode;
  className?: string;
}) {
  const t = BADGE_TOM_STYLE[tom];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
      style={{ backgroundColor: t.bg, color: t.texto }}
    >
      {children}
    </span>
  );
}

/** Card de métrica compacto: ícone circular + label + valor + delta opcional. */
export function MetricCard({
  icone: Icone,
  label,
  valor,
  detalhe,
  cor = ERP_COLORS.goldBright,
  onClick,
}: {
  icone: LucideIcon;
  label: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${cor}22` }}
      >
        <Icone className="size-4" style={{ color: cor }} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-display text-xl font-bold leading-tight">{valor}</p>
        {detalhe ? <p className="truncate text-[11px] text-muted-foreground">{detalhe}</p> : null}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[#15191B] p-3 text-left shadow-[0_6px_18px_rgba(0,0,0,.28)] transition-colors hover:border-[rgba(226,160,52,.55)]"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[#15191B] p-3 shadow-[0_6px_18px_rgba(0,0,0,.28)]">
      {body}
    </div>
  );
}

/** Card de seção com título compacto e ações no cabeçalho. */
export function SectionCard({
  titulo,
  acoes,
  children,
  className,
  bodyClassName,
}: {
  titulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[rgba(226,160,52,.35)] bg-[#15191B] shadow-[0_0_18px_rgba(244,185,66,.08)]",
        className,
      )}
    >
      {titulo || acoes ? (
        <header className="flex min-h-[42px] flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,.08)] px-3 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#C7CCCE]">{titulo}</h3>
          {acoes ? <div className="flex flex-wrap items-center gap-1.5">{acoes}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Tabela escura compacta (linhas 40-44px, header escuro, hover leve). */
export function DarkTable({
  colunas,
  children,
  className,
  vazio,
}: {
  colunas: ReactNode[];
  children: ReactNode;
  className?: string;
  vazio?: string | undefined;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,.08)] bg-[#1A1E20]">
            {colunas.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground",
                  i === 0 && "rounded-tl-md",
                  i === colunas.length - 1 && "rounded-tr-md",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(255,255,255,.05)]">{children}</tbody>
      </table>
      {vazio && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
      )}
    </div>
  );
}

/** Linha de tabela padrão. */
export function DarkTableRow({ children }: { children: ReactNode }) {
  return (
    <tr className="transition-colors hover:bg-[rgba(255,255,255,.025)]">{children}</tr>
  );
}

/** Coluna de kanban com header colorido (produção/atendimento). */
export function KanbanColumn({
  titulo,
  contador,
  cor,
  children,
  className,
}: {
  titulo: string;
  contador: number;
  cor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-[rgba(255,255,255,.08)] bg-[#111416]",
        className,
      )}
    >
      <header
        className="flex min-h-[42px] shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ backgroundColor: `${cor}1F`, borderBottom: `2px solid ${cor}` }}
      >
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: cor }}>
          {titulo}
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${cor}33`, color: cor }}
        >
          {contador}
        </span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

/** Botão de ação padronizado. */
export function ActionButton({
  children,
  onClick,
  variant = "gold",
  className,
  disabled,
  type,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "gold" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    gold: "min-h-[34px] border border-[rgba(226,160,52,.55)] bg-gradient-to-b from-[#F5BF4A] to-[#E19B28] text-[#141414] hover:brightness-110",
    ghost:
      "min-h-[34px] border border-[rgba(255,255,255,.1)] bg-[#202426] text-[#F6F7F7] hover:border-[rgba(226,160,52,.45)]",
    danger:
      "min-h-[34px] border border-[rgba(227,72,53,.5)] bg-[rgba(227,72,53,.15)] text-[#F08374] hover:bg-[rgba(227,72,53,.25)]",
  } as const;
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variants[variant], className)}
    >
      {children}
    </button>
  );
}

/** Card que envolve um gráfico (título + corpo do gráfico). */
export function ChartCard({
  titulo,
  acoes,
  children,
  className,
  altura = "h-52",
}: {
  titulo: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  altura?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[rgba(226,160,52,.35)] bg-[#15191B] shadow-[0_0_18px_rgba(244,185,66,.08)]",
        className,
      )}
    >
      <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-[rgba(255,255,255,.08)] px-3 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#C7CCCE]">{titulo}</h3>
        {acoes}
      </header>
      <div className={cn("p-3", altura)}>{children}</div>
    </section>
  );
}
