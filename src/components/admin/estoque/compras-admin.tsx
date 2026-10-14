import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";

const UNIDADES = ["g", "kg", "ml", "l", "un"] as const;

const STATUS_COR: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-800",
  enviada: "bg-blue-100 text-blue-800",
  recebida_parcial: "bg-yellow-100 text-yellow-800",
  recebida_total: "bg-green-100 text-green-800",
  cancelada: "bg-red-100 text-red-800",
};

/** Aba Compras: pedido de compra (rascunho→enviada→recebida) + recebimento parcial/total. */
export function ComprasAdmin() {
  const queryClient = useQueryClient();
  const [foco, setFoco] = useState<any | null>(null);

  const { data: compras } = useQuery({
    queryKey: ["estoque-compras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compras")
        .select("*, fornecedores(nome)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: fornecedores } = useQuery({
    queryKey: ["estoque-fornecedores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: insumos } = useQuery({
    queryKey: ["estoque-insumos-compra"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insumos").select("id, nome, unidade_base").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["estoque-compra-itens", foco?.id],
    enabled: !!foco?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compra_itens")
        .select("*, insumos(nome, unidade_base)")
        .eq("compra_id", foco.id);
      if (error) throw error;
      return (data ?? []) as any[];
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
    const f = new FormData(e.currentTarget);
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
    (e.target as HTMLFormElement).reset();
    toast.success("Compra criada em rascunho.");
    refresh();
  }

  async function adicionarItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foco || foco.status !== "rascunho") {
      toast.error("Itens só entram no rascunho.");
      return;
    }
    const f = new FormData(e.currentTarget);
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
    (e.target as HTMLFormElement).reset();
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
    const f = new FormData(e.currentTarget);
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
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Compras</h2>
        <ul className="mt-2 divide-y divide-border">
          {(compras ?? []).map((c: any) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFoco(foco?.id === c.id ? null : c)}>
                <span className="block truncate text-sm font-semibold">
                  #{c.id.slice(0, 8)} — {c.fornecedores?.nome ?? "sem fornecedor"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("pt-BR")} {c.observacao ? `• ${c.observacao}` : ""}
                </span>
              </button>
              <Badge className={STATUS_COR[c.status] ?? ""}>{c.status}</Badge>
            </li>
          ))}
          {(compras ?? []).length === 0 && <li className="py-4 text-sm text-muted-foreground">Nenhuma compra.</li>}
        </ul>
        <form onSubmit={novaCompra} className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Fornecedor</Label>
            <select name="fornecedor_id" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
              <option value="">—</option>
              {(fornecedores ?? []).map((f: any) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label>Observação</Label><Input name="observacao" /></div>
          <div className="sm:col-span-3"><Button type="submit">Nova compra (rascunho)</Button></div>
        </form>
      </section>

      {foco && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl">Compra #{foco.id.slice(0, 8)}</h2>
            <Badge className={STATUS_COR[foco.status] ?? ""}>{foco.status}</Badge>
            <div className="ml-auto flex gap-2">
              {foco.status === "rascunho" && <Button size="sm" onClick={() => mudarStatus("enviada")}>Enviar</Button>}
              {foco.status !== "cancelada" && foco.status !== "recebida_total" && (
                <Button size="sm" variant="outline" onClick={() => mudarStatus("cancelada")}>Cancelar</Button>
              )}
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {(itens ?? []).map((it: any) => (
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
                  {(insumos ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_base})</option>)}
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
        </section>
      )}
    </div>
  );
}
