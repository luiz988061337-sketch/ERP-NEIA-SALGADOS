import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { logAdmin } from "@/lib/operacao";
import { downloadCSV } from "@/lib/export";
import { DarkTable, DarkTableRow, SectionCard, StatusBadge, type BadgeTom } from "@/components/admin/erp-ui";
import { alertaEstoque } from "@/lib/lotes";
import { converterUnidade, sugestaoCompra } from "@/lib/insumos";

const UNIDADES = ["g", "kg", "ml", "l", "un"] as const;

const STATUS_TOM: Record<string, BadgeTom> = {
  ok: "ok",
  baixo: "atencao",
  critico: "atencao",
  zerado: "perigo",
};

/** Aba Insumos: cadastro, lotes FEFO, perda/ajuste, inventário, movimentações, sugestão de compra. */
export function InsumosAdmin() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<any | null>(null);
  const [editando, setEditando] = useState<any | null>(null);

  const { data: insumos } = useQuery({
    queryKey: ["estoque-insumos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insumos").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: lotes } = useQuery({
    queryKey: ["estoque-lotes", foco?.id],
    enabled: !!foco?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insumo_lotes")
        .select("*")
        .eq("insumo_id", foco.id)
        .order("validade", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: movs } = useQuery({
    queryKey: ["estoque-movs", foco?.id],
    enabled: !!foco?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insumo_movimentacoes")
        .select("*")
        .eq("insumo_id", foco.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (insumos ?? []).filter((i) => !t || String(i.nome ?? "").toLowerCase().includes(t));
  }, [insumos, busca]);

  // Consumo médio diário (30d) p/ sugestão de compra — só do insumo em foco.
  const cmd30 = useMemo(() => {
    const corte = Date.now() - 30 * 86400000;
    const tot = (movs ?? [])
      .filter((m) => m.tipo === "consumo" && +new Date(m.created_at) >= corte)
      .reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
    return tot / 30;
  }, [movs]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["estoque-insumos"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-lotes"] });
    queryClient.invalidateQueries({ queryKey: ["estoque-movs"] });
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      nome: String(f.get("nome") ?? "").trim(),
      categoria: String(f.get("categoria") ?? "").trim(),
      unidade_base: String(f.get("unidade_base") ?? "g"),
      estoque_minimo: Number(f.get("estoque_minimo") ?? 0) || 0,
      ativo: f.get("ativo") === "on",
    };
    if (body.nome.length < 2) {
      toast.error("Informe o nome do insumo.");
      return;
    }
    const { error } = editando?.id
      ? await supabase.from("insumos").update({ ...body, updated_at: new Date().toISOString() }).eq("id", editando.id)
      : await supabase.from("insumos").insert(body);
    if (error) {
      toast.error("Falha ao salvar. Rode a migration 0075.");
      return;
    }
    void logAdmin(editando?.id ? "insumo_alterado" : "insumo_criado", body.nome);
    setEditando(null);
    (e.target as HTMLFormElement).reset();
    toast.success("Insumo salvo.");
    refresh();
  }

  async function registrarPerda(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foco) return;
    const f = new FormData(e.currentTarget);
    const qtdBase = converterUnidade(Number(f.get("qtd") ?? 0), String(f.get("unidade") ?? foco.unidade_base), foco.unidade_base);
    if (qtdBase == null || qtdBase <= 0) {
      toast.error("Quantidade/unidade inválida.");
      return;
    }
    if (qtdBase > Number(foco.estoque_atual ?? 0)) {
      toast.error(`Perda maior que o estoque (${foco.estoque_atual} ${foco.unidade_base}).`);
      return;
    }
    const motivo = String(f.get("motivo") ?? "").trim();
    const { error: e1 } = await supabase
      .from("insumos")
      .update({ estoque_atual: Number(foco.estoque_atual) - qtdBase, updated_at: new Date().toISOString() })
      .eq("id", foco.id);
    if (e1) {
      toast.error("Falha ao baixar estoque.");
      return;
    }
    const { error: e2 } = await supabase.from("insumo_movimentacoes").insert({
      insumo_id: foco.id,
      tipo: "perda",
      quantidade: qtdBase,
      saldo_antes: Number(foco.estoque_atual),
      saldo_depois: Number(foco.estoque_atual) - qtdBase,
      referencia: motivo || "perda registrada na produção",
    });
    if (e2) {
      toast.error("Movimento não gravado (estoque já baixado — confira).");
    } else {
      void logAdmin("insumo_perda", `${foco.nome} -${qtdBase}${foco.unidade_base}`);
      toast.success("Perda registrada.");
    }
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  async function fazerInventario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!foco) return;
    const f = new FormData(e.currentTarget);
    const contado = converterUnidade(Number(f.get("contado") ?? NaN), String(f.get("unidade") ?? foco.unidade_base), foco.unidade_base);
    if (contado == null || contado < 0 || Number.isNaN(contado)) {
      toast.error("Contagem inválida.");
      return;
    }
    const antes = Number(foco.estoque_atual ?? 0);
    const motivo = String(f.get("motivo") ?? "").trim() || "inventário";
    const { error: e1 } = await supabase
      .from("insumos")
      .update({ estoque_atual: contado, updated_at: new Date().toISOString() })
      .eq("id", foco.id);
    if (e1) {
      toast.error("Falha no inventário.");
      return;
    }
    await supabase.from("insumo_movimentacoes").insert({
      insumo_id: foco.id,
      tipo: "inventario",
      quantidade: Math.abs(contado - antes),
      saldo_antes: antes,
      saldo_depois: contado,
      referencia: motivo,
    });
    void logAdmin("insumo_inventario", `${foco.nome}: ${antes} → ${contado}${foco.unidade_base} (${motivo})`);
    toast.success(`Inventário: diferença ${contado - antes >= 0 ? "+" : ""}${contado - antes} ${foco.unidade_base}.`);
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  function exportarMovs() {
    if (!movs?.length) {
      toast.error("Sem movimentações para exportar.");
      return;
    }
    downloadCSV(
      `movimentacoes-${String(foco?.nome ?? "insumo").replace(/\s+/g, "-")}.csv`,
      movs.map((m: any) => ({
        data: new Date(m.created_at).toLocaleString("pt-BR"),
        tipo: m.tipo,
        quantidade: m.quantidade,
        saldo_antes: m.saldo_antes,
        saldo_depois: m.saldo_depois,
        referencia: m.referencia,
      })),
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        titulo="Insumos"
        acoes={<span className="text-[10px] uppercase text-muted-foreground">{lista.length} item(ns)</span>}
        bodyClassName="p-0"
      >
        <div className="p-3 pb-0">
          <Input placeholder="Buscar insumo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <DarkTable
          className="mt-3"
          colunas={[
            "Produto",
            "Categoria",
            "Estoque",
            "Mínimo",
            "Custo médio",
            "Status",
            "Ações",
          ]}
          vazio={lista.length === 0 ? "Nenhum insumo. Cadastre abaixo." : undefined}
        >
          {lista.map((i: any) => {
            const st = alertaEstoque(Number(i.estoque_atual ?? 0), Number(i.estoque_minimo ?? 0));
            return (
              <DarkTableRow key={i.id}>
                <td className="px-2.5 py-2">
                  <button
                    type="button"
                    className="text-left font-semibold hover:text-[#F4B942]"
                    onClick={() => setFoco(foco?.id === i.id ? null : i)}
                  >
                    {i.nome}
                  </button>
                </td>
                <td className="px-2.5 py-2 text-muted-foreground">{i.categoria || "—"}</td>
                <td className="px-2.5 py-2 font-semibold whitespace-nowrap">
                  {i.estoque_atual} {i.unidade_base}
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap text-muted-foreground">
                  {i.estoque_minimo} {i.unidade_base}
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap text-muted-foreground">
                  R$ {Number(i.custo_medio ?? 0).toFixed(4)}/{i.unidade_base}
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge tom={STATUS_TOM[st] ?? "neutro"}>{st}</StatusBadge>
                </td>
                <td className="px-2.5 py-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditando(i)}>
                    Editar
                  </Button>
                </td>
              </DarkTableRow>
            );
          })}
        </DarkTable>
      </SectionCard>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">{editando?.id ? "Editar insumo" : "Novo insumo"}</h2>
        <form onSubmit={salvar} className="mt-3 grid gap-3 sm:grid-cols-2" key={editando?.id ?? "novo"}>
          <div className="space-y-1"><Label>Nome *</Label><Input name="nome" required defaultValue={editando?.nome ?? ""} /></div>
          <div className="space-y-1"><Label>Categoria</Label><Input name="categoria" defaultValue={editando?.categoria ?? ""} placeholder="farinha, frango, óleo, embalagem…" /></div>
          <div className="space-y-1">
            <Label>Unidade base *</Label>
            <select name="unidade_base" defaultValue={editando?.unidade_base ?? "g"} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={!!editando?.id}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Estoque mínimo (na unidade base)</Label><Input name="estoque_minimo" type="number" step="any" min="0" defaultValue={editando?.estoque_minimo ?? 0} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={editando?.ativo ?? true} /> Ativo</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Salvar</Button>
            {editando && <Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>}
          </div>
        </form>
      </section>

      {foco && (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Lotes FEFO — {foco.nome}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(lotes ?? []).map((l: any) => (
                <li key={l.id} className="flex justify-between gap-2 rounded border border-border px-2 py-1">
                  <span>restante <b>{l.restante}</b> de {l.quantidade} {foco.unidade_base}</span>
                  <span className="text-muted-foreground">validade {l.validade ? new Date(l.validade).toLocaleDateString("pt-BR") : "—"} • R$ {Number(l.custo_unitario ?? 0).toFixed(4)}</span>
                </li>
              ))}
              {(lotes ?? []).length === 0 && <li className="text-muted-foreground">Sem lotes — receba uma compra para dar entrada.</li>}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Consumo médio 30d: {cmd30.toFixed(1)} {foco.unidade_base}/dia • Sugestão de compra (prazo 7d + 7 cobertura): <b>{sugestaoCompra(cmd30, 7, Number(foco.estoque_atual ?? 0))} {foco.unidade_base}</b>
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Registrar perda — {foco.nome}</h2>
            <form onSubmit={registrarPerda} className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label>Qtd</Label><Input name="qtd" type="number" step="any" min="0" required /></div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <select name="unidade" defaultValue={foco.unidade_base} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2"><Label>Motivo</Label><Input name="motivo" placeholder="queimou, venceu, derramou…" /></div>
              <div className="sm:col-span-4"><Button type="submit">Registrar perda</Button></div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Inventário — {foco.nome}</h2>
            <p className="text-xs text-muted-foreground">Contagem física ajusta o sistema e grava a diferença com motivo.</p>
            <form onSubmit={fazerInventario} className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label>Contado</Label><Input name="contado" type="number" step="any" min="0" required /></div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <select name="unidade" defaultValue={foco.unidade_base} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2"><Label>Motivo do ajuste</Label><Input name="motivo" placeholder="contagem mensal…" /></div>
              <div className="sm:col-span-4"><Button type="submit">Ajustar pelo inventário</Button></div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Movimentações — {foco.nome}</h2>
              <Button size="sm" variant="outline" onClick={exportarMovs}>Exportar CSV</Button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {(movs ?? []).map((m: any) => (
                <li key={m.id} className="flex justify-between gap-2 rounded border border-border px-2 py-1">
                  <span><Badge variant="outline">{m.tipo}</Badge> {m.quantidade} {foco.unidade_base} <span className="text-muted-foreground">({m.saldo_antes} → {m.saldo_depois})</span></span>
                  <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")} {m.referencia ? `• ${m.referencia}` : ""}</span>
                </li>
              ))}
              {(movs ?? []).length === 0 && <li className="text-muted-foreground">Sem movimentações.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
