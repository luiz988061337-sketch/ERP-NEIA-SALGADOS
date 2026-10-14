import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { EmptyState, PageHeader } from "@/components/admin/ui-admin";
import { brl } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { dreMensal } from "@/lib/financeiro";
import { converterUnidade } from "@/lib/insumos";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/gestao")({
  head: () => ({ meta: [{ title: "Gestão — Néia Salgados" }] }),
  component: Gestao,
});

function faixa(mes: string, desloc: number): { ini: string; fim: string; ref: string } {
  const partes = mes.split("-").map(Number);
  const y = partes[0] ?? new Date().getFullYear();
  const m = partes[1] ?? 1;
  const d = new Date(y, m - 1 + desloc, 1);
  const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const f = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { ini: `${ref}-01`, fim: f.toISOString().slice(0, 10), ref };
}

function Gestao() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const isAdmin = roles?.includes("admin");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/gestao" }, replace: true });
  }, [loading, user, navigate]);

  async function buscaPedidos(ini: string, fim: string) {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id, numero, total, desconto, forma_pagamento, pagamento_status, status, bairro, created_at, cliente_nome, telefone, user_id")
      .gte("created_at", ini)
      .lt("created_at", fim)
      .order("created_at", { ascending: false })
      .limit(4000);
    if (error) throw error;
    return (data ?? []) as any[];
  }

  const fAtual = faixa(mes, 0);
  const fAnt = faixa(mes, -1);
  const fAno = faixa(mes, -12);

  const q = (key: string, ini: string, fim: string) =>
    useQuery({
      queryKey: ["gestao-ped", key],
      enabled: !!isAdmin,
      queryFn: () => buscaPedidos(ini, fim),
    });
  const atual = q(fAtual.ref, fAtual.ini, fAtual.fim);
  const anterior = q(fAnt.ref, fAnt.ini, fAnt.fim);
  const anoPassado = q(fAno.ref, fAno.ini, fAno.fim);

  const { data: contas } = useQuery({
    queryKey: ["gestao-contas", mes],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("contas").select("tipo, categoria, valor, status, vencimento").limit(2000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: metas } = useQuery({
    queryKey: ["gestao-metas", mes],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("metas").select("*").eq("tipo", "mensal").eq("periodo_ref", mes).limit(10);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: itensMes } = useQuery({
    queryKey: ["gestao-itens", mes],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pedido_itens")
          .select("nome, quantidade, preco_unitario, pedidos!inner(created_at)")
          .gte("pedidos.created_at", fAtual.ini)
          .lt("pedidos.created_at", fAtual.fim)
          .limit(8000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: fichas } = useQuery({
    queryKey: ["gestao-fichas"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("id, nome, preco, preco_promocional, embalagem_custo, fichas_tecnicas(perda_pct, por_cento, ficha_itens(quantidade, unidade, insumos(custo_medio, unidade_base)))");
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["gestao-docs", mes],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("documentos_fiscais").select("status").gte("created_at", fAtual.ini).lt("created_at", fAtual.fim).limit(2000);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const { data: caixaUlt } = useQuery({
    queryKey: ["gestao-caixa"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("caixa_sessoes").select("diferenca, fechada_em").eq("status", "fechada").order("fechada_em", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return (data ?? null) as any;
      } catch {
        return null;
      }
    },
  });

  const { data: datasFortes } = useQuery({
    queryKey: ["gestao-datas"],
    enabled: !!isAdmin,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("datas_demanda").select("ocasiao, data, nivel").eq("ativo", true).gte("data", new Date().toISOString().slice(0, 10)).order("data").limit(10);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const calc = useMemo(() => {
    const soma = (arr: any[]) => arr.reduce((s: number, p: any) => s + (Number(p.total ?? 0) || 0), 0);
    const ok = (arr: any[]) => arr.filter((p: any) => p.status !== "cancelado");
    const a = ok(atual.data ?? []);
    const b = ok(anterior.data ?? []);
    const c = ok(anoPassado.data ?? []);
    const fat = soma(a);
    const diasDec = Math.max(1, new Date().getDate());
    const diasMes = new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]), 0).getDate();
    const divisao = (x: number, y: number) => (y > 0 ? ((x - y) / y) * 100 : null);
    const pagos = a.filter((p: any) => p.pagamento_status === "pago");
    const cmvPago = (contas ?? []).filter((x: any) => x.tipo === "pagar" && x.status === "paga" && x.categoria === "insumos").reduce((s: number, x: any) => s + (Number(x.valor ?? 0) || 0), 0);
    const desp = (contas ?? []).filter((x: any) => x.tipo === "pagar" && x.status === "paga" && x.categoria !== "insumos").reduce((s: number, x: any) => s + (Number(x.valor ?? 0) || 0), 0);
    const d = dreMensal({
      bruta: fat,
      cancelamentos: soma((atual.data ?? []).filter((p: any) => p.status === "cancelado")),
      descontos: a.reduce((s: number, p: any) => s + (Number(p.desconto ?? 0) || 0), 0),
      cmv: cmvPago,
      despesas: desp,
    });
    const porBairro = new Map<string, number>();
    const porCanal = new Map<string, number>();
    const porHora = new Map<number, number>();
    const vistos = new Set<string>();
    let recompras = 0;
    for (const p of a) {
      porBairro.set(p.bairro || "—", (porBairro.get(p.bairro || "—") ?? 0) + (Number(p.total) || 0));
      porCanal.set(p.forma_pagamento || "outro", (porCanal.get(p.forma_pagamento || "outro") ?? 0) + (Number(p.total) || 0));
      const h = new Date(p.created_at).getHours();
      porHora.set(h, (porHora.get(h) ?? 0) + (Number(p.total) || 0));
      const k = p.user_id ?? p.telefone ?? "";
      if (k) {
        if (vistos.has(k)) recompras += 1;
        else vistos.add(k);
      }
    }
    const top = (m: Map<string, number>, n = 5) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
    return {
      fat,
      pagos: soma(pagos),
      qtd: a.length,
      ticket: a.length ? fat / a.length : 0,
      porDia: a.length / Math.max(1, diasDec),
      dFatAnt: divisao(fat, soma(b)),
      dFatAno: divisao(fat, soma(c)),
      previsao: (fat / diasDec) * diasMes,
      dre: d,
      porBairro: top(porBairro),
      porCanal: top(porCanal),
      porHora: [...porHora.entries()].sort((x, y) => x[0] - y[0]),
      recompraPct: a.length ? (recompras / a.length) * 100 : 0,
      diasDec,
    };
  }, [atual.data, anterior.data, anoPassado.data, contas, mes]);

  const lucratividade = useMemo(() => {
    const rec = new Map<string, number>();
    for (const i of itensMes ?? []) rec.set(i.nome, (rec.get(i.nome) ?? 0) + (Number(i.preco_unitario) || 0) * (Number(i.quantidade) || 0));
    const out: { nome: string; receita: number; margem: number | null }[] = [];
    for (const p of fichas ?? []) {
      const ficha = (p.fichas_tecnicas ?? [])[0];
      const preco = Number(p.preco_promocional ?? p.preco ?? 0) || 0;
      if (!ficha) {
        out.push({ nome: p.nome, receita: rec.get(p.nome) ?? 0, margem: null });
        continue;
      }
      let custo = Number(p.embalagem_custo ?? 0) || 0;
      for (const it of ficha.ficha_itens ?? []) {
        const base = converterUnidade(Number(it.quantidade), it.unidade, it.insumos?.unidade_base ?? it.unidade);
        if (base == null) continue;
        const q = (ficha.por_cento ? base / 100 : base) * (1 + Number(ficha.perda_pct ?? 0) / 100);
        custo += q * (Number(it.insumos?.custo_medio ?? 0) || 0);
      }
      out.push({ nome: p.nome, receita: rec.get(p.nome) ?? 0, margem: preco > 0 ? (preco - custo) / preco : null });
    }
    const comMargem = out.filter((o) => o.margem != null);
    return {
      top: [...comMargem].sort((a, b) => (b.margem ?? 0) - (a.margem ?? 0)).slice(0, 5),
      piores: [...comMargem].sort((a, b) => (a.margem ?? 0) - (b.margem ?? 0)).slice(0, 5),
      semFicha: out.filter((o) => o.margem == null && o.receita > 0).length,
      negativas: comMargem.filter((o) => (o.margem ?? 0) < 0),
    };
  }, [itensMes, fichas]);

  const alertas = useMemo(() => {
    const out: { texto: string; tom: string }[] = [];
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const amStr = amanha.toISOString().slice(0, 10);
    const venceAmanha = (contas ?? []).filter((c: any) => c.tipo === "pagar" && c.status !== "paga" && c.status !== "cancelada" && c.vencimento === amStr).length;
    if (venceAmanha > 0) out.push({ texto: `${venceAmanha} conta(s) vencendo amanhã`, tom: "atencao" });
    for (const n of lucratividade.negativas.slice(0, 5)) out.push({ texto: `Margem negativa: ${n.nome}`, tom: "perigo" });
    if (caixaUlt && Number(caixaUlt.diferenca ?? 0) !== 0) out.push({ texto: `Último caixa com diferença de ${brl(caixaUlt.diferenca)}`, tom: "atencao" });
    const rej = (docs ?? []).filter((d: any) => d.status === "rejeitada").length;
    if (rej > 0) out.push({ texto: `${rej} nota(s) rejeitada(s) no mês`, tom: "perigo" });
    for (const m of metas ?? []) {
      const alvo = Number(m.valor ?? 0) || 0;
      if (alvo > 0 && calc.fat < alvo) out.push({ texto: `Meta mensal abaixo do ritmo (${brl(calc.fat)} de ${brl(alvo)})`, tom: "atencao" });
    }
    return out;
  }, [contas, lucratividade, caixaUlt, docs, metas, calc.fat]);

  if (roles && !isAdmin) {
    return <p className="p-10 text-center text-muted-foreground">Painel do dono (acesso restrito).</p>;
  }

  return (
    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Dono"
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <PageHeader
          titulo="Gestão"
          descricao="Números do dono: faturamento, lucro, comparativos e alertas."
          acoes={<Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" aria-label="Mês" />}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiGestao rotulo="Faturamento" valor={brl(calc.fat)} detalhe={`${calc.qtd} pedidos • ${calc.porDia.toFixed(1)}/dia`} />
          <KpiGestao rotulo="Recebido" valor={brl(calc.pagos)} detalhe="pagamento confirmado" />
          <KpiGestao rotulo="Lucro (DRE)" valor={brl(calc.dre.resultado)} detalhe={`${calc.dre.margemPct.toFixed(1)}% margem`} />
          <KpiGestao rotulo="Ticket médio" valor={brl(calc.ticket)} detalhe={`recompra ${calc.recompraPct.toFixed(0)}%`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <KpiGestao rotulo="vs. mês anterior" valor={calc.dFatAnt == null ? "—" : `${calc.dFatAnt >= 0 ? "+" : ""}${calc.dFatAnt.toFixed(1)}%`} detalhe="faturamento" />
          <KpiGestao rotulo="vs. mesmo mês, ano passado" valor={calc.dFatAno == null ? "—" : `${calc.dFatAno >= 0 ? "+" : ""}${calc.dFatAno.toFixed(1)}%`} detalhe="faturamento" />
          <KpiGestao rotulo="Previsão do mês" valor={brl(calc.previsao)} detalhe={`ritmo de ${calc.diasDec}d`} />
        </div>

        {(metas ?? []).length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-xl">Metas do mês</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(metas ?? []).map((m: any) => {
                const alvo = Number(m.valor ?? 0) || 0;
                const pct = alvo > 0 ? Math.min(100, (calc.fat / alvo) * 100) : 0;
                return (
                  <li key={m.id}>
                    <div className="flex justify-between"><span>Meta {brl(alvo)}</span><b>{pct.toFixed(0)}%</b></div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-yellow-400" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {alertas.length > 0 ? (
          <section className="rounded-xl border border-orange-300 bg-orange-50 p-4" aria-label="Alertas">
            <h2 className="font-display text-xl">Alertas</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {alertas.map((a, i) => (
                <li key={i} className={a.tom === "perigo" ? "font-semibold text-red-700" : "text-orange-800"}>• {a.texto}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-xl">Mais lucrativos</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {lucratividade.top.map((o) => (
                <li key={o.nome} className="flex justify-between gap-2"><span>{o.nome}</span><b className="text-green-700">{((o.margem ?? 0) * 100).toFixed(0)}%</b></li>
              ))}
              {lucratividade.top.length === 0 ? <li className="text-muted-foreground">Sem fichas para calcular.</li> : null}
            </ul>
            <h2 className="mt-4 font-display text-xl">Menos lucrativos</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {lucratividade.piores.map((o) => (
                <li key={o.nome} className="flex justify-between gap-2"><span>{o.nome}</span><b className={(o.margem ?? 0) < 0 ? "text-red-600" : ""}>{((o.margem ?? 0) * 100).toFixed(0)}%</b></li>
              ))}
            </ul>
            {lucratividade.semFicha > 0 ? <p className="mt-2 text-xs text-muted-foreground">{lucratividade.semFicha} produto(s) vendido(s) sem ficha.</p> : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl">Por bairro e canal</h2>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() =>
                  downloadCSV(`gestao-${mes}.csv`, [
                    ...calc.porBairro.map(([bairro, total]) => ({ grupo: "bairro", nome: bairro, total })),
                    ...calc.porCanal.map(([canal, total]) => ({ grupo: "canal", nome: canal, total })),
                  ])
                }
              >
                Exportar CSV
              </Button>
            </div>
            <h3 className="mt-2 text-sm font-bold">Bairros</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {calc.porBairro.map(([b, t]) => (
                <li key={b} className="flex justify-between"><span>{b}</span><b>{brl(t)}</b></li>
              ))}
            </ul>
            <h3 className="mt-3 text-sm font-bold">Canais (pagamento)</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {calc.porCanal.map(([c, t]) => (
                <li key={c} className="flex justify-between"><span>{c}</span><b>{brl(t)}</b></li>
              ))}
            </ul>
            <h3 className="mt-3 text-sm font-bold">Por horário</h3>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {calc.porHora.map(([h, t]) => (
                <li key={h} className="flex justify-between"><span>{h}h</span><span>{brl(t)}</span></li>
              ))}
            </ul>
          </section>
        </div>

        {(datasFortes ?? []).length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-xl">Datas fortes à frente</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(datasFortes ?? []).map((d: any) => (
                <li key={`${d.data}-${d.ocasiao}`} className="flex justify-between"><span>{d.ocasiao} • {d.data}</span><span className="text-muted-foreground">{d.nivel}</span></li>
              ))}
            </ul>
          </section>
        ) : null}

        {(!atual.data || atual.data.length === 0) && !atual.isPending ? (
          <EmptyState titulo="Sem movimento no mês" descricao="Escolha outra competência." />
        ) : null}
      </div>
    </>
  );
}

function KpiGestao({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <span className="block text-sm text-muted-foreground">{rotulo}</span>
      <span className="block font-display text-2xl">{valor}</span>
      {detalhe ? <span className="mt-0.5 block text-xs text-muted-foreground">{detalhe}</span> : null}
    </div>
  );
}
