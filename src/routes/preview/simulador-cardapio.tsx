import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CameraOff, Minus, Plus, RefreshCw, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PREVIEW_CATEGORIAS, PREVIEW_HERO_IMG, PREVIEW_MOMENTOS, PREVIEW_PRODUTOS, type PreviewMomento, type PreviewProduto } from "./-dados";

// Lógica local do Preview (sem banco, sem venda real).
// 1 combo = 50 salgados. Congelados/kits/bebidas ficam FORA da distribuição.
const CATS_COMBO = ["Fritos", "Pastéis", "Assados", "Pizzas", "Empadas"];

function embaralhar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = a[i];
    const y = a[j];
    if (x === undefined || y === undefined) continue;
    a[i] = y;
    a[j] = x;
  }
  return a;
}

// Sabores que podem compor o combo de 50 (só salgados; sem bebidas/kits).
const SABORES_COMBO: PreviewProduto[] = PREVIEW_PRODUTOS.filter((p) => CATS_COMBO.includes(p.categoria));

// Sugestão aleatória somando 50 DENTRO de uma categoria (regra: 1 combo = 1 categoria).
function sugestaoAleatoria(categoria: string): Record<string, number> {
  const dist: Record<string, number> = {};
  let resto = 50;
  const ordem = embaralhar(SABORES_COMBO.filter((p) => p.categoria === categoria));
  const blocos = [20, 15, 10, 10, 5];
  for (const p of ordem) {
    if (resto <= 0) break;
    const bloco = blocos[Math.floor(Math.random() * blocos.length)] ?? 5;
    const qtd = Math.min(bloco, resto);
    dist[p.id] = (dist[p.id] ?? 0) + qtd;
    resto -= qtd;
  }
  // Completa eventual resto no primeiro sabor (garante total 50).
  const primeiro = ordem[0];
  if (resto > 0 && primeiro) dist[primeiro.id] = (dist[primeiro.id] ?? 0) + resto;
  return dist;
}

