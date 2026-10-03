import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Calculator, Clock, Package, Search, Share2, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import hero from "@/assets/hero.jpg";
import { HeroCarousel, useHeroCarousel } from "@/components/hero-carousel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { isPromoAtiva, useAvaliacoes, useCategorias, useProdutos } from "@/lib/catalog";
import { useSession, useStaffOnly } from "@/lib/session";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
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
  const { data: categorias, isLoading: loadingCats } = useCategorias();
  const { data: produtos, isLoading: loadingProds } = useProdutos();
  const { data: avaliacoes } = useAvaliacoes();
  const { user } = useSession();
  const { staffOnly, painel } = useStaffOnly();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subtotal, totalItens } = useCart();
  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState<string | null>(null);
  const carregando = loadingCats || loadingProds;
  const { itens: heroItens, carregando: heroCarregando } = useHeroCarousel();

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  // Link rastreável de campanha (?campanha=xxx): guarda a origem p/ atribuir o pedido depois.
  useEffect(() => {
    try {
      const camp = new URLSearchParams(window.location.search).get("campanha");
      if (camp) {
        const slug = camp.slice(0, 60);
        localStorage.setItem("neia-campanha", slug);
        const chave = `neia-clique-${slug}`;
        if (!sessionStorage.getItem(chave)) {
          sessionStorage.setItem(chave, "1");
          void supabase.from("campanha_cliques").insert({ slug }).then(() => undefined, () => undefined);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  function compartilhar() {
    const url = `${window.location.origin}/`;
    const texto = "Cardápio Néia Salgados — salgados, combos e kits para festa!";
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ title: "Néia Salgados", text: texto, url }).catch(() => undefined);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`, "_blank", "noopener");
    }
  }

  const { data: favoritos } = useQuery({
    queryKey: ["favoritos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("favoritos").select("produto_id");
      if (error) throw error;
      return (data ?? []).map((f: { produto_id: string }) => f.produto_id);
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
    if (!user) {
      toast.info("Entre na sua conta para favoritar produtos.");
      navigate({ to: "/auth", search: { redirect: "/" } });
      return;
    }
    if (favoritos?.includes(produtoId)) {
      await supabase.from("favoritos").delete().eq("produto_id", produtoId).eq("user_id", user.id);
    } else {
      await supabase.from("favoritos").insert({ produto_id: produtoId, user_id: user.id });
    }
    queryClient.invalidateQueries({ queryKey: ["favoritos"] });
  }

  const termo = busca.trim().toLowerCase();
  const listaFiltrada = (produtos ?? []).filter((p) =>
    termo
      ? p.nome.toLowerCase().includes(termo) || (p.descricao ?? "").toLowerCase().includes(termo)
      : true,
  );

  const catsVisiveis = (categorias ?? []).filter((c) => !catAtiva || c.id === catAtiva);
  const slugPorId = useMemo(() => new Map((categorias ?? []).map((c) => [c.id, c.slug])), [categorias]);
  const ofertas = useMemo(() => (produtos ?? []).filter((p) => isPromoAtiva(p) && p.disponivel), [produtos]);
  const destaques = useMemo(() => (produtos ?? []).filter((p) => p.destaque && p.disponivel), [produtos]);

  if (staffOnly) {
    return <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>;
  }

  return (
    <div>
      {heroItens.length > 0 || heroCarregando ? (
        <HeroCarousel itens={heroItens} carregando={heroCarregando} />
      ) : (
      <section className="relative h-[320px] w-full overflow-hidden sm:h-[420px]">
        <img
          src={hero}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-110 object-cover blur-2xl"
        />
        <img
          src={hero}
          alt="Bandeja de salgados variados"
          width={1600}
          height={912}
          className="relative size-full object-contain"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/35 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-full max-w-2xl bg-gradient-to-r from-foreground/70 to-transparent sm:w-3/5" />
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-6xl px-4">
            <div className="max-w-lg text-background">
              <h1 className="font-display text-3xl leading-tight text-white sm:text-5xl">
                Salgados quentinhos na sua porta
              </h1>
              <p className="mt-3 text-sm text-white/85 sm:text-base">
                Fritos, assados, congelados e kits para festa. Peça agora e receba em minutos.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-white/85 sm:text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4" /> 40-60 min
                </span>
                <span className="flex items-center gap-1.5">
                  <Truck className="size-4" /> Entrega a partir de {brl(TAXA_ENTREGA)}
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4" /> Pagamento na entrega ou PIX
                </span>
                <button
                  type="button"
                  onClick={compartilhar}
                  className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 font-semibold text-white backdrop-blur hover:bg-white/30"
                >
                  <Share2 className="size-4" /> Compartilhar
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

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
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Link
            to="/combo"
            className="brand-gradient flex items-center gap-3 rounded-2xl p-4 text-white shadow-[var(--shadow-card)]"
          >
            <span className="rounded-xl bg-white/20 p-2">
              <Package className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg leading-tight">Monte seu combo</span>
              <span className="block text-xs text-white/85">Misture sabores à vontade — total por categoria em múltiplos de 50</span>
            </span>
            <ArrowRight className="size-5" />
          </Link>
          <Link
            to="/calculadora"
            className="brand-gradient flex items-center gap-3 rounded-2xl p-4 text-white shadow-[var(--shadow-card)]"
          >
            <span className="rounded-xl bg-white/20 p-2">
              <Calculator className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg leading-tight">Orçamento de salgados</span>
              <span className="block text-xs text-white/85">Calculamos a quantidade e o valor — fornecemos só os salgados, sem buffet</span>
            </span>
            <ArrowRight className="size-5" />
          </Link>
        </div>
        {carregando ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Carregando cardápio">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-border bg-card">
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-5 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!carregando && !termo && !catAtiva ? (
          <>
            {ofertas.length > 0 ? (
              <section className="mb-8" aria-label="Ofertas da semana">
                <h2 className="mb-3 font-display text-2xl">🔥 Ofertas da semana</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {ofertas.slice(0, 8).map((p) => (
                    <ProductCard
                      key={p.id}
                      produto={p}
                      slugCategoria={slugPorId.get(p.categoria_id) ?? ""}
                      nota={(() => { const n = notas.get(p.id); return n ? n.soma / n.qtd : null; })()}
                      favorito={favoritos?.includes(p.id)}
                      onToggleFavorito={() => toggleFavorito(p.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {destaques.length > 0 ? (
              <section className="mb-8" aria-label="Destaques">
                <h2 className="mb-3 font-display text-2xl">⭐ Destaques</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {destaques.slice(0, 8).map((p) => (
                    <ProductCard
                      key={p.id}
                      produto={p}
                      slugCategoria={slugPorId.get(p.categoria_id) ?? ""}
                      nota={(() => { const n = notas.get(p.id); return n ? n.soma / n.qtd : null; })()}
                      favorito={favoritos?.includes(p.id)}
                      onToggleFavorito={() => toggleFavorito(p.id)}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
        {!carregando
          ? catsVisiveis.map((cat) => {
              const itens = listaFiltrada.filter((p) => p.categoria_id === cat.id);
              if (itens.length === 0) return null;
              return (
                <section key={cat.id} className="mb-8">
                  <h2 className="mb-3 font-display text-2xl">{cat.nome}</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {itens.map((p) => {
                      const n = notas.get(p.id);
                      return (
                        <ProductCard
                          key={p.id}
                          produto={p}
                          slugCategoria={cat.slug}
                          nota={n ? n.soma / n.qtd : null}
                          favorito={favoritos?.includes(p.id)}
                          onToggleFavorito={() => toggleFavorito(p.id)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })
          : null}

        {!carregando && listaFiltrada.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground">
              {termo ? `Nenhum produto encontrado para “${busca.trim()}”.` : "Nenhum produto encontrado."}
            </p>
            {termo ? (
              <Button variant="outline" className="mt-4" onClick={() => { setBusca(""); setCatAtiva(null); }}>
                Limpar busca
              </Button>
            ) : null}
          </div>
        ) : null}

        <section className="mb-8 rounded-2xl border border-border bg-card p-5" aria-label="Como funciona">
          <h2 className="font-display text-2xl">Como funciona</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            <li className="rounded-xl bg-muted p-4 text-sm"><p className="font-bold">1. Escolha seus salgados</p><p className="mt-1 text-muted-foreground">Escolha produtos e sabores no cardápio ou monte seu combo.</p></li>
            <li className="rounded-xl bg-muted p-4 text-sm"><p className="font-bold">2. Monte seu pedido</p><p className="mt-1 text-muted-foreground">Combine sabores em múltiplos de 50. Congelados vendem por unidade.</p></li>
            <li className="rounded-xl bg-muted p-4 text-sm"><p className="font-bold">3. Receba em casa</p><p className="mt-1 text-muted-foreground">Informe endereço, escolha PIX ou pagamento na entrega e receba.</p></li>
          </ol>
        </section>

        <section className="mb-4 flex flex-wrap gap-2 text-xs sm:text-sm" aria-label="Informações de confiança">
          <span className="rounded-full border border-border bg-card px-3 py-1.5">🚚 Entrega em 40–60 minutos</span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">📦 Pedidos para festas e eventos</span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">🔢 Combos a partir de 50 unidades</span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">🧊 Congelados vendidos por unidade</span>
          <span className="rounded-full border border-border bg-card px-3 py-1.5">💳 PIX e pagamento na entrega</span>
        </section>
      </div>

      {totalItens > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto hidden w-[min(100%-2rem,32rem)] md:block">
          <Button asChild size="lg" className="w-full justify-between shadow-[var(--shadow-float)]">
            <Link to="/carrinho">
              <span className="flex items-center gap-2">
                <ShoppingBag className="size-4" /> Ver carrinho ({totalItens})
              </span>
              <span>{brl(subtotal)}</span>
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
