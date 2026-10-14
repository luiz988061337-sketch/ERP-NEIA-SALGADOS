import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";
import { consumoPorInsumo } from "@/lib/insumos";

const UNIDADES = ["g", "kg", "ml", "l", "un"] as const;

/** Aba Fichas: ficha técnica por produto (insumos/un ou por cento, perda). */
export function FichasAdmin() {
  const queryClient = useQueryClient();
  const [produtoId, setProdutoId] = useState("");

  const { data: produtos } = useQuery({
    queryKey: ["estoque-produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: insumos } = useQuery({
    queryKey: ["estoque-insumos-lista"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insumos").select("id, nome, unidade_base").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: ficha } = useQuery({
    queryKey: ["estoque-ficha", produtoId],
    enabled: !!produtoId,
    queryFn: async () => {
      const { data, error } = await supabase.from("fichas_tecnicas").select("*").eq("produto_id", produtoId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["estoque-ficha-itens", ficha?.id],
    enabled: !!ficha?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ficha_itens")
        .select("*, insumos(nome, unidade_base)")
        .eq("ficha_id", ficha.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const nomeInsumo = useMemo(() => new Map((insumos ?? []).map((i: any) => [i.id, i])), [insumos]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["estoque-ficha"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-ficha-itens"] });
  }

  async function garantirFicha(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!produtoId) return;
    const f = new FormData(e.currentTarget);
    const body = {
      produto_id: produtoId,
      rendimento: Number(f.get("rendimento") ?? 1) || 1,
      perda_pct: Number(f.get("perda_pct") ?? 0) || 0,
      por_cento: f.get("por_cento") === "on",
      obs: String(f.get("obs") ?? ""),
      updated_at: new Date().toISOString(),
    };
    const { error } = ficha?.id
      ? await supabase.from("fichas_tecnicas").update(body).eq("id", ficha.id)
      : await supabase.from("fichas_tecnicas").insert(body);
    if (error) {
      toast.error("Falha ao salvar ficha. Rode a migration 0075.");
      return;
    }
    void logAdmin("ficha_salva", produtoId.slice(0, 8));
    toast.success("Ficha salva.");
    refresh();
  }

  async function adicionarItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ficha?.id) {
      toast.error("Salve a ficha primeiro.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const insumo_id = String(f.get("insumo_id") ?? "");
    const quantidade = Number(f.get("quantidade") ?? 0);
    const unidade = String(f.get("unidade") ?? "g");
    if (!insumo_id || !(quantidade > 0)) {
      toast.error("Insumo e quantidade válidos.");
      return;
    }
    const { error } = await supabase.from("ficha_itens").insert({ ficha_id: ficha.id, insumo_id, quantidade, unidade });
    if (error) {
      toast.error("Falha ao adicionar (insumo já está na ficha?).");
      return;
    }
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  async function removerItem(id: string) {
    if (!window.confirm("Remover este insumo da ficha?")) return;
    const { error } = await supabase.from("ficha_itens").delete().eq("id", id);
    if (error) {
      toast.error("Falha ao remover.");
      return;
    }
    refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Ficha técnica por produto</h2>
        <p className="text-xs text-muted-foreground">Quanto de cada insumo vai em cada unidade (ou cento) de salgado.</p>
        <div className="mt-3 max-w-md space-y-1">
          <Label>Produto</Label>
          <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Escolha o produto…</option>
            {(produtos ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </section>

      {produtoId && (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Parâmetros</h2>
            <form onSubmit={garantirFicha} className="mt-3 grid gap-3 sm:grid-cols-2" key={ficha?.id ?? "nova"}>
              <div className="space-y-1"><Label>Rendimento</Label><Input name="rendimento" type="number" step="any" min="0.01" defaultValue={ficha?.rendimento ?? 1} /></div>
              <div className="space-y-1"><Label>Perda (%)</Label><Input name="perda_pct" type="number" step="any" min="0" max="100" defaultValue={ficha?.perda_pct ?? 0} /></div>
              <div className="space-y-1"><Label>Observação</Label><Input name="obs" defaultValue={ficha?.obs ?? ""} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="por_cento" defaultChecked={!!ficha?.por_cento} /> Ficha por cento de salgados</label>
              <div className="sm:col-span-2"><Button type="submit">Salvar ficha</Button></div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Insumos da ficha</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(itens ?? []).map((it: any) => {
                const ins = nomeInsumo.get(it.insumo_id) as any;
                const p100 = consumoPorInsumo(100, { quantidade: Number(it.quantidade), unidade: it.unidade }, Number(ficha?.perda_pct ?? 0), !!ficha?.por_cento, ins?.unidade_base ?? it.unidade);
                return (
                  <li key={it.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                    <span><b>{it.insumos?.nome ?? it.insumo_id.slice(0, 8)}</b> — {it.quantidade} {it.unidade}{ficha?.por_cento ? "/cento" : "/un"}{p100 != null && ins ? <span className="text-muted-foreground"> (≈ {p100.toFixed(0)} {ins.unidade_base}/100un)</span> : null}</span>
                    <Button size="sm" variant="ghost" onClick={() => removerItem(it.id)}>Remover</Button>
                  </li>
                );
              })}
              {(itens ?? []).length === 0 && <li className="text-muted-foreground">Nenhum insumo na ficha.</li>}
            </ul>
            <form onSubmit={adicionarItem} className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <Label>Insumo</Label>
                <select name="insumo_id" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="">
                  <option value="">Escolha…</option>
                  {(insumos ?? []).map((i: any) => <option key={i.id} value={i.id}>{i.nome} ({i.unidade_base})</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>Qtd</Label><Input name="quantidade" type="number" step="any" min="0" required /></div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <select name="unidade" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" defaultValue="g">
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="sm:col-span-4"><Button type="submit">Adicionar insumo</Button></div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
