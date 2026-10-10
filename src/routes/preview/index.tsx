import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck, ShieldCheck, Clock, Sparkles, Package, ArrowRight, Calculator, Flame, Star, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import hero from "@/assets/hero.jpg";
import fritos from "@/assets/cat-fritos.jpg";
import assados from "@/assets/cat-assados.jpg";

export const Route = createFileRoute("/preview/")({
  head: () => ({
    meta: [
      { title: "Néia Salgados — Preview V4 DEMO" },
      { name: "description", content: "Preview V4 da nova experiência Néia Salgados — DEMO" },
    ],
  }),
  component: PreviewHome,
});

const CATEGORIAS = [
  { nome: "Fritos", slug: "mini-fritos", desc: "Crocantes, cremosos por dentro", img: fritos, count: "12 sabores" },
  { nome: "Assados", slug: "mini-assados", desc: "Leves, dourados na medida", img: assados, count: "10 sabores" },
  { nome: "Pastéis", slug: "mini-pasteis", desc: "Perfeitos para festas", img: fritos, count: "8 sabores" },
  { nome: "Mini Pizzas", slug: "mini-pizzas", desc: "Sabores variados", img: assados, count: "6 sabores" },
  { nome: "Empadinhas", slug: "mini-empadinhas", desc: "Massa leve, recheio cremoso", img: assados, count: "7 sabores" },
  { nome: "Congelados", slug: "mini-congelados", desc: "Venda por unidade — DEMO", img: hero, count: "Por unidade" },
  { nome: "Kits Festa", slug: "kits-para-festa", desc: "Praticidade para eventos", img: hero, count: "4 kits" },
  { nome: "Bebidas", slug: "bebidas", desc: "Para acompanhar", img: assados, count: "6 itens" },
];

const DESTAQUES = [
  { id: 1, nome: "Coxinha Frango c/ Catupiry", desc: "A clássica que todo mundo ama", preco: "R$ XX,XX — DEMO", img: fritos, tag: "MAIS VENDIDO" },
  { id: 2, nome: "Bolinho de Queijo", desc: "Queijo derretido por dentro", preco: "R$ XX,XX — DEMO", img: fritos, tag: "NOVO" },
  { id: 3, nome: "Risol Presunto e Queijo", desc: "Massa fina, recheio cremoso", preco: "R$ XX,XX — DEMO", img: assados, tag: "PROMOÇÃO" },
  { id: 4, nome: "Kibe de Carne", desc: "Tradicional, crocante e suculento", preco: "R$ XX,XX — DEMO", img: fritos, tag: null },
  { id: 5, nome: "Mini Pastel de Carne", desc: "Massa crocante, recheio generoso", preco: "R$ XX,XX — DEMO", img: fritos, tag: "COMBO" },
  { id: 6, nome: "Mini Pizza Calabresa", desc: "Molho especial, queijo derretido", preco: "R$ XX,XX — DEMO", img: assados, tag: null },
  { id: 7, nome: "Empada de Frango", desc: "Massa leve, frango cremoso", preco: "R$ XX,XX — DEMO", img: assados, count: null, tag: "CONGELADO" },
  { id: 8, nome: "Esfiha Aberta de Carne", desc: "Massa macia, recheio suculento", preco: "R$ XX,XX — DEMO", img: assados, tag: null },
];

