import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgePercent,
  Check,
  CirclePlus,
  Info,
  Layers,
  MessageCircle,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import { ehModoDemo } from "@/lib/demo-preview";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { regraDoItem, regraQuantidade, type RegraQuantidade } from "@/lib/quantidade";
import { validarCupom } from "@/lib/cupons";
import { useStaffOnly } from "@/lib/session";
import { useCrmSettings } from "@/lib/crm";
import { useCategorias, useProdutos, precoFinal } from "@/lib/catalog";
import coxinhaFoto from "@/routes/preview/fotos/coxinha-1.jpg";
import bolinhaFoto from "@/routes/preview/fotos/bolinha-queijo-1.jpg";
import croqueteFoto from "@/routes/preview/fotos/croquete-1.jpg";
import kibeFoto from "@/routes/preview/fotos/kibe-1.jpg";
import mixFoto from "@/routes/preview/fotos/mix-neia.jpg";
import { sugestoesPorCoocorrencia, useTodosItens } from "@/lib/inteligencia";
import { prazosAtendimento, useLojaConfig } from "@/lib/loja";
import { cn } from "@/lib/utils";

const CHAVE_OBS_PEDIDO = "neia-obs-pedido";

/** Emoji de apoio apenas quando não há foto cadastrada nem asset local. */
function emojiDoItem(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("coxinha")) return "🍗";
  if (n.includes("queijo") || n.includes("bolinha")) return "🧀";
  if (n.includes("pastel")) return "🥟";
  if (n.includes("pão") || n.includes("pao") || n.includes("assado")) return "🥐";
  return "🥟";
}

