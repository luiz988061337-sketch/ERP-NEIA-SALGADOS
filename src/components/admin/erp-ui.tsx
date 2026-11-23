import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Componentes estruturais compartilhados do ERP (identidade premium escura/dourada).
 * Uso exclusivo do painel interno — a loja pública não importa nada daqui.
 * Paleta: fundo preto/grafite, cards escuros, bordas douradas brilhantes,
 * textos brancos, destaque em amarelo/dourado vivo, status em verde/azul/laranja/vermelho.
 */

export const ERP_COLORS = {
  gold: "#D4A94A",
  goldStrong: "#F2CE6B",
  goldLight: "rgba(212,169,74,.14)",
  goldVeryLight: "rgba(212,169,74,.08)",
  green: "#35C97C",
  blue: "#5B93F5",
  orange: "#F5A623",
  red: "#F16A6A",
  purple: "#A78BFA",
  gray: "#A09A8E",
  // Tokens de sombra e borda
  line: "rgba(201,162,75,0.26)",
  lineStrong: "rgba(201,162,75,0.45)",
} as const;

/** Cabeçalho de módulo: ícone dourado + título grande + subtítulo + status à direita.
 * Fundo escuro com contorno dourado leve. */
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
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
          <Icone className="size-5 text-[#F2CE6B]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold uppercase leading-tight tracking-tight text-foreground">
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

/**
 * Cabeçalho de módulo premium (Lote 02): cartão com contorno dourado,
 * ícone grande, título, subtítulo, selo de demonstração e ações à direita.
 */
