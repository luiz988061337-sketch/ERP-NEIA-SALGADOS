import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  titulo: string;
  descricao?: string | undefined;
  children?: ReactNode;
  className?: string | undefined;
};

/**
 * Cabeçalho compartilhado das páginas públicas, conforme referência escrita aprovada:
 * fundo creme claro, ícone branco em quadrado vermelho→laranja→dourado,
 * título vinho e subtítulo marrom-cinza. Não altera a lógica das páginas.
 */
export function PublicPageHero({ icon: Icon, titulo, descricao, children, className }: Props) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-[#FFFCF7] p-5 shadow-[var(--shadow-card)] sm:p-7",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <span className="brand-gradient grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-[var(--shadow-card)] sm:size-14">
          <Icon className="size-6 sm:size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold leading-tight text-[#500B08] sm:text-[40px]">
            {titulo}
          </h1>
          {descricao ? (
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#60524C] sm:text-base">
              {descricao}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}
