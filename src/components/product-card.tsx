import { useRef } from "react";
import { Heart, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { imagemProduto, isPromoAtiva, precoFinal, tipoVendaProduto, type Produto } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { MINIMO_COMBO } from "@/lib/totals";
import { cn } from "@/lib/utils";

type Props = {
  produto: Produto;
  slugCategoria: string;
  nota?: number | null | undefined;
  favorito?: boolean | undefined;
  onToggleFavorito?: (() => void) | undefined;
};

export function ProductCard({ produto, slugCategoria, nota, favorito, onToggleFavorito }: Props) {
  const { add } = useCart();
  const preco = precoFinal(produto);
  const promo = produto.preco_promocional != null && isPromoAtiva(produto);
  const indisponivel = !produto.disponivel || produto.estoque <= 0;
  const tipo = tipoVendaProduto(produto, slugCategoria);
  const ehCombo = tipo === "combo_50";
  const adicionando = useRef(false);

  function adicionar() {
    if (indisponivel || adicionando.current) return;
    adicionando.current = true;
    // Combo entra com 50 unidades (regra dos múltiplos). Congelados/unidade: 1.
    add(
      {
        id: produto.id,
        nome: produto.nome,
        preco,
        imagem: produto.imagem_url,
        produtoId: produto.id,
        combo: ehCombo,
        estoque: produto.estoque,
      },
      ehCombo ? MINIMO_COMBO : 1,
    );
    toast.success(
      ehCombo
        ? `${MINIMO_COMBO} unidades de ${produto.nome} adicionadas — combos saem de ${MINIMO_COMBO} em ${MINIMO_COMBO}.`
        : `${produto.nome} adicionado ao pedido`,
    );
    setTimeout(() => {
      adicionando.current = false;
    }, 600);
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="relative">
        <img
          src={imagemProduto(produto.imagem_url, slugCategoria)}
          alt={produto.nome}
          loading="lazy"
          width={480}
          height={360}
          className={cn("aspect-[4/3] w-full object-cover", indisponivel && "grayscale")}
        />
        <div className="absolute left-2 top-2 flex gap-1.5">
          {promo ? (
            <Badge className="bg-primary text-primary-foreground">Promo</Badge>
          ) : null}
          {produto.destaque ? <Badge variant="secondary">⭐ Destaque</Badge> : null}
        </div>
        {onToggleFavorito ? (
          <button
            type="button"
            onClick={onToggleFavorito}
            aria-label="Favoritar"
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-muted-foreground shadow transition-colors hover:text-primary"
          >
            <Heart className={cn("size-4", favorito && "fill-primary text-primary")} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-display text-base leading-tight">{produto.nome}</h3>
        <p className="line-clamp-2 text-xs text-muted-foreground">{produto.descricao}</p>
        <p className="text-[11px] font-medium text-muted-foreground">
          {ehCombo ? `Venda em múltiplos de ${MINIMO_COMBO} • mínimo ${MINIMO_COMBO}un` : "Venda por unidade"}
        </p>

        {nota ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-secondary text-secondary" /> {nota.toFixed(1)}
          </span>
        ) : null}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
            {promo ? (
              <span className="text-xs text-muted-foreground line-through">{brl(produto.preco)}</span>
            ) : null}
            <span className="font-display text-lg text-primary">{brl(preco)}</span>
          </div>
          <Button
            size="sm"
            className="ml-auto min-h-[40px] shrink-0 px-4 font-bold"
            disabled={indisponivel}
            onClick={adicionar}
            aria-label={`Adicionar ${produto.nome} ao pedido`}
          >
            {indisponivel ? "Esgotado" : <><Plus className="mr-1 size-4" /> {ehCombo ? `+${MINIMO_COMBO}un` : "Adicionar"}</>}
          </Button>
        </div>
      </div>
    </article>
  );
}