export function PremiumPageHeader({
  icone: Icone,
  titulo,
  subtitulo,
  demo = false,
  maiusculo = true,
  status,
  acoes,
}: {
  icone: LucideIcon;
  titulo: string;
  subtitulo?: string;
  demo?: boolean;
  maiusculo?: boolean;
  status?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4A94A] bg-[linear-gradient(120deg,#1C1912_0%,#141310_55%,#1A1712_100%)] px-4 py-3 shadow-card">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
          <Icone className="size-6 text-[#F2CE6B]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1
            className={cn(
              "font-display text-[22px] font-bold leading-tight tracking-tight text-[#F4F1EA]",
              maiusculo && "uppercase tracking-wide",
            )}
          >
            {titulo}
          </h1>
          {subtitulo ? (
            <p className="mt-0.5 text-[13px] leading-snug text-[#A09A8E]">{subtitulo}</p>
          ) : null}
        </div>
      </div>
      {demo ? (
        <span className="hidden rounded-full border border-[#D4A94A]/70 bg-[#1A1712] px-3 py-1 text-[11px] font-semibold tracking-wide text-[#F2CE6B] lg:inline-flex">
          MODO DEMONSTRAÇÃO · dados fictícios · nenhuma operação real
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {acoes}
        {status}
      </div>
    </header>
  );
}

/** Selo dourado de demonstração isolada (cabeçalho premium). */
export function PremiumDemoBadge({ children = "Demonstração isolada" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[#D4A94A]/70 bg-[#1A1712] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#F2CE6B]">
      {children}
    </span>
  );
}

/** Indicador de status ● texto, com cor. */
export function StatusDot({ label, cor = "#35C97C" }: { label: string; cor?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4A94A] bg-[#1A1712] px-2.5 py-1 text-xs font-medium text-[#F4F1EA]">
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
export function StatusBadge({
  tom = "neutro",
  children,
  className,
}: {
  tom?: "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra";
  children: ReactNode;
  className?: string;
}) {
  const BADGE_TOM_STYLE: Record<
    "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra",
    { bg: string; texto: string }
  > = {
    ok: { bg: "rgba(53,201,124,.18)", texto: "#35C97C" },
    info: { bg: "rgba(91,147,245,.16)", texto: "#5B93F5" },
    atencao: { bg: "rgba(245,166,35,.18)", texto: "#F5B301" },
    perigo: { bg: "rgba(241,106,106,.16)", texto: "#F16A6A" },
    neutro: { bg: "rgba(255,255,255,.05)", texto: "#A09A8E" },
    extra: { bg: "rgba(167,139,250,.14)", texto: "#A78BFA" },
  };
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

/** Badge maior (para uso em cards/grids). */
export function StatusBadgeLarge({
  tom = "neutro",
  children,
  className,
}: {
  tom?: "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra";
  children: ReactNode;
  className?: string;
}) {
  const BADGE_TOM_STYLE: Record<
    "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra",
    { bg: string; texto: string }
  > = {
    ok: { bg: "rgba(53,201,124,.18)", texto: "#35C97C" },
    info: { bg: "rgba(91,147,245,.16)", texto: "#5B93F5" },
    atencao: { bg: "rgba(245,166,35,.18)", texto: "#F5B301" },
    perigo: { bg: "rgba(241,106,106,.16)", texto: "#F16A6A" },
    neutro: { bg: "rgba(255,255,255,.05)", texto: "#A09A8E" },
    extra: { bg: "rgba(167,139,250,.14)", texto: "#A78BFA" },
  };
  const t = BADGE_TOM_STYLE[tom];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[9px] font-semibold uppercase tracking-wide",
        className,
      )}
      style={{ backgroundColor: t.bg, color: t.texto }}
    >
      {children}
    </span>
  );
}

/** Card de métrica compacto: ícone circular + label + valor + delta opcional.
 * Fundo escuro com contorno dourado, ícone dourado vivo. */
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
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#D4A94A] bg-[#1A1712]">
        <Icone className="size-4" style={{ color: cor }} aria-hidden />
      </span>
      <div className="min-w-0">
          <p className="text-xs font-medium uppercase leading-snug tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-display text-xl font-bold leading-tight">{valor}</p>
          {detalhe ? <p className="text-xs text-muted-foreground">{detalhe}</p> : null}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="erp-btn-gold min-h-[64px] items-center gap-3 rounded-xl border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C] shadow-card transition-colors"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-xl border border-[#D4A94A] bg-[#1A1712] shadow-card">
      {body}
    </div>
  );
}

/** Card de seção com título compacto e ações no cabeçalho.
 * Fundo escuro com contorno dourado forte. */
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
        "overflow-hidden rounded-xl border border-[#D4A94A] bg-[#1A1712] shadow-card",
        className,
      )}
    >
      {titulo || acoes ? (
        <header className="flex min-h-[42px] flex-wrap items-center justify-between gap-2 border-b border-[#D4A94A] px-3 py-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{titulo}</h3>
          {acoes ? <div className="flex flex-wrap items-center gap-1.5">{acoes}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Tabela compacta visual escuro/dourado. */
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
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-[#D4A94A] bg-[#1A1712]">
            {colunas.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "px-2.5 py-2 text-left text-[9px] font-bold uppercase tracking-wide text-foreground",
                  i === 0 && "rounded-tl-md",
                  i === colunas.length - 1 && "rounded-tr-md",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2721]">{children}</tbody>
      </table>
      {vazio && <p className="px-3 py-6 text-center text-xs text-muted-foreground">{vazio}</p>}
    </div>
  );
}

/** Linha de tabela padrão. */
export function DarkTableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-[#211F18]">{children}</tr>;
}

/** Coluna de kanban com header colorido (produção/atendimento).
 * Headers escuros com contorno dourado e fundo levemente tintado. */
export function KanbanColumn({
  titulo,
  contador,
  cor,
  children,
  className,
  icone: Icone,
}: {
  titulo: string;
  contador: number;
  cor: string;
  children: ReactNode;
  className?: string;
  /** Ícone do cabeçalho (à esquerda, como na referência). */
  icone?: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#D4A94A] bg-[#121110] shadow-card",
        className,
      )}
    >
      <header
        className="grid min-h-[56px] shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5"
        style={{ backgroundColor: cor, color: "#fff" }}
      >
        {Icone ? (
          <Icone className="size-6 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]" aria-hidden />
        ) : (
          <span />
        )}
        <h3 className="text-center font-display text-xl font-bold uppercase leading-none tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]">
          {titulo}
        </h3>
        <span className="grid min-w-8 place-items-center rounded-lg bg-black/25 px-2 py-1 font-display text-base font-bold leading-none text-white">
          {contador}
        </span>
      </header>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">{children}</div>
    </div>
  );
}

/** Botão de ação padronizado com gradiente dourado premium. */
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
    gold: "erp-btn-gold min-h-[34px] border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C] hover:brightness-105",
    ghost:
      "min-h-[34px] border border-[#2A2721] bg-[#1A1712] text-[#F4F1EA] hover:border-[#D4A94A] hover:bg-[#F2CE6B] hover:text-[#14120C]",
    danger: "min-h-[34px] border border-[#F16A6A] bg-[#140E0E] text-[#F16A6A] hover:bg-[#2A0E0E]",
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

/** Card que envolve um gráfico (título + corpo do gráfico).
 * Fundo escuro com contorno dourado. */
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
        "overflow-hidden rounded-xl border border-[#D4A94A] bg-[#1A1712] shadow-card",
        className,
      )}
    >
      <header className="flex min-h-[42px] items-center justify-between gap-2 border-b border-[#D4A94A] px-3 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{titulo}</h3>
        {acoes}
      </header>
      <div className={cn("p-3", altura)}>{children}</div>
    </section>
  );
}

export type BadgeTom = "ok" | "info" | "atencao" | "perigo" | "neutro" | "extra";