function PreviewHome() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden">
        <img src={hero} alt="Bandeja de salgados Néia — DEMO" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
        <div className="absolute inset-0 bg-radial-glow" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:py-20 md:py-28 lg:px-6">
          <div className="max-w-2xl animate-slide-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-black/40 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur">
              <Sparkles className="size-3.5" /> Preview V4 — DEMO, sem pedido real
            </span>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              O sabor que transforma qualquer momento em festa.
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
              Salgados fresquinhos, combos em múltiplos de 50 e praticidade para pedir. Visual novo, mesma qualidade Néia.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="brand-gradient min-h-12 gap-2 text-base font-bold text-black">
                <Link to="/preview/cardapio">Ver cardápio <ArrowRight className="size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12 gap-2 border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20">
                <Link to="/preview/combo">Montar meu pedido <Calculator className="size-4" /></Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/80">
              <span className="flex items-center gap-2"><Clock className="size-4 text-primary" /> 40–60 min</span>
              <span className="flex items-center gap-2"><Truck className="size-4 text-primary" /> Entrega a partir de R$ XX,XX DEMO</span>
              <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> PIX e cartão na entrega</span>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--background)] to-transparent" aria-hidden="true" />
      </section>

      <div className="sticky top-16 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="no-scrollbar mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3">
          <Link to="/preview" className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Início</Link>
          <Link to="/preview/cardapio" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Cardápio</Link>
          <Link to="/preview/combo" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Combos</Link>
          <Link to="/preview/calculadora" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Calculadora</Link>
          <Link to="/preview/carrinho" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Carrinho</Link>
          <Link to="/preview/admin" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Painel DEMO</Link>
          <Link to="/preview/admin/entregas" className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">Central DEMO</Link>
        </div>
      </div>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 md:py-14" aria-label="Categorias">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl">Categorias</h2>
            <p className="mt-1 text-sm text-muted-foreground">Fotos reais da Néia • toque para explorar (DEMO)</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/preview/cardapio">Ver tudo</Link></Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIAS.map((c, i) => (
            <Link
              key={c.slug}
              to="/preview/cardapio"
              className="hover-lift group relative overflow-hidden rounded-2xl border border-border bg-card animate-fade-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="aspect-[16/10] overflow-hidden">
                <img src={c.img} alt={c.nome} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="p-3">
                <h3 className="font-display text-base leading-tight">{c.nome}</h3>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.desc}</p>
                <p className="mt-2 text-xs font-semibold text-primary">{c.count}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-card/40 py-10 md:py-14" aria-label="Destaques">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-center gap-2">
            <Flame className="size-5 text-primary" />
            <h2 className="font-display text-2xl sm:text-3xl">Os queridinhos da Néia — DEMO</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {DESTAQUES.map((p, i) => (
              <article key={p.id} className="hover-lift group overflow-hidden rounded-2xl border border-border bg-card animate-fade-in" style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}>
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img src={p.img} alt={p.nome} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  {p.tag && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold tracking-wide text-primary backdrop-blur">{p.tag}</span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <h3 className="line-clamp-1 font-display text-base">{p.nome}</h3>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{p.desc}</p>
                  <p className="pt-1 font-display text-base text-primary">{p.preco}</p>
                  <Button asChild size="sm" className="mt-2 w-full min-h-10 font-bold">
                    <Link to="/preview/cardapio"><ShoppingBag className="mr-1 size-4" /> Ver no cardápio</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 md:py-14" aria-label="Combos">
        <Link to="/preview/combo" className={cn("hover-lift group grid gap-6 overflow-hidden rounded-3xl border border-primary/20 bg-card p-6 sm:p-8 md:grid-cols-2 md:p-10")}>
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Package className="size-3.5" /> Monte sua festa — DEMO
            </span>
            <h2 className="mt-3 font-display text-3xl leading-tight">50 <ArrowRight className="inline size-6" /> 100 <ArrowRight className="inline size-6" /> 150 <ArrowRight className="inline size-6" /> 200</h2>
            <p className="mt-2 text-sm text-muted-foreground">Combos respeitam múltiplos de 50. Congelados por unidade. Progressão visual clara.</p>
            <span className="mt-4 inline-flex items-center gap-2 font-semibold text-primary">Começar montagem <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[50, 100, 150, 200].map((v) => (
              <div key={v} className="rounded-2xl border border-border bg-background p-4 text-center">
                <p className="font-display text-2xl text-primary">{v}</p>
                <p className="text-xs text-muted-foreground">unidades</p>
              </div>
            ))}
          </div>
        </Link>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-24 md:pb-10" aria-label="Avaliação">
        <div className="flex items-center gap-2">
          <Star className="size-5 fill-primary text-primary" />
          <p className="text-sm text-muted-foreground">4.9 — 1.200+ avaliações (DEMO visual) • Entrega 40–60 min • PIX na entrega</p>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Carrinho DEMO</p>
            <p className="font-display text-base">R$ XX,XX — DEMO</p>
          </div>
          <Button asChild className="min-h-11 flex-1 font-bold"><Link to="/preview/carrinho">Ver carrinho</Link></Button>
        </div>
      </div>
    </div>
  );
}
