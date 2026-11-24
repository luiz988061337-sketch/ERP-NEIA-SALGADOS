import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowRight, CircleDollarSign, ClipboardList, PackagePlus, Plus, Search, ShoppingCart, Truck } from "lucide-react";
import { ERP_COLORS, PremiumKpi, PremiumPageHeader, PremiumSection, StatusBadge } from "@/components/admin/erp-ui";
import { brl } from "@/lib/format";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";

const UNIDADES = ["g", "kg", "ml", "l", "un"] as const;

const STATUS_COMPRA = {
  rascunho: { nome: "Rascunho", tom: "neutro" },
  enviada: { nome: "Enviada", tom: "info" },
  recebida_parcial: { nome: "Recebida parcial", tom: "atencao" },
  recebida_total: { nome: "Recebida total", tom: "ok" },
  cancelada: { nome: "Cancelada", tom: "perigo" },
} as const;

type StatusCompra = keyof typeof STATUS_COMPRA;
type ItemCompra = { quantidade: number; custo_unitario: number | null };
type ItemCompraDetalhe = ItemCompra & { id: string; unidade: string; quantidade_recebida: number; insumos: { nome: string } | null };
type Compra = {
  id: string;
  fornecedores: { nome: string } | null;
  created_at: string;
  recebida_em: string | null;
  status: StatusCompra;
  observacao: string | null;
  compra_itens: ItemCompra[];
};
type InsumoCompra = { id: string; nome: string; unidade_base: string; estoque_atual: number | null; estoque_minimo: number | null };

function totalCompra(compra: Compra) {
  return (compra.compra_itens ?? []).reduce((total, item) => total + Number(item.quantidade) * Number(item.custo_unitario ?? 0), 0);
}


