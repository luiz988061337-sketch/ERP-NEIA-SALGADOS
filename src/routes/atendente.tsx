import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Database } from "@/integrations/supabase/types";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA, mensagemStatus, whatsappLink } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { precoFinal, tipoVendaProduto, useCategorias, useProdutos } from "@/lib/catalog";
import { MINIMO_COMBO, calcTotals } from "@/lib/totals";
import { ajustarParaCombo } from "@/lib/cart";
import { logAdmin } from "@/lib/operacao";
import { normalizarTelefone } from "@/lib/crm";

export const Route = createFileRoute("/atendente")({
  head: () => ({ meta: [{ title: "Novo Pedido (atendente) — Néia Salgados" }] }),
  component: Atendente,
});

type Linha = { produto_id: string; nome: string; preco: number; quantidade: number; combo?: boolean };

function Atendente() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const permitido = roles?.includes("admin") || roles?.includes("atendente");
  const { data: produtos } = useProdutos();
const { data: categorias } = useCategorias();
const slugCategoriaPorId = useMemo(() => new Map((categorias ?? []).map((c) => [c.id, c.slug])), [categorias]);

  const [buscaCli, setBuscaCli] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [buscaProd, setBuscaProd] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [entrega, setEntrega] = useState<"entrega" | "retirada">("entrega");
  const [quando, setQuando] = useState<"hoje" | "agendar">("hoje");
  const [agendamento, setAgendamento] = useState("");
  const [pagamento, setPagamento] = useState<"pix" | "dinheiro" | "credito" | "debito">("pix");
  const [obs, setObs] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/atendente" }, replace: true });
  }, [loading, user, navigate]);

  const { data: achados } = useQuery({
    queryKey: ["atendente-clientes", buscaCli],
    enabled: !!permitido && buscaCli.trim().length >= 3,
    queryFn: async () => {
      const t = buscaCli.trim().replace(/[^\p{L}\p{N}\s]/gu, "").slice(0, 60);
      const dig = t.replace(/\D/g, "");
      const { data, error } = await supabase.from("profiles").select("nome, telefone").or(`nome.ilike.%${t}%,telefone.ilike.%${dig}%`).limit(12);
      if (error) throw error;
      const vistos = new Set<string>();
      const out: { nome: string; telefone: string }[] = [];
      for (const p of ((data ?? []) as any[])) {
        const tel = String(p.telefone ?? "");
        if (!tel || vistos.has(tel)) continue;
        vistos.add(tel);
        out.push({ nome: p.nome ?? "", telefone: tel });
      }
      return out.slice(0, 8);
    },
  });

  const subtotal = linhas.reduce((a, l) => a + l.preco * l.quantidade, 0);
  const calc = calcTotals({ subtotal, taxaEntrega: entrega === "entrega" ? TAXA_ENTREGA : 0, desconto });

  function addProd(id: string) {
    const p = (produtos ?? []).find((x) => x.id === id);
    if (!p || !p.disponivel) return;
    // Mesma regra do carrinho: combo entra em múltiplos de 50.
    const combo = tipoVendaProduto(p, slugCategoriaPorId.get(p.categoria_id) ?? "") === "combo_50";
    const passo = combo ? MINIMO_COMBO : 1;
    setLinhas((prev) => {
      const f = prev.find((l) => l.produto_id === id);
      if (f) {
        const soma = f.quantidade + passo;
        return prev.map((l) =>
          l.produto_id === id ? { ...l, quantidade: combo ? ajustarParaCombo(soma) : soma } : l,
        );
      }
      return [...prev, { produto_id: id, nome: p.nome, preco: precoFinal(p), quantidade: passo, combo }];
    });
  }

  function mudaQtd(id: string, delta: number) {
    setLinhas((prev) =>
      prev
        .map((l) => {
          if (l.produto_id !== id) return l;
          const n = l.quantidade + delta;
          return { ...l, quantidade: l.combo ? ajustarParaCombo(Math.max(n, MINIMO_COMBO)) : n };
        })
        .filter((l) => l.quantidade > 0),
    );
  }

  async function finalizar() {
    if (!user) return;
    const telDig = telefone.replace(/\D/g, "");
    if (nome.trim().length < 2) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (telDig.length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (linhas.length === 0) {
      toast.error("Adicione ao menos um produto.");
      return;
    }
    if (entrega === "entrega" && endereco.trim().length < 6) {
      toast.error("Informe o endereço de entrega.");
      return;
    }
    let agendadoPara: string | null = null;
    if (quando === "agendar") {
      const dt = new Date(agendamento);
      if (!agendamento || Number.isNaN(+dt) || +dt <= Date.now() + 30 * 60000) {
        toast.error("Agende com pelo menos 30 minutos de antecedência.");
        return;
      }
      agendadoPara = dt.toISOString();
    }
    setEnviando(true);
    try {
      // Revalida preços atuais direto do banco
      const ids = [...new Set(linhas.map((l) => l.produto_id))];
      const { data: prods, error: e1 } = await supabase.from("produtos").select("id, nome, preco, preco_promocional, disponivel, estoque").in("id", ids);
      if (e1) throw e1;
      const mapa = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
      const itens: Linha[] = [];
      const fora: string[] = [];
      let sub = 0;
      for (const l of linhas) {
        const p = mapa.get(l.produto_id);
        if (!p || !p.disponivel || Number(p.estoque ?? 0) <= 0) {
          fora.push(l.nome);
          continue;
        }
        const preco = Number(precoFinal(p as any));
        sub += preco * l.quantidade;
        itens.push({ produto_id: l.produto_id, nome: l.nome, preco, quantidade: l.quantidade });
      }
      if (itens.length === 0) throw new Error("Nenhum item disponível no momento.");
      const calcF = calcTotals({ subtotal: sub, taxaEntrega: entrega === "entrega" ? TAXA_ENTREGA : 0, desconto });
      // Determinar modalidade de pagamento: online vs na_entrega
      // - dinheiro: sempre na_entrega
      // - pix/credito/debito: online por padrão
      // - retirada: sempre online
      const pagamento_modalidade = entrega === "retirada" ? "online"
        : pagamento === "dinheiro" ? "na_entrega"
        : "online";

      const insertBody: Record<string, any> = {
        user_id: user.id,
        cliente_nome: nome.trim(),
        telefone: telefone.trim(),
        endereco: entrega === "entrega" ? endereco.trim() : "Retirada",
        bairro: bairro.trim(),
        cidade: cidade.trim(),
        complemento: "",
        referencia: "",
        observacoes: obs.trim(),
        forma_pagamento: pagamento,
        pagamento_modalidade,
        subtotal: sub,
        taxa_entrega: calcF.taxaEntrega,
        desconto: calcF.desconto,
        total: calcF.total,
        cupom: null,
        tipo_entrega: entrega,
        agendado_para: agendadoPara,
        agendamento_obs: "",
        tipo_evento: "",
      };
      let pedidoId = "";
      let numero = 0;
      {
        const res = await supabase.from("pedidos").insert(insertBody).select("id, numero").single();
        if (res.error && String(res.error.message ?? "").includes("column")) {
          const { agendado_para: _a, agendamento_obs: _b, tipo_evento: _c, cidade: _d, pagamento_modalidade: _pm, tipo_entrega: _te, ...legacy } = insertBody;
          const retry = await supabase.from("pedidos").insert(legacy).select("id, numero").single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          pedidoId = (retry.data as any).id;
          numero = (retry.data as any).numero;
        } else {
          if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
          pedidoId = (res.data as any).id;
          numero = (res.data as any).numero;
        }
      }
      const { error: e2 } = await supabase.from("pedido_itens").insert(
        itens.map((i) => ({ pedido_id: pedidoId, produto_id: i.produto_id, nome: i.nome, preco_unitario: i.preco, quantidade: i.quantidade })),
      );
      if (e2) console.error(e2);
      void logAdmin("pedido_atendente", `#${numero} ${nome.trim()} ${brl(calcF.total)}`);
      setUltimo(numero);
      setLinhas([]);
      setObs("");
      setDesconto(0);
      if (fora.length > 0) toast.warning(`Indisponíveis: ${fora.slice(0, 3).join(", ")}`);
      toast.success(`Pedido #${numero} registrado! Total ${brl(calcF.total)}`);
      const linhasTxt = itens.map((i) => `* ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`).join("\n");
      window.open(whatsappLink(telefone.trim(), `Novo pedido #${numero}\n\nCliente: ${nome.trim()}\n\n${linhasTxt}\n\nProdutos: ${brl(calcF.subtotal)}\nEntrega: ${brl(calcF.taxaEntrega)}\nTotal: ${brl(calcF.total)}\n\nPagamento: ${PAGAMENTO_LABEL[pagamento]}\n\n${mensagemStatus("recebido", nome.trim(), numero)}`), "_blank", "noopener");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setEnviando(false);
    }
  }

  if (loading) return <p className="p-10 text-center text-muted-foreground">Carregando…</p>;
  if (roles && !permitido) return <p className="p-10 text-center">Acesso restrito a atendentes e administradores.</p>;

  const termo = buscaProd.trim().toLowerCase();
  const prodsOk = (produtos ?? []).filter((p) => p.disponivel && (!termo || p.nome.toLowerCase().includes(termo)));

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <h1 className="font-display text-3xl">Novo pedido</h1>
      {ultimo ? <p className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm">✅ Último pedido registrado: <strong>#{ultimo}</strong></p> : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Cliente</h2>
        <Input value={buscaCli} onChange={(e) => setBuscaCli(e.target.value)} placeholder="Buscar cliente (3+ letras)…" />
        {(achados ?? []).length > 0 ? (
          <ul className="space-y-1">
            {(achados ?? []).map((a) => (
              <li key={a.telefone}>
                <button type="button" className="w-full rounded-lg border border-border p-2 text-left text-sm hover:bg-muted" onClick={() => { setNome(a.nome); setTelefone(a.telefone); setBuscaCli(""); }}>
                  {a.nome || "Sem nome"} • {a.telefone}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" /></div>
          <div className="space-y-1.5"><Label>WhatsApp *</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" inputMode="tel" /></div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Produtos</h2>
        <Input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto…" />
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {prodsOk.slice(0, 60).map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{p.nome} <span className="text-muted-foreground">• {brl(precoFinal(p))}</span></span>
              <Button size="sm" variant="outline" onClick={() => addProd(p.id)}>Adicionar</Button>
            </li>
          ))}
        </ul>
        {linhas.length > 0 ? (
          <ul className="space-y-1.5 border-t border-border pt-2">
            {linhas.map((l) => (
              <li key={l.produto_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{l.quantidade}x {l.nome}</span>
                <Button size="sm" variant="outline" onClick={() => mudaQtd(l.produto_id, -1)}>−</Button>
                <Button size="sm" variant="outline" onClick={() => mudaQtd(l.produto_id, 1)}>+</Button>
                <span className="w-20 text-right">{brl(l.preco * l.quantidade)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Entrega e data</h2>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setEntrega("entrega")} className={`rounded-lg border p-3 text-sm font-semibold ${entrega === "entrega" ? "border-primary bg-primary/10" : ""}`}>🛵 Entrega</button>
          <button type="button" onClick={() => setEntrega("retirada")} className={`rounded-lg border p-3 text-sm font-semibold ${entrega === "retirada" ? "border-primary bg-primary/10" : ""}`}>🏃 Retirada</button>
        </div>
        {entrega === "entrega" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1"><Label>Endereço *</Label><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número" /></div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input value={bairro} onChange={(e) => setBairro(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setQuando("hoje")} className={`rounded-lg border p-3 text-sm font-semibold ${quando === "hoje" ? "border-primary bg-primary/10" : ""}`}>Hoje</button>
          <button type="button" onClick={() => setQuando("agendar")} className={`rounded-lg border p-3 text-sm font-semibold ${quando === "agendar" ? "border-primary bg-primary/10" : ""}`}>Agendar</button>
        </div>
        {quando === "agendar" ? (
          <div className="space-y-1.5"><Label>Data e horário *</Label><Input type="datetime-local" value={agendamento} onChange={(e) => setAgendamento(e.target.value)} /></div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">Pagamento e obs.</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
            <button key={op} type="button" onClick={() => setPagamento(op)} className={`rounded-lg border p-2.5 text-sm font-semibold ${pagamento === op ? "border-primary bg-primary/10" : ""}`}>{PAGAMENTO_LABEL[op]}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Desconto (R$)</Label><Input type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Observação</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} /></div>
        </div>
      </section>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{brl(entrega === "entrega" ? TAXA_ENTREGA : 0)}</span></div>
        {desconto > 0 ? <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{brl(Math.min(desconto, subtotal))}</span></div> : null}
        <div className="flex justify-between border-t border-border pt-2 font-display text-lg"><span>Total</span><span className="text-primary">{brl(calc.total)}</span></div>
        <p className="text-xs text-muted-foreground">Telefone normalizado: {normalizarTelefone(telefone) || "—"}</p>
      </section>

      <Button size="lg" className="min-h-[52px] w-full text-base" disabled={enviando || linhas.length === 0} onClick={finalizar}>
        {enviando ? "Registrando…" : `Finalizar pedido • ${brl(calc.total)}`}
      </Button>
    </div>
  );
}
