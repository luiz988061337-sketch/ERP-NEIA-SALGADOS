import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { brl, TAXA_ENTREGA } from "@/lib/format";

export const Route = createFileRoute("/carrinho")({
  head: () => ({
    meta: [
      { title: "Carrinho — Néia Salgados" },
      { name: "description", content: "Revise os itens do seu pedido antes de finalizar." },
      { property: "og:title", content: "Carrinho — Néia Salgados" },
      { property: "og:description", content: "Revise os itens do seu pedido antes de finalizar." },
    ],
  }),
  component: Carrinho,
});

function Carrinho() {
  const { items, setQuantidade, remove, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <ShoppingBag className="size-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl">Seu carrinho está vazio</h1>
        <p className="mt-2 text-sm text-muted-foreground">Escolha seus salgados favoritos no cardápio.</p>
        <Button asChild className="mt-6">
          <Link to="/">Ver cardápio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Seu carrinho</h1>

      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
          >
            <div className="flex-1">
              <p className="font-display">{item.nome}</p>
              <p className="text-sm text-muted-foreground">{brl(item.preco)} cada</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setQuantidade(item.id, item.quantidade - 1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-7 text-center font-semibold">{item.quantidade}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                onClick={() => setQuantidade(item.id, item.quantidade + 1)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <span className="w-20 text-right font-display">{brl(item.preco * item.quantidade)}</span>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => remove(item.id)}>
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{brl(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Taxa de entrega</span>
          <span>{brl(TAXA_ENTREGA)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 font-display text-lg">
          <span>Total</span>
          <span className="text-primary">{brl(subtotal + TAXA_ENTREGA)}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">Cupom de desconto pode ser aplicado no checkout.</p>
      </div>

      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/">Continuar comprando</Link>
        </Button>
        <Button asChild className="flex-1">
          <Link to="/checkout">Finalizar pedido</Link>
        </Button>
      </div>
    </div>
  );
}
