import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Minus, Package, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useStaffOnly } from "@/lib/session";
import { imagemProduto, useCategorias, useProdutos } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { COMBO_CATEGORIAS, MINIMO_COMBO, PASSO_COMBO, saborCurto } from "@/lib/combo";
import { isMultiploCombo, quantoFaltaCombo } from "@/lib/totals";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/combo")({
  head: () => ({
    meta: [
      { title: "Monte seu combo â€” NÃ©ia Salgados" },
      {
        name: "description",
        content: "Misture os sabores da categoria a partir de 1 unidade e feche mÃºltiplos de 50.",
      },
      { property: "og:title", content: "Monte seu combo â€” NÃ©ia Salgados" },
      {
        property: "og:description",
        content: "Misture os sabores da categoria a partir de 1 unidade e feche mÃºltiplos de 50.",
      },
    ],
  }),
  component: Combo,
});

function Combo() {
  const navigate = useNavigate();
  const { add } = useCart();
  const { data: categorias } = useCategorias();
  const { data: produtos } = useProdutos();
  const [slug, setSlug] = useState<string | null>(null);
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const { staffOnly, painel } = useStaffOnly();

  useEffect(() => {
    if (staffOnly && painel) navigate({ to: painel, replace: true });
  }, [staffOnly, painel, navigate]);

  const cat = COMBO_CATEGORIAS.find((c) => c.slug === slug) ?? null;
  const catDb = categorias?.find((c) => c.slug === slug);
  const catId = catDb?.id;
  // Preco autoritativo: banco (0097) quando configurado; fallback estatico
  // apenas para ambientes ainda sem a migration. O servidor SEMPRE revalida.
  const precoUnit = Number(catDb?.combo_preco_unit ?? cat?.precoUnit ?? 0);
  const itens = useMemo(
    () => (catId ? (produtos ?? []).filter((p) => p.categoria_id === catId && p.disponivel) : []),
    [produtos, catId],
  );

  const total = Object.values(qtds).reduce((a, q) => a + q, 0);
  const resto = total % PASSO_COMBO;
  const faltam = quantoFaltaCombo(total);
  const valido = isMultiploCombo(total);
  const alvo = total === 0 ? MINIMO_COMBO : resto === 0 ? total : total + faltam;
  const valor = cat ? total * precoUnit : 0;
  const progresso = total === 0 ? 0 : resto === 0 ? 100 : (resto / PASSO_COMBO) * 100;

  function escolher(novoSlug: string) {
    setSlug(novoSlug);
    setQtds({});
  }

  function mudarQtd(id: string, delta: number) {
    setQtds((s) => {
      const atual = Math.max(0, (s[id] ?? 0) + delta);
      if (atual === 0) {
        const copia = { ...s };
        delete copia[id];
        return copia;
      }
      return { ...s, [id]: atual };
    });
  }

  function adicionar() {
    if (!cat) return;
    if (!valido) {
      toast.error(
        total === 0
          ? "Os combos sÃ£o vendidos em mÃºltiplos de 50 unidades. Toque em + para comeÃ§ar."
          : `Seu combo precisa ter ${alvo} unidades. Adicione mais ${faltam} unidades.`,
      );
      return;
    }
    const partes = itens
      .filter((p) => (qtds[p.id] ?? 0) > 0)
      .map((p) => `${qtds[p.id]}x ${saborCurto(p.nome)}`);
    const componentes = itens
      .filter((p) => (qtds[p.id] ?? 0) > 0)
      .map((p) => ({ produtoId: p.id, quantidade: qtds[p.id]! }));
    add({
      id: `combo-${cat.slug}-${Date.now()}`,
      nome: `Combo ${cat.nome} ${total}un (${partes.join(", ")})`,
      // preco = unitÃ¡rio da categoria; quantidade = unidades (mÃºltiplo de 50).
      preco: precoUnit,
      imagem: null,
      produtoId: null,
      combo: true,
      // Composicao estruturada: o servidor debita CADA produto desta lista.
      // A soma e exatamente `total`; nao existe conversao de embalagem.
      componentes,
    }, total);
    toast.success(`Combo de ${total} minis adicionado ao carrinho!`);
    navigate({ to: "/carrinho" });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {staffOnly ? (
        <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>
      ) : (
      <>
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link to="/">
          <ArrowLeft className="mr-1 size-4" /> CardÃ¡pio
        </Link>
      </Button>
      <h1 className="font-display text-3xl">Monte seu combo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Monte seu combo escolhendo os sabores que quiser. O total de cada categoria deve ser
        50, 100, 150 unidades ou mÃºltiplos de {PASSO_COMBO}. Congelados vendem por unidade no cardÃ¡pio.
      </p>

      {!cat ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COMBO_CATEGORIAS.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => escolher(c.slug)}
              className="group overflow-hidden rounded-2xl border border-border bg-card text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]"
            >
              <img
                src={imagemProduto(null, c.slug)}
                alt={c.nome}
                loading="lazy"
                width={480}
                height={360}
                className="aspect-[16/10] w-full object-cover"
              />
              <div className="p-3">
                <p className="font-display">{c.nome}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{c.descricao}</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {brl(c.precoUnit)}
                  <span className="font-normal text-muted-foreground">/un</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl">{cat.nome}</h2>
            <span className="text-sm text-muted-foreground">
              {brl(precoUnit)}/un
            </span>
            <button
              type="button"
              onClick={() => setSlug(null)}
              className="ml-auto text-sm text-muted-foreground underline"
            >
              Trocar categoria
            </button>
          </div>

          {itens.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum sabor disponÃ­vel nesta categoria no momento.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {itens.map((p) => {
                const qtd = qtds[p.id] ?? 0;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]",
                      qtd > 0 && "border-primary/60",
                    )}
                  >
                    <img
                      src={imagemProduto(p.imagem_url, cat.slug)}
                      alt={p.nome}
                      loading="lazy"
                      width={128}
                      height={128}
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-display leading-tight">{saborCurto(p.nome)}</p>
                      <p className="text-xs text-muted-foreground">{brl(precoUnit)}/un</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => mudarQtd(p.id, -1)}
                        aria-label={`Tirar 1 ${p.nome}`}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-10 text-center font-semibold">{qtd}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-8"
                        onClick={() => mudarQtd(p.id, 1)}
                        aria-label={`Adicionar 1 ${p.nome}`}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="sticky bottom-4 mt-6 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <Package className="size-4 text-primary" /> Quantidade selecionada: {total} / {alvo}
              </span>
              <span className="font-display text-lg text-primary">{brl(valor)}</span>
            </div>
            {valido && total > 0 ? (
              <p className="mt-1 text-sm font-bold text-green-600">âœ“ Combo completo ({total}un)</p>
            ) : null}
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {total === 0
                ? `Toque em + para comeÃ§ar â€” mÃ­nimo ${MINIMO_COMBO}un por categoria.`
                : valido
                  ? `Combo fechado em ${total}un! Pode adicionar ao carrinho.`
                  : `Faltam ${faltam}un para fechar ${total + faltam}un (mÃºltiplos de ${PASSO_COMBO}).`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setQtds({})}>
                Limpar
              </Button>
              <Button className="flex-1" disabled={!valido} onClick={adicionar}>
                <ShoppingBag className="mr-1 size-4" /> Adicionar combo â€¢ {brl(valor)}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        Prefere os pacotes prontos? <Link to="/" className="inline-flex items-center gap-0.5 underline">Ver cardÃ¡pio <ArrowRight className="size-3" /></Link>
      </p>
      </>
      )}
    </div>
  );
}
