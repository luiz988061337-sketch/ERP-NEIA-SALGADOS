import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Componentes estruturais compartilhados do ERP (identidade clara).
 * Uso exclusivo do painel interno — a loja pública não importa nada daqui.
 * Todos seguem a paleta oficial: fundo claro #F8F9FA + dourado #C49A43
 * como destaque + cores de status (verde/azul/laranja/vermelho).
 */

export const ERP_COLORS = {
  gold: "#C49A43",
  goldStrong: "#A9813A",
  goldLight: "#F5EBD2",
  green: "#21835D",
  blue: "#2563EB",
  orange: "#F59E0B",
  red: "#DC2626",
  gray: "#64748B",
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
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(196,154,67,.45)] bg-[#F5EBD2]">
          <Icone className="size-5 text-[#A9813A]" aria-hidden />
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
  cor = "#21835D",
}: {
  label: string;
  cor?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#202B3A]">
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
  ok: { bg: "rgba(33,131,93,.12)", texto: "#21835D" },
  info: { bg: "rgba(37,99,235,.10)", texto: "#2563EB" },
  atencao: { bg: "rgba(245,158,11,.16)", texto: "#B45309" },
  perigo: { bg: "rgba(220,38,38,.10)", texto: "#DC2626" },
  neutro: { bg: "rgba(15,23,42,.06)", texto: "#64748B" },
  extra: { bg: "rgba(124,58,237,.10)", texto: "#7C3AED" },
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
  cor = ERP_COLORS.gold,
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
        style={{ backgroundColor: `${cor}1A` }}
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
        className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 text-left shadow-card transition-colors hover:border-[rgba(196,154,67,.55)]"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-card">
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
        "overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-card",
        className,
      )}
    >
      {titulo || acoes ? (
        <header className="flex min-h-[42px] flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{titulo}</h3>
          {acoes ? <div className="flex flex-wrap items-center gap-1.5">{acoes}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Tabela clara compacta (linhas 40-44px, header cinza-claro, hover leve). */
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
          <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA]">
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
        <tbody className="divide-y divide-[#EEF1F5]">{children}</tbody>
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
    <tr className="transition-colors hover:bg-[rgba(15,23,42,.02)]">{children}</tr>
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
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#F8F9FA]",
        className,
      )}
    >
      <header
        className="flex min-h-[42px] shrink-0 items-center justify-between gap-2 px-3 py-2"
        style={{ backgroundColor: `${cor}14`, borderBottom: `2px solid ${cor}` }}
      >
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: cor }}>
          {titulo}
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: `${cor}26`, color: cor }}
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
    gold: "min-h-[34px] border border-[#C49A43] bg-gradient-to-b from-[#D9B25E] to-[#C49A43] text-[#202B3A] hover:brightness-105",
    ghost:
      "min-h-[34px] border border-[#E5E7EB] bg-white text-[#202B3A] hover:border-[rgba(196,154,67,.55)] hover:bg-[#F5EBD2]",
    danger:
      "min-h-[34px] border border-[rgba(220,38,38,.4)] bg-[rgba(220,38,38,.08)] text-[#DC2626] hover:bg-[rgba(220,38,38,.16)]",
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
        "overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-card",
        className,
      )}
    >
      <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{titulo}</h3>
        {acoes}
      </header>
      <div className={cn("p-3", altura)}>{children}</div>
    </section>
  );
}