/** Aba Compras: pedido de compra (rascunho→enviada→recebida) + recebimento parcial/total. */
export function ComprasAdmin() {
  const queryClient = useQueryClient();
  const [focoId, setFocoId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: compras, isPending, isError, refetch } = useQuery({
    queryKey: ["estoque-compras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compras")
        .select("id, status, created_at, recebida_em, observacao, fornecedores(nome), compra_itens(quantidade, custo_unitario)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Compra[];
    },
  });

  const { data: fornecedores } = useQuery({
    queryKey: ["estoque-fornecedores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const { data: insumos, isError: erroInsumos } = useQuery({
    queryKey: ["estoque-insumos-compra"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insumos").select("id, nome, unidade_base, estoque_atual, estoque_minimo").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as InsumoCompra[];
    },
  });

  const foco = compras?.find((compra) => compra.id === focoId);

  const { data: itens, isPending: carregandoItens, isError: erroItens } = useQuery({
    queryKey: ["estoque-compra-itens", foco?.id],
    enabled: !!foco?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compra_itens")
        .select("*, insumos(nome, unidade_base)")
        .eq("compra_id", focoId);
      if (error) throw error;
      return (data ?? []) as ItemCompraDetalhe[];
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["estoque-compras"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-compra-itens"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-insumos"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-lotes"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-movs"] });
  }

  async function novaCompra(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const fornecedor_id = String(f.get("fornecedor_id") ?? "") || null;
    const { data, error } = await supabase
      .from("compras")
      .insert({ fornecedor_id, observacao: String(f.get("observacao") ?? ""), status: "rascunho" })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Falha ao criar compra. Rode a migration 0075.");
      return;
    }
    void logAdmin("compra_criada", (data as any).id.slice(0, 8));
    form.reset();
    toast.success("Compra criada em rascunho.");
    setFocoId(String(data.id));
    refresh();
  }

  async function adicionarItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foco || foco.status !== "rascunho") {
      toast.error("Itens só entram no rascunho.");
      return;
    }
    const form = e.currentTarget;
    const f = new FormData(form);
    const insumo_id = String(f.get("insumo_id") ?? "");
    const quantidade = Number(f.get("quantidade") ?? 0);
    if (!insumo_id || !(quantidade > 0)) {
      toast.error("Insumo e quantidade válidos.");
      return;
    }
    const { error } = await supabase.from("compra_itens").insert({
      compra_id: foco.id,
      insumo_id,
      quantidade,
      unidade: String(f.get("unidade") ?? "kg"),
      custo_unitario: Number(f.get("custo_unitario") ?? 0) || 0,
    });
    if (error) {
      toast.error("Falha ao adicionar item.");
      return;
    }
    form.reset();
    refresh();
  }

  async function mudarStatus(status: string) {
    if (!foco) return;
    if (status === "cancelada" && !window.confirm("Cancelar esta compra?")) return;
    const { error } = await supabase.from("compras").update({ status }).eq("id", foco.id);
    if (error) {
      toast.error("Falha ao mudar status.");
      return;
    }
    void logAdmin("compra_status", `${foco.id.slice(0, 8)} → ${status}`);
    toast.success(`Compra ${status}.`);
    refresh();
  }

  async function receber(e: React.FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const qtd = Number(f.get("qtd") ?? 0);
    const unidade = String(f.get("unidade") ?? "kg");
    const validade = String(f.get("validade") ?? "") || null;
    if (!(qtd > 0)) {
      toast.error("Quantidade válida.");
      return;
    }
    const { error } = await supabase.rpc("receber_compra_item", {
      p_item_id: itemId,
      p_qtd: qtd,
      p_unidade: unidade,
      p_validade: validade,
    });
    if (error) {
      toast.error(/insuficiente|invalida|cancelada|nao_encontrado/i.test(error.message) ? error.message : "Falha no recebimento.");
      return;
    }
    toast.success("Recebimento gravado (lote + custo médio + conta a pagar).");
    form.reset();
    refresh();
  }

  const lista = compras ?? [];
  const termo = busca.trim().toLowerCase();
  const filtradas = lista.filter((c) => (filtroStatus === "todos" || c.status === filtroStatus) &&
    [c.id, c.fornecedores?.nome, c.observacao].some((campo) => campo?.toLowerCase().includes(termo)));
  const abertas = lista.filter((c) => c.status !== "recebida_total" && c.status !== "cancelada");
  const reposicao = (insumos ?? []).filter((i) => i.estoque_minimo != null && i.estoque_atual != null && i.estoque_atual < i.estoque_minimo);
  const metricas = [
    { rotulo: "Pedidos ativos", valor: abertas.length, detalhe: "rascunho, enviada ou parcial", icone: ClipboardList, cor: ERP_COLORS.blue },
    { rotulo: "Recebimentos parciais", valor: lista.filter((c) => c.status === "recebida_parcial").length, detalhe: "aguardando complemento", icone: Truck, cor: ERP_COLORS.orange },
    { rotulo: "Valor planejado", valor: brl(abertas.reduce((total, c) => total + totalCompra(c), 0)), detalhe: "valor dos pedidos ativos", icone: CircleDollarSign, cor: ERP_COLORS.goldStrong },
    { rotulo: "Alertas de reposição", valor: insumos && !erroInsumos ? reposicao.length : "—", detalhe: "itens abaixo do mínimo", icone: AlertTriangle, cor: ERP_COLORS.red },
  ];

  return (
    <div className="min-w-0 space-y-5 pb-28">
      <PremiumPageHeader icone={ShoppingCart} titulo="Compras Premium" subtitulo="Pedidos de compra e recebimentos de insumos" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map((k) => <PremiumKpi key={k.rotulo} {...k} valor={k.icone === AlertTriangle || (compras && !isError) ? k.valor : "—"} />)}
      </div>
      <PremiumSection icone={ClipboardList} titulo="Pedidos de compra" subtitulo={compras && !isError ? filtradas.length + " pedidos na consulta" : undefined}
        acoes={<div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Buscar pedido" className="h-9 pl-8" placeholder="Buscar pedido" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select aria-label="Status da compra" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            {Object.entries(STATUS_COMPRA).map(([id, status]) => <option key={id} value={id}>{status.nome}</option>)}
          </select>
        </div>}>
        {isError ? <p role="alert" className="flex flex-wrap items-center gap-2">Falha ao carregar as compras. <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button></p>
          : isPending ? <p role="status">Carregando compras…</p>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-sm">
              <thead><tr className="border-b border-[#D4A94A] bg-[#1B1811] text-left text-xs uppercase tracking-wide text-[#C9C2B8]">
                {["Pedido", "Fornecedor", "Recebimento", "Status", "Total", "Ação"].map((titulo) => <th key={titulo} scope="col" className="px-3 py-2.5">{titulo}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[#2A2721]">{filtradas.map((c) => <tr key={c.id} className={focoId === c.id ? "bg-[#F2CE6B]/10" : "hover:bg-[#211F18]"}>
                <td className="px-3 py-3"><strong className="text-[#F2CE6B]">#{c.id.slice(0, 8)}</strong><small className="block text-muted-foreground">Criado em {new Date(c.created_at).toLocaleDateString("pt-BR")}</small></td>
                <td className="px-3 py-3">{c.fornecedores?.nome ?? "—"}</td>
                <td className="px-3 py-3">{c.recebida_em ? new Date(c.recebida_em).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="px-3 py-3"><StatusBadge tom={STATUS_COMPRA[c.status]?.tom ?? "neutro"}>{STATUS_COMPRA[c.status]?.nome ?? c.status}</StatusBadge></td>
                <td className="px-3 py-3 font-semibold">{brl(totalCompra(c))}</td>
                <td className="px-3 py-3"><Button type="button" variant="outline" size="sm" aria-expanded={focoId === c.id} aria-controls={focoId === c.id ? "compra-detalhes" : undefined} onClick={() => setFocoId(focoId === c.id ? null : c.id)}>Ver <ArrowRight size={15} aria-hidden /></Button></td>
              </tr>)}</tbody>
            </table>
            {!filtradas.length && <p className="p-4 text-center text-muted-foreground">Nenhum pedido de compra encontrado.</p>}
          </div>}
      </PremiumSection>
      <PremiumSection icone={Plus} titulo="Novo pedido" subtitulo="Crie um rascunho para adicionar itens e informar o recebimento.">
        <form onSubmit={novaCompra} className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="compra-fornecedor">Fornecedor</Label>
            <select id="compra-fornecedor" name="fornecedor_id" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
              <option value="">Sem fornecedor</option>
              {(fornecedores ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="compra-observacao">Observação</Label><Input id="compra-observacao" name="observacao" /></div>
          <div className="flex justify-end sm:col-span-3"><Button type="submit" className="erp-btn-gold"><Plus size={16} aria-hidden />Nova compra (rascunho)</Button></div>
        </form>
      </PremiumSection>

      {foco && (
        <PremiumSection icone={PackagePlus} titulo="Recebimento e acompanhamento">
          <div id="compra-detalhes" className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Compra #{foco.id.slice(0, 8)}</h2>
            <StatusBadge tom={STATUS_COMPRA[foco.status]?.tom ?? "neutro"}>{STATUS_COMPRA[foco.status]?.nome ?? foco.status}</StatusBadge>
            <div className="ml-auto flex gap-2">
              {foco.status === "rascunho" && <Button size="sm" onClick={() => mudarStatus("enviada")}>Enviar</Button>}
              {foco.status !== "cancelada" && foco.status !== "recebida_total" && (
                <Button size="sm" variant="outline" onClick={() => mudarStatus("cancelada")}>Cancelar</Button>
              )}
            </div>
          </div>

          {erroItens ? <p role="alert">Falha ao carregar os itens.</p> : carregandoItens ? <p role="status">Carregando itens…</p> : null}
          <ul className="mt-3 space-y-2">
            {(itens ?? []).map((it) => (
              <li key={it.id} className="rounded border border-border p-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span><b>{it.insumos?.nome}</b> — {it.quantidade} {it.unidade} a R$ {Number(it.custo_unitario ?? 0).toFixed(2)}</span>
                  <span className="text-muted-foreground">recebido {it.quantidade_recebida}/{it.quantidade}</span>
                </div>
                {foco.status !== "rascunho" && foco.status !== "cancelada" && Number(it.quantidade_recebida) < Number(it.quantidade) && (
                  <form onSubmit={(e) => receber(e, it.id)} className="mt-2 grid gap-2 sm:grid-cols-4">
                    <div className="space-y-1"><Label>Receber qtd</Label><Input name="qtd" type="number" step="any" min="0" required /></div>
                    <div className="space-y-1">
                      <Label>Unidade</Label>
                      <select name="unidade" defaultValue={it.unidade} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><Label>Validade do lote</Label><Input name="validade" type="date" /></div>
                    <div className="flex items-end"><Button type="submit" size="sm">Receber</Button></div>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {foco.status === "rascunho" && (
            <form onSubmit={adicionarItem} className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Insumo</Label>
                <select name="insumo_id" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
                  <option value="">Escolha…</option>
                  {(insumos ?? []).map((i) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_base})</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Qtd</Label><Input name="quantidade" type="number" step="any" min="0" required /></div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <select name="unidade" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="kg">
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Custo unit. (R$)</Label><Input name="custo_unitario" type="number" step="any" min="0" required /></div>
              <div className="sm:col-span-4"><Button type="submit" size="sm">Adicionar item</Button></div>
            </form>
          )}
        </PremiumSection>
      )}
      <PremiumSection icone={AlertTriangle} titulo="Sugestões de reposição" subtitulo="Insumos com saldo abaixo do mínimo cadastrado.">
        {erroInsumos ? <p role="alert">Falha ao carregar os saldos dos insumos.</p> : !insumos ? <p role="status">Carregando saldos…</p>
          : reposicao.length ? <ul className="divide-y divide-border">
            {reposicao.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <strong>{i.nome}</strong><span className="text-muted-foreground">Saldo {i.estoque_atual} {i.unidade_base} / mínimo {i.estoque_minimo} {i.unidade_base}</span>
            </li>)}
          </ul> : <p className="text-sm text-muted-foreground">Nenhum insumo abaixo do mínimo cadastrado.</p>}
      </PremiumSection>
    </div>
  );
}
