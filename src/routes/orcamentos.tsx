import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, TAXA_ENTREGA } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { useCart } from "@/lib/cart";
import { precoFinal, useProdutos } from "@/lib/catalog";
import { montarWhatsApp } from "@/lib/inteligencia";
import { logAdmin } from "@/lib/operacao";
import { htmlOrcamento, textoOrcamento, totaisOrcamento, type OrcamentoDoc, type OrcamentoMixItem } from "@/lib/orcamentos";

export const Route = createFileRoute("/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos — Néia Salgados" }] }),
  component: Orcamentos,
});

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
  convertido: "Convertido em pedido",
};

function Orcamentos() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const { add, clear } = useCart();
  const { data: produtos } = useProdutos();
  const isStaff = roles?.includes("admin") || roles?.includes("atendente");

  const [modo, setModo] = useState<"lista" | "novo" | "ver">("lista");
  const [atual, setAtual] = useState<any | null>(null);
  const [buscaProd, setBuscaProd] = useState("");
  const [mix, setMix] = useState<Record<string, number>>({});
  const [retirada, setRetirada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/orcamentos" }, replace: true });
  }, [loading, user, navigate]);

  const { data: lista, isLoading } = useQuery({
    queryKey: ["orcamentos", user?.id, isStaff],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("orcamentos").select("*").order("created_at", { ascending: false }).limit(200);
      if (!isStaff) q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const itensMix: OrcamentoMixItem[] = useMemo(() => {
    const porId = new Map((produtos ?? []).map((p) => [p.id, p]));
    return Object.entries(mix)
      .filter(([, q]) => q > 0)
      .map(([id, quantidade]): OrcamentoMixItem | null => {
        const p = porId.get(id);
        if (!p) return null;
        return { produto_id: id, nome: p.nome, quantidade, preco_unitario: precoFinal(p) };
      })
      .filter((x): x is OrcamentoMixItem => !!x);
  }, [mix, produtos]);

  if (loading) {
    return <p className="p-10 text-center text-muted-foreground">Carregando…</p>;
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>, status = "rascunho") {
    e.preventDefault();
    if (!user) return;
    if (itensMix.length === 0) {
      toast.error("Adicione ao menos um produto.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const desconto = Number(f.get("desconto") ?? 0);
    const taxa = retirada ? 0 : TAXA_ENTREGA;
    const calc = totaisOrcamento(itensMix, taxa, desconto);
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: isStaff ? null : user.id,
        cliente_nome: String(f.get("cliente_nome") ?? ""),
        telefone: String(f.get("telefone") ?? ""),
        tipo_evento: String(f.get("tipo_evento") ?? ""),
        pessoas: Number(f.get("pessoas") ?? 0),
        data_evento: String(f.get("data_evento") ?? "") || null,
        horario: String(f.get("horario") ?? ""),
        validade: String(f.get("validade") ?? "") || null,
        mix: itensMix,
        observacoes: String(f.get("observacoes") ?? ""),
        subtotal: calc.subtotal,
        taxa_entrega: calc.taxaEntrega,
        total: calc.total,
        status,
      };
      let { error } = await supabase.from("orcamentos").insert(payload);
      if (error && String(error.message ?? "").includes("column")) {
        const { validade: _v, ...legacy } = payload;
        const retry = await supabase.from("orcamentos").insert(legacy);
        error = retry.error;
        if (!error) toast.warning("Salvo sem validade — rode a migração 0007 no Supabase.");
      }
      if (error) throw error;
      toast.success("Orçamento salvo!");
      setMix({});
      setModo("lista");
      (e.target as HTMLFormElement).reset();
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar. Verifique as migrações no Supabase.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(o: any, status: string) {
    const { error } = await supabase.from("orcamentos").update({ status }).eq("id", o.id);
    if (error) {
      toast.error("Não foi possível atualizar.");
      return;
    }
    toast.success(`Orçamento → ${STATUS_LABEL[status] ?? status}`);
    void logAdmin("orcamento_status", `${o.cliente_nome} → ${status}`);
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
    if (atual?.id === o.id) setAtual({ ...atual, status });
  }

  function imprimir(o: any) {
    const doc: OrcamentoDoc = {
      ...o,
      mix: Array.isArray(o.mix) ? o.mix : [],
      desconto: Number(o.desconto ?? (o.subtotal + o.taxa_entrega - o.total)),
    };
    const w = window.open("", "_blank", "noopener,width=700");
    if (!w) {
      toast.error("Permita pop-ups para imprimir.");
      return;
    }
    w.document.write(htmlOrcamento(doc));
    w.document.close();
  }

  /** Converter: recalcula preços atuais, valida disponibilidade, preenche o carrinho (NÃO confirma sozinho). */
  async function converter(o: any) {
    const mixArr: OrcamentoMixItem[] = Array.isArray(o.mix) ? o.mix : [];
    if (mixArr.length === 0) {
      toast.error("Orçamento sem itens.");
      return;
    }
    const ids = [...new Set(mixArr.map((i) => i.produto_id).filter(Boolean))] as string[];
    const { data: prods } = await supabase.from("produtos").select("id, nome, preco, preco_promocional, disponivel, estoque, imagem_url").in("id", ids);
    const mapa = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
    const indisponiveis: string[] = [];
    const validos: OrcamentoMixItem[] = [];
    for (const item of mixArr) {
      const p = item.produto_id ? mapa.get(item.produto_id) : null;
      if (!p || !p.disponivel || Number(p.estoque ?? 0) <= 0) {
        indisponiveis.push(item.nome);
        continue;
      }
      validos.push({ produto_id: item.produto_id, nome: item.nome, quantidade: item.quantidade, preco_unitario: Number(precoFinal(p as any)) });
    }
    if (validos.length === 0) {
      toast.error("Nenhum item disponível no momento.");
      return;
    }
    clear();
    for (const v of validos) {
      add({ id: v.produto_id!, nome: v.nome, preco: v.preco_unitario, imagem: null, produtoId: v.produto_id }, v.quantidade);
    }
    await mudarStatus(o, "convertido");
    if (indisponiveis.length > 0) toast.warning(`Indisponíveis agora: ${indisponiveis.slice(0, 3).join(", ")}`);
    toast.success("Carrinho preenchido com preços atuais. Confira e finalize.");
    navigate({ to: "/checkout" });
  }

  const termo = buscaProd.trim().toLowerCase();
  const prodsFiltrados = (produtos ?? []).filter((p) => p.disponivel && (!termo || p.nome.toLowerCase().includes(termo)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl">Orçamentos</h1>
        <div className="ml-auto flex gap-2">
          {modo !== "lista" ? <Button variant="outline" size="sm" onClick={() => { setModo("lista"); setAtual(null); }}>Voltar</Button> : null}
          {modo === "lista" ? <Button size="sm" onClick={() => { setMix({}); setModo("novo"); }}>+ Novo orçamento</Button> : null}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Orçamento não é pedido confirmado. A conversão sempre recalcula preços e disponibilidade.</p>

      {modo === "lista" ? (
        <ul className="mt-4 space-y-2">
          {isLoading ? <li className="text-sm text-muted-foreground">Carregando…</li> : null}
          {(lista ?? []).map((o: any) => (
            <li key={o.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display">{o.cliente_nome || "Sem nome"}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{STATUS_LABEL[o.status] ?? o.status}</span>
                <span className="ml-auto font-display text-primary">{brl(o.total)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {o.tipo_evento || "Evento"}{o.data_evento ? ` • ${new Date(`${o.data_evento}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}{o.horario ? ` • ${o.horario}` : ""} • {(o.mix ?? []).length} item(ns)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => { setAtual(o); setModo("ver"); }}>Abrir</Button>
                {o.status === "rascunho" ? <Button size="sm" variant="outline" onClick={() => mudarStatus(o, "enviado")}>Marcar enviado</Button> : null}
                {o.status === "enviado" ? <Button size="sm" variant="outline" onClick={() => mudarStatus(o, "aprovado")}>Aprovar</Button> : null}
                {o.status === "enviado" ? <Button size="sm" variant="ghost" onClick={() => mudarStatus(o, "recusado")}>Recusar</Button> : null}
                {["rascunho", "enviado", "aprovado"].includes(o.status) ? <Button size="sm" onClick={() => converter(o)}>Converter em pedido</Button> : null}
              </div>
            </li>
          ))}
          {!isLoading && (lista ?? []).length === 0 ? <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum orçamento ainda.</li> : null}
        </ul>
      ) : null}

      {modo === "novo" ? (
        <form onSubmit={(e) => salvar(e)} className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Cliente *</Label><Input name="cliente_nome" required maxLength={100} /></div>
            <div className="space-y-1.5"><Label>Telefone *</Label><Input name="telefone" required placeholder="(11) 90000-0000" /></div>
            <div className="space-y-1.5"><Label>Tipo de evento</Label>
              <select name="tipo_evento" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
                <option value="">—</option>
                <option value="aniversario">Aniversário</option>
                <option value="casamento">Casamento</option>
                <option value="empresa">Empresa</option>
                <option value="festa">Festa</option>
                <option value="confraternizacao">Confraternização</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Pessoas (opcional)</Label><Input name="pessoas" type="number" min={0} defaultValue={0} /></div>
            <div className="space-y-1.5"><Label>Data do evento</Label><Input name="data_evento" type="date" /></div>
            <div className="space-y-1.5"><Label>Horário</Label><Input name="horario" placeholder="Ex: 15h" maxLength={20} /></div>
            <div className="space-y-1.5"><Label>Validade</Label><Input name="validade" type="date" /></div>
            <div className="space-y-1.5"><Label>Desconto (R$)</Label><Input name="desconto" type="number" min={0} step="0.01" defaultValue={0} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={retirada} onChange={(e) => setRetirada(e.target.checked)} /> Retirada (sem taxa de entrega)</label>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea name="observacoes" rows={2} maxLength={300} /></div>
          <div className="space-y-1.5">
            <Label>Produtos (preços atuais)</Label>
            <Input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto…" />
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {prodsFiltrados.slice(0, 60).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{p.nome} <span className="text-muted-foreground">• {brl(precoFinal(p))}</span></span>
                  <input
                    type="number" min={0} value={mix[p.id] ?? 0}
                    onChange={(e) => setMix((s) => ({ ...s, [p.id]: Math.max(0, Number(e.target.value)) }))}
                    className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm" aria-label={`Qtd ${p.nome}`}
                  />
                </li>
              ))}
            </ul>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={salvando || itensMix.length === 0}>
            {salvando ? "Salvando…" : "Salvar orçamento"}
          </Button>
        </form>
      ) : null}

      {modo === "ver" && atual ? (
        <section className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">{atual.cliente_nome}</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{STATUS_LABEL[atual.status] ?? atual.status}</span>
            <span className="ml-auto font-display text-lg text-primary">{brl(atual.total)}</span>
          </div>
          <p className="text-muted-foreground">
            {atual.telefone}{atual.tipo_evento ? ` • ${atual.tipo_evento}` : ""}{atual.data_evento ? ` • ${new Date(`${atual.data_evento}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}{atual.horario ? ` • ${atual.horario}` : ""}{atual.pessoas ? ` • ${atual.pessoas} pessoas` : ""}
          </p>
          <ul className="space-y-1">
            {((atual.mix ?? []) as any[]).map((i: any, idx: number) => (
              <li key={idx} className="flex justify-between gap-2"><span className="text-muted-foreground">{i.quantidade}x {i.nome}</span><span>{brl(Number(i.preco_unitario) * i.quantidade)}</span></li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(atual.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega</span><span>{brl(atual.taxa_entrega)}</span></div>
          </div>
          {atual.observacoes ? <p className="text-muted-foreground">Obs.: {atual.observacoes}</p> : null}
          {atual.validade ? <p className="text-muted-foreground">Válido até {new Date(`${atual.validade}T12:00:00`).toLocaleDateString("pt-BR")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => imprimir(atual)}>Imprimir / PDF</Button>
            <Button
              size="sm" variant="outline"
              onClick={() => window.open(montarWhatsApp(atual.telefone, textoOrcamento({ ...atual, mix: atual.mix ?? [], desconto: Number(atual.desconto ?? (atual.subtotal + atual.taxa_entrega - atual.total)) })), "_blank", "noopener")}
            >
              Enviar no WhatsApp
            </Button>
            {["rascunho", "enviado", "aprovado"].includes(atual.status) ? <Button size="sm" onClick={() => converter(atual)}>Converter em pedido</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">A conversão recalcula preços e disponibilidade — nunca confirma sozinha.</p>
          {["enviado", "aprovado", "convertido"].includes(atual.status) ? <DegustacaoBox orcamento={atual} userId={isStaff ? null : (user?.id ?? null)} /> : null}
        </section>
      ) : null}
    </div>
  );
}

function DegustacaoBox({ orcamento, userId }: { orcamento: any; userId: string | null }) {
  const totalQtd = ((orcamento.mix ?? []) as any[]).reduce((s, i) => s + Number(i.quantidade ?? 0), 0);
  const [regras, setRegras] = useState<any>(null);
  const [minha, setMinha] = useState<any>(null);
  const [enviado, setEnviado] = useState(false);
  useEffect(() => {
    supabase.from("degustacao_regras").select("*").eq("id", true).maybeSingle().then(({ data }: any) => setRegras(data));
    supabase.from("degustacoes").select("id,status").eq("orcamento_id", orcamento.id).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }: any) => setMinha(data ?? null));
  }, [orcamento.id]);
  const elegivel = regras
    ? totalQtd >= Number(regras.qtd_minima ?? 500)
      && Number(orcamento.total ?? 0) >= Number(regras.valor_minimo ?? 500)
      && Number(orcamento.pessoas ?? 0) >= Number(regras.pessoas_minimas ?? 0)
    : totalQtd >= 500;
  async function solicitar() {
    const { error } = await supabase.from("degustacoes").insert({ orcamento_id: orcamento.id, user_id: userId, status: "solicitada" });
    if (error) toast.error("Não foi possível solicitar. Fale no WhatsApp.");
    else { setEnviado(true); toast.success("Degustação solicitada! Vamos analisar e avisar."); }
  }
  if (minha) return <p className="rounded-lg bg-muted p-3 text-sm">Degustação {String(minha.status).toUpperCase()} — acompanhe por aqui ou no WhatsApp.</p>;
  if (enviado) return <p className="rounded-lg bg-muted p-3 text-sm">Degustação SOLICITADA — acompanhe por aqui ou no WhatsApp.</p>;
  if (!elegivel) return <p className="text-xs text-muted-foreground">Degustação disponível para orçamentos a partir de {regras?.qtd_minima ?? 500} un / R$ {regras?.valor_minimo ?? 500}{regras?.pessoas_minimas ? ` / ${regras.pessoas_minimas} pessoas` : ""}.</p>;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <p className="font-semibold">Que tal provar antes? 🎉</p>
      <p className="text-muted-foreground">Seu orçamento concluído é elegível para degustação. Opcional, sem bloquear o pedido.</p>
      <Button size="sm" className="mt-2" onClick={solicitar}>Solicitar degustação</Button>
    </div>
  );
}