/**
 * Card de métrica do Painel de Gestão (referência oficial):
 * ícone em QUADRADO colorido à esquerda, label cinza no topo, valor branco
 * grande e delta colorido à direita.
 */
export function PainelMetrica({
  icone: Icone,
  label,
  valor,
  delta,
  cor = ERP_COLORS.gold,
  onClick,
}: {
  icone: LucideIcon;
  label: string;
  valor: ReactNode;
  delta?: ReactNode;
  cor?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${cor}26`, color: cor }}
      >
        <Icone className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-display text-lg font-bold leading-tight text-foreground sm:text-xl">
          {valor}
        </p>
      </div>
      {delta ? <div className="hidden shrink-0 text-right sm:block">{delta}</div> : null}
    </>
  );
  const cls =
    "flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[#D4A94A] bg-[#17150F] p-3 text-left shadow-card transition-colors";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "hover:border-[#F2CE6B]")}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/**
 * Cabeçalho de painel (referência oficial): marca + título em caixa alta +
 * subtítulo à esquerda, ações/seletor de data à direita. Fundo com fio
 * dourado separando do corpo do painel.
 */
export function PainelCabecalho({
  titulo,
  subtitulo,
  marca,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  marca?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4A94A] bg-[#17150F] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {marca ? <span className="shrink-0">{marca}</span> : null}
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-foreground">
            {titulo}
          </h1>
          {subtitulo ? <p className="truncate text-xs text-muted-foreground">{subtitulo}</p> : null}
        </div>
      </div>
      {acoes ? <div className="flex shrink-0 items-center gap-2">{acoes}</div> : null}
    </header>
  );
}

/**
 * Indicador premium (Lote 02): rótulo/valor/detalhe + ícone. Com
 * `posicao="esquerda"` o ícone fica à esquerda; com `tint` a cor de fundo é
 * aplicada por métrica (verde/azul/laranja/vermelho) nos painéis de Contador,
 * Dono e Metas.
 */
export function PremiumKpi({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  cor = ERP_COLORS.goldStrong,
  posicao = "direita",
  tint,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode | undefined;
  cor?: string;
  posicao?: "esquerda" | "direita";
  tint?: "gold" | "green" | "blue" | "orange" | "red";
}) {
  const conteudo = (
    <div
      className={cn(
        "relative z-10",
        posicao === "esquerda" ? "min-h-[50px] py-3 pl-14 pr-3" : "min-h-[50px] py-3 pl-4 pr-16",
      )}
    >
      <p className="text-[13px] font-medium text-[#A09A8E]">{rotulo}</p>
      <p className="font-display text-[22px] font-bold leading-tight text-[#F4F1EA]">{valor}</p>
      {detalhe ? <p className="text-[12px] leading-snug text-[#C9C2B8]">{detalhe}</p> : null}
    </div>
  );
  const card = (
    <div
      className={cn(
        "relative min-h-[86px] overflow-hidden rounded-xl border border-[#D4A94A] shadow-card",
        !tint && "bg-[linear-gradient(115deg,#201D14_0%,#15130E_58%,#1C1811_100%)]",
      )}
      style={tint ? { backgroundColor: `${cor}1F` } : undefined}
    >
      {posicao === "esquerda" ? (
        <div className="relative z-10 flex min-h-[86px] items-center gap-3 pl-4 pr-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
            <Icone className="size-5 text-[#F2CE6B]" aria-hidden />
          </span>
          {conteudo}
        </div>
      ) : (
        <>
          {conteudo}
          <Icone
            className="pointer-events-none absolute right-4 top-1/2 size-12 -translate-y-1/2 opacity-25"
            style={{ color: cor }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-6 top-1/2 size-14 -translate-y-1/2 rounded-full blur-2xl"
            style={{ backgroundColor: `${cor}22` }}
            aria-hidden
          />
        </>
      )}
      {tint ? (
        <span
          className="pointer-events-none absolute -right-2 -top-2 size-28 rounded-full blur-2xl"
          style={{ backgroundColor: `${cor}1F` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
  return card;
}

/**
 * Card de seção premium do Lote 02: cabeçalho com ícone dourado + título em
 * caixa alta + subtítulo opcional e ações à direita.
 */
export function PremiumSection({
  icone: Icone,
  titulo,
  subtitulo,
  acoes,
  children,
  className,
  bodyClassName,
}: {
  icone?: LucideIcon;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[#D4A94A] bg-[#17150F] shadow-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4A94A] bg-[#1B1811] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icone ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#D4A94A]/70 bg-[#1A1712]">
              <Icone className="size-4 text-[#F2CE6B]" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold uppercase leading-tight tracking-wide text-[#F4F1EA]">
              {titulo}
            </h3>
            {subtitulo ? (
              <p className="text-[12px] leading-snug text-[#A09A8E]">{subtitulo}</p>
            ) : null}
          </div>
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
