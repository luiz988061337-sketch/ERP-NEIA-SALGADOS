import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Banknote,
  Calculator,
  CreditCard,
  Droplet,
  Flame,
  LayoutGrid,
  LogOut,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Settings,
  Package,
  Snowflake,
  Star,
  TicketPercent,
  Trash2,
  Truck,
  UtensilsCrossed,
  ChartColumn,
  ClipboardList,
  Repeat2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import {
  precoFinal,
  tipoVendaProduto,
  useCategorias,
  useProdutos,
  imagemProduto,
} from "@/lib/catalog";
import { calcTotals, isMultiploCombo } from "@/lib/totals";
import { logAdmin } from "@/lib/operacao";

export const Route = createFileRoute("/pdv")({
  head: () => ({ meta: [{ title: "PDV Balcão — Néia Salgados" }] }),
  component: PDV,
});

type Item = {
  produto_id: string;
  nome: string;
  imagem: string;
  preco: number;
  quantidade: number;
  passo: number;
};

const CATEGORIAS = [
  { id: "todos", label: "Todos", icon: LayoutGrid },
  { id: "fritos", label: "Fritos", icon: Droplet },
  { id: "assados", label: "Assados", icon: Flame },
  { id: "pasteis", label: "Pastéis", icon: UtensilsCrossed },
  { id: "congelados", label: "Congelados", icon: Snowflake },
  { id: "combos", label: "Combos", icon: Package },
] as const;

function grupoDoSlug(slug: string): string {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("frito")) return "fritos";
  if (s.includes("assad")) return "assados";
  if (s.includes("pastel")) return "pasteis";
  if (s.includes("congelado")) return "congelados";
  if (s.includes("combo") || s.includes("kit")) return "combos";
  return "todos";
}

function agoraSP(): Date {
  return new Date();
}

