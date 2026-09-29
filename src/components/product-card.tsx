import { Heart, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { imagemProduto, precoFinal, type Produto } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
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
  const promo = produto.preco_promocional != null;
  const indisponivel = !produto.disponivel || produto.estoque <= 0;

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
        {promo ? (
          <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground">Promo</Badge>
        ) : null}
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

        {nota ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-secondary text-secondary" /> {nota.toFixed(1)}
          </span>
        ) : null}

        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            {promo ? (
              <span className="mr-1 text-xs text-muted-foreground line-through">{brl(produto.preco)}</span>
            ) : null}
            <span className="font-display text-lg text-primary">{brl(preco)}</span>
          </div>
          <Button
            size="sm"
            disabled={indisponivel}
            onClick={() => {
              add({ id: produto.id, nome: produto.nome, preco, imagem: produto.imagem_url });
              toast.success(`${produto.nome} adicionado ao carrinho`);
            }}
          >
            {indisponivel ? "Esgotado" : <Plus className="size-4" />}
          </Button>
        </div>
      </div>
    </article>
  );
}