export const Route = createFileRoute("/preview/simulador-cardapio")({
  head: () => ({
    meta: [
      { title: "Preview — Cardápio Real Néia Salgados" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SimuladorCardapio,
});

// Carrinho 100% mock do Preview: não toca o carrinho real, checkout ou banco.
function SimuladorCardapio() {
  const [categoria, setCategoria] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [sacola, setSacola] = useState<Record<string, number>>({});
  const [adicionadoId, setAdicionadoId] = useState<string | null>(null);
  const [momentoId, setMomentoId] = useState<string | null>(null);
  const [comboSabores, setComboSabores] = useState<Record<string, number>>({});
  const [catCombo, setCatCombo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const momento = PREVIEW_MOMENTOS.find((m) => m.id === momentoId) ?? null;
  const kitSugerido = momento?.kitId ? PREVIEW_PRODUTOS.find((p) => p.id === momento.kitId) ?? null : null;

  function escolherMomento(m: PreviewMomento) {
    // Regra absoluta: 1 combo = 1 categoria. Surpresa exige escolher a categoria primeiro.
    setMomentoId(m.id);
    setCatCombo(null);
    setComboSabores({});
  }

  function surpreendaMe() {
    const m = PREVIEW_MOMENTOS.find((x) => x.id === "surpresa");
    if (!m) return;
    setCategoria("Combinações");
    escolherMomento(m);
    requestAnimationFrame(() => document.getElementById("pv-momentos")?.scrollIntoView({ behavior: "smooth" }));
  }

  function adicionarComboMontado(descricao: string) {
    const id = `combo50-${Date.now()}`;
    setSacola((s) => ({ ...s, [id]: 1 }));
    toast.success(`Combo 50 na sacola: ${descricao} (demonstração)`);
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(
    () =>
      PREVIEW_PRODUTOS.filter(
        (p) =>
          (categoria === "Todos" || p.categoria === categoria) &&
          (!termo || p.nome.toLowerCase().includes(termo)),
      ),
    [categoria, termo],
  );
  const totalItens = useMemo(() => Object.values(sacola).reduce((a, q) => a + q, 0), [sacola]);

  function adicionar(p: PreviewProduto) {
    setSacola((s) => ({ ...s, [p.id]: (s[p.id] ?? 0) + 1 }));
    setAdicionadoId(p.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdicionadoId(null), 1200);
    toast.success(`${p.nome} na sacola (demonstração)`);
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Header slim */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <span className="font-display text-lg text-primary">Néia Salgados</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Preview</span>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
            <ShoppingBag className="size-4" aria-hidden />
            <span aria-live="polite">{totalItens} {totalItens === 1 ? "item" : "itens"}</span>
          </div>
        </div>
      </header>

      {/* Hero curto */}
      <section className="relative overflow-hidden">
        <img src={PREVIEW_HERO_IMG} alt="Caixa sortida de salgados Néia" className="h-44 w-full object-cover sm:h-56" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-4">
          <h1 className="font-display text-2xl sm:text-3xl">Salgados para todos os momentos</h1>
          <p className="text-sm text-muted-foreground">Escolha seus favoritos ou deixe a Néia montar uma combinação para você.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => document.getElementById("pv-produtos")?.scrollIntoView({ behavior: "smooth" })}>
              Explorar cardápio
            </Button>
            <Button size="sm" variant="outline" onClick={surpreendaMe}>
              <Sparkles className="mr-1 size-4" /> Surpreenda-me
            </Button>
          </div>
        </div>
      </section>

      <main id="pv-produtos" className="mx-auto max-w-7xl scroll-mt-16 space-y-4 px-4 py-6">
        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar salgados..."
            aria-label="Buscar salgados"
            className="pl-9 pr-9"
          />
          {busca && (
            <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Categorias */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Categorias">
          {PREVIEW_CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={categoria === c}
              onClick={() => setCategoria(c)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
                categoria === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Grade / Momentos */}
        {categoria === "Combinações" ? (
          <div id="pv-momentos" className="scroll-mt-16 space-y-4">
            <div>
              <h2 className="font-display text-xl">🎉 Monte sua combinação</h2>
              <p className="text-sm text-muted-foreground">Escolha um momento e receba uma sugestão com produtos reais. Só descoberta — sem venda real.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PREVIEW_MOMENTOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => escolherMomento(m)}
                  aria-pressed={momentoId === m.id}
                  className={cn(
                    "rounded-2xl border bg-card p-4 text-left transition-colors",
                    momentoId === m.id ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                >
                  <span className="text-2xl" aria-hidden>{m.icone}</span>
                  <span className="mt-1 block font-display text-base">{m.titulo}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.descricao}</span>
                  <span className="mt-2 block text-sm font-bold text-primary">Ver sugestão</span>
                </button>
              ))}
            </div>
            {momento && (
              <MontarCombo
                key={`${momento.id}-${catCombo ?? "sem-categoria"}`}
                momento={momento}
                categoria={catCombo}
                kitSugerido={kitSugerido}
                sabores={comboSabores}
                onSabores={setComboSabores}
                onTrocarCategoria={(cat: string) => { setCatCombo(cat); setComboSabores({}); }}
                onAdicionarCombo={adicionarComboMontado}
                onAdicionar={adicionar}
              />
            )}
            <MultiCombos
              onAdicionarMultiplos={(descricoes: string[]) => {
                setSacola((s) => {
                  const copia = { ...s };
                  for (const d of descricoes) copia[`combo50-${Date.now()}-${d}`] = 1;
                  return copia;
                });
                toast.success(`${descricoes.length} combos na sacola (demonstração)`);
              }}
            />
          </div>
        ) : visiveis.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum produto encontrado para essa busca.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {visiveis.map((p) => (
              <PreviewCard key={p.id} produto={p} adicionado={adicionadoId === p.id} onAdicionar={() => adicionar(p)} />
            ))}
          </div>
        )}
        <p className="text-center text-xs text-muted-foreground">Preços atuais do sistema — serão revisados. Demonstração sem checkout real.</p>
      </main>
    </div>
  );
}

function MontarCombo(props: {
  momento: PreviewMomento;
  categoria: string | null;
  kitSugerido: PreviewProduto | null;
  sabores: Record<string, number>;
  onSabores: Dispatch<SetStateAction<Record<string, number>>>;
  onTrocarCategoria: (cat: string) => void;
  onAdicionarCombo: (descricao: string) => void;
  onAdicionar: (p: PreviewProduto) => void;
}) {
  // REGRA ABSOLUTA: 1 combo = 1 categoria. Só sabores da categoria ativa entram na conta.
  const { momento, categoria, sabores } = props;
  const ehSurpresa = momento.id === "surpresa";
  const saboresCat = categoria ? SABORES_COMBO.filter((p) => p.categoria === categoria) : [];
  const total = saboresCat.reduce((a, p) => a + (sabores[p.id] ?? 0), 0);
  const faltam = 50 - total;
  const completo = total === 50;
  const itens = saboresCat.filter((p) => (sabores[p.id] ?? 0) > 0);

  function alterar(id: string, delta: number) {
    props.onSabores((prev) => {
      const atual = prev[id] ?? 0;
      const totalPrev = saboresCat.reduce((a, p) => a + (prev[p.id] ?? 0), 0);
      const novo = Math.min(Math.max(0, atual + delta), Math.max(0, 50 - (totalPrev - atual)));
      if (novo === atual) return prev;
      return { ...prev, [id]: novo };
    });
  }

  function gerarSugestao() {
    if (!categoria) return;
    props.onSabores(sugestaoAleatoria(categoria));
  }

  function surpreenderNovamente() {
    if (!categoria) return;
    props.onSabores(sugestaoAleatoria(categoria));
  }

  function limpar() {
    props.onSabores({});
  }

  function trocarCategoria(cat: string) {
    if (cat !== categoria) props.onTrocarCategoria(cat);
  }

  function adicionarCombo() {
    if (total !== 50) return;
    const descricao = `Combo 50 ${categoria}: ` + itens.map((p) => `${sabores[p.id]}x ${p.nome}`).join(", ");
    props.onAdicionarCombo(descricao);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {momento.icone} {momento.titulo} — <strong>COMBO — 50 UNIDADES{categoria ? ` ${categoria.toUpperCase()}` : ""}</strong>
      </p>

      {/* Seletor de categoria do combo (trocar zera a montagem atual) */}
      <div className="mt-3">
        <p className="text-sm font-bold">{ehSurpresa && !categoria ? "Qual categoria você quer?" : "Categoria do combo"}</p>
        <div className="mt-1 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categoria do combo">
          {CATS_COMBO.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={categoria === c}
              onClick={() => trocarCategoria(c)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm",
                categoria === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {!categoria ? (
        <p className="mt-3 text-sm text-muted-foreground">Escolha uma categoria acima — o combo terá 50 unidades só dela.</p>
      ) : (
      <>
      <p className="mt-3 text-sm"><strong>Monte seu combo escolhendo os sabores de {categoria.toLowerCase()}.</strong> Misture os sabores para completar as 50 unidades — sempre dentro da mesma categoria.</p>
      <p className="mt-1 text-xs text-muted-foreground">Exemplos (só exemplos): 50 Coxinhas • 25 + 25 • 20 + 10 + 10 + 10</p>

      {/* Contador */}
      <div className="mt-3 rounded-xl bg-muted p-3 text-sm" aria-live="polite">
        <p className="font-display text-lg">TOTAL DO COMBO — {total} / 50 unidades</p>
        {completo ? (
          <p className="font-bold text-primary">✓ COMBO COMPLETO — 50 / 50 unidades</p>
        ) : (
          <p>Faltam <strong>{faltam} unidades</strong></p>
        )}
      </div>

      {/* Sabores da categoria ativa */}
      <div className="mt-3">
        <h3 className="font-display text-sm uppercase text-muted-foreground">Sabores — {categoria}</h3>
        <div className="mt-1 space-y-2">
          {saboresCat.map((p) => {
            const qtd = sabores[p.id] ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                {p.foto ? (
                  <img src={p.foto} alt="" aria-hidden width={48} height={36} className="size-12 rounded-md object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden><CameraOff className="size-4" /></span>
                )}
                <span className="min-w-0 flex-1 text-sm font-bold">{p.nome}</span>
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => alterar(p.id, -1)} disabled={qtd <= 0} aria-label={`Menos uma unidade de ${p.nome}`}>−</Button>
                <span className="w-10 text-center text-sm font-bold" aria-live="polite">{qtd}</span>
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => alterar(p.id, 1)} disabled={total >= 50} aria-label={`Mais uma unidade de ${p.nome}`}>+</Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composição */}
      {itens.length > 0 && (
        <div className="mt-3 rounded-xl border border-border p-3">
          <h3 className="font-display text-sm uppercase text-muted-foreground">Composição do combo</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {itens.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">{p.nome}</span>
                <strong className="shrink-0">{sabores[p.id]}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-sm"><strong>Total — {total} / 50</strong>{!completo && <> • <span className="text-destructive">FALTAM {faltam} UNIDADES</span></>}</p>
          <p className="mt-1 text-xs text-muted-foreground">{categoria}: {total} unidades — tudo na mesma categoria, como manda a regra do combo.</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={gerarSugestao}>
          <RefreshCw className="mr-2 size-4" /> Gerar sugestão
        </Button>
        {ehSurpresa && (
          <Button size="sm" variant="outline" onClick={surpreenderNovamente}>
            <Sparkles className="mr-2 size-4" /> Surpreender novamente
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={limpar} disabled={total === 0}>Limpar</Button>
        <Button size="sm" disabled={!completo} onClick={adicionarCombo}>
          <Plus className="mr-2 size-4" /> Adicionar combo à sacola
        </Button>
      </div>

      {props.kitSugerido && props.kitSugerido.preco != null && (
        <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
          Também temos uma opção pronta para sua festa: <strong>{props.kitSugerido.nome}</strong> — {brl(props.kitSugerido.preco)}
          <Button size="sm" variant="outline" className="ml-2" onClick={() => props.onAdicionar(props.kitSugerido!)}>Adicionar</Button>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function MultiCombos({ onAdicionarMultiplos }: { onAdicionarMultiplos: (descricoes: string[]) => void }) {
  const [totalDesejado, setTotalDesejado] = useState(150);
  const [blocos, setBlocos] = useState<Record<string, number>>({});
  const valido = totalDesejado >= 50 && totalDesejado % 50 === 0;
  const usados = CATS_COMBO.reduce((a, c) => a + (blocos[c] ?? 0) * 50, 0);
  const completo = valido && usados === totalDesejado && totalDesejado > 0;

  function alterarBloco(cat: string, delta: number) {
    setBlocos((s) => {
      const atual = s[cat] ?? 0;
      const outros = CATS_COMBO.reduce((a, c) => a + (c === cat ? 0 : (s[c] ?? 0)), 0);
      const maxBlocos = valido ? Math.floor(totalDesejado / 50) - outros : 0;
      const novo = Math.min(Math.max(0, atual + delta), Math.max(0, maxBlocos));
      if (novo === atual) return s;
      return { ...s, [cat]: novo };
    });
  }

  // Expande os blocos em combos independentes de 50 (1 bloco = 1 combo = 1 categoria).
  const listaCombos: { key: string; titulo: string }[] = [];
  for (const cat of CATS_COMBO) {
    const n = blocos[cat] ?? 0;
    for (let i = 1; i <= n; i++) {
      listaCombos.push({ key: `${cat}-${i}`, titulo: n > 1 ? `Combo ${cat} #${i} — 50` : `Combo ${cat} — 50` });
    }
  }
  // Validação final: todo combo tem 50, toda categoria é válida, soma confere.
  const consistente = completo && listaCombos.length * 50 === totalDesejado
    && listaCombos.every((c) => CATS_COMBO.some((cat) => c.titulo.includes(cat)));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-lg">Montar vários combos</h3>
      <p className="text-sm text-muted-foreground">Informe o total e divida em blocos de 50 por categoria. Cada bloco é um combo independente.</p>
      <div className="mt-3">
        <label htmlFor="pv-total" className="text-sm font-bold">Quantos salgados você quer?</label>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => setTotalDesejado((t) => Math.max(50, t - 50))} aria-label="Menos 50">−</Button>
          <Input
            id="pv-total"
            inputMode="numeric"
            value={totalDesejado}
            onChange={(e) => setTotalDesejado(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="max-w-[140px] text-center text-lg font-bold"
          />
          <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => setTotalDesejado((t) => Math.min(1000, t + 50))} aria-label="Mais 50">+</Button>
        </div>
        {!valido ? (
          <p className="mt-1 text-xs text-destructive">Use múltiplos de 50 (50, 100, 150, 200…).</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Cada bloco é um combo de 50 da mesma categoria.</p>
        )}
      </div>
      {valido && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-bold">Divida seus salgados</p>
          {CATS_COMBO.map((cat) => {
            const n = blocos[cat] ?? 0;
            return (
              <div key={cat} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <span className="flex-1 text-sm font-bold">{cat}</span>
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => alterarBloco(cat, -1)} disabled={n <= 0} aria-label={`Menos um bloco de ${cat}`}>−</Button>
                <span className="w-20 text-center text-sm" aria-live="polite">{n * 50}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] min-w-[44px]"
                  onClick={() => alterarBloco(cat, 1)}
                  disabled={usados + 50 > totalDesejado}
                  aria-label={`Mais um bloco de ${cat}`}
                >
                  +
                </Button>
              </div>
            );
          })}
          <div className="rounded-xl bg-muted p-3 text-sm" aria-live="polite">
            <strong>TOTAL: {usados} / {totalDesejado}</strong>
            {usados < totalDesejado ? (
              <span> • Faltam <strong>{totalDesejado - usados}</strong></span>
            ) : (
              <span> • ✓ Distribuição completa</span>
            )}
          </div>
        </div>
      )}
      {completo && (
        <div className="mt-3 rounded-xl border border-border p-3">
          <h4 className="font-display text-sm uppercase text-muted-foreground">Seu pedido</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {listaCombos.map((c) => (
              <li key={c.key} className="flex justify-between gap-2">
                <span>{c.titulo}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-sm"><strong>TOTAL — {totalDesejado} unidades</strong></p>
          <Button
            size="sm"
            className="mt-2"
            disabled={!consistente}
            onClick={() => onAdicionarMultiplos(listaCombos.map((c) => c.titulo))}
          >
            <Plus className="mr-2 size-4" /> Adicionar {listaCombos.length} {listaCombos.length === 1 ? "combo" : "combos"} à sacola
          </Button>
        </div>
      )}
    </div>
  );
}

function PreviewCard({ produto: p, adicionado, onAdicionar }: { produto: PreviewProduto; adicionado: boolean; onAdicionar: () => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative">
        {p.foto ? (
          <img src={p.foto} alt={p.nome} loading="lazy" width={480} height={360} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
            <CameraOff className="size-6" aria-hidden />
            <span className="text-xs">Foto em breve</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          {p.promo != null && p.preco != null ? <Badge className="bg-primary text-primary-foreground">Oferta</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-display text-base leading-tight">{p.nome}</h3>
        <p className="text-[11px] font-medium text-muted-foreground">
          {p.tipo === "combo" ? "Salgados para festa • múltiplos de 50" : "Vendido por unidade"}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            {p.preco == null ? (
              <span className="font-display text-base text-muted-foreground">A confirmar</span>
            ) : (
              <>
                {p.promo != null ? <span className="mr-1 text-xs text-muted-foreground line-through">{brl(p.preco)}</span> : null}
                <span className="font-display text-lg text-primary">{brl(p.promo ?? p.preco)}</span>
              </>
            )}
          </div>
          <Button
            size="sm"
            className="min-h-[40px] px-4 font-bold"
            onClick={onAdicionar}
            aria-label={`Adicionar ${p.nome} à sacola`}
          >
            {adicionado ? <><Minus className="mr-1 size-4" /> Na sacola</> : <><Plus className="mr-1 size-4" /> Adicionar</>}
          </Button>
        </div>
      </div>
    </article>
  );
}
