import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { CameraOff, Minus, Plus, RefreshCw, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PREVIEW_CATEGORIAS, PREVIEW_HERO_IMG, PREVIEW_MOMENTOS, PREVIEW_PRODUTOS, type PreviewMomento, type PreviewProduto } from "./preview/-dados";

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

// Sugestão visual de produtos da categoria (variedade, sem repetir, sem promessa comercial).
function sugerirProdutos(categoria: string, max = 4): PreviewProduto[] {
  return embaralhar(PREVIEW_PRODUTOS.filter((p) => p.categoria === categoria)).slice(0, max);
}

// Distribuição equilibrada: round-robin com início aleatório.
function distribuicaoEquilibrada(totalCombos: number): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const c of CATS_COMBO) dist[c] = 0;
  const inicio = Math.floor(Math.random() * CATS_COMBO.length);
  for (let i = 0; i < totalCombos; i++) {
    const cat = CATS_COMBO[(inicio + i) % CATS_COMBO.length];
    if (cat) dist[cat] = (dist[cat] ?? 0) + 1;
  }
  return dist;
}

// Distribuição surpresa: composição aleatória somando o total.
function distribuicaoSurpresa(totalCombos: number): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const c of CATS_COMBO) dist[c] = 0;
  for (let i = 0; i < totalCombos; i++) {
    const cat = CATS_COMBO[Math.floor(Math.random() * CATS_COMBO.length)];
    if (cat) dist[cat] = (dist[cat] ?? 0) + 1;
  }
  return dist;
}

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Preview — Cardápio Real Néia Salgados" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PreviewCardapio,
});

