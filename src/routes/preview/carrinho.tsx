import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, Gift, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/carrinho")({
  head: () => ({
    meta: [
      { title: "Carrinho — Néia Salgados Preview" },
      { name: "description", content: "Revise seu pedido Néia Salgados" },
    ],
  }),
  component: PreviewCarrinho,
});

const MOCK_ITEMS = [
  { id: "1", nome: "Coxinha de Frango c/ Catupiry", preco: 7.50, quantidade: 3, imagem: null, observacao: "", combo: false, produtoId: "1" },
  { id: "2", nome: "Bolinho de Queijo", preco: 6.50, quantidade: 2, imagem: null, observacao: "Bem passado", combo: false, produtoId: "2" },
  { id: "3", nome: "Risol de Presunto e Queijo", preco: 7.00, quantidade: 1, imagem: null, observacao: "", combo: false, produtoId: "3" },
  { id: "4", nome: "Combo Festa 50 unidades", preco: 320.00, quantidade: 1, imagem: null, observacao: "25 coxinha + 25 bolinho", combo: true, produtoId: "4" },
];

const TAXA_ENTREGA = 6.00;
const MINIMO_COMBO = 50;
const PASSO_COMBO = 50;

function PreviewCarrinho() {
  const [items, setItems] = useState(MOCK_ITEMS);
  const [cupom, setCupom] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{ codigo: string; desconto: number } | null>(null);

  const subtotal = items.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  const desconto = cupomAplicado?.desconto ?? 0;
  const taxaEntrega = subtotal > 0 ? TAXA_ENTREGA : 0;
  const total = Math.max(0, subtotal - desconto) + taxaEntrega;

  function setQuantidade(itemId: string, novaQtd: number) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (item.combo) {
          const passo = PASSO_COMBO;
          const minimo = MINIMO_COMBO;
          if (novaQtd > 0 && novaQtd < minimo) return item;
          const ajustada = Math.max(0, Math.round(novaQtd / passo) * passo);
          return { ...item, quantidade: ajustada };
        }
        return { ...item, quantidade: Math.max(0, novaQtd) };
      })
    );
  }

  function removeItem(itemId: string) {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  function setObservacao(itemId: string, obs: string) {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, observacao: obs } : item)));
  }

  function aplicarCupom() {
    const codigo = cupom.trim().toUpperCase();
    if (!codigo) return;
    // Mock: NEIA10 = 10% off, NEIA20 = R$ 20 off
    if (codigo === "NEIA10") {
      setCupomAplicado({ codigo, desconto: Math.round(subtotal * 0.1 * 100) / 100 });
    } else if (codigo === "NEIA20") {
      setCupomAplicado({ codigo, desconto: 20 });
    } else {
      alert("Cupom inválido. Tente: NEIA10 ou NEIA20");
      return;
    }
    setCupom("");
  }

  const proximaPromo = useMemo(() => {
    const promos = [
      { codigo: "NEIA10", minimo: 50 },
      { codigo: "NEIA20", minimo: 100 },
    ];
    return promos.find((p) => p.minimo > subtotal) ?? null;
  }, [subtotal]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-md">
            <ShoppingBag className="mx-auto size-16 text-muted-foreground/50" />
            <h1 className="mt-6 font-display text-2xl text-foreground">Seu carrinho está vazio</h1>
            <p className="mt-2 text-muted-foreground">Escolha seus salgados favoritos no cardápio.</p>
            <Button asChild className="mt-6 w-full sm:w-auto">
              <Link to="/preview/cardapio">Ver Cardápio</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/preview/cardapio"><ArrowLeft className="size-5" /></Link>
            </Button>
            <h1 className="font-display text-2xl">Carrinho</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-8 md:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Lista de itens */}
          <ul className="space-y-3" role="list" aria-label="Itens do carrinho">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-all hover:border-primary/30 animate-fade-in"
              >
                <div className="flex items-start gap-4">
                  <div className="relative h-16 w-16 shrink-0 rounded-xl bg-muted overflow-hidden">
                    {item.imagem ? (
                      <img src={item.imagem} alt={item.nome} className="size-full object-cover" />
                    ) : (
                      <div className="brand-gradient flex h-full items-center justify-center px-2 text-center font-display text-xs font-bold text-black">Néia DEMO</div>
                    )}
                    {item.combo && (
                      <span className="absolute bottom-1 right-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold text-primary-foreground">COMBO</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold text-foreground truncate">{item.nome}</h3>
                        <p className="text-sm text-muted-foreground">
                          {item.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} cada
                          {item.combo && ` • combo em múltiplos de ${PASSO_COMBO}`}
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-lg text-primary">
                        { (item.preco * item.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1 border border-border rounded-lg">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => {
                            const passo = item.combo ? PASSO_COMBO : 1;
                            const nova = item.quantidade - passo;
                            if (item.combo && nova > 0 && nova < MINIMO_COMBO) {
                              alert(`Combos têm mínimo de ${MINIMO_COMBO} unidades. Para remover, use a lixeira.`);
                              return;
                            }
                            setQuantidade(item.id, nova);
                          }}
                          aria-label={`Diminuir ${item.nome}`}
                          disabled={item.quantidade <= (item.combo ? MINIMO_COMBO : 1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-10 text-center font-semibold">{item.quantidade}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => setQuantidade(item.id, item.quantidade + (item.combo ? PASSO_COMBO : 1))}
                          aria-label={`Aumentar ${item.nome}`}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remover ${item.nome}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="mt-3">
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
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Resumo */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sticky top-24 self-start animate-slide-up">
            <h2 className="font-display text-lg">Resumo do Pedido</h2>

            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Produtos ({items.reduce((a, i) => a + i.quantidade, 0)} itens)</span>
                <span>{subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entrega</span>
                <span>{taxaEntrega.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>

              {desconto > 0 && (
                <div className="flex justify-between text-sm text-success border-t border-border pt-3">
                  <span>Desconto ({cupomAplicado?.codigo})</span>
                  <span>-{desconto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </div>
              )}

              <div className="flex justify-between font-display text-xl border-t border-border pt-3">
                <span>Total</span>
                <span className="text-primary">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>

              <p className="text-xs text-muted-foreground">Taxa de entrega cobrada 1x por pedido. Cupom aplicado no checkout.</p>

              {proximaPromo && (
                <div className="rounded-lg bg-muted p-3 border border-border">
                  <p className="text-xs text-muted-foreground">
                    Faltam <strong>{(proximaPromo.minimo - subtotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> para usar o cupom <strong>{proximaPromo.codigo}</strong> (mín. {proximaPromo.minimo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (subtotal / proximaPromo.minimo) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Cupom */}
            <div className="mt-5 rounded-lg border border-border p-4 bg-muted/50">
              <Label className="text-sm font-medium">Cupom de desconto</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={cupom}
                  onChange={(e) => setCupom(e.target.value.toUpperCase())}
                  placeholder="Ex: NEIA10"
                  maxLength={20}
                  className="flex-1"
                />
                <Button variant="outline" onClick={aplicarCupom} disabled={!cupom.trim()}>
                  Aplicar
                </Button>
              </div>
              {cupomAplicado && (
                <p className="mt-2 text-xs text-success flex items-center gap-1">
                  <Gift className="size-3.5" /> Cupom <strong>{cupomAplicado.codigo}</strong> aplicado! Desconto de {cupomAplicado.desconto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              )}
            </div>

            {/* Ações */}
            <div className="mt-5 flex flex-col gap-3">
              <Button asChild size="lg" className="brand-gradient w-full gap-2 text-black hover:opacity-90 shadow-[var(--shadow-glow)]">
                <Link to="/preview/checkout">Finalizar Pedido</Link>
                <Truck className="size-4" />
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/preview/cardapio">Continuar Comprando</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}