import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Search, Filter, X, ShoppingBag, Package, Tag, Sparkles, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/cardapio")({
  head: () => ({
    meta: [
      { title: "Cardápio — Néia Salgados Preview" },
      { name: "description", content: "Cardápio completo de salgados Néia Salgados" },
    ],
  }),
  component: PreviewCardapio,
});

function PreviewCardapio() {
  const search = useSearch({ strict: false }) as { cat?: string };
  const [catAtiva, setCatAtiva] = useState<string | null>(search.cat ?? null);
  const [busca, setBusca] = useState("");
  const [filtroPromocao, setFiltroPromocao] = useState(false);

  const categorias = [
    { id: "coxinhas", nome: "Coxinhas", slug: "coxinhas", icone: "🍗", ordem: 1 },
    { id: "bolinhos", nome: "Bolinhos", slug: "bolinhos", icone: "🥟", ordem: 2 },
    { id: "risoles", nome: "Risoles", slug: "risoles", icone: "🥟", ordem: 3 },
    { id: "kibes", nome: "Kibes", slug: "kibes", icone: "🥟", ordem: 4 },
    { id: "croquetes", nome: "Croquetes", slug: "croquetes", icone: "🥟", ordem: 5 },
    { id: "mini-pasteis", nome: "Mini Pastéis", slug: "mini-pasteis", icone: "🥟", ordem: 6 },
    { id: "esfihas", nome: "Esfihas", slug: "esfihas", icone: "🥟", ordem: 7 },
    { id: "mini-pizzas", nome: "Mini Pizzas", slug: "mini-pizzas", icone: "🍕", ordem: 8 },
    { id: "empadas", nome: "Empadas", slug: "empadas", icone: "🥧", ordem: 9 },
  ];

  const todosProdutos = [
    // Coxinhas
    { id: 1, nome: "Coxinha de Frango c/ Catupiry", desc: "A clássica que todo mundo ama", preco: 7.50, imagem: null, promocao: true, precoOriginal: 8.50, categoria: "coxinhas", disponivel: true },
    { id: 2, nome: "Coxinha de Frango Tradicional", desc: "Frango desfiado, tempero caseiro", preco: 6.50, imagem: null, promocao: false, categoria: "coxinhas", disponivel: true },
    { id: 3, nome: "Coxinha de Carne Seca", desc: "Carne seca desfiada, cremosa", preco: 8.00, imagem: null, promocao: true, precoOriginal: 9.00, categoria: "coxinhas", disponivel: true },
    { id: 4, nome: "Coxinha de Queijo", desc: "Queijo muçarela derretido", preco: 6.50, imagem: null, promocao: false, categoria: "coxinhas", disponivel: true },
    { id: 5, nome: "Coxinha de Calabresa", desc: "Calabresa fatiada, levemente apimentada", preco: 7.00, imagem: null, promocao: false, categoria: "coxinhas", disponivel: true },
    { id: 6, nome: "Coxinha de Palmito", desc: "Palmito cremoso, opção vegetariana", preco: 7.50, imagem: null, promocao: false, categoria: "coxinhas", disponivel: true },

    // Bolinhos
    { id: 7, nome: "Bolinho de Queijo", desc: "Queijo derretido por dentro", preco: 6.50, imagem: null, promocao: false, categoria: "bolinhos", disponivel: true },
    { id: 8, nome: "Bolinho de Bacalhau", desc: "Bacalhau desfiado, azeitonas", preco: 8.50, imagem: null, promocao: true, precoOriginal: 9.50, categoria: "bolinhos", disponivel: true },
    { id: 9, nome: "Bolinho de Carne", desc: "Carne moída temperada", preco: 6.50, imagem: null, promocao: false, categoria: "bolinhos", disponivel: true },
    { id: 10, nome: "Bolinho de Frango c/ Catupiry", desc: "Frango cremoso com catupiry", preco: 7.00, imagem: null, promocao: false, categoria: "bolinhos", disponivel: true },
    { id: 11, nome: "Bolinho de Mandioca c/ Carne Seca", desc: "Massa de mandioca, recheio suculento", preco: 7.50, imagem: null, promocao: false, categoria: "bolinhos", disponivel: true },

    // Risoles
    { id: 12, nome: "Risol de Presunto e Queijo", desc: "Massa fina, recheio cremoso", preco: 7.00, imagem: null, promocao: true, precoOriginal: 8.00, categoria: "risoles", disponivel: true },
    { id: 13, nome: "Risol de Frango c/ Catupiry", desc: "Frango desfiado, catupiry cremoso", preco: 7.50, imagem: null, promocao: false, categoria: "risoles", disponivel: true },
    { id: 14, nome: "Risol de Carne", desc: "Carne moída bem temperada", preco: 6.50, imagem: null, promocao: false, categoria: "risoles", disponivel: true },
    { id: 15, nome: "Risol de Palmito", desc: "Palmito cremoso, opção veg", preco: 7.50, imagem: null, promocao: false, categoria: "risoles", disponivel: true },
    { id: 16, nome: "Risol de Camarão", desc: "Camarões suculentos, molho especial", preco: 9.00, imagem: null, promocao: true, precoOriginal: 10.50, categoria: "risoles", disponivel: true },

    // Kibes
    { id: 17, nome: "Kibe de Carne Tradicional", desc: "Trigo, carne, hortelã e especiarias", preco: 6.50, imagem: null, promocao: false, categoria: "kibes", disponivel: true },
    { id: 18, nome: "Kibe de Carne c/ Queijo", desc: "Recheio extra de queijo muçarela", preco: 7.50, imagem: null, promocao: false, categoria: "kibes", disponivel: true },
    { id: 19, nome: "Kibe de Frango", desc: "Frango desfiado temperado", preco: 6.50, imagem: null, promocao: true, precoOriginal: 7.50, categoria: "kibes", disponivel: true },
    { id: 20, nome: "Kibe de Queijo", desc: "Opção vegetariana, muito queijo", preco: 6.50, imagem: null, promocao: false, categoria: "kibes", disponivel: true },

    // Croquetes
    { id: 21, nome: "Croquete de Carne Seca", desc: "Recheio cremoso e temperado", preco: 7.00, imagem: null, promocao: false, categoria: "croquetes", disponivel: true },
    { id: 22, nome: "Croquete de Frango", desc: "Frango cremoso, massa crocante", preco: 6.50, imagem: null, promocao: false, categoria: "croquetes", disponivel: true },
    { id: 23, nome: "Croquete de Queijo", desc: "Queijo muçarela derretido", preco: 6.00, imagem: null, promocao: true, precoOriginal: 7.00, categoria: "croquetes", disponivel: true },
    { id: 24, nome: "Croquete de Espinafre c/ Ricota", desc: "Opção vegetariana leve e saborosa", preco: 7.00, imagem: null, promocao: false, categoria: "croquetes", disponivel: true },

    // Mini Pastéis
    { id: 25, nome: "Mini Pastel de Carne", desc: "Massa crocante, recheio generoso", preco: 5.50, imagem: null, promocao: true, precoOriginal: 6.50, categoria: "mini-pasteis", disponivel: true },
    { id: 26, nome: "Mini Pastel de Queijo", desc: "Queijo derretido, massa fina", preco: 5.00, imagem: null, promocao: false, categoria: "mini-pasteis", disponivel: true },
    { id: 27, nome: "Mini Pastel de Frango c/ Catupiry", desc: "Frango cremoso com catupiry", preco: 5.50, imagem: null, promocao: false, categoria: "mini-pasteis", disponivel: true },
    { id: 28, nome: "Mini Pastel de Palmito", desc: "Palmito cremoso", preco: 5.50, imagem: null, promocao: false, categoria: "mini-pasteis", disponivel: true },
    { id: 29, nome: "Mini Pastel de Carne Seca", desc: "Carne seca desfiada, tempero especial", preco: 6.00, imagem: null, promocao: false, categoria: "mini-pasteis", disponivel: true },

    // Esfihas
    { id: 30, nome: "Esfiha Aberta de Carne", desc: "Massa macia, recheio suculento", preco: 6.00, imagem: null, promocao: false, categoria: "esfihas", disponivel: true },
    { id: 31, nome: "Esfiha Fechada de Carne", desc: "Massa fofa, bem recheada", preco: 6.50, imagem: null, promocao: false, categoria: "esfihas", disponivel: true },
    { id: 32, nome: "Esfiha de Frango c/ Catupiry", desc: "Frango cremoso, catupiry derretido", preco: 7.00, imagem: null, promocao: true, precoOriginal: 8.00, categoria: "esfihas", disponivel: true },
    { id: 33, nome: "Esfiha de Calabresa", desc: "Calabresa, cebola, orégano", preco: 6.50, imagem: null, promocao: false, categoria: "esfihas", disponivel: true },
    { id: 34, nome: "Esfiha de Queijo", desc: "Queijo muçarela, orégano", preco: 6.00, imagem: null, promocao: false, categoria: "esfihas", disponivel: true },
    { id: 35, nome: "Esfiha de Escarola", desc: "Escarola refogada, alho, azeitona", preco: 6.50, imagem: null, promocao: false, categoria: "esfihas", disponivel: true },

    // Mini Pizzas
    { id: 36, nome: "Mini Pizza Calabresa", desc: "Molho especial, queijo, calabresa", preco: 7.50, imagem: null, promocao: false, categoria: "mini-pizzas", disponivel: true },
    { id: 37, nome: "Mini Pizza Mussarela", desc: "Molho, muito queijo, orégano", preco: 7.00, imagem: null, promocao: true, precoOriginal: 8.00, categoria: "mini-pizzas", disponivel: true },
    { id: 38, nome: "Mini Pizza Frango c/ Catupiry", desc: "Frango desfiado, catupiry, milho", preco: 8.00, imagem: null, promocao: false, categoria: "mini-pizzas", disponivel: true },
    { id: 39, nome: "Mini Pizza Portuguesa", desc: "Presunto, queijo, ovo, ervilha, cebola", preco: 8.50, imagem: null, promocao: false, categoria: "mini-pizzas", disponivel: true },
    { id: 40, nome: "Mini Pizza Marguerita", desc: "Molho, mussarela, tomate, manjericão", preco: 7.50, imagem: null, promocao: false, categoria: "mini-pizzas", disponivel: true },

    // Empadas
    { id: 41, nome: "Empada de Frango", desc: "Massa leve, frango cremoso", preco: 6.50, imagem: null, promocao: true, precoOriginal: 7.50, categoria: "empadas", disponivel: true },
    { id: 42, nome: "Empada de Palmito", desc: "Palmito cremoso, massa dourada", preco: 6.50, imagem: null, promocao: false, categoria: "empadas", disponivel: true },
    { id: 43, nome: "Empada de Camarão", desc: "Camarões suculentos, molho rosa", preco: 8.50, imagem: null, promocao: false, categoria: "empadas", disponivel: true },
    { id: 44, nome: "Empada de Queijo", desc: "Queijo cremoso, massa crocante", preco: 6.00, imagem: null, promocao: false, categoria: "empadas", disponivel: true },
    { id: 45, nome: "Empada de Carne Seca", desc: "Carne seca desfiada, tempero caseiro", preco: 7.00, imagem: null, promocao: false, categoria: "empadas", disponivel: true },
  ];

  const produtosFiltrados = useMemo(() => {
    return todosProdutos.filter((p) => {
      if (!p.disponivel) return false;
      if (catAtiva && p.categoria !== catAtiva) return false;
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        if (!p.nome.toLowerCase().includes(termo) && !p.desc.toLowerCase().includes(termo)) return false;
      }
      if (filtroPromocao && !p.promocao) return false;
      return true;
    });
  }, [catAtiva, busca, filtroPromocao]);

  const categoriaAtiva = categorias.find((c) => c.id === catAtiva);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header da página */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl">Cardápio</h1>
              <p className="text-sm text-muted-foreground">
                {categoriaAtiva ? `${categoriaAtiva.nome} • ` : ""}{produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className={cn("gap-1", filtroPromocao && "bg-primary/10 border-primary/30 text-primary")} onClick={() => setFiltroPromocao(!filtroPromocao)}>
                <Sparkles className="size-3.5" /> Promoções
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/preview/combo"><Package className="mr-1 size-3.5" /> Montar Combo</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Busca */}
        <div className="mx-auto max-w-7xl px-4 pb-4 md:px-6 lg:px-8">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="pl-9"
            />
            {busca && (
              <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setBusca("")} aria-label="Limpar busca">
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Categorias */}
        <div className="mx-auto max-w-7xl px-4 pb-4 md:px-6 lg:px-8">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setCatAtiva(null)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all whitespace-nowrap",
                !catAtiva
                  ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-card)]"
                  : "bg-card border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              Tudo
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCatAtiva(cat.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5",
                  catAtiva === cat.id
                    ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-card)]"
                    : "bg-card border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span>{cat.icone}</span>
                {cat.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid de produtos */}
      <div className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
          {produtosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="size-16 text-muted-foreground/50" />
              <h2 className="mt-4 font-display text-xl text-foreground">Nenhum produto encontrado</h2>
              <p className="mt-2 text-muted-foreground">
                {busca ? `Nenhum resultado para “${busca}”.` : catAtiva ? "Nenhum produto nesta categoria." : "Nenhum produto disponível no momento."}
              </p>
              {(busca || catAtiva) && (
                <Button variant="outline" className="mt-4" onClick={() => { setBusca(""); setCatAtiva(null); setFiltroPromocao(false); }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {produtosFiltrados.map((prod, i) => (
                <PreviewProductCard key={prod.id} produto={prod} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewProductCard({ produto, index }: { produto: any; index: number }) {
  const categoryImage = produto.categoria === "coxinhas" 
    ? "/src/assets/cat-fritos.jpg" 
    : "/src/assets/cat-assados.jpg";

  const handleAdd = () => {
    // Visual feedback only
    console.log("Adicionar ao carrinho:", produto.nome);
  };

  return (
    <article className="group relative rounded-2xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-[var(--shadow-float)] hover:-translate-y-1 animate-fade-in animate-slide-up" style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}>
      <div className="aspect-[4/3] bg-muted relative overflow-hidden">
        <img src={categoryImage} alt={produto.nome} className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
        {!produto.disponivel && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">Indisponível</span>
          </div>
        )}
        {produto.promocao && (
          <div className="absolute top-3 left-3 z-10">
            <span className="rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold text-destructive-foreground">
              -{Math.round((1 - produto.preco / (produto.precoOriginal || produto.preco)) * 100)}%
            </span>
          </div>
        )}
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
          <Button size="icon" variant="secondary" className="size-10 rounded-full shadow-[var(--shadow-float)]" onClick={handleAdd} disabled={!produto.disponivel}>
            <span className="sr-only">Adicionar {produto.nome}</span>
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {categorias.find(c => c.id === produto.categoria)?.nome ?? produto.categoria}
          </span>
          {produto.promocao && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Promoção</span>
          )}
        </div>
        <h3 className="font-display text-lg text-foreground line-clamp-1">{produto.nome}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{produto.desc}</p>
        <div className="flex items-baseline justify-between pt-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl text-primary">{produto.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            {produto.promocao && produto.precoOriginal && (
              <span className="text-sm line-through text-muted-foreground">{produto.precoOriginal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

const categorias = [
  { id: "coxinhas", nome: "Coxinhas", slug: "coxinhas", icone: "🍗", ordem: 1 },
  { id: "bolinhos", nome: "Bolinhos", slug: "bolinhos", icone: "🥟", ordem: 2 },
  { id: "risoles", nome: "Risoles", slug: "risoles", icone: "🥟", ordem: 3 },
  { id: "kibes", nome: "Kibes", slug: "kibes", icone: "🥟", ordem: 4 },
  { id: "croquetes", nome: "Croquetes", slug: "croquetes", icone: "🥟", ordem: 5 },
  { id: "mini-pasteis", nome: "Mini Pastéis", slug: "mini-pasteis", icone: "🥟", ordem: 6 },
  { id: "esfihas", nome: "Esfihas", slug: "esfihas", icone: "🥟", ordem: 7 },
  { id: "mini-pizzas", nome: "Mini Pizzas", slug: "mini-pizzas", icone: "🍕", ordem: 8 },
  { id: "empadas", nome: "Empadas", slug: "empadas", icone: "🥧", ordem: 9 },
];