import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bike,
  Briefcase,
  CalendarDays,
  Check,
  ChefHat,
  ClipboardList,
  Crown,
  DollarSign,
  Home,
  LogOut,
  ShoppingCart,
  Target,
  Ticket,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { L1Alert, L1Btn, L1Section, L1Stat } from "@/components/l1/ui";
import { brl } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { dreMensal, montarDRE } from "@/lib/financeiro";
import { faixaCompetencia } from "@/lib/competencia";
import { converterUnidade } from "@/lib/insumos";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/gestao")({
  head: () => ({
    meta: [{ title: "Gestão — Néia Salgados" }],
    links: [{ rel: "stylesheet", href: "/src/l1-preview.css" }],
  }),
  component: () => {
    const navigate = useNavigate();
    useEffect(() => {
      // /admin já abre o dashboard aprovado; o parâmetro antigo "aba" era ignorado.
      navigate({ to: "/admin", replace: true });
    }, [navigate]);
    return null;
  },
});

function faixa(mes: string, desloc: number): { ini: string; fim: string; ref: string } {
  const partes = mes.split("-").map(Number);
  const y = partes[0] ?? new Date().getFullYear();
  const m = partes[1] ?? 1;
  const d = new Date(y, m - 1 + desloc, 1);
  const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Fronteiras exatas (America/Sao_Paulo, sem dia 31): item 6.
  const fx = faixaCompetencia(ref);
  return { ini: fx.ini, fim: fx.fim, ref };
}

function Gestao() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const isAdmin = roles?.includes("admin");

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/auth", search: { redirect: "/gestao" }, replace: true });
  }, [loading, user, navigate]);

  async function buscaPedidos(ini: string, fim: string) {
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        "id, numero, total, desconto, forma_pagamento, pagamento_status, status, bairro, created_at, cliente_nome, telefone, user_id",
      )
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
        const { data, error } = await supabase
          .from("contas")
          .select("tipo, categoria, valor, valor_pago, status, vencimento")
          .limit(2000);
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
        const { data, error } = await supabase
          .from("metas")
          .select("*")
          .eq("tipo", "mensal")
          .eq("periodo_ref", mes)
          .limit(10);
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
          .select(
            "id, nome, preco, preco_promocional, embalagem_custo, fichas_tecnicas(perda_pct, por_cento, ficha_itens(quantidade, unidade, insumos(custo_medio, unidade_base)))",
          );
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
        const { data, error } = await supabase
          .from("documentos_fiscais")
          .select("status")
          .gte("created_at", fAtual.ini)
          .lt("created_at", fAtual.fim)
          .limit(2000);
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
        const { data, error } = await supabase
          .from("caixa_sessoes")
          .select("diferenca, fechada_em")
          .eq("status", "fechada")
          .order("fechada_em", { ascending: false })
          .limit(1)
          .maybeSingle();
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
        const { data, error } = await supabase
          .from("datas_demanda")
          .select("ocasiao, data, nivel")
          .eq("ativo", true)
          .gte("data", new Date().toISOString().slice(0, 10))
          .order("data")
          .limit(10);
        if (error) throw error;
        return (data ?? []) as any[];
      } catch {
        return [];
      }
    },
  });

  const calc = useMemo(() => {
    const soma = (arr: any[]) =>
      arr.reduce((s: number, p: any) => s + (Number(p.total ?? 0) || 0), 0);
    const ok = (arr: any[]) => arr.filter((p: any) => p.status !== "cancelado");
    const a = ok(atual.data ?? []);
    const b = ok(anterior.data ?? []);
    const c = ok(anoPassado.data ?? []);
    const fat = soma(a);
    const diasDec = Math.max(1, new Date().getDate());
    const diasMes = new Date(Number(mes.split("-")[0]), Number(mes.split("-")[1]), 0).getDate();
    const divisao = (x: number, y: number) => (y > 0 ? ((x - y) / y) * 100 : null);
    const pagos = a.filter((p: any) => p.pagamento_status === "pago");
    const d = montarDRE(
      atual.data ?? [],
      (contas ?? []).filter((x: any) =>
        x.tipo === "pagar" && x.status !== "cancelada" &&
        (x.status === "paga" || Number(x.valor_pago ?? 0) > 0),
      ),
    );
    const porBairro = new Map<string, number>();
    const porCanal = new Map<string, number>();
    const porHora = new Map<number, number>();
    const vistos = new Set<string>();
    let recompras = 0;
    for (const p of a) {
      porBairro.set(
        p.bairro || "—",
        (porBairro.get(p.bairro || "—") ?? 0) + (Number(p.total) || 0),
      );
      porCanal.set(
        p.forma_pagamento || "outro",
        (porCanal.get(p.forma_pagamento || "outro") ?? 0) + (Number(p.total) || 0),
      );
      const h = new Date(p.created_at).getHours();
      porHora.set(h, (porHora.get(h) ?? 0) + (Number(p.total) || 0));
      const k = p.user_id ?? p.telefone ?? "";
      if (k) {
        if (vistos.has(k)) recompras += 1;
        else vistos.add(k);
      }
    }
    const top = (m: Map<string, number>, n = 5) =>
      [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n);
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
    for (const i of itensMes ?? [])
      rec.set(
        i.nome,
        (rec.get(i.nome) ?? 0) + (Number(i.preco_unitario) || 0) * (Number(i.quantidade) || 0),
      );
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
        const base = converterUnidade(
          Number(it.quantidade),
          it.unidade,
          it.insumos?.unidade_base ?? it.unidade,
        );
        if (base == null) continue;
        const q = (ficha.por_cento ? base / 100 : base) * (1 + Number(ficha.perda_pct ?? 0) / 100);
        custo += q * (Number(it.insumos?.custo_medio ?? 0) || 0);
      }
      out.push({
        nome: p.nome,
        receita: rec.get(p.nome) ?? 0,
        margem: preco > 0 ? (preco - custo) / preco : null,
      });
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
    const venceAmanha = (contas ?? []).filter(
      (c: any) =>
        c.tipo === "pagar" &&
        c.status !== "paga" &&
        c.status !== "cancelada" &&
        c.vencimento === amStr,
    ).length;
    if (venceAmanha > 0)
      out.push({ texto: `${venceAmanha} conta(s) vencendo amanhã`, tom: "atencao" });
    for (const n of lucratividade.negativas.slice(0, 5))
      out.push({ texto: `Margem negativa: ${n.nome}`, tom: "perigo" });
    if (caixaUlt && Number(caixaUlt.diferenca ?? 0) !== 0)
      out.push({
        texto: `Último caixa com diferença de ${brl(caixaUlt.diferenca)}`,
        tom: "atencao",
      });
    const rej = (docs ?? []).filter((d: any) => d.status === "rejeitada").length;
    if (rej > 0) out.push({ texto: `${rej} nota(s) rejeitada(s) no mês`, tom: "perigo" });
    for (const m of metas ?? []) {
      const alvo = Number(m.valor ?? 0) || 0;
      if (alvo > 0 && calc.fat < alvo)
        out.push({
          texto: `Meta mensal abaixo do ritmo (${brl(calc.fat)} de ${brl(alvo)})`,
          tom: "atencao",
        });
    }
    return out;
  }, [contas, lucratividade, caixaUlt, docs, metas, calc.fat]);

  if (roles && !isAdmin) {
    return (
      <div className="l1">
        <p className="l1-demo">Painel do dono (acesso restrito).</p>
      </div>
    );
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const NAV: { grupo: string; rotulo: string; to: string; icone: LucideIcon; ativo?: boolean }[] = [
    { grupo: "Principal", rotulo: "Dashboard", to: "/admin", icone: Home },
    { grupo: "Principal", rotulo: "Gestão", to: "/gestao", icone: BarChart3, ativo: true },
    { grupo: "Operação", rotulo: "Pedidos", to: "/atendente", icone: ClipboardList },
    { grupo: "Operação", rotulo: "PDV", to: "/pdv", icone: ShoppingCart },
    { grupo: "Operação", rotulo: "Produção", to: "/producao", icone: ChefHat },
    { grupo: "Operação", rotulo: "Entregas", to: "/central-entregas", icone: Bike },
    { grupo: "Gestão", rotulo: "Financeiro", to: "/financeiro", icone: DollarSign },
    { grupo: "Gestão", rotulo: "Clientes", to: "/clientes", icone: Users },
    { grupo: "Gestão", rotulo: "Equipe", to: "/equipe", icone: Briefcase },
  ];

  let ultimoGrupo = "";
  return (
    <div className="l1">
      <div className="l1-shell">
        <aside className="l1-side" aria-label="Navegação da gestão">
          <div className="l1-brand">
            <Crown size={20} color="#B48A36" aria-hidden />
            <b>Néia</b>
            <span>SALGADOS</span>
            <small>O sabor que faz a diferença</small>
          </div>
          <nav>
            {NAV.map((n) => {
              const cab = n.grupo !== ultimoGrupo ? ((ultimoGrupo = n.grupo), true) : false;
              const I = n.icone;
              return (
                <span key={n.rotulo}>
                  {cab ? <p className="l1-nav-title">{n.grupo}</p> : null}
                  <Link
                    to={n.to}
                    className={`l1-nav-item${n.ativo ? " on" : ""}`}
                    aria-current={n.ativo ? "page" : undefined}
                  >
                    <I aria-hidden />
                    {n.rotulo}
                  </Link>
                </span>
              );
            })}
          </nav>
          <div className="l1-side-foot">
            Sistema Online
            <b>{mes}</b>
            {user?.email ?? "Dono"}
            <span style={{ display: "block", marginTop: 8 }}>
              <button type="button" className="l1-btn ghost sm block" onClick={sair}>
                <LogOut size={16} aria-hidden /> Sair
              </button>
            </span>
          </div>
        </aside>

        <div className="l1-main">
          <div className="l1-mobile-tabs" role="tablist" aria-label="Navegação">
            {NAV.map((n) => (
              <Link
                key={n.rotulo}
                to={n.to}
                role="tab"
                aria-selected={n.ativo}
                className={`l1-pill${n.ativo ? " on" : ""}`}
              >
                {n.rotulo}
              </Link>
            ))}
          </div>

          <header className="l1-top">
            <div>
              <h1>
                <BarChart3 aria-hidden />
                Gestão
              </h1>
              <p>Números do dono: faturamento, lucro, comparativos e alertas.</p>
            </div>
            <div className="l1-top-right">
              <label className="l1-field" aria-label="Mês">
                <CalendarDays aria-hidden />
                <input
                  type="month"
                  value={mes}
                  onChange={(e) => setMes(e.target.value)}
                  aria-label="Mês"
                />
              </label>
            </div>
          </header>

          <div className="l1-grid cols-auto">
            <L1Stat
              numero={brl(calc.fat)}
              texto={`${calc.qtd} pedidos • ${calc.porDia.toFixed(1)}/dia`}
              icone={DollarSign}
              fundo="#E2F2E7"
            />
            <L1Stat
              numero={brl(calc.pagos)}
              texto="pagamento confirmado"
              icone={Check}
              fundo="#E2ECF9"
            />
            <L1Stat
              numero={brl(calc.dre.resultado)}
              texto={`${calc.dre.margemPct.toFixed(1)}% margem`}
              icone={Target}
              fundo="#F3E9D2"
            />
            <L1Stat
              numero={brl(calc.ticket)}
              texto={`recompra ${calc.recompraPct.toFixed(0)}%`}
              icone={Ticket}
              fundo="#ECE4FA"
            />
            <L1Stat
              numero={
                calc.dFatAnt == null
                  ? "—"
                  : `${calc.dFatAnt >= 0 ? "+" : ""}${calc.dFatAnt.toFixed(1)}%`
              }
              texto="vs. mês anterior"
              icone={TrendingUp}
              fundo="#F2F0EA"
            />
            <L1Stat
              numero={
                calc.dFatAno == null
                  ? "—"
                  : `${calc.dFatAno >= 0 ? "+" : ""}${calc.dFatAno.toFixed(1)}%`
              }
              texto="vs. ano passado"
              icone={TrendingUp}
              fundo="#F2F0EA"
            />
            <L1Stat
              numero={brl(calc.previsao)}
              texto={`ritmo de ${calc.diasDec}d`}
              icone={CalendarDays}
              fundo="#F2F0EA"
            />
          </div>

          {(metas ?? []).length > 0 ? (
            <L1Section titulo="Metas do mês">
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="l1-grid cols-2">
                {(metas ?? []).map((m: any) => {
                  const alvo = Number(m.valor ?? 0) || 0;
                  const pct = alvo > 0 ? Math.min(100, (calc.fat / alvo) * 100) : 0;
                  return (
                    <li key={m.id} className="l1-card">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Meta {brl(alvo)}</span>
                        <b>{pct.toFixed(0)}%</b>
                      </div>
                      <div className="l1-progress" aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </L1Section>
          ) : null}

          {alertas.length > 0 ? (
            <div aria-label="Alertas" style={{ marginTop: 16 }}>
              {alertas.map((a, i) => (
                <L1Alert key={i} cor={a.tom === "perigo" ? "red" : "yellow"}>
                  <TriangleAlert aria-hidden />• {a.texto}
                </L1Alert>
              ))}
            </div>
          ) : null}

          <div className="l1-grid cols-2" style={{ marginTop: 4 }}>
            <L1Section titulo="Lucratividade">
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Mais lucrativos</h3>
              <ul className="l1-flavors">
                {lucratividade.top.map((o) => (
                  <li key={o.nome} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{o.nome}</span>
                    <b style={{ color: "#1e7e46" }}>{((o.margem ?? 0) * 100).toFixed(0)}%</b>
                  </li>
                ))}
                {lucratividade.top.length === 0 ? <li>Sem fichas para calcular.</li> : null}
              </ul>
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Menos lucrativos</h3>
              <ul className="l1-flavors">
                {lucratividade.piores.map((o) => (
                  <li key={o.nome} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{o.nome}</span>
                    <b style={{ color: (o.margem ?? 0) < 0 ? "#c03535" : undefined }}>
                      {((o.margem ?? 0) * 100).toFixed(0)}%
                    </b>
                  </li>
                ))}
              </ul>
              {lucratividade.semFicha > 0 ? (
                <p className="l1-meta">
                  {lucratividade.semFicha} produto(s) vendido(s) sem ficha.
                </p>
              ) : null}
            </L1Section>

            <L1Section titulo="Por bairro e canal">
              <div style={{ margin: "-4px 0 8px" }}>
                <L1Btn
                  tam="sm"
                  cor="ghost"
                  onClick={() =>
                    downloadCSV(`gestao-${mes}.csv`, [
                      ...calc.porBairro.map(([bairro, total]) => ({
                        grupo: "bairro",
                        nome: bairro,
                        total,
                      })),
                      ...calc.porCanal.map(([canal, total]) => ({
                        grupo: "canal",
                        nome: canal,
                        total,
                      })),
                    ])
                  }
                  label="Exportar CSV"
                >
                  Exportar CSV
                </L1Btn>
              </div>
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Bairros</h3>
              <ul className="l1-flavors">
                {calc.porBairro.map(([b, t]) => (
                  <li key={b} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{b}</span>
                    <b>{brl(t)}</b>
                  </li>
                ))}
              </ul>
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Canais (pagamento)</h3>
              <ul className="l1-flavors">
                {calc.porCanal.map(([c, t]) => (
                  <li key={c} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{c}</span>
                    <b>{brl(t)}</b>
                  </li>
                ))}
              </ul>
              <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Por horário</h3>
              <ul className="l1-flavors">
                {calc.porHora.map(([h, t]) => (
                  <li key={h} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{h}h</span>
                    <span>{brl(t)}</span>
                  </li>
                ))}
              </ul>
            </L1Section>
          </div>

          {(datasFortes ?? []).length > 0 ? (
            <L1Section titulo="Datas fortes à frente">
              <ul className="l1-flavors">
                {(datasFortes ?? []).map((d: any) => (
                  <li key={`${d.data}-${d.ocasiao}`} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>
                      {d.ocasiao} • {d.data}
                    </span>
                    <span className="l1-meta">{d.nivel}</span>
                  </li>
                ))}
              </ul>
            </L1Section>
          ) : null}

          {(!atual.data || atual.data.length === 0) && !atual.isPending ? (
            <div className="l1-card" style={{ marginTop: 12 }}>
              <h3>Sem movimento no mês</h3>
              <p className="l1-meta">Escolha outra competência.</p>
            </div>
          ) : null}

          <p className="l1-foot">Gestão Néia Salgados • dados reais do mês {mes}.</p>
        </div>
      </div>
    </div>
  );
}
