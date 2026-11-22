import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useStaffOnly } from "@/lib/session";
import { brl } from "@/lib/format";

/** Barra fixa inferior no mobile — visível em todas as rotas de loja quando há itens. */
export function CartDock() {
  const { items, subtotal, totalItens } = useCart();
  const { staffOnly } = useStaffOnly();
  if (staffOnly || items.length === 0 || totalItens <= 0) return null;
  // HOMO-CLIENTE-15: a taxa depende da modalidade e do endereço validado no
  // checkout. A barra flutuante mostra apenas o subtotal, sem frete presumido.
  const valorCarrinho = subtotal;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <Button asChild size="lg" className="min-h-[52px] w-full justify-between text-base">
          <Link to="/carrinho" aria-label={`Ver pedido com ${totalItens} itens`}>
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" aria-hidden />
              {totalItens} {totalItens === 1 ? "item" : "itens"} — {brl(valorCarrinho)}
            </span>
            <span className="font-bold">VER PEDIDO</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
