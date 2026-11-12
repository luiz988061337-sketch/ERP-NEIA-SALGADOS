import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Fundação visual do Admin (Projeto A1, Etapa B).
 * Uso exclusivo do painel interno — nada aqui é importado pela loja pública.
 * Tons semânticos seguem o padrão já usado no repo (tints do Tailwind):
 * neutro = amarelo da marca, ok = verde, info = azul, atencao = laranja,
 * perigo = vermelho, extra = roxo.
 */

export type Tom = "neutro" | "ok" | "info" | "atencao" | "perigo" | "extra";

export const TOM_FUNDO: Record<Tom, string> = {
  neutro: "bg-yellow-100 text-yellow-900",
  ok: "bg-green-100 text-green-800",
  info: "bg-blue-100 text-blue-800",
  atencao: "bg-orange-100 text-orange-800",
  perigo: "bg-red-100 text-red-800",
  extra: "bg-purple-100 text-purple-800",
};

/** Cabeçalho padrão de página/aba: título, descrição e ações à direita. */
export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-2xl">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

/** Cartão de indicador: ícone em pastilha, valor em destaque, subtítulo. */
export function StatCard({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "neutro",
  onClick,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  icone: LucideIcon;
  tom?: Tom;
  onClick?: () => void;
}) {
  const Corpo = (
    <>
      <span className={cn("rounded-lg p-2", TOM_FUNDO[tom])}>
        <Icone className="size-5" aria-hidden />
      </span>
      <span className="mt-2 block text-sm text-muted-foreground">{rotulo}</span>
      <span className="block font-display text-2xl">{valor}</span>
      {detalhe ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">{detalhe}</span>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-h-[44px] rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-[rgba(196,154,67,.55)]"
      >
        {Corpo}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      {Corpo}
    </div>
  );
}

/** Estado vazio padronizado (com rótulo textual, sem depender só de ícone). */
export function EmptyState({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{titulo}</p>
      {descricao ? <p className="text-xs text-muted-foreground">{descricao}</p> : null}
    </div>
  );
}

/** Carregamento padronizado (esqueleto + texto, sem layout shift brusco). */
export function LoadingState({ titulo = "Carregando…" }: { titulo?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label={titulo}>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <p className="text-xs text-muted-foreground">{titulo}</p>
    </div>
  );
}

/** Cartão colorido clicável (KPIs operacionais do mockup). */
export function StatusCard({
  className,
  icone: Icone,
  titulo,
  valor,
  detalhe,
  onClick,
  corIcone,
  corValor,
}: {
  className?: string;
  icone: LucideIcon;
  titulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  onClick?: () => void;
  /** Cor do ícone (padrão: herda a cor do texto). */
  corIcone?: string;
  /** Cor do valor (padrão: herda a cor do texto). */
  corValor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[88px] rounded-xl p-4 text-left shadow-[var(--shadow-card)] transition-opacity hover:opacity-90 ${className ?? ""}`}
    >
      <Icone className="size-6" style={corIcone ? { color: corIcone } : undefined} aria-hidden />
      <span className="mt-1 block text-sm font-semibold">{titulo}</span>
      <span className="block font-display text-3xl" style={corValor ? { color: corValor } : undefined}>
        {valor}
      </span>
      {detalhe ? <span className="mt-0.5 block text-xs opacity-80">{detalhe}</span> : null}
    </button>
  );
}

/** Anel de progresso SVG puro (sem lib): pct 0-100, rótulo central. */
export function DonutChart({
  pct,
  cor = "#F2CE6B",
  trilho = "rgba(255,255,255,.08)",
  tamanho = 120,
  grossura = 14,
  rotulo,
  sub,
}: {
  pct: number;
  cor?: string;
  trilho?: string;
  tamanho?: number;
  grossura?: number;
  rotulo: string;
  sub?: string;
}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = (tamanho - grossura) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        role="img"
        aria-label={`${rotulo}: ${v.toFixed(0)}%`}
      >
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke={trilho}
          strokeWidth={grossura}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke={cor}
          strokeWidth={grossura}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          fontSize="22"
          fontWeight="bold"
          fill="currentColor"
        >
          {v.toFixed(0)}%
        </text>
      </svg>
      <div className="leading-tight">
        <p className="text-sm font-bold">{rotulo}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </div>
  );
}
