import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/back-button";
import { useCart, isComboItem } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { brl, TAXA_ENTREGA } from "@/lib/format";
import { calcTotals, MINIMO_COMBO, PASSO_COMBO } from "@/lib/totals";
import { useStaffOnly } from "@/lib/session";
import { useCrmSettings } from "@/lib/crm";
import { useCategorias, useProdutos, precoFinal, tipoVendaProduto } from "@/lib/catalog";
import { sugestoesPorCoocorrencia, useTodosItens } from "@/lib/inteligencia";

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
  const { items, setQuantidade, setObservacao, remove, subtotal, add } = useCart();
  const { staffOnly, painel } = useStaffOnly();
  const navigate = useNavigate();
  const { taxaEntrega, total } = calcTotals({ subtotal, taxaEntrega: TAXA_ENTREGA });
  const { data: settings } = useCrmSettings();
  const sugAtivas = settings?.sugestoes_ativas ?? true;
  const { data: todosItens } = useTodosItens(sugAtivas && items.length > 0);
  const { data: produtos } = useProdutos();
const { data: categorias } = useCategorias();
  useEffect(() => {
    if (!produtos || produtos.length === 0 || items.length === 0) return;
    const porId = new Map(produtos.map((p) => [p.id, p]));
    for (const it of items) {
      if (!it.produtoId || it.combo) continue;
      const p = porId.get(it.produtoId);
      if (!p) continue;
      const limite = Math.max(0, Math.floor(p.estoque ?? 0));
      if (limite <= 0) {
        toast.warning(`${it.nome} ficou sem estoque. Remova o item para continuar.`);
      } else if (it.quantidade > limite) {
        toast.warning(`O estoque de ${it.nome} foi atualizado. Você pode comprar somente ${limite} agora.`);
        setQuantidade(it.id, limite);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos]);
  const { data: cupons } = useQuery({
    queryKey: ["cupons-ativos-carrinho"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cupons").select("codigo, tipo, valor, minimo").eq("ativo", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sugestoes = useMemo(() => {
    if (!sugAtivas || items.length === 0) return [];
    const excluir = new Set(items.map((i) => i.produtoId ?? i.id));
    const top = sugestoesPorCoocorrencia(items, todosItens ?? [], excluir, 4);
    const porId = new Map((produtos ?? []).map((p) => [p.id, p]));
    return top
      .map((s) => porId.get(s.produto_id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.disponivel && p.estoque > 0)
      .slice(0, 3);
  }, [sugAtivas, items, todosItens, produtos]);

  const slugCategoria = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug])),
    [categorias],
  );

  const proximaPromo = useMemo(() => {
    const candidatas = (cupons ?? [])
      .map((c: any) => ({ codigo: c.codigo, minimo: Number(c.minimo ?? 0) }))
      .filter((c) => c.minimo > subtotal)
      .sort((a, b) => a.minimo - b.minimo);
    return candidatas[0] ?? null;
  }, [cupons, subtotal]);

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

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
        {items.map((item) => {
          const combo = isComboItem(item);
          const passo = combo ? PASSO_COMBO : 1;
          return (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="font-display leading-tight">{item.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {brl(item.preco)} cada{combo ? ` • combo em múltiplos de ${PASSO_COMBO}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => {
                    const nova = item.quantidade - passo;
                    if (combo && nova > 0 && nova < MINIMO_COMBO) {
                      toast.error(`Combos têm mínimo de ${MINIMO_COMBO} unidades. Para remover, use a lixeira.`);
                      return;
                    }
                    setQuantidade(item.id, nova);
                  }}
                  aria-label={`Diminuir ${item.nome}`}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-7 text-center font-semibold">{item.quantidade}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => setQuantidade(item.id, item.quantidade + passo)}
                  aria-label={`Aumentar ${item.nome}`}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="w-20 text-right font-display">{brl(item.preco * item.quantidade)}</span>
              <Button size="icon" variant="ghost" className="size-9" onClick={() => remove(item.id)} aria-label={`Remover ${item.nome}`}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
            <div className="mt-2">
              <Label htmlFor={`obs-${item.id}`} className="text-xs text-muted-foreground">Observações (opcional)</Label>
              <Input
                id={`obs-${item.id}`}
                value={item.observacao ?? ""}
                onChange={(e) => setObservacao(item.id, e.target.value)}
                placeholder="Ex: bem passado, sem pimenta..."
                maxLength={200}
                className="mt-1"
              />
            </div>
          </li>
          );
        })}
      </ul>

      <div className="mt-6 space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Produtos</span>
          <span>{brl(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Entrega</span>
          <span>{brl(taxaEntrega)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 font-display text-lg">
          <span>Total</span>
          <span className="text-primary">{brl(total)}</span>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">Cupom de desconto pode ser aplicado no checkout. Taxa de entrega cobrada 1x por pedido.</p>
        {proximaPromo ? (
          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs">Faltam <strong>{brl(proximaPromo.minimo - subtotal)}</strong> para usar o cupom <strong>{proximaPromo.codigo}</strong> (mín. {brl(proximaPromo.minimo)}).</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (subtotal / proximaPromo.minimo) * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {sugestoes.length > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-card p-4" aria-label="Sugestões">
          <h2 className="font-display text-lg">Talvez você também goste</h2>
          <p className="text-xs text-muted-foreground">Baseado em pedidos reais.</p>
          <ul className="mt-3 space-y-2">
            {sugestoes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{p.nome} <span className="text-muted-foreground">• {brl(precoFinal(p))}</span></span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    add(
                      {
                        id: p.id,
                        nome: p.nome,
                        preco: precoFinal(p),
                        imagem: p.imagem_url,
                        produtoId: p.id,
                        combo: tipoVendaProduto(p, slugCategoria.get(p.categoria_id) ?? "") === "combo_50",
                      },
                      tipoVendaProduto(p, slugCategoria.get(p.categoria_id) ?? "") === "combo_50"
                        ? MINIMO_COMBO
                        : 1,
                    );
                    toast.success(`${p.nome} adicionado.`);
                  }}
                >
                  Adicionar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-4 flex gap-2">
        <BackButton label="Voltar" />
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
