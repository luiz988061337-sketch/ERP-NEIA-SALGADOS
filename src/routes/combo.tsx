import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPageHero } from "@/components/public-page-hero";
import { useCart } from "@/lib/cart";
import { useStaffOnly } from "@/lib/session";
import { imagemProduto, useCategorias, useProdutos } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { COMBO_CATEGORIAS, MINIMO_COMBO, PASSO_COMBO, saborCurto } from "@/lib/combo";
import { isMultiploCombo, quantoFaltaCombo } from "@/lib/totals";
import { regraQuantidade } from "@/lib/quantidade";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/combo")({
  head: () => ({
    meta: [
      { title: "Monte seu combo — Néia Salgados" },
      {
        name: "description",
        content: "Misture os sabores da categoria a partir de 1 unidade e feche múltiplos de 50.",
      },
      { property: "og:title", content: "Monte seu combo — Néia Salgados" },
      {
        property: "og:description",
        content: "Misture os sabores da categoria a partir de 1 unidade e feche múltiplos de 50.",
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
  // Preço autoritativo: banco (0097) quando configurado; fallback estático
  // apenas para ambientes ainda sem a migration. O servidor SEMPRE revalida.
  const precoUnit = Number(catDb?.combo_preco_unit ?? cat?.precoUnit ?? 0);
  // Montagem de combos = salgados prontos: passo 50, mínimo 50.
  const regraCombo = regraQuantidade({ tipo_venda: "combo_50", unidade_medida: "un" });
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
  const selecionados = itens.filter((p) => (qtds[p.id] ?? 0) > 0);

  function escolher(novoSlug: string) {
    setSlug(novoSlug || null);
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

  function remover(id: string) {
    setQtds((s) => {
      const copia = { ...s };
      delete copia[id];
      return copia;
    });
  }

  function adicionar() {
    if (!cat) return;
    if (!valido) {
      toast.error(
        total === 0
          ? "Os combos são vendidos em múltiplos de 50 unidades. Toque em + para começar."
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
      // preço = unitário da categoria; quantidade = unidades (múltiplo de 50).
      preco: precoUnit,
      imagem: null,
      produtoId: null,
      combo: true,
      regra: regraCombo,
      // Composição estruturada: o servidor debita CADA produto desta lista.
      // A soma é exatamente `total`; não existe conversão de embalagem.
      componentes,
    }, total);
    toast.success(`Combo de ${total} minis adicionado ao carrinho!`);
    navigate({ to: "/carrinho" });
  }

  const resumoCombo = (
    <section className="overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]">
      <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
        <Layers className="size-5" aria-hidden />
        <h2 className="font-display text-xl font-bold">Seu Combo</h2>
        <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">{total} un</span>
      </div>
      <div className="p-4">
        {selecionados.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#60524C]">
            Selecione um sabor para começar seu combo.
          </p>
        ) : (
          <ul className="space-y-3">
            {selecionados.map((p) => {
              const qtd = qtds[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <img
                    src={imagemProduto(p.imagem_url, cat?.slug)}
                    alt=""
                    loading="lazy"
                    className="size-11 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#500B08]">{saborCurto(p.nome)}</p>
                    <p className="text-xs text-[#60524C]">{brl(precoUnit)}/un</p>
                  </div>
                  <div className="flex items-center rounded-full border border-[#B9000B]">
                    <button
                      type="button"
                      onClick={() => mudarQtd(p.id, -1)}
                      aria-label={`Tirar 1 ${p.nome}`}
                      className="grid size-8 place-items-center text-[#B9000B]"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{qtd}</span>
                    <button
                      type="button"
                      onClick={() => mudarQtd(p.id, 1)}
                      aria-label={`Adicionar 1 ${p.nome}`}
                      className="grid size-8 place-items-center text-[#B9000B]"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <span className="w-14 text-right text-sm font-bold text-[#D50909]">
                    {brl(precoUnit * qtd)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remover(p.id)}
                    aria-label={`Remover ${p.nome}`}
                    className="text-[#B9000B] hover:opacity-70"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 rounded-2xl bg-[#FFF4D8] p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#500B08]">Subtotal</span>
            <span className="font-display text-2xl font-bold text-[#D50909]">{brl(valor)}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] transition-all"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[#60524C]">
            {total === 0
              ? `Mínimo de ${MINIMO_COMBO} unidades para salgados prontos.`
              : valido
                ? `Combo fechado em ${total} unidades.`
                : `Faltam ${faltam} unidades para fechar ${alvo} (múltiplos de ${PASSO_COMBO}).`}
          </p>
        </div>

        <Button
          type="button"
          onClick={adicionar}
          disabled={!valido || total === 0}
          className="mt-4 h-12 w-full rounded-full bg-gradient-to-r from-[#B9000B] via-[#F47500] to-[#F6B300] font-bold text-white shadow-[var(--shadow-card)] hover:opacity-95 disabled:opacity-50"
        >
          <ShoppingBag className="mr-2 size-4" aria-hidden /> Finalizar Combo
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setQtds({})}
          disabled={total === 0}
          className="mt-1 w-full text-[#500B08]"
        >
          Limpar seleção
        </Button>
      </div>
    </section>
  );

  const receber = (
    <section className="rounded-[22px] border border-[#F0D9A8] bg-white p-4 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#500B08]">
        <Truck className="size-5 text-[#D50909]" aria-hidden /> Como deseja receber?
      </h2>
      <div className="mt-3 grid gap-2">
        <div className="rounded-2xl border border-[#F0D9A8] bg-[#FFFCF7] p-3">
          <p className="text-sm font-bold text-[#500B08]">Entrega</p>
          <p className="mt-1 text-xs text-[#60524C]">
            Frete calculado após informar o endereço.
          </p>
        </div>
        <div className="rounded-2xl border border-[#F0D9A8] bg-[#FFFCF7] p-3">
          <p className="text-sm font-bold text-[#500B08]">Retirada na loja</p>
          <p className="mt-1 text-xs text-[#60524C]">Sem taxa de entrega.</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {staffOnly ? (
        <p className="p-10 text-center text-muted-foreground">Abrindo seu painel...</p>
      ) : (
        <>
          <Button variant="ghost" size="sm" asChild className="mb-2 text-[#500B08]">
            <Link to="/">
              <ArrowLeft className="mr-1 size-4" /> Cardápio
            </Link>
          </Button>

          <PublicPageHero
            icon={Layers}
            titulo="Monte seu combo"
            descricao="Escolha os salgados, defina as quantidades (múltiplos de 50) e monte seu pedido."
            className="mt-3"
          >
            <p className="mt-3 text-xs font-semibold text-[#650C09]">
              A regra de múltiplos de 50 vale para os salgados prontos elegíveis. Congelados e
              bebidas são vendidos por unidade comercial no cardápio.
            </p>
          </PublicPageHero>

          <div className="mt-5 flex flex-wrap gap-2 rounded-[22px] border border-[#F0D9A8] bg-white p-3 shadow-[var(--shadow-card)]">
            <button
              type="button"
              onClick={() => escolher("")}
              className={cn(
                "min-h-11 rounded-full px-4 py-2 text-sm font-bold transition-colors",
                !slug
                  ? "bg-[#B9000B] text-white shadow-[var(--shadow-card)]"
                  : "border border-[#F6B300] bg-[#FFFCF7] text-[#650C09] hover:bg-[#FFF4D8]",
              )}
            >
              Todos os salgados
            </button>
            {COMBO_CATEGORIAS.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => escolher(c.slug)}
                className={cn(
                  "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  slug === c.slug
                    ? "border-[#B9000B] bg-[#B9000B] text-white shadow-[var(--shadow-card)]"
                    : "border-[#F6B300] bg-white text-[#650C09] hover:bg-[#FFF4D8]",
                )}
              >
                {c.nome}
              </button>
            ))}
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              {!cat ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {COMBO_CATEGORIAS.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => escolher(c.slug)}
                      className="hover-lift overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white text-left shadow-[var(--shadow-card)] hover:border-[#B9000B]"
                    >
                      <img
                        src={imagemProduto(null, c.slug)}
                        alt={c.nome}
                        loading="lazy"
                        width={480}
                        height={360}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <div className="p-4">
                        <p className="font-display text-lg font-bold text-[#500B08]">{c.nome}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[#60524C]">{c.descricao}</p>
                        <p className="mt-2 text-sm font-bold text-[#D50909]">
                          {brl(c.precoUnit)}
                          <span className="font-normal text-[#60524C]">/un</span>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-2xl font-bold text-[#500B08]">{cat.nome}</h2>
                    <span className="text-sm font-semibold text-[#D50909]">{brl(precoUnit)}/un</span>
                    <button
                      type="button"
                      onClick={() => escolher("")}
                      className="ml-auto min-h-11 text-sm font-semibold text-[#500B08] underline"
                    >
                      Todos os salgados
                    </button>
                  </div>

                  {itens.length === 0 ? (
                    <p className="mt-6 rounded-[22px] border border-dashed border-[#F0D9A8] p-8 text-center text-sm text-[#60524C]">
                      Nenhum sabor disponível nesta categoria no momento.
                    </p>
                  ) : (
                    <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {itens.map((p) => {
                        const qtd = qtds[p.id] ?? 0;
                        return (
                          <li
                            key={p.id}
                            className={cn(
                              "hover-lift overflow-hidden rounded-[22px] border border-[#F0D9A8] bg-white shadow-[var(--shadow-card)]",
                              qtd > 0 && "border-[#B9000B] ring-1 ring-[#B9000B]/20",
                            )}
                          >
                            <img
                              src={imagemProduto(p.imagem_url, cat.slug)}
                              alt={p.nome}
                              loading="lazy"
                              width={480}
                              height={360}
                              className="aspect-[4/3] w-full object-cover"
                            />
                            <div className="p-4">
                              <p className="font-display text-lg font-bold leading-tight text-[#500B08]">
                                {saborCurto(p.nome)}
                              </p>
                              <p className="mt-1 font-bold text-[#D50909]">
                                {brl(precoUnit)}
                                <span className="text-xs font-normal text-[#60524C]">/un</span>
                              </p>
                              <p className="mt-1 text-xs text-[#60524C]">
                                Unidade de venda cadastrada · mínimo {MINIMO_COMBO} un
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <div className="flex items-center rounded-full border border-[#B9000B]">
                                  <button
                                    type="button"
                                    onClick={() => mudarQtd(p.id, -1)}
                                    aria-label={`Tirar 1 ${p.nome}`}
                                    className="grid size-9 place-items-center text-[#B9000B]"
                                  >
                                    <Minus className="size-4" />
                                  </button>
                                  <span className="w-8 text-center text-sm font-bold">{qtd}</span>
                                  <button
                                    type="button"
                                    onClick={() => mudarQtd(p.id, 1)}
                                    aria-label={`Adicionar 1 ${p.nome}`}
                                    className="grid size-9 place-items-center text-[#B9000B]"
                                  >
                                    <Plus className="size-4" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => mudarQtd(p.id, 1)}
                                  className="ml-auto flex min-h-11 items-center gap-1 rounded-full bg-[#FFF4D8] px-3 text-sm font-bold text-[#650C09] hover:bg-[#FFE9B8]"
                                >
                                  <ShoppingBag className="size-4" aria-hidden /> Adicionar
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>

            <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
              {resumoCombo}
              {receber}
            </aside>
          </div>

          <details className="mt-5 rounded-[22px] border border-[#F0D9A8] bg-[#FFFCF7] p-4 lg:hidden">
            <summary className="cursor-pointer list-none font-display text-lg font-bold text-[#500B08]">
              Seu Combo · {total} un · {brl(valor)}
            </summary>
            <div className="mt-4 space-y-4">
              {resumoCombo}
              {receber}
            </div>
          </details>

          <p className="mt-6 flex items-center justify-center gap-1 text-center text-sm text-[#60524C]">
            Prefere os pacotes prontos?{" "}
            <Link to="/" className="inline-flex items-center gap-0.5 font-semibold text-[#500B08] underline">
              Ver cardápio <ArrowRight className="size-3" />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
