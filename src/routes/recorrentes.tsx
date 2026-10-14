import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { PageHeader } from "@/components/admin/ui-admin";
import type { Database } from "@/integrations/supabase/types";
import { brl, PAGAMENTO_LABEL, TAXA_ENTREGA } from "@/lib/format";
import { useRoles, useSession } from "@/lib/session";
import { calcTotals } from "@/lib/totals";
import { precoFinal } from "@/lib/catalog";
import { logAdmin } from "@/lib/operacao";
import { montarWhatsApp } from "@/lib/inteligencia";
import { FREQUENCIA_LABEL, diasAte, proximaData, type Frequencia } from "@/lib/recorrencia";

export const Route = createFileRoute("/recorrentes")({
  validateSearch: z.object({ criar: z.string().optional() }).parse,
  head: () => ({ meta: [{ title: "Pedidos recorrentes — Néia Salgados" }] }),
  component: Recorrentes,
});

type ItemR = {
  produto_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
};

function Recorrentes() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const isStaff = roles?.includes("admin") || roles?.includes("atendente");

  const [modo, setModo] = useState<"lista" | "novo" | "editar">("lista");
  const [editando, setEditando] = useState<any | null>(null);
  const [itensBase, setItensBase] = useState<ItemR[]>([]);
  const [qtds, setQtds] = useState<Record<number, number>>({});
  const [salvando, setSalvando] = useState(false);
  const [soVencidos, setSoVencidos] = useState(false);

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/recorrentes" }, replace: true });
  }, [loading, user, navigate]);

  const { data: lista } = useQuery({
    queryKey: ["recorrentes", user?.id, isStaff],
    enabled: !!user,
    queryFn: async () => {
      try {
        let q = supabase
          .from("pedidos_recorrentes")
          .select("*")
          .order("proxima_execucao")
          .limit(200);
        if (!isStaff) q = q.eq("user_id", user!.id);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  // Pré-preenche a partir de um pedido existente (?criar=pedidoId)
  useEffect(() => {
    if (!search.criar || !user || modo !== "lista") return;
    (async () => {
      const { data: p } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .eq("id", search.criar!)
        .maybeSingle();
      if (!p) {
        toast.error("Pedido não encontrado.");
        return;
      }
      if (!isStaff && (p as any).user_id !== user.id) {
        toast.error("Sem acesso a este pedido.");
        return;
      }
      const itens: ItemR[] = (((p as any).pedido_itens ?? []) as any[]).map((i) => ({
        produto_id: i.produto_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_unitario: Number(i.preco_unitario),
      }));
      setItensBase(itens);
      setQtds(Object.fromEntries(itens.map((_, idx) => [idx, itens[idx]!.quantidade])));
      setEditando({
        cliente_nome: (p as any).cliente_nome,
        telefone: (p as any).telefone,
        endereco: (p as any).endereco,
        bairro: (p as any).bairro,
        cidade: (p as any).cidade ?? "",
        complemento: (p as any).complemento ?? "",
        referencia: (p as any).referencia ?? "",
        forma_pagamento: (p as any).forma_pagamento ?? "pix",
        frequencia: "semanal",
        proxima_execucao: proximaData(new Date().toISOString().slice(0, 10), "semanal"),
        modo_confirmacao: "manual",
      });
      setModo("novo");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.criar, user, isStaff]);

  const itensFinais: ItemR[] = useMemo(
    () =>
      itensBase
        .map((it, idx) => ({ ...it, quantidade: qtds[idx] ?? it.quantidade }))
        .filter((it) => it.quantidade > 0),
    [itensBase, qtds],
  );

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    if (itensFinais.length === 0) {
      toast.error("Mantenha ao menos um item.");
      return;
    }
    const f = new FormData(e.currentTarget);
    const endereco = String(f.get("endereco") ?? "");
    const pagamento = String(f.get("forma_pagamento") ?? "pix");
    // Determinar modalidade de pagamento: online vs na_entrega
    // - dinheiro: sempre na_entrega
    // - pix/credito/debito: online por padrão
    // - retirada (endereco == "Retirada"): sempre online
    const isRetirada = endereco === "Retirada";
    const pagamento_modalidade = isRetirada
      ? "online"
      : String(f.get("forma_pagamento") ?? "pix") === "dinheiro"
        ? "na_entrega"
        : "online";

    const payload = {
      user_id: editando?.user_id ?? user.id,
      cliente_nome: String(f.get("cliente_nome") ?? ""),
      telefone: String(f.get("telefone") ?? ""),
      endereco: String(f.get("endereco") ?? ""),
      bairro: String(f.get("bairro") ?? ""),
      cidade: String(f.get("cidade") ?? ""),
      complemento: String(f.get("complemento") ?? ""),
      referencia: String(f.get("referencia") ?? ""),
      forma_pagamento: String(f.get("forma_pagamento") ?? "pix"),
      pagamento_modalidade,
      itens: itensFinais,
      frequencia: String(f.get("frequencia") ?? "semanal"),
      proxima_execucao: String(f.get("proxima_execucao") ?? ""),
      modo_confirmacao: String(f.get("modo_confirmacao") ?? "manual"),
      status: editando?.id ? editando.status : "ativo",
    };
    if (payload.cliente_nome.trim().length < 2 || payload.telefone.replace(/\D/g, "").length < 10) {
      toast.error("Informe cliente e WhatsApp válidos.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = editando?.id
        ? await supabase.from("pedidos_recorrentes").update(payload).eq("id", editando.id)
        : await supabase.from("pedidos_recorrentes").insert(payload);
      if (error) throw error;
      toast.success(
        editando?.id
          ? "Recorrência atualizada!"
          : "Pedido recorrente criado! Nada é confirmado sozinho.",
      );
      void logAdmin(
        editando?.id ? "recorrencia_editada" : "recorrencia_criada",
        payload.cliente_nome,
      );
      setModo("lista");
      setEditando(null);
      setItensBase([]);
      navigate({ to: "/recorrentes", search: {} });
      queryClient.invalidateQueries({ queryKey: ["recorrentes"] });
    } catch {
      toast.error("Não foi possível salvar. Rode a migração 0012 no Supabase.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(r: any, status: string) {
    if (status === "cancelado" && !confirm("Cancelar esta recorrência?")) return;
    const { error } = await supabase.from("pedidos_recorrentes").update({ status }).eq("id", r.id);
    if (error) {
      toast.error("Não foi possível atualizar.");
      return;
    }
    toast.success(`Recorrência ${status}.`);
    void logAdmin("recorrencia_status", `${r.cliente_nome} → ${status}`);
    queryClient.invalidateQueries({ queryKey: ["recorrentes"] });
  }

  /** Confirmação manual (staff): revalida tudo e cria o pedido agora. Nunca automático. */
  async function confirmarAgora(r: any) {
    if (!user) return;
    if (!confirm(`Criar agora o pedido de ${r.cliente_nome}? Preços serão recalculados.`)) return;
    try {
      const itens: ItemR[] = Array.isArray(r.itens) ? r.itens : [];
      const ids = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))] as string[];
      const { data: prods } = await supabase
        .from("produtos")
        .select("id, preco, preco_promocional, disponivel, estoque")
        .in("id", ids);
      const mapa = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
      let sub = 0;
      const validos: ItemR[] = [];
      const fora: string[] = [];
      for (const it of itens) {
        const p = it.produto_id ? mapa.get(it.produto_id) : null;
        if (!p || !p.disponivel || Number(p.estoque ?? 0) <= 0) {
          fora.push(it.nome);
          continue;
        }
        const preco = Number(precoFinal(p as any));
        sub += preco * it.quantidade;
        validos.push({ ...it, preco_unitario: preco });
      }
      if (validos.length === 0) throw new Error("Nenhum item disponível.");
      const calc = calcTotals({ subtotal: sub, taxaEntrega: TAXA_ENTREGA, desconto: 0 });
      const body: Record<string, any> = {
        user_id: user.id,
        cliente_nome: r.cliente_nome,
        telefone: r.telefone,
        endereco: r.endereco,
        bairro: r.bairro,
        cidade: r.cidade,
        complemento: r.complemento,
        referencia: r.referencia,
        observacoes: `Recorrência ${r.frequencia}`,
        forma_pagamento: r.forma_pagamento,
        subtotal: sub,
        taxa_entrega: calc.taxaEntrega,
        desconto: 0,
        total: calc.total,
      };
      let ped: { id: string; numero: number } | null = null;
      {
        const res = await supabase.from("pedidos").insert(body).select("id, numero").single();
        if (res.error && String(res.error.message ?? "").includes("column")) {
          // Banco sem migrações — reenvia sem colunas novas
          const {
            cidade: _c,
            agendado_para: _a,
            agendamento_obs: _b,
            tipo_evento: _t,
            campanha_origem: _o,
            ...legacy
          } = body;
          const retry = await supabase.from("pedidos").insert(legacy).select("id, numero").single();
          if (retry.error || !retry.data) throw retry.error ?? new Error("insert falhou");
          ped = retry.data;
          toast.warning("Pedido criado sem cidade/agendamento — rode as migrações no Supabase.");
        } else {
          if (res.error || !res.data) throw res.error ?? new Error("insert falhou");
          ped = res.data;
        }
      }
      await supabase
        .from("pedido_itens")
        .insert(
          validos.map((i) => ({
            pedido_id: (ped as any).id,
            produto_id: i.produto_id,
            nome: i.nome,
            preco_unitario: i.preco_unitario,
            quantidade: i.quantidade,
          })),
        );
      const prox = proximaData(new Date().toISOString().slice(0, 10), r.frequencia as Frequencia);
      await supabase.from("pedidos_recorrentes").update({ proxima_execucao: prox }).eq("id", r.id);
      if (fora.length > 0) toast.warning(`Indisponíveis: ${fora.slice(0, 3).join(", ")}`);
      toast.success(
        `Pedido #${(ped as any).numero} criado! Próxima: ${prox.split("-").reverse().join("/")}`,
      );
      void logAdmin("recorrencia_confirmada", `#${(ped as any).numero} ${r.cliente_nome}`);
      queryClient.invalidateQueries({ queryKey: ["recorrentes"] });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Não foi possível confirmar.");
    }
  }

  function avisarWhats(r: any) {
    const itens: ItemR[] = Array.isArray(r.itens) ? r.itens : [];
    const linhas = itens.map((i) => `* ${i.quantidade}x ${i.nome}`).join("\n");
    window.open(
      montarWhatsApp(
        r.telefone,
        `Olá ${String(r.cliente_nome).split(" ")[0]}! Aqui é da Néia Salgados 😊\nSeu pedido recorrente (${r.frequencia}) está previsto. Confirma para esta semana?\n\n${linhas}\n\nResponda SIM para confirmarmos com os preços atuais.`,
      ),
      "_blank",
      "noopener",
    );
  }

  const visiveis = (lista ?? []).filter((r: any) => {
    if (!soVencidos) return true;
    const d = diasAte(r.proxima_execucao);
    return r.status === "ativo" && d != null && d <= 0;
  });

  if (loading) return <p className="p-10 text-center text-muted-foreground">Carregando…</p>;

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Equipe"
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="flex items-center gap-3">
          <PageHeader titulo="Pedidos recorrentes" />
          {modo === "lista" && isStaff ? (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={soVencidos}
                onChange={(e) => setSoVencidos(e.target.checked)}
              />{" "}
              Só vencidos/hoje
            </label>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Repetição programada com confirmação sempre manual. Nada é cobrado ou confirmado sozinho.
        </p>

        {modo === "lista" ? (
          <ul className="space-y-2">
            {(visiveis as any[]).map((r) => {
              const d = diasAte(r.proxima_execucao);
              return (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display">{r.cliente_nome}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {FREQUENCIA_LABEL[r.frequencia as Frequencia] ?? r.frequencia} • {r.status}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      Próxima: {r.proxima_execucao.split("-").reverse().join("/")}
                      {d != null
                        ? d < 0
                          ? ` (${-d}d atrasada)`
                          : d === 0
                            ? " (hoje)"
                            : ` (em ${d}d)`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {((r.itens ?? []) as any[])
                      .map((i: any) => `${i.quantidade}x ${i.nome}`)
                      .join(" • ")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.status === "ativo" && isStaff ? (
                      <Button size="sm" onClick={() => confirmarAgora(r)}>
                        Confirmar agora
                      </Button>
                    ) : null}
                    {r.status === "ativo" && isStaff ? (
                      <Button size="sm" variant="outline" onClick={() => avisarWhats(r)}>
                        Pedir confirmação no WhatsApp
                      </Button>
                    ) : null}
                    {r.status === "ativo" ? (
                      <Button size="sm" variant="outline" onClick={() => mudarStatus(r, "pausado")}>
                        Pausar
                      </Button>
                    ) : null}
                    {r.status === "pausado" ? (
                      <Button size="sm" variant="outline" onClick={() => mudarStatus(r, "ativo")}>
                        Retomar
                      </Button>
                    ) : null}
                    {!isStaff || r.status !== "cancelado" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const itens: ItemR[] = Array.isArray(r.itens) ? r.itens : [];
                          setItensBase(itens);
                          setQtds(Object.fromEntries(itens.map((it, idx) => [idx, it.quantidade])));
                          setEditando(r);
                          setModo("editar");
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    {r.status !== "cancelado" ? (
                      <Button size="sm" variant="ghost" onClick={() => mudarStatus(r, "cancelado")}>
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {visiveis.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhuma recorrência. Crie a partir de um pedido em “Minha conta”.
              </li>
            ) : null}
          </ul>
        ) : null}

        {(modo === "novo" || modo === "editar") && editando ? (
          <form onSubmit={salvar} className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">
              {modo === "novo" ? "Nova recorrência" : "Editar recorrência"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cliente *</Label>
                <Input
                  name="cliente_nome"
                  defaultValue={editando.cliente_nome}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp *</Label>
                <Input name="telefone" defaultValue={editando.telefone} required inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label>Endereço</Label>
                <Input name="endereco" defaultValue={editando.endereco} maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input name="bairro" defaultValue={editando.bairro} maxLength={100} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input name="cidade" defaultValue={editando.cidade} maxLength={100} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Frequência *</Label>
                <select
                  name="frequencia"
                  defaultValue={editando.frequencia}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(Object.keys(FREQUENCIA_LABEL) as Frequencia[]).map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCIA_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Próxima execução *</Label>
                <Input
                  name="proxima_execucao"
                  type="date"
                  defaultValue={editando.proxima_execucao}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <select
                  name="forma_pagamento"
                  defaultValue={editando.forma_pagamento}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {(["pix", "dinheiro", "credito", "debito"] as const).map((op) => (
                    <option key={op} value={op}>
                      {PAGAMENTO_LABEL[op]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmação</Label>
                <select
                  name="modo_confirmacao"
                  defaultValue={editando.modo_confirmacao}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="manual">Manual (equipe confirma)</option>
                  <option value="whatsapp">Pedir confirmação no WhatsApp</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Itens (quantidades editáveis)</Label>
              <ul className="space-y-1.5">
                {itensFinais.map((it, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{it.nome}</span>
                    <input
                      type="number"
                      min={0}
                      value={qtds[idx] ?? it.quantidade}
                      onChange={(e) =>
                        setQtds((s) => ({ ...s, [idx]: Math.max(0, Number(e.target.value)) }))
                      }
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
                      aria-label={`Qtd ${it.nome}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setModo("lista");
                  setEditando(null);
                  navigate({ to: "/recorrentes", search: {} });
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