/** Fotos locais já usadas nos previews; nenhum asset novo é buscado na rede. */
function fotoLocalDoItem(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes("coxinha")) return coxinhaFoto;
  if (n.includes("bolinha") || n.includes("queijo")) return bolinhaFoto;
  if (n.includes("croquete")) return croqueteFoto;
  if (n.includes("kibe")) return kibeFoto;
  if (n.includes("mix") || n.includes("pastel") || n.includes("assado")) return mixFoto;
  return null;
}

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
  const { items, setQuantidade, setObservacao, remove, subtotal, add, tipoEntrega, definirTipoEntrega, restaurarExemploDemo } = useCart();
  const { staffOnly, painel } = useStaffOnly();
  const navigate = useNavigate();
  const [obsPedido, setObsPedido] = useState("");
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupomValidado, setCupomValidado] = useState<string | null>(null);
  const [validandoCupom, setValidandoCupom] = useState(false);
  const { data: lojaConfig } = useLojaConfig();
  const prazos = prazosAtendimento(lojaConfig);
  const { data: settings } = useCrmSettings();

  // A modalidade agora vive no CartProvider e é a única fonte para o Checkout.
  // A obs do pedido continua na chave própria, aplicada uma vez ao entrar aqui.
  useEffect(() => {
    try {
      setObsPedido(localStorage.getItem(CHAVE_OBS_PEDIDO) ?? "");
    } catch {
      /* navegador sem storage */
    }
  }, []);

  function mudarObsPedido(valor: string) {
    setObsPedido(valor);
    try {
      localStorage.setItem(CHAVE_OBS_PEDIDO, valor);
    } catch {
      /* navegador sem storage */
    }
  }

  /**
   * Valida o cupom com a MESMA regra do checkout (validarCupom). O desconto
   * entra no pedido no checkout; aqui apenas confirmamos o código para não
   * exibir valor fictício nem divergir do resumo financeiro.
   */
  async function aplicarCupom() {
    const codigo = cupomTexto.trim().toUpperCase();
    if (!codigo) {
      toast.error("Digite o código do cupom.");
      return;
    }
    setValidandoCupom(true);
    try {
      const { data, error } = await supabase
        .from("cupons")
        .select("*")
        .eq("codigo", codigo)
        .eq("ativo", true)
        .maybeSingle();
      if (error || !data) {
        toast.error("Cupom inválido.");
        return;
      }
      let usos = 0;
      if (Number((data as any).max_usos ?? 0) > 0) {
        const r = await supabase
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .eq("cupom", codigo)
          .neq("status", "cancelado");
        usos = r.count ?? 0;
      }
      const res = validarCupom(data as any, {
        subtotal,
        // Sem telefone nesta etapa: cupons exclusivos falham fechado (regra
        // oficial) e o cliente é orientado a validar no checkout.
        telefoneDigitado: "",
        usosRegistrados: usos,
        produtoIdsNoCarrinho: items.map((i) => i.produtoId),
      });
      if (!res.ok) {
        toast.error(res.motivo);
        return;
      }
      setCupomValidado(codigo);
      toast.success(`Cupom ${codigo} válido! Aplique-o no checkout para concluir.`);
    } catch {
      toast.error("Não foi possível validar o cupom agora.");
    } finally {
      setValidandoCupom(false);
    }
  }

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

  // Regra autoritativa por produto: tipo_venda cadastrado primeiro, slug da
  // categoria só como fallback para cadastros antigos.
  const regrasPorProduto = useMemo(() => {
    const mapa = new Map<string, RegraQuantidade>();
    for (const p of produtos ?? []) {
      mapa.set(p.id, regraQuantidade(p, slugCategoria.get(p.categoria_id) ?? ""));
    }
    return mapa;
  }, [produtos, slugCategoria]);

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
        {ehModoDemo() ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              restaurarExemploDemo();
              toast.success("Carrinho de demonstração restaurado.");
            }}
          >
            Restaurar exemplo (demo)
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <header className="flex items-start gap-3">
        <span className="brand-gradient grid size-14 shrink-0 place-items-center rounded-2xl text-white shadow-[var(--shadow-card)]">
          <ShoppingCart className="size-8" />
        </span>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight text-[#650900]">Meu Carrinho</h1>
          <p className="mt-1 text-[#786754]">Confira os itens, quantidades e finalize seu pedido.</p>
        </div>
      </header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <ul className="space-y-3">
            {items.map((item) => {
              const regra =
                (item.produtoId ? regrasPorProduto.get(item.produtoId) : null) ?? regraDoItem(item);
              const passo = regra.passo;
              const fotoCatalogo = produtos?.find((p) => p.id === item.produtoId)?.imagem_url;
              const foto = item.imagem || fotoCatalogo || fotoLocalDoItem(item.nome);
              return (
                <li
                  key={item.id}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-3 pl-4 shadow-[var(--shadow-card)]"
                >
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-secondary" aria-hidden />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-secondary/50 bg-[#FFF8EE] text-3xl">
                        {foto ? (
                          <img src={foto} alt={item.nome} className="size-full object-cover" />
                        ) : (
                          <span aria-hidden>{emojiDoItem(item.nome)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-bold leading-tight text-[#650900]">
                          {item.nome}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-secondary/25 px-2 py-0.5 text-sm font-semibold text-[#650900]">
                          <ShoppingBag className="size-3.5" aria-hidden />
                          Unidades
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="inline-flex items-center rounded-full border-2 border-primary/70">
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-full text-primary transition hover:bg-primary/10"
                          onClick={() => {
                            const nova = item.quantidade - passo;
                            if (nova <= 0) {
                              toast.error("Use a lixeira para remover o item do carrinho.");
                              return;
                            }
                            if (regra.tipoVenda === "combo_50" && nova < regra.minimo) {
                              toast.error(
                                `Combos têm mínimo de ${regra.minimo} unidades. Para remover, use a lixeira.`,
                              );
                              return;
                            }
                            setQuantidade(item.id, nova);
                          }}
                          aria-label={`Diminuir ${item.nome}`}
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="w-10 text-center font-bold" aria-live="polite">
                          {item.quantidade}
                        </span>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-full text-primary transition hover:bg-primary/10"
                          onClick={() => setQuantidade(item.id, item.quantidade + passo)}
                          aria-label={`Aumentar ${item.nome}`}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>

                      <div className="min-w-20 text-right">
                        <p className="font-display text-lg font-bold">{brl(item.preco * item.quantidade)}</p>
                                              </div>

                      <button
                        type="button"
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-primary/60 transition hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => remove(item.id)}
                        aria-label={`Remover ${item.nome}`}
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  </div>

                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">
                      Adicionar observação
                    </summary>
                    <Input
                      value={item.observacao ?? ""}
                      onChange={(e) => setObservacao(item.id, e.target.value)}
                      placeholder="Ex.: sem pimenta, horário de preferência..."
                      maxLength={200}
                      aria-label={`Observações de ${item.nome}`}
                      className="mt-2 h-10 bg-background text-sm"
                    />
                  </details>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-xl border-2 border-[#E8AD16] bg-card font-display text-base font-bold text-[#650900] transition hover:border-[#C00000] hover:bg-[#FFF3D0] focus-visible:ring-2 focus-visible:ring-[#E8AD16]"
            >
              <Link to="/">
                <CirclePlus className="size-5" aria-hidden /> Adicionar mais itens
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-xl border-2 border-[#E8AD16] bg-card font-display text-base font-bold text-[#650900] transition hover:border-[#C00000] hover:bg-[#FFF3D0] focus-visible:ring-2 focus-visible:ring-[#E8AD16]"
            >
              <Link to="/combo">
                <Layers className="size-5" aria-hidden /> Montar um combo
              </Link>
            </Button>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            <div className="brand-gradient flex items-center gap-2 px-4 py-3 text-white">
              <Truck className="size-5" aria-hidden />
              <h2 className="font-display text-xl font-bold">Como deseja receber?</h2>
            </div>
            {tipoEntrega === null ? (
              <p className="px-4 pt-3 text-xs text-[#60524C]">
                Escolha uma opção abaixo para prosseguir para o checkout.
              </p>
            ) : null}
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {([
                {
                  id: "entrega" as const,
                  titulo: "Entrega",
                  descricao: "Entrega calculada após informar o endereço",
                  Icone: Truck,
                },
                {
                  id: "retirada" as const,
                  titulo: "Retirada na loja",
                  descricao: "Retirada grátis, sem taxa",
                  Icone: Store,
                },
              ]).map(({ id, titulo, descricao, Icone }) => {
                const ativo = tipoEntrega === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => definirTipoEntrega(id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition",
                      ativo
                        ? "border-[#E8AD16] bg-[#FFF3D0] ring-2 ring-[#E8AD16]/40"
                        : "border-border bg-background hover:border-[#E8AD16]/70",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border-2",
                        ativo ? "border-[#E8AD16] bg-[#E8AD16]/20" : "border-muted-foreground/50",
                      )}
                      aria-hidden
                    >
                      {ativo ? <span className="size-2.5 rounded-full bg-[#E8AD16]" /> : null}
                    </span>
                    <Icone className={cn("size-6", ativo ? "text-[#650900]" : "text-muted-foreground")} aria-hidden />
                    <span>
                      <span className="block font-semibold">{titulo}</span>
                      <span className="block text-sm text-muted-foreground">{descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <Label htmlFor="obs-pedido" className="flex items-center gap-2 text-base font-semibold text-[#650900]">
              <MessageCircle className="size-4 text-primary" aria-hidden /> Observações do pedido{" "}
              <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="obs-pedido"
              value={obsPedido}
              onChange={(e) => mudarObsPedido(e.target.value)}
              placeholder="Ex.: sem cebola, horário de preferência, etc."
              maxLength={300}
              className="mt-2 bg-card text-sm"
            />
          </section>

          {sugestoes.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-4" aria-label="Sugestões">
              <h2 className="font-display text-lg font-bold">Talvez você também goste</h2>
              <p className="text-sm text-muted-foreground">Baseado em pedidos reais.</p>
              <ul className="mt-3 space-y-2">
                {sugestoes.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1">
                      {p.nome} <span className="text-muted-foreground">• {brl(precoFinal(p))}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const regra = regraQuantidade(p, slugCategoria.get(p.categoria_id) ?? "");
                        add(
                          {
                            id: p.id,
                            nome: p.nome,
                            preco: precoFinal(p),
                            imagem: p.imagem_url,
                            produtoId: p.id,
                            combo: regra.tipoVenda === "combo_50",
                            regra,
                          },
                          regra.minimo,
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
        </div>

        <aside className="space-y-4 self-start lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            <div className="brand-gradient px-5 py-4 text-white">
              <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
                <Package className="size-6" aria-hidden /> Resumo do Pedido
              </h2>
            </div>

            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Package className="size-4 text-primary" aria-hidden /> Produtos
                </span>
                <span className="font-semibold">{brl(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Truck className="size-4 text-primary" aria-hidden /> Entrega
                  <Info className="size-3.5" aria-hidden />
                </span>
                <span className="text-right font-semibold text-[#650900]">
                  {tipoEntrega === "retirada"
                    ? "Retirada grátis (R$ 0,00)"
                    : "Entrega calculada após informar o endereço"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-secondary/25 px-3 py-3">
                <span className="font-display text-lg font-bold">Subtotal</span>
                <span className="font-display text-2xl font-bold text-primary">{brl(subtotal)}</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="brand-gradient flex items-center gap-2 px-4 py-2.5 text-white">
                  <BadgePercent className="size-5" aria-hidden />
                  <h3 className="font-display text-lg font-bold">Cupom de desconto</h3>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <Input
                      value={cupomTexto}
                      onChange={(e) => {
                        setCupomTexto(e.target.value);
                        setCupomValidado(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void aplicarCupom();
                        }
                      }}
                      placeholder="Digite seu cupom"
                      aria-label="Código do cupom de desconto"
                      className="h-10 bg-background text-sm font-medium uppercase"
                    />
                    <Button
                      type="button"
                      onClick={() => void aplicarCupom()}
                      disabled={validandoCupom || !cupomTexto.trim()}
                      className="brand-gradient h-10 shrink-0 rounded-lg px-4 text-sm font-bold text-white hover:brightness-105 disabled:opacity-60"
                    >
                      {validandoCupom ? "Validando..." : "Aplicar"}
                    </Button>
                  </div>
                  {cupomValidado ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-secondary/15 px-3 py-2 text-sm font-medium text-[#650900]">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#C00000]" aria-hidden />
                      Cupom {cupomValidado} validado. Conclua o pedido no checkout para aplicar o desconto.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Validação oficial: valor mínimo, validade e limite de uso. O desconto é aplicado no checkout.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border-2 border-[#E8AD16] bg-[#FFF8EE] p-4 text-sm">
                <p className="flex items-center gap-2 font-display text-base font-bold text-[#650900]">
                  <Info className="size-4 text-[#C00000]" aria-hidden /> Informações importantes
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#5B4A38]">
                  <li>Pedido mínimo: 50 unidades.</li>
                  <li>Pedidos em múltiplos de 50 unidades.</li>
                  <li>Prazo de entrega: {prazos.entregaMin} a {prazos.entregaMax} minutos.</li>
                  <li>Retirada no balcão: {prazos.retiradaMin} a {prazos.retiradaMax} minutos.</li>
                </ul>
              </div>

              <Button
                asChild
                size="lg"
                className="brand-gradient h-12 w-full rounded-xl font-display text-lg font-bold text-white hover:brightness-105"
              >
                <Link to="/checkout">
                  Finalizar Pedido <ArrowRight className="size-5" aria-hidden />
                </Link>
              </Button>
              {proximaPromo ? (
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-sm leading-relaxed">
                    Faltam <strong>{brl(proximaPromo.minimo - subtotal)}</strong> para usar o cupom{" "}
                    <strong>{proximaPromo.codigo}</strong> (mín. {brl(proximaPromo.minimo)}).
                  </p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (subtotal / proximaPromo.minimo) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <Button asChild variant="outline" className="w-full">
            <Link to="/">Continuar comprando</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
