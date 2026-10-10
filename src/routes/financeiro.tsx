import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import {
  diferencaCaixa,
  resumoConciliacao,
  saldoCaixaEsperado,
  statusConta,
  totalContas,
} from "@/lib/financeiro";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Néia Salgados" },
      { name: "description", content: "Caixa, contas a pagar/receber e conciliação." },
    ],
  }),
  component: Financeiro,
});

const MEIOS = ["dinheiro", "pix", "credito", "debito", "transferencia", "outro"] as const;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function Financeiro() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));

  if (!loading && !user) {
    navigate({ to: "/auth", search: { redirect: "/financeiro" }, replace: true });
  }
  const autorizado = roles?.includes("admin") || roles?.includes("financeiro");

  const { data: pedidos } = useQuery({
    queryKey: ["fin-pedidos", mes],
    enabled: !!autorizado,
    refetchInterval: 30000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pedidos")
          .select("id, numero, total, pagamento_status, status, forma_pagamento, created_at")
          .gte("created_at", `${mes}-01`)
          .lt("created_at", `${mes}-31`)
          .order("created_at", { ascending: false })
          .limit(2000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: contas } = useQuery({
    queryKey: ["fin-contas"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("contas")
          .select("*")
          .order("vencimento", { ascending: true, nullsFirst: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: caixaAberto } = useQuery({
    queryKey: ["fin-caixa-aberto"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("caixa_sessoes")
          .select("*")
          .eq("status", "aberta")
          .order("aberta_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as any;
      } catch {
        return null;
      }
    },
  });

  const { data: caixas } = useQuery({
    queryKey: ["fin-caixas"],
    enabled: !!autorizado,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("caixa_sessoes")
          .select("*")
          .eq("status", "fechada")
          .order("fechada_em", { ascending: false })
          .limit(30);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  if (roles && !autorizado) {
    return <p className="p-10 text-center">Acesso do admin/financeiro.</p>;
  }

  const conc = resumoConciliacao(pedidos ?? []);
  const hoje = hojeISO();
  const contasComStatus = (contas ?? []).map((c: any) => ({ ...c, efetivo: statusConta(c, hoje) }));
  const aPagar = totalContas(
    contasComStatus.filter((c: any) => c.tipo === "pagar" && c.efetivo !== "paga"),
    "pagar",
  );
  const aReceber = totalContas(
    contasComStatus.filter((c: any) => c.tipo === "receber" && c.efetivo !== "paga"),
    "receber",
  );
  const vencidas = contasComStatus.filter((c: any) => c.efetivo === "vencida");

  // Caixa: entradas em dinheiro = pedidos pagos em dinheiro + contas receber pagas em dinheiro;
  // saídas em dinheiro = contas pagar pagas em dinheiro (no período da sessão aberta).
  const iniSessao = String(caixaAberto?.aberta_em ?? "").slice(0, 10) || "0000-00-00";
  const entPedidos = (pedidos ?? [])
    .filter(
      (p: any) =>
        p.pagamento_status === "pago" &&
        p.status !== "cancelado" &&
        p.forma_pagamento === "dinheiro" &&
        String(p.created_at ?? "").slice(0, 10) >= iniSessao,
    )
    .reduce((s: number, p: any) => s + (Number(p.total ?? 0) || 0), 0);
  const entContas = contasComStatus
    .filter((c: any) => c.tipo === "receber" && c.efetivo === "paga" && c.meio === "dinheiro")
    .reduce((s: number, c: any) => s + (Number(c.valor ?? 0) || 0), 0);
  const saiContas = contasComStatus
    .filter((c: any) => c.tipo === "pagar" && c.efetivo === "paga" && c.meio === "dinheiro")
    .reduce((s: number, c: any) => s + (Number(c.valor ?? 0) || 0), 0);
  const esperado = caixaAberto
    ? saldoCaixaEsperado(Number(caixaAberto.saldo_inicial ?? 0), entPedidos + entContas, saiContas)
    : 0;

  async function abrirCaixa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("caixa_sessoes").insert({
      saldo_inicial: Number(f.get("saldo_inicial") ?? 0),
      responsavel: user!.id,
      observacao: String(f.get("observacao") ?? ""),
    });
    if (error) {
      toast.error("Não foi possível abrir. Rode a migration 0072 no Supabase.");
      return;
    }
    toast.success("Caixa aberto.");
    queryClient.invalidateQueries({ queryKey: ["fin-caixa-aberto"] });
  }

  async function fecharCaixa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!caixaAberto) return;
    const f = new FormData(e.currentTarget);
    const informado = Number(f.get("saldo_informado") ?? 0);
    const dif = diferencaCaixa(informado, esperado);
    const { error } = await supabase
      .from("caixa_sessoes")
      .update({
        status: "fechada",
        fechada_em: new Date().toISOString(),
        saldo_informado: informado,
        diferenca: dif,
      })
      .eq("id", caixaAberto.id)
      .eq("status", "aberta");
    if (error) {
      toast.error("Não foi possível fechar (sessão já fechada por outro turno?).");
      return;
    }
    toast.success(dif === 0 ? "Caixa fechado exato." : `Fechado com diferença de ${brl(dif)}.`);
    queryClient.invalidateQueries({ queryKey: ["fin-caixa-aberto"] });
    queryClient.invalidateQueries({ queryKey: ["fin-caixas"] });
  }

  async function salvarConta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("contas").insert({
      tipo: String(f.get("tipo") ?? "pagar"),
      descricao: String(f.get("descricao") ?? ""),
      categoria: String(f.get("categoria") ?? ""),
      fornecedor: String(f.get("fornecedor") ?? ""),
      valor: Number(f.get("valor") ?? 0),
      meio: String(f.get("meio") ?? "dinheiro"),
      vencimento: String(f.get("vencimento") ?? "") || null,
      parcela_atual: Number(f.get("parcela_atual") ?? 1),
      parcela_total: Number(f.get("parcela_total") ?? 1),
      recorrente: String(f.get("recorrente") ?? "") === "on",
      created_by: user!.id,
    });
    if (error) {
      toast.error("Não foi possível salvar. Rode a migration 0072 no Supabase.");
      return;
    }
    toast.success("Conta registrada.");
    (e.target as HTMLFormElement).reset();
    queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
  }

  async function mudarConta(c: any, status: string) {
    const { error } = await supabase
      .from("contas")
      .update({
        status,
        pago_em: status === "paga" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (error) toast.error("Não foi possível atualizar.");
    else {
      toast.success(status === "paga" ? "Conta marcada como paga." : `Conta ${status}.`);
      queryClient.invalidateQueries({ queryKey: ["fin-contas"] });
    }
  }

  function exportar(tipo: string) {
    if (tipo === "conciliacao") {
      downloadCSV(`conciliacao-${mes}.csv`, [
        { metrica: "recebido", valor: conc.recebido, qtd: conc.qtdRecebido },
        { metrica: "pendente", valor: conc.pendente, qtd: conc.qtdPendente },
        { metrica: "cancelado", valor: conc.cancelado, qtd: 0 },
        ...Object.entries(conc.porMeio).map(([meio, valor]) => ({
          metrica: `recebido_${meio}`,
          valor,
          qtd: 0,
        })),
      ]);
    } else {
      downloadCSV(
        `contas-${hoje}.csv`,
        contasComStatus.map((c: any) => ({
          tipo: c.tipo,
          descricao: c.descricao,
          categoria: c.categoria,
          fornecedor: c.fornecedor,
          valor: c.valor,
          meio: c.meio,
          vencimento: c.vencimento,
          status: c.efetivo,
          parcela: `${c.parcela_atual}/${c.parcela_total}`,
        })),
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl">Financeiro</h1>
        <Input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="ml-auto w-44"
          aria-label="Mês"
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl">Conciliação — {mes}</h2>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => exportar("conciliacao")}
          >
            Exportar CSV
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Recebido = só pagamento confirmado. Pedido criado ou pendente não é receita.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>Recebido ({conc.qtdRecebido})</span>
            <strong>{brl(conc.recebido)}</strong>
          </p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>A receber ({conc.qtdPendente})</span>
            <strong>{brl(conc.pendente)}</strong>
          </p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>Cancelados</span>
            <strong>{brl(conc.cancelado)}</strong>
          </p>
        </div>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-4">
          {(["pix", "dinheiro", "credito", "debito"] as const).map((m) => (
            <p key={m} className="flex justify-between rounded-lg border border-border p-2.5">
              <span>Recebido {m}</span>
              <strong>{brl(conc.porMeio[m] ?? 0)}</strong>
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-display text-xl">Caixa</h2>
        {caixaAberto ? (
          <form onSubmit={fecharCaixa} className="mt-3 space-y-2 text-sm">
            <p>
              Aberto em {caixaAberto.aberta_em} • Inicial{" "}
              <strong>{brl(caixaAberto.saldo_inicial)}</strong>
            </p>
            <p>
              Entradas (dinheiro) <strong>{brl(entPedidos + entContas)}</strong> • Saídas (dinheiro){" "}
              <strong>{brl(saiContas)}</strong> • Esperado <strong>{brl(esperado)}</strong>
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Saldo contado no fechamento</Label>
                <Input
                  name="saldo_informado"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  className="w-44"
                />
              </div>
              <Button type="submit" size="sm">
                Fechar caixa
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={abrirCaixa} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
            <div className="space-y-1">
              <Label>Saldo inicial</Label>
              <Input
                name="saldo_inicial"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Input name="observacao" maxLength={200} className="w-64" />
            </div>
            <Button type="submit" size="sm">
              Abrir caixa
            </Button>
          </form>
        )}
        {(caixas ?? []).length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {(caixas ?? []).map((s: any) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>{String(s.fechada_em ?? "").slice(0, 10)}</span>
                <span>
                  Inicial {brl(s.saldo_inicial)} • Informado {brl(s.saldo_informado)} • Diferença{" "}
                  {brl(s.diferenca)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl">Contas a pagar e receber</h2>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => exportar("contas")}
          >
            Exportar CSV
          </Button>
        </div>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>A pagar</span>
            <strong>{brl(aPagar)}</strong>
          </p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>A receber</span>
            <strong>{brl(aReceber)}</strong>
          </p>
          <p className="flex justify-between rounded-lg bg-muted p-2.5">
            <span>Vencidas ({vencidas.length})</span>
            <strong>
              {brl(vencidas.reduce((s: number, c: any) => s + (Number(c.valor ?? 0) || 0), 0))}
            </strong>
          </p>
        </div>
        <form onSubmit={salvarConta} className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <select
              name="tipo"
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              defaultValue="pagar"
            >
              <option value="pagar">A pagar</option>
              <option value="receber">A receber</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Descrição *</Label>
            <Input name="descricao" required maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>Valor *</Label>
            <Input name="valor" type="number" min={0} step="0.01" required />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Input name="categoria" maxLength={60} />
          </div>
          <div className="space-y-1">
            <Label>Fornecedor</Label>
            <Input name="fornecedor" maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label>Meio</Label>
            <select
              name="meio"
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              defaultValue="dinheiro"
            >
              {MEIOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Vencimento</Label>
            <Input name="vencimento" type="date" />
          </div>
          <div className="space-y-1">
            <Label>Parcela atual</Label>
            <Input name="parcela_atual" type="number" min={1} defaultValue={1} />
          </div>
          <div className="space-y-1">
            <Label>Total de parcelas</Label>
            <Input name="parcela_total" type="number" min={1} defaultValue={1} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="recorrente" /> Conta recorrente
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm">
              Registrar conta
            </Button>
          </div>
        </form>
        <ul className="mt-3 space-y-2 text-sm">
          {(contasComStatus ?? []).map((c: any) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
            >
              <span className="font-semibold">
                {c.tipo === "pagar" ? "A pagar" : "A receber"} • {brl(c.valor)}
              </span>
              <span className="text-xs text-muted-foreground">
                {c.descricao} {c.fornecedor ? `• ${c.fornecedor}` : ""}{" "}
                {c.vencimento ? `• vence ${c.vencimento}` : ""} • parcela {c.parcela_atual}/
                {c.parcela_total}
                {c.recorrente ? " • recorrente" : ""} • {c.efetivo}
              </span>
              <span className="ml-auto flex gap-1">
                {c.efetivo !== "paga" ? (
                  <Button size="sm" variant="outline" onClick={() => mudarConta(c, "paga")}>
                    Marcar paga
                  </Button>
                ) : null}
                {c.efetivo !== "cancelada" ? (
                  <Button size="sm" variant="ghost" onClick={() => mudarConta(c, "cancelada")}>
                    Cancelar
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
          {(contasComStatus ?? []).length === 0 ? (
            <li className="text-muted-foreground">Nenhuma conta registrada.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