// Carrinho 100% mock do Preview: não toca o carrinho real, checkout ou banco.
function PreviewCardapio() {
  const [categoria, setCategoria] = useState<string>("Todos");
  const [busca, setBusca] = useState("");
  const [sacola, setSacola] = useState<Record<string, number>>({});
  const [adicionadoId, setAdicionadoId] = useState<string | null>(null);
  const [momentoId, setMomentoId] = useState<string | null>(null);
  const [totalSalgados, setTotalSalgados] = useState(200);
  const [modo, setModo] = useState<"manual" | "auto" | "surpresa" | null>(null);
  const [manualCombos, setManualCombos] = useState<Record<string, number>>({});
  const [sugestaoKey, setSugestaoKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const momento = PREVIEW_MOMENTOS.find((m) => m.id === momentoId) ?? null;
  const kitSugerido = momento?.kitId ? PREVIEW_PRODUTOS.find((p) => p.id === momento.kitId) ?? null : null;
  const totalCombos = Math.floor(totalSalgados / 50);
  const qtdValida = totalSalgados >= 50 && totalSalgados % 50 === 0;
  const usadosManual = CATS_COMBO.reduce((a, c) => a + (manualCombos[c] ?? 0), 0);

  function escolherMomento(m: PreviewMomento) {
    setMomentoId(m.id);
    setModo(null);
    setManualCombos({});
  }

  function ajustarTotal(delta: number) {
    setTotalSalgados((t) => Math.min(1000, Math.max(50, t + delta)));
    setModo(null);
    setManualCombos({});
  }

  function escolherModo(novo: "manual" | "auto" | "surpresa") {
    setModo(novo);
    setManualCombos({});
    setSugestaoKey((k) => k + 1);
  }

  function alterarManual(cat: string, delta: number) {
    setManualCombos((s) => {
      const atual = s[cat] ?? 0;
      const outros = CATS_COMBO.reduce((a, c) => a + (c === cat ? 0 : (s[c] ?? 0)), 0);
      const novo = Math.min(Math.max(0, atual + delta), Math.max(0, totalCombos - outros));
      return { ...s, [cat]: novo };
    });
  }

  function surpreendaMe() {
    const m = PREVIEW_MOMENTOS.find((x) => x.id === "surpresa");
    if (!m) return;
    setCategoria("Combinações");
    setMomentoId(m.id);
    setTotalSalgados(200);
    setModo("surpresa");
    setManualCombos({});
    setSugestaoKey((k) => k + 1);
    requestAnimationFrame(() => document.getElementById("pv-momentos")?.scrollIntoView({ behavior: "smooth" }));
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
              <MomentoPainel
                momento={momento}
                kitSugerido={kitSugerido}
                totalSalgados={totalSalgados}
                totalCombos={totalCombos}
                qtdValida={qtdValida}
                modo={modo}
                manualCombos={manualCombos}
                sugestaoKey={sugestaoKey}
                onTotal={ajustarTotal}
                onTotalDigitar={(v: number) => { setTotalSalgados(v); setModo(null); setManualCombos({}); }}
                onModo={escolherModo}
                onManual={alterarManual}
                onGerarOutra={() => setSugestaoKey((k) => k + 1)}
                adicionadoId={adicionadoId}
                onAdicionar={adicionar}
              />
            )}
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

function MomentoPainel(props: {
  momento: PreviewMomento;
  kitSugerido: PreviewProduto | null;
  totalSalgados: number;
  totalCombos: number;
  qtdValida: boolean;
  modo: "manual" | "auto" | "surpresa" | null;
  manualCombos: Record<string, number>;
  sugestaoKey: number;
  onTotal: (delta: number) => void;
  onTotalDigitar: (v: number) => void;
  onModo: (m: "manual" | "auto" | "surpresa") => void;
  onManual: (cat: string, delta: number) => void;
  onGerarOutra: () => void;
  adicionadoId: string | null;
  onAdicionar: (p: PreviewProduto) => void;
}) {
  const { momento, totalSalgados, totalCombos, qtdValida, modo } = props;
  const distribuicao = useMemo<Record<string, number> | null>(() => {
    if (!qtdValida || !modo) return null;
    if (modo === "manual") return props.manualCombos;
    if (modo === "auto") return distribuicaoEquilibrada(totalCombos);
    return distribuicaoSurpresa(totalCombos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, totalCombos, qtdValida, props.manualCombos, props.sugestaoKey]);
  const usados = CATS_COMBO.reduce((a, c) => a + (distribuicao?.[c] ?? 0), 0);
  const completa = qtdValida && !!distribuicao && usados === totalCombos && (modo !== "manual" || totalCombos > 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {momento.icone} {momento.titulo} — <strong>monte sua seleção</strong>
      </p>

      {/* Quantidade */}
      <div className="mt-3">
        <label htmlFor="pv-qtd" className="text-sm font-bold">Quantos salgados você quer?</label>
        <div className="mt-1 flex items-center gap-2">
          <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => props.onTotal(-50)} aria-label="Diminuir 50">−</Button>
          <Input
            id="pv-qtd"
            inputMode="numeric"
            value={Number.isNaN(props.totalSalgados) ? "" : props.totalSalgados}
            onChange={(e) => props.onTotalDigitar(Math.floor(Number(e.target.value) || 0))}
            className="max-w-[140px] text-center text-lg font-bold"
          />
          <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => props.onTotal(50)} aria-label="Aumentar 50">+</Button>
        </div>
        {!qtdValida ? (
          <p className="mt-1 text-xs text-destructive">Escolha uma quantidade em múltiplos de 50 (mínimo 50).</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">1 combo = 50 salgados • {totalSalgados} salgados = {totalCombos} {totalCombos === 1 ? "combo" : "combos"}</p>
        )}
      </div>

      {/* Modos */}
      {qtdValida && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            { id: "manual", icone: "🎯", titulo: "Eu escolho", desc: "Divida os combos por categoria" },
            { id: "auto", icone: "🤖", titulo: "Equilibrar para mim", desc: "Distribuição automática" },
            { id: "surpresa", icone: "✨", titulo: "Surpreenda-me", desc: "Combinação aleatória" },
          ] as const).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => props.onModo(m.id)}
              aria-pressed={modo === m.id}
              className={cn(
                "rounded-xl border p-3 text-left",
                modo === m.id ? "border-primary ring-2 ring-primary" : "border-border",
              )}
            >
              <span aria-hidden>{m.icone}</span>
              <span className="block text-sm font-bold">{m.titulo}</span>
              <span className="block text-xs text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Manual */}
      {qtdValida && modo === "manual" && distribuicao && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">Como você quer dividir seus <strong>{totalSalgados} salgados</strong>?</p>
          {CATS_COMBO.map((cat) => {
            const n = distribuicao[cat] ?? 0;
            return (
              <div key={cat} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <span className="flex-1 text-sm font-bold">{cat}</span>
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => props.onManual(cat, -1)} disabled={n <= 0} aria-label={`Menos um combo de ${cat}`}>−</Button>
                <span className="w-14 text-center text-sm" aria-live="polite">{n} <span className="text-muted-foreground">({n * 50})</span></span>
                <Button size="sm" variant="outline" className="min-h-[44px] min-w-[44px]" onClick={() => props.onManual(cat, 1)} disabled={usados >= totalCombos} aria-label={`Mais um combo de ${cat}`}>+</Button>
              </div>
            );
          })}
          <div className="rounded-xl bg-muted p-3 text-sm" aria-live="polite">
            {usados < totalCombos ? (
              <>Você escolheu <strong>{usados} de {totalCombos} combos</strong> • Falta escolher: <strong>{totalCombos - usados} combo(s) ({(totalCombos - usados) * 50} salgados)</strong></>
            ) : (
              <>✓ Combinação completa — <strong>{totalCombos} combos • {totalSalgados} salgados</strong></>
            )}
          </div>
        </div>
      )}

      {/* Resultado */}
      {completa && distribuicao && (
        <div key={props.sugestaoKey} className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">Sugestão visual — valores serão definidos no pedido.</p>
          {CATS_COMBO.filter((c) => (distribuicao[c] ?? 0) > 0).map((cat) => (
            <SugestaoCategoria
              key={cat}
              categoria={cat}
              combos={distribuicao[cat] ?? 0}
              seed={props.sugestaoKey}
              adicionadoId={props.adicionadoId}
              onAdicionar={props.onAdicionar}
            />
          ))}
          {props.kitSugerido && (
            <div className="rounded-xl bg-muted p-3 text-sm">
              Também temos uma opção pronta para sua festa: <strong>{props.kitSugerido.nome}</strong> — {brl(props.kitSugerido.preco)}
              <Button size="sm" variant="outline" className="ml-2" onClick={() => props.onAdicionar(props.kitSugerido!)}>Adicionar</Button>
            </div>
          )}
          {(modo === "auto" || modo === "surpresa") && (
            <Button className="w-full min-h-[44px] sm:w-auto" onClick={props.onGerarOutra}>
              <RefreshCw className="mr-2 size-4" /> Gerar outra combinação
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SugestaoCategoria({ categoria, combos, seed, adicionadoId, onAdicionar }: {
  categoria: string;
  combos: number;
  seed: number;
  adicionadoId: string | null;
  onAdicionar: (p: PreviewProduto) => void;
}) {
  const itens = useMemo(() => sugerirProdutos(categoria, 4), [categoria, seed]);
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-sm"><strong>{categoria}</strong> <span className="text-muted-foreground">• {combos} {combos === 1 ? "combo" : "combos"} ({combos * 50} salgados)</span></p>
      <ul className="mt-2 space-y-1.5">
        {itens.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            {p.foto ? (
              <img src={p.foto} alt="" aria-hidden width={40} height={30} className="size-10 rounded-md object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden><CameraOff className="size-4" /></span>
            )}
            <span className="min-w-0 flex-1 truncate">✓ {p.nome}</span>
            <Button size="sm" variant="ghost" onClick={() => onAdicionar(p)} aria-label={`Adicionar ${p.nome} à sacola`}>
              {adicionadoId === p.id ? "Na sacola" : <Plus className="size-4" />}
            </Button>
          </li>
        ))}
      </ul>
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
