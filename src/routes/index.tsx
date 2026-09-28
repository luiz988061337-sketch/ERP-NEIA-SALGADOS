import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MapPin, Search, ShieldCheck, Truck } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { useAvaliacoes, useCategorias, useProdutos } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { brl, TAXA_ENTREGA } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Néia Salgados — Peça salgados com entrega rápida" },
      {
        name: "description",
        content:
          "Cardápio de salgados fritos, assados, congelados, mini salgados, kits para festa e bebidas com entrega em casa.",
      },
      { property: "og:title", content: "Néia Salgados — Delivery de salgados" },
      {
        property: "og:description",
        content: "Salgados quentinhos, kits para festa e bebidas entregues na sua porta.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: categorias } = useCategorias();
  const { data: produtos } = useProdutos();
  const { data: avaliacoes } = useAvaliacoes();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { subtotal, totalItens } = useCart();
  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState<string | null>(null);

  const { data: favoritos } = useQuery({
    queryKey: ["favoritos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favoritos").select("produto_id");
      if (error) throw error;
      return (data ?? []).map((f) => f.produto_id);
    },
  });

  const notas = useMemo(() => {
    const map = new Map<string, { soma: number; qtd: number }>();
    for (const a of avaliacoes ?? []) {
      const cur = map.get(a.produto_id) ?? { soma: 0, qtd: 0 };
      map.set(a.produto_id, { soma: cur.soma + a.nota, qtd: cur.qtd + 1 });
    }
    return map;
  }, [avaliacoes]);

  async function toggleFavorito(produtoId: string) {
    if (!user) return;
    if (favoritos?.includes(produtoId)) {
      await supabase.from("favoritos").delete().eq("produto_id", produtoId).eq("user_id", user.id);
    } else {
      await supabase.from("favoritos").insert({ produto_id: produtoId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["favoritos"] });
  }

  const listaFiltrada = (produtos ?? []).filter((p) =>
    busca ? p.nome.toLowerCase().includes(busca.toLowerCase()) : true,
  );

  const catsVisiveis = (categorias ?? []).filter((c) => !catAtiva || c.id === catAtiva);

  return (
    <div>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt="Bandeja de salgados variados"
          width={1600}
          height={912}
          className="h-[320px] w-full object-cover sm:h-[420px]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/55 to-transparent" />
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-6xl px-4">
            <div className="max-w-lg text-background">
              <h1 className="font-display text-3xl leading-tight text-white sm:text-5xl">
                Salgados quentinhos na sua porta
              </h1>
              <p className="mt-3 text-sm text-white/85 sm:text-base">
                Fritos, assados, congelados e kits para festa. Peça agora e receba em minutos.
              </p>
              <div className="mt-5 flex flex-wrap gap-4 text-xs text-white/85 sm:text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" /> 40-60 min
                </span>
                <span className="flex items-center gap-1.5">
                  <Truck className="size-4" /> Entrega {brl(TAXA_ENTREGA)}
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4" /> Pagamento na entrega ou PIX
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="pl-9"
            />
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCatAtiva(null)}
              className={cn(
                "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm transition-colors",
                !catAtiva ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              Tudo
            </button>
            {(categorias ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setCatAtiva(c.id)}
                className={cn(
                  "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm transition-colors",
                  catAtiva === c.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 pb-28">
        {catsVisiveis.map((cat) => {
          const itens = listaFiltrada.filter((p) => p.categoria_id === cat.id);
          if (itens.length === 0) return null;
          return (
            <section key={cat.id} className="mb-8">
              <h2 className="mb-3 font-display text-2xl">{cat.nome}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {itens.map((p) => {
                  const n = notas.get(p.id);
                  return (
                    <ProductCard
                      key={p.id}
                      produto={p}
                      slugCategoria={cat.slug}
                      nota={n ? n.soma / n.qtd : null}
                      favorito={favoritos?.includes(p.id)}
                      onToggleFavorito={user ? () => toggleFavorito(p.id) : undefined}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}

        {listaFiltrada.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">Nenhum produto encontrado.</p>
        ) : null}
      </div>

      {totalItens > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(100%-2rem,32rem)]">
          <Button asChild size="lg" className="w-full justify-between shadow-[var(--shadow-float)]">
            <Link to="/carrinho">
              <span className="flex items-center gap-2">
                <MapPin className="size-4" /> Ver carrinho ({totalItens})
              </span>
              <span>{brl(subtotal)}</span>
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