function PDV() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const permitido = roles?.includes("admin") || roles?.includes("atendente");
  const { data: produtos } = useProdutos();
  const { data: categorias } = useCategorias();

  const [cat, setCat] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [pagtos, setPagtos] = useState<{ id: number; meio: string; valor: string }[]>([
    { id: 1, meio: "pix", valor: "" },
  ]);
  const [nomeCli, setNomeCli] = useState("");
  const [telCli, setTelCli] = useState("");
  const [tel2Cli, setTel2Cli] = useState("");
  const [endCli, setEndCli] = useState("");
  const [agendadoPara, setAgendadoPara] = useState("");
  const [descontoLib, setDescontoLib] = useState(false);
  const [desconto, setDesconto] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [ultimos, setUltimos] = useState<Item[]>([]);
  const [painel, setPainel] = useState<"venda" | "pedidos" | "vendas" | "config">("venda");
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [relogio, setRelogio] = useState(agoraSP());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/pdv" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    const t = setInterval(() => setRelogio(agoraSP()), 10000);
    return () => clearInterval(t);
  }, []);

  const slugPorCategoria = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.id, c.slug ?? ""])),
    [categorias],
  );

  const grade = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (produtos ?? []).filter((p: any) => {
      if (p.disponivel === false) return false;
      if (soFavoritos && !p.destaque) return false;
      if (
        t &&
        !String(p.nome ?? "")
          .toLowerCase()
          .includes(t)
      )
        return false;
      if (cat !== "todos" && grupoDoSlug(slugPorCategoria.get(p.categoria_id) ?? "") !== cat)
        return false;
      return true;
    });
  }, [produtos, categorias, slugPorCategoria, cat, busca, soFavoritos]);

  const subtotal = itens.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const calc = calcTotals({ subtotal, taxaEntrega: 0, desconto });

  const hojeISO = new Date().toISOString().slice(0, 10);
  const { data: vendasHoje } = useQuery({
    queryKey: ["pdv-vendas-hoje", hojeISO],
    enabled: !!permitido && (painel === "vendas" || painel === "pedidos"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, numero, total, forma_pagamento, pagamento_status, status, created_at, cliente_nome",
        )
        .gte("created_at", `${hojeISO}T00:00:00`)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const comandaN = String((vendasHoje?.length ?? 0) + 1).padStart(4, "0");

  function adicionar(p: any) {
    const slug = slugPorCategoria.get(p.categoria_id) ?? "";
    const tipo = tipoVendaProduto(p, slug);
    const passo = tipo === "combo_50" ? 50 : 1;
    const preco = Number(precoFinal(p));
    setItens((prev) => {
      const ex = prev.find((i) => i.produto_id === p.id);
      if (ex)
        return prev.map((i) =>
          i.produto_id === p.id ? { ...i, quantidade: i.quantidade + passo } : i,
        );
      return [
        ...prev,
        {
          produto_id: p.id,
          nome: p.nome,
          imagem: imagemProduto(p.imagem_url, slug),
          preco,
          quantidade: passo,
          passo,
        },
      ];
    });
  }

  function mudarQtd(id: string, delta: number) {
    setItens((prev) =>
      prev
        .map((i) =>
          i.produto_id === id ? { ...i, quantidade: i.quantidade + delta * i.passo } : i,
        )
        .filter((i) => i.quantidade > 0),
    );
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Soma dos pagamentos lançados (tolerância de centavos).
  const somaPagtos = pagtos.reduce((a, p) => a + (Number(p.valor) || 0), 0);
  const faltaPagar = Math.round((calc.total - somaPagtos) * 100) / 100;

  function presetPagamento(meio: string) {
    setPagtos([
      {
        id: Date.now(),
        meio,
        valor: calc.total > 0 ? String(Math.round(calc.total * 100) / 100) : "",
      },
    ]);
  }

  function dividirPagamento() {
    const falta = Math.max(0, Math.round((calc.total - somaPagtos) * 100) / 100);
    setPagtos((prev) => [
      ...prev,
      { id: Date.now(), meio: "dinheiro", valor: falta > 0 ? String(falta) : "" },
    ]);
  }

  async function finalizar() {
    if (itens.length === 0) {
      toast.error("Comanda vazia.");
      return;
    }
    for (const i of itens) {
      const p = (produtos ?? []).find((x: any) => x.id === i.produto_id) as any;
      if (!p) continue;
      const slug = slugPorCategoria.get(p.categoria_id) ?? "";
      if (tipoVendaProduto(p, slug) === "combo_50" && !isMultiploCombo(i.quantidade)) {
        toast.error(`"${i.nome}": combos em múltiplos de 50.`);
        return;
      }
    }
    const validos = pagtos.filter((p) => (Number(p.valor) || 0) > 0 && p.meio);
    if (validos.length === 0) {
      toast.error("Informe ao menos um pagamento com valor.");
      return;
    }
    if (Math.abs(faltaPagar) >= 0.005) {
      toast.error(
        faltaPagar > 0
          ? `Faltam ${brl(faltaPagar)} nos pagamentos.`
          : `Passou ${brl(-faltaPagar)} nos pagamentos.`,
      );
      return;
    }
    let agendadoISO: string | null = null;
    if (agendadoPara.trim()) {
      const dt = new Date(agendadoPara);
      if (Number.isNaN(+dt) || dt.getTime() < Date.now() - 60000) {
        toast.error("Informe data/hora futura para agendar.");
        return;
      }
      agendadoISO = dt.toISOString();
    }
    setEnviando(true);
    try {
      const principal = validos.reduce((a, b) =>
        (Number(b.valor) || 0) > (Number(a.valor) || 0) ? b : a,
      );
      const forma = principal.meio;
      const temPix = validos.some((p) => p.meio === "pix");
      const pagoNaHora = !temPix;
      const partes = [...validos]
        .sort((a, b) => Number(b.valor) - Number(a.valor))
        .map((p) => `${brl(Number(p.valor))} ${p.meio}`)
        .join(" + ");
      const obsBits = [
        "PDV balcão",
        desconto > 0 ? `desconto autorizado R$ ${desconto.toFixed(2)}` : "",
        tel2Cli.trim() ? `Contato 2: ${tel2Cli.trim()}` : "",
        agendadoISO ? `agendado ${new Date(agendadoISO).toLocaleString("pt-BR")}` : "",
        validos.length > 1 ? `Pagtos: ${partes}` : "",
      ].filter(Boolean);
      const res = await supabase
        .from("pedidos")
        .insert({
          user_id: user!.id,
          cliente_nome: nomeCli.trim() || "Balcão",
          telefone: telCli.trim(),
          endereco: endCli.trim() || "Balcão",
          bairro: "-",
          cidade: "-",
          tipo_entrega: "retirada",
          forma_pagamento: forma,
          pagamento_modalidade: "online",
          pagamento_status: pagoNaHora ? "pago" : "pendente",
          pagamento_em: pagoNaHora ? new Date().toISOString() : null,
          subtotal,
          taxa_entrega: 0,
          desconto: calc.desconto,
          total: calc.total,
          agendado_para: agendadoISO,
          observacoes: obsBits.join(" • "),
        })
        .select("id, numero")
        .single();
      if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
      const pedidoId = (res.data as any).id as string;
      const numero = (res.data as any).numero as number;
      const { error: e2 } = await supabase
        .from("pedido_itens")
        .insert(
          itens.map((i) => ({
            pedido_id: pedidoId,
            produto_id: i.produto_id,
            nome: i.nome,
            preco_unitario: i.preco,
            quantidade: i.quantidade,
          })),
        );
      if (e2) throw e2;
      try {
        await supabase
          .from("pedido_status_historico")
          .insert({
            pedido_id: pedidoId,
            de_status: null,
            para_status: "recebido",
            motivo: agendadoISO ? "pdv balcão agendado" : "pdv balcão",
          });
      } catch {
        /* sem migration — segue */
      }
      void logAdmin(
        "pedido_pdv",
        `#${numero} ${nomeCli.trim() || "Balcão"} ${brl(calc.total)} (${partes}${pagoNaHora ? ", pago" : ""})`,
      );
      toast.success(
        pagoNaHora ? `Venda #${numero} finalizada!` : `Venda #${numero} no aguardo do Pix.`,
      );
      setUltimos(itens);
      setItens([]);
      setDesconto(0);
      setDescontoLib(false);
      setPagtos([{ id: Date.now(), meio: "pix", valor: "" }]);
      setNomeCli("");
      setTelCli("");
      setTel2Cli("");
      setEndCli("");
      setAgendadoPara("");
      queryClient.invalidateQueries({ queryKey: ["pdv-vendas-hoje"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível finalizar.");
    } finally {
      setEnviando(false);
    }
  }

  function repetir() {
    if (ultimos.length === 0) {
      toast.error("Nenhuma venda anterior neste turno.");
      return;
    }
    setItens(ultimos);
    setPainel("venda");
    toast.success("Última comanda repetida.");
  }

  function compartilharWhats() {
    if (itens.length === 0) {
      toast.error("Comanda vazia.");
      return;
    }
    const linhas = itens
      .map((i) => `${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`)
      .join("\n");
    const texto = `Néia Salgados — Comanda\n${linhas}\nTotal: ${brl(calc.total)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  if (!loading && user && roles && !permitido) {
    return (
      <main className="mx-auto max-w-md p-10 text-center text-muted-foreground">
        PDV restrito a atendente/admin.
      </main>
    );
  }

  const totaisVendas = useMemo(() => {
    const lista = vendasHoje ?? [];
    const total = lista.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
    const porMeio: Record<string, number> = {};
    for (const v of lista)
      porMeio[String(v.forma_pagamento ?? "?")] =
        (porMeio[String(v.forma_pagamento ?? "?")] ?? 0) + (Number(v.total) || 0);
    return { qtd: lista.length, total, porMeio };
  }, [vendasHoje]);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Topo */}
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
        <div className="mr-2 leading-tight">
          <p className="font-display text-2xl font-bold text-yellow-400">
            Néia <span className="text-sm font-normal text-neutral-300">Salgados</span>
          </p>
          <p className="text-[11px] italic text-neutral-400">O sabor que faz a diferença</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg border border-neutral-700 px-3 py-1.5">
            Operador(a)
            <br />
            <b>{user?.email?.split("@")[0] ?? "Caixa 01"}</b>
          </span>
          <span className="rounded-lg border border-neutral-700 px-3 py-1.5">
            <span className="mr-1 inline-block size-2 rounded-full bg-green-500" />
            Online
            <br />
            <span className="text-neutral-400">Sistema conectado</span>
          </span>
          <span className="rounded-lg border border-neutral-700 px-3 py-1.5 text-center">
            <b>{relogio.toLocaleDateString("pt-BR")}</b>
            <br />
            {relogio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-neutral-700 bg-neutral-900 text-neutral-100"
            onClick={sair}
          >
            <LogOut className="mr-1 size-4" />
            Sair
          </Button>
        </div>
      </header>

      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[200px_1fr_340px]">
        {/* Lateral */}
        <aside className="space-y-2">
          <div className="space-y-1.5">
            {CATEGORIAS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCat(c.id);
                  setPainel("venda");
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${cat === c.id && painel === "venda" ? "bg-yellow-400 text-black" : "bg-neutral-900 text-neutral-200"}`}
              >
                <c.icon className="size-5" />
                {c.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm text-neutral-400">
              <Search className="size-4" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto…"
                className="w-full bg-transparent text-neutral-100 outline-none placeholder:text-neutral-500"
              />
            </div>
            {[
              { id: "pedidos", label: "Pedidos", icon: ClipboardList },
              { id: "desconto", label: "Desconto Autorizado", icon: TicketPercent },
              { id: "vendas", label: "Vendas do Dia", icon: ChartColumn },
              { id: "config", label: "Configurações", icon: Settings },
            ].map((m: any) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (m.id === "desconto") {
                    setDescontoLib((v) => !v);
                    setPainel("venda");
                    if (!descontoLib) toast.success("Desconto autorizado liberado na comanda.");
                    return;
                  }
                  setPainel(m.id);
                }}
                className="flex w-full items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2.5 text-sm text-neutral-200"
              >
                <m.icon className="size-4" />
                {m.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Centro */}
        <main>
          {painel === "venda" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 p-4 text-black">
                  <p className="font-display text-lg font-bold leading-tight">
                    Salgados sempre fresquinhos e deliciosos!
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-900 p-4">
                  <p className="font-display text-lg font-bold text-yellow-400">COMBOS ESPECIAIS</p>
                  <p className="text-xs text-neutral-300">Mais sabor, mais economia!</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {grade.map((p: any) => {
                  const slug = slugPorCategoria.get(p.categoria_id) ?? "";
                  return (
                    <div key={p.id} className="overflow-hidden rounded-xl bg-white text-black">
                      <img
                        src={imagemProduto(p.imagem_url, slug)}
                        alt={p.nome}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                      <div className="flex items-center justify-between gap-1 p-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{p.nome}</p>
                          <p className="text-xs font-bold">{brl(precoFinal(p))}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => adicionar(p)}
                          className="rounded-full bg-yellow-400 p-1.5 text-black"
                          aria-label={`Adicionar ${p.nome}`}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {grade.length === 0 && (
                <p className="mt-6 text-center text-sm text-neutral-400">
                  Nenhum produto nesta categoria.
                </p>
              )}
            </>
          )}

          {painel === "pedidos" && (
            <div className="rounded-xl bg-neutral-900 p-4">
              <h2 className="font-display text-xl text-yellow-400">Pedidos de hoje</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(vendasHoje ?? []).map((v: any) => (
                  <li
                    key={v.id}
                    className="flex justify-between gap-2 rounded border border-neutral-800 px-2 py-1.5"
                  >
                    <span>
                      #{v.numero} • {v.cliente_nome} • {v.forma_pagamento} • {v.pagamento_status}
                    </span>
                    <b>{brl(v.total)}</b>
                  </li>
                ))}
                {(vendasHoje ?? []).length === 0 && (
                  <li className="text-neutral-400">Sem vendas hoje.</li>
                )}
              </ul>
            </div>
          )}

          {painel === "vendas" && (
            <div className="rounded-xl bg-neutral-900 p-4">
              <h2 className="font-display text-xl text-yellow-400">Vendas do dia</h2>
              <p className="mt-2 text-3xl font-bold">{brl(totaisVendas.total)}</p>
              <p className="text-sm text-neutral-400">{totaisVendas.qtd} venda(s)</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(totaisVendas.porMeio).map(([m, v]) => (
                  <li
                    key={m}
                    className="flex justify-between rounded border border-neutral-800 px-2 py-1.5"
                  >
                    <span>{m}</span>
                    <b>{brl(v)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {painel === "config" && (
            <div className="rounded-xl bg-neutral-900 p-4 text-sm">
              <h2 className="font-display text-xl text-yellow-400">Configurações</h2>
              <ul className="mt-2 space-y-1 text-neutral-300">
                <li className="flex items-center gap-2">
                  <Truck className="size-4" />
                  Impressora: Tanca TP-550 (fila automática)
                </li>
                <li className="flex items-center gap-2">
                  <ReceiptText className="size-4" />
                  Cupom impresso ao confirmar a venda paga
                </li>
              </ul>
            </div>
          )}
        </main>

        {/* Comanda */}
        <aside className="rounded-xl bg-white p-4 text-black">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">
              Comanda Atual{" "}
              <span className="ml-1 rounded bg-yellow-100 px-2 py-0.5 text-sm text-yellow-800">
                #{comandaN}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setItens([]);
                setDesconto(0);
              }}
              aria-label="Limpar comanda"
            >
              <Trash2 className="size-5 text-neutral-500" />
            </button>
          </div>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {itens.map((i) => (
              <li key={i.produto_id} className="flex items-center gap-2 rounded-lg bg-amber-50 p-2">
                <img src={i.imagem} alt="" className="size-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{i.nome}</p>
                  <p className="text-xs">{brl(i.preco)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mudarQtd(i.produto_id, -1)}
                    className="rounded bg-neutral-200 p-1"
                    aria-label="Diminuir"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold">{i.quantidade}</span>
                  <button
                    type="button"
                    onClick={() => mudarQtd(i.produto_id, 1)}
                    className="rounded bg-neutral-200 p-1"
                    aria-label="Aumentar"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <b className="text-xs">{brl(i.preco * i.quantidade)}</b>
              </li>
            ))}
            {itens.length === 0 && (
              <li className="py-6 text-center text-sm text-neutral-500">
                Toque em + para montar a comanda.
              </li>
            )}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-2 text-sm">
            <p className="flex justify-between">
              <span>Subtotal</span>
              <b>{brl(subtotal)}</b>
            </p>
            <p className="flex items-center justify-between">
              <span>Desconto{!descontoLib && " (bloqueado)"}</span>
              {descontoLib ? (
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={desconto || ""}
                  onChange={(e) => setDesconto(Math.max(0, Number(e.target.value) || 0))}
                  className="h-7 w-24 text-right text-black"
                />
              ) : (
                <b>{brl(0)}</b>
              )}
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-yellow-400 px-3 py-2.5 text-black">
            <b>Total</b>
            <b className="text-xl">{brl(calc.total)}</b>
          </div>
          <details className="mt-2 rounded-lg border border-neutral-200 text-sm">
            <summary className="cursor-pointer px-2 py-1.5 font-semibold">
              Cliente (opcional)
            </summary>
            <div className="grid gap-2 p-2">
              <input
                value={nomeCli}
                onChange={(e) => setNomeCli(e.target.value)}
                placeholder="Nome"
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={telCli}
                  onChange={(e) => setTelCli(e.target.value)}
                  placeholder="Telefone"
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
                <input
                  value={tel2Cli}
                  onChange={(e) => setTel2Cli(e.target.value)}
                  placeholder="2º contato"
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <input
                value={endCli}
                onChange={(e) => setEndCli(e.target.value)}
                placeholder="Endereço"
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </details>
          <details className="mt-2 rounded-lg border border-neutral-200 text-sm">
            <summary className="cursor-pointer px-2 py-1.5 font-semibold">
              Agendar (opcional)
            </summary>
            <div className="p-2">
              <input
                type="datetime-local"
                value={agendadoPara}
                onChange={(e) => setAgendadoPara(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                aria-label="Data e hora do agendamento"
              />
              {agendadoPara ? (
                <button
                  type="button"
                  onClick={() => setAgendadoPara("")}
                  className="mt-1 text-xs text-muted-foreground underline"
                >
                  Limpar (venda imediata)
                </button>
              ) : null}
            </div>
          </details>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                { id: "pix", label: "PIX", icon: QrCode, cls: "bg-emerald-500" },
                { id: "credito", label: "Cartão", icon: CreditCard, cls: "bg-blue-600" },
                { id: "dinheiro", label: "Dinheiro", icon: Banknote, cls: "bg-purple-700" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => presetPagamento(m.id)}
                className={`flex min-h-[44px] flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-bold text-white ${m.cls} ${pagtos.length === 1 && pagtos[0]?.meio === m.id ? "ring-2 ring-black ring-offset-2" : "opacity-80"}`}
              >
                <m.icon className="size-5" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1.5 text-sm">
            {pagtos.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <select
                  value={p.meio}
                  onChange={(e) =>
                    setPagtos((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, meio: e.target.value } : x)),
                    )
                  }
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Meio de pagamento"
                >
                  <option value="pix">Pix</option>
                  <option value="credito">Crédito</option>
                  <option value="debito">Débito</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={p.valor}
                  onChange={(e) =>
                    setPagtos((prev) =>
                      prev.map((x) => (x.id === p.id ? { ...x, valor: e.target.value } : x)),
                    )
                  }
                  placeholder="0,00"
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  aria-label="Valor"
                />
                {pagtos.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPagtos((prev) =>
                        prev.length > 1 ? prev.filter((x) => x.id !== p.id) : prev,
                      )
                    }
                    className="rounded-md border border-input px-2 py-1.5 text-sm"
                    aria-label="Remover pagamento"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={dividirPagamento}
                className="text-xs font-semibold text-blue-700 underline"
              >
                + Dividir pagamento
              </button>
              <span
                className={`text-xs font-bold ${Math.abs(faltaPagar) < 0.005 ? "text-green-700" : "text-red-600"}`}
              >
                {Math.abs(faltaPagar) < 0.005
                  ? "Pagamento fechado"
                  : faltaPagar > 0
                    ? `Faltam ${brl(faltaPagar)}`
                    : `Passou ${brl(-faltaPagar)}`}
              </span>
            </div>
          </div>
          <Button
            onClick={finalizar}
            disabled={enviando || itens.length === 0}
            className="mt-2 w-full bg-yellow-400 py-6 text-lg font-bold text-black hover:bg-yellow-300"
          >
            ✓ Finalizar Venda
          </Button>
          {pagtos.some((p) => p.meio === "pix" && (Number(p.valor) || 0) > 0) && (
            <p className="mt-1 text-center text-[11px] text-neutral-500">
              Pix imprime após confirmação do pagamento.
            </p>
          )}
        </aside>
      </div>

      {/* Rodapé */}
      <footer className="flex flex-wrap items-center gap-1 border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
        <span className="mr-2 italic text-yellow-400">O sabor que faz a diferença</span>
        <button
          type="button"
          onClick={() => setSoFavoritos((v) => !v)}
          className={`flex items-center gap-1 rounded px-2 py-1 ${soFavoritos ? "bg-yellow-400 text-black" : ""}`}
        >
          <Star className="size-4" />
          Favoritos
        </button>
        <button
          type="button"
          onClick={repetir}
          className="flex items-center gap-1 rounded px-2 py-1"
        >
          <Repeat2 className="size-4" />
          Repetir Pedido
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/calculadora" })}
          className="flex items-center gap-1 rounded px-2 py-1"
        >
          <Calculator className="size-4" />
          Calculadora
        </button>
        <button
          type="button"
          onClick={compartilharWhats}
          className="flex items-center gap-1 rounded px-2 py-1"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/campanhas" })}
          className="flex items-center gap-1 rounded px-2 py-1"
        >
          <TicketPercent className="size-4" />
          Cupom/Indicação
        </button>
        <span className="ml-auto hidden sm:block">Néia Salgados — Qualidade em cada mordida!</span>
      </footer>
    </div>
  );
}
