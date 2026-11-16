import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Banknote,
  Calculator,
  CreditCard,
  Droplet,
  Flame,
  LayoutGrid,
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
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminTopbar } from "@/components/admin/admin-topbar";
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
import { decidirCriacaoAtomica, type RpcClient } from "@/lib/criacao-atomica";
import { BUILD_DE_CORTE } from "@/lib/corte";
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

/**
 * Tela do PDV/Balcão.
 *
 * `preview` existe apenas para a conferência visual (rota /preview-l2-pdv):
 * injeta catálogo fictício local e não exige sessão — nenhuma escrita no
 * Supabase acontece nesse modo. Na rota real (/pdv) o comportamento é
 * exatamente o de sempre (sessão, papéis, estoque, pedido e impressão).
 */
export function PDV({
  preview = false,
  produtosInjetados,
  categoriasInjetadas,
}: {
  preview?: boolean;
  produtosInjetados?: any[];
  categoriasInjetadas?: any[];
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const permitido = preview ? true : roles?.includes("admin") || roles?.includes("atendente");
  const { data: produtosHook } = useProdutos();
  const { data: categoriasHook } = useCategorias();
  const produtos = produtosInjetados ?? produtosHook;
  const categorias = categoriasInjetadas ?? categoriasHook;

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
  // Idempotência: mesma chave por tentativa; reenvio retorna o mesmo pedido.
  const chaveRef = useRef("");

  useEffect(() => {
    if (preview) return;
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/pdv" }, replace: true });
  }, [loading, user, navigate, preview]);

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
    enabled: (preview || !!permitido) && (painel === "vendas" || painel === "pedidos"),
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

  // Regra dos Hooks: TODO hook fica ANTES de qualquer early-return de permissão
  // (roles muda de undefined para carregado e, se um hook vier depois do
  // return condicional, o React quebra a renderização por número de hooks
  // diferente entre renders).
  const totaisVendas = useMemo(() => {
    const lista = vendasHoje ?? [];
    const total = lista.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
    const porMeio: Record<string, number> = {};
    for (const v of lista)
      porMeio[String(v.forma_pagamento ?? "?")] =
        (porMeio[String(v.forma_pagamento ?? "?")] ?? 0) + (Number(v.total) || 0);
    return { qtd: lista.length, total, porMeio };
  }, [vendasHoje]);

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
    if (preview) {
      toast.info("Prévia visual: finalização desativada (nenhum pedido é criado).");
      return;
    }
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
      if (!chaveRef.current) chaveRef.current = crypto.randomUUID();

      // Criação atômica (0095) — atrás de flag OFF. Flag OFF => caminho legado
      // intacto. Flag ON + sucesso => pula o legado. Flag ON sem attestation/
      // erro => aborta (NUNCA cai no fallback inseguro).
      let atomico = false;
      let pedidoId = "";
      let numero = 0;
      {
        const decisao = await decidirCriacaoAtomica(supabase as unknown as RpcClient, {
          pedidoId: chaveRef.current,
          canal: "pdv",
          dados: {
            cliente_nome: nomeCli.trim() || "Balcão",
            telefone: telCli.trim(),
            endereco: endCli.trim() || "Balcão",
            bairro: "-",
            cidade: "-",
            tipo_entrega: "retirada",
            forma_pagamento: forma,
            observacoes: obsBits.join(" • "),
            agendado_para: agendadoISO,
            desconto_manual: Number(desconto) || 0,
            pagamento_imediato: pagoNaHora,
          },
          itens: itens.map((i) => ({
            produtoId: i.produto_id,
            quantidade: i.quantidade,
          })),
        });
        if (decisao.modo === "erro") {
          toast.error(decisao.mensagem);
          return;
        }
        if (decisao.modo === "atomico") {
          pedidoId = decisao.pedido.id;
          numero = decisao.pedido.numero;
          atomico = true;
        }
      }

      // No BUILD DE CORTE o caminho legado NAO e compilado: o bloco e removido
      // do bundle (constant-folding de !BUILD_DE_CORTE). Nao ha fallback.
      if (!BUILD_DE_CORTE && !atomico) {
        const res = await supabase
          .from("pedidos")
          .insert({
            id: chaveRef.current,
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
        if (res.error || !res.data) {
          if ((res.error as any)?.code === "23505") {
            // Reenvio: recupera o pedido da mesma chave em vez de duplicar.
            const rec = await supabase
              .from("pedidos")
              .select("id, numero")
              .eq("id", chaveRef.current)
              .single();
            if (!rec.error && rec.data) {
              toast.success(`Venda #${(rec.data as any).numero} já estava registrada.`);
              chaveRef.current = "";
              return;
            }
          }
          throw res.error ?? new Error("insert falhou");
        }
        pedidoId = (res.data as any).id as string;
        numero = (res.data as any).numero as number;
        const { error: e2 } = await supabase.from("pedido_itens").insert(
          itens.map((i) => ({
            pedido_id: pedidoId,
            produto_id: i.produto_id,
            nome: i.nome,
            preco_unitario: i.preco,
            quantidade: i.quantidade,
          })),
        );
        if (e2) {
          // Compensação: desfaz o pedido vazio e mantém a comanda.
          try {
            await supabase.from("pedidos").delete().eq("id", pedidoId);
          } catch {
            /* best-effort */
          }
          throw new Error(
            "Falha ao gravar itens — venda desfeita, comanda mantida. Tente de novo.",
          );
        }
        try {
          await supabase.from("pedido_status_historico").insert({
            pedido_id: pedidoId,
            de_status: null,
            para_status: "recebido",
            motivo: agendadoISO ? "pdv balcão agendado" : "pdv balcão",
          });
        } catch {
          /* sem migration — segue */
        }
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
      chaveRef.current = "";
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

  if (!preview && !loading && user && roles && !permitido) {    return (
      <main className="mx-auto max-w-md p-10 text-center text-muted-foreground">
        PDV restrito a atendente/admin.
      </main>
    );
  }

  return (
    <AdminShell
      aba="pdv"
      onAba={() => {}}
      onRefresh={() => queryClient.invalidateQueries()}
      usuario={user?.email ?? null}
      onSair={sair}
    >
      <div className="admin-pdv-l1 flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Topo do módulo (mesmo padrão dos demais módulos) */}
      <AdminTopbar
        usuario={user?.email ?? null}
        onSair={sair}
        onVoltar={() => navigate({ to: roles?.includes("admin") ? "/admin" : "/atendente" })}
      />

      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Catálogo */}
        <main className="min-w-0 space-y-3">
          {/* Cabeçalho do módulo (como na referência) */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-3 shadow-card">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
                <ReceiptText className="size-4 text-[#F2CE6B]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-foreground">
                  PDV — Atendimento e Caixa
                </h1>
                <p className="text-xs text-muted-foreground">
                  Registro de pedidos, pagamentos e impressão de comandas
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C97C]/55 bg-[#35C97C]/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#35C97C]">
              <span className="size-1.5 rounded-full bg-[#35C97C]" aria-hidden />
              PDV
            </span>
          </section>
          {/* Busca + atalhos */}
          <section className="rounded-2xl border border-[#D4A94A] bg-[#121110] p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-h-[44px] min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#D4A94A]/50 bg-[#17150F] px-3">
                <Search className="size-4 shrink-0 text-[#C9A24B]" aria-hidden />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto por nome ou código…"
                  aria-label="Buscar produto"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-[#8A8278]"
                />
              </div>
              {[
                { id: "pedidos", label: "Pedidos", icon: ClipboardList },
                { id: "desconto", label: "Desconto", icon: TicketPercent },
                { id: "vendas", label: "Vendas", icon: ChartColumn },
                { id: "config", label: "Config", icon: Settings },
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
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2A2721] bg-[#17150F] px-3 text-xs font-medium text-[#C9C2B8] transition-colors hover:border-[#D4A94A]/60 hover:text-[#F2CE6B]"
                >
                  <m.icon className="size-4 text-[#C9A24B]" />
                  {m.label}
                </button>
              ))}
            </div>

            {/* Categorias (chips, como na referência) */}
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => {
                const ativo = cat === c.id && painel === "venda";
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCat(c.id);
                      setPainel("venda");
                    }}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                      ativo
                        ? "erp-btn-gold border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C]"
                        : "border-[#2A2721] bg-[#17150F] text-[#C9C2B8] hover:border-[#D4A94A]/60 hover:text-[#F2CE6B]"
                    }`}
                  >
                    <c.icon className={`size-4 ${ativo ? "text-[#14120C]" : "text-[#C9A24B]"}`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>
          {painel === "venda" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#D4A94A] bg-gradient-to-br from-[#241E12] to-[#141310] px-4 py-2.5 shadow-card">
                  <p className="font-display text-base font-bold leading-tight text-[#F2CE6B]">
                    Salgados sempre fresquinhos e deliciosos!
                  </p>
                </div>
                <div className="rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-2.5 shadow-card">
                  <p className="font-display text-base font-bold text-[#F2CE6B]">COMBOS ESPECIAIS</p>
                  <p className="text-[11px] text-[#A09A8E]">Mais sabor, mais economia!</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {grade.map((p: any) => {
                  const slug = slugPorCategoria.get(p.categoria_id) ?? "";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => adicionar(p)}
                      className="group overflow-hidden rounded-2xl border border-[#D4A94A]/45 bg-[#121110] text-left shadow-card transition-all hover:border-[#F2CE6B] hover:shadow-[0_0_20px_rgba(212,169,74,.28)]"
                      aria-label={`Adicionar ${p.nome}`}
                    >
                      <img
                        src={imagemProduto(p.imagem_url, slug)}
                        alt={p.nome}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                      <div className="flex items-center justify-between gap-1 p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">{p.nome}</p>
                          <p className="text-xs font-bold text-[#F2CE6B]">{brl(precoFinal(p))}</p>
                        </div>
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C] transition-transform group-hover:scale-105">
                          <Plus className="size-4" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {grade.length === 0 && (
                <p className="mt-6 rounded-2xl border border-[#D4A94A]/45 bg-[#121110] py-6 text-center text-sm text-[#A09A8E]">
                  Nenhum produto nesta categoria.
                </p>
              )}
            </>
          )}

          {painel === "pedidos" && (
            <div className="rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 shadow-card">
              <h2 className="font-display text-xl text-[#F2CE6B]">Pedidos de hoje</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {(vendasHoje ?? []).map((v: any) => (
                  <li
                    key={v.id}
                    className="flex justify-between gap-2 rounded-xl border border-[#2A2721] bg-[#17150F] px-3 py-2"
                  >
                    <span className="text-[#C9C2B8]">
                      #{v.numero} • {v.cliente_nome} • {v.forma_pagamento} • {v.pagamento_status}
                    </span>
                    <b className="text-[#F2CE6B]">{brl(v.total)}</b>
                  </li>
                ))}
                {(vendasHoje ?? []).length === 0 && (
                  <li className="text-[#A09A8E]">Sem vendas hoje.</li>
                )}
              </ul>
            </div>
          )}

          {painel === "vendas" && (
            <div className="rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 shadow-card">
              <h2 className="font-display text-xl text-[#F2CE6B]">Vendas do dia</h2>
              <p className="mt-2 font-display text-3xl font-bold text-foreground">
                {brl(totaisVendas.total)}
              </p>
              <p className="text-sm text-[#A09A8E]">{totaisVendas.qtd} venda(s)</p>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(totaisVendas.porMeio).map(([m, v]) => (
                  <li
                    key={m}
                    className="flex justify-between rounded-xl border border-[#2A2721] bg-[#17150F] px-3 py-2"
                  >
                    <span className="text-[#C9C2B8]">{m}</span>
                    <b className="text-[#F2CE6B]">{brl(v)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {painel === "config" && (
            <div className="rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 text-sm shadow-card">
              <h2 className="font-display text-xl text-[#F2CE6B]">Configurações</h2>
              <ul className="mt-2 space-y-1 text-[#C9C2B8]">
                <li className="flex items-center gap-2">
                  <Truck className="size-4 text-[#C9A24B]" />
                  Impressora: Tanca TP-550 (fila automática)
                </li>
                <li className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-[#C9A24B]" />
                  Cupom impresso ao confirmar a venda paga
                </li>
              </ul>
            </div>
          )}
        </main>

        {/* Comanda */}
        <aside className="rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 text-foreground shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
              Pedido{" "}
              <span className="ml-1 rounded-full border border-[#D4A94A]/60 bg-[#F2CE6B]/15 px-2 py-0.5 text-xs font-bold text-[#F2CE6B]">
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
              className="grid size-9 place-items-center rounded-xl border border-[#2A2721] bg-[#17150F] text-[#A09A8E] transition-colors hover:border-[#F16A6A]/60 hover:text-[#F16A6A]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {itens.map((i) => (
              <li
                key={i.produto_id}
                className="flex items-center gap-2 rounded-xl border border-[#2A2721] bg-[#17150F] p-2"
              >
                <img src={i.imagem} alt="" className="size-10 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{i.nome}</p>
                  <p className="text-xs text-[#A09A8E]">{brl(i.preco)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mudarQtd(i.produto_id, -1)}
                    className="grid size-8 place-items-center rounded-lg border border-[#D4A94A]/45 bg-[#121110] text-[#F2CE6B] transition-colors hover:bg-[#F2CE6B] hover:text-[#14120C]"
                    aria-label="Diminuir"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-foreground">
                    {i.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={() => mudarQtd(i.produto_id, 1)}
                    className="grid size-8 place-items-center rounded-lg border border-[#D4A94A]/45 bg-[#121110] text-[#F2CE6B] transition-colors hover:bg-[#F2CE6B] hover:text-[#14120C]"
                    aria-label="Aumentar"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <b className="text-xs text-[#F2CE6B]">{brl(i.preco * i.quantidade)}</b>
              </li>
            ))}
            {itens.length === 0 && (
              <li className="rounded-xl border border-dashed border-[#D4A94A]/40 py-6 text-center text-sm text-[#A09A8E]">
                Toque em + para montar o pedido.
              </li>
            )}
          </ul>
          <div className="mt-3 space-y-1 border-t border-[#D4A94A]/35 pt-2 text-sm">
            <p className="flex justify-between text-[#C9C2B8]">
              <span>Subtotal</span>
              <b className="text-foreground">{brl(subtotal)}</b>
            </p>
            <p className="flex items-center justify-between text-[#C9C2B8]">
              <span>Desconto{!descontoLib && " (bloqueado)"}</span>
              {descontoLib ? (
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={desconto || ""}
                  onChange={(e) => setDesconto(Math.max(0, Number(e.target.value) || 0))}
                  className="h-8 w-24 bg-[#121110] text-right text-foreground"
                  aria-label="Desconto"
                />
              ) : (
                <b className="text-foreground">{brl(0)}</b>
              )}
            </p>
          </div>
          <div className="erp-btn-gold mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-[#14120C]">
            <b className="uppercase tracking-wide">Total</b>
            <b className="font-display text-xl">{brl(calc.total)}</b>
          </div>
          <details className="mt-2 rounded-xl border border-[#2A2721] bg-[#17150F] text-sm">
            <summary className="cursor-pointer px-3 py-2 font-semibold text-[#C9C2B8]">
              Cliente (opcional)
            </summary>
            <div className="grid gap-2 p-2">
              <input
                value={nomeCli}
                onChange={(e) => setNomeCli(e.target.value)}
                placeholder="Nome"
                className="rounded-md border border-[#D4A94A]/40 bg-[#121110] px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-[#8A8278]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={telCli}
                  onChange={(e) => setTelCli(e.target.value)}
                  placeholder="Telefone"
                  className="rounded-md border border-[#D4A94A]/40 bg-[#121110] px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-[#8A8278]"
                />
                <input
                  value={tel2Cli}
                  onChange={(e) => setTel2Cli(e.target.value)}
                  placeholder="2º contato"
                  className="rounded-md border border-[#D4A94A]/40 bg-[#121110] px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-[#8A8278]"
                />
              </div>
              <input
                value={endCli}
                onChange={(e) => setEndCli(e.target.value)}
                placeholder="Endereço"
                className="rounded-md border border-[#D4A94A]/40 bg-[#121110] px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-[#8A8278]"
              />
            </div>
          </details>
          <details className="mt-2 rounded-xl border border-[#2A2721] bg-[#17150F] text-sm">
            <summary className="cursor-pointer px-3 py-2 font-semibold text-[#C9C2B8]">
              Agendar (opcional)
            </summary>
            <div className="p-2">
              <input
                type="datetime-local"
                value={agendadoPara}
                onChange={(e) => setAgendadoPara(e.target.value)}
                className="w-full rounded-md border border-[#D4A94A]/40 bg-[#121110] px-2 py-1.5 text-sm text-foreground outline-none"
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
                { id: "dinheiro", label: "Dinheiro", icon: Banknote },
                { id: "pix", label: "PIX", icon: QrCode },
                { id: "credito", label: "Cartão", icon: CreditCard },
              ] as const
            ).map((m) => {
              const selecionado = pagtos.length === 1 && pagtos[0]?.meio === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => presetPagamento(m.id)}
                  className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-bold transition-colors ${
                    selecionado
                      ? "erp-btn-gold border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C]"
                      : "border-[#2A2721] bg-[#17150F] text-[#C9C2B8] hover:border-[#D4A94A]/60 hover:text-[#F2CE6B]"
                  }`}
                >
                  <m.icon
                    className={`size-5 ${selecionado ? "text-[#14120C]" : "text-[#C9A24B]"}`}
                  />
                  {m.label}
                </button>
              );
            })}
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
                className="text-xs font-semibold text-[#2563EB] underline"
              >
                + Dividir pagamento
              </button>
              <span
                className={`text-xs font-bold ${Math.abs(faltaPagar) < 0.005 ? "text-[#21835D]" : "text-[#DC2626]"}`}
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
            className="erp-btn-gold mt-3 w-full min-h-[56px] rounded-xl border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-base font-bold uppercase tracking-wide text-[#14120C] hover:brightness-105"
          >
            ✓ Finalizar Pedido
          </Button>
          {pagtos.some((p) => p.meio === "pix" && (Number(p.valor) || 0) > 0) && (
            <p className="mt-1 text-center text-[11px] text-[#A09A8E]">
              Pix imprime após confirmação do pagamento.
            </p>
          )}
        </aside>
      </div>

      {/* Rodapé */}
      <footer className="flex flex-wrap items-center gap-1 border-t border-[#D4A94A]/35 bg-[#0F0E0C] px-3 py-2 text-xs text-[#A09A8E]">
        <span className="mr-2 italic text-[#C9A24B]">O sabor que faz a diferença</span>
        <button
          type="button"
          onClick={() => setSoFavoritos((v) => !v)}
          className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 py-1 transition-colors ${
            soFavoritos
              ? "border-[#D4A94A] bg-[#F2CE6B]/15 text-[#F2CE6B]"
              : "border-transparent hover:border-[#D4A94A]/50 hover:text-[#F2CE6B]"
          }`}
        >
          <Star className="size-4 text-[#C9A24B]" />
          Favoritos
        </button>
        <button
          type="button"
          onClick={repetir}
          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 transition-colors hover:border-[#D4A94A]/50 hover:text-[#F2CE6B]"
        >
          <Repeat2 className="size-4 text-[#C9A24B]" />
          Repetir Pedido
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/calculadora" })}
          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 transition-colors hover:border-[#D4A94A]/50 hover:text-[#F2CE6B]"
        >
          <Calculator className="size-4 text-[#C9A24B]" />
          Calculadora
        </button>
        <button
          type="button"
          onClick={compartilharWhats}
          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 transition-colors hover:border-[#D4A94A]/50 hover:text-[#F2CE6B]"
        >
          <MessageCircle className="size-4 text-[#C9A24B]" />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/campanhas" })}
          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 transition-colors hover:border-[#D4A94A]/50 hover:text-[#F2CE6B]"
        >
          <TicketPercent className="size-4 text-[#C9A24B]" />
          Cupom/Indicação
        </button>
        <span className="ml-auto hidden sm:block">Néia Salgados — Qualidade em cada mordida!</span>
      </footer>
      </div>
    </AdminShell>
  );
}
