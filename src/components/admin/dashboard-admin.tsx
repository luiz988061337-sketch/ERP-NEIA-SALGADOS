import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Bike,
  Calculator,
  CalendarDays,
  ChefHat,
  ChevronRight,
  Crown,
  Heart,
  MessageCircle,
  Printer,
  Repeat2,
  Search,
  ShoppingCart,
  Store,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  Wheat,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { CentralOperacao, PERIODO_LABEL } from "@/components/central-operacao";
import { StatusBadge } from "@/components/status-steps";
import { EmptyState } from "@/components/admin/ui-admin";
import {
  ERP_COLORS,
  MetricCard,
  PainelCabecalho,
  PainelMetrica,
  SectionCard,
  ChartCard,
} from "@/components/admin/erp-ui";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { imagemProduto } from "@/lib/catalog";
import { brl, dataHora, hora } from "@/lib/format";
import type { PeriodoKey } from "@/lib/operacao";
import hero from "@/assets/hero.jpg";

/**
 * Dashboard do Admin — reforma estrutural.
 * Linha 1: 4 métricas | Linha 2: 2 gráficos | Linha 3: 3 cards.
 * Todos os números vêm das consultas reais. Sem deltas inventados:
 * "vs. ontem" só aparece com base calculada; sem base, mostra "—".
 * Blocos funcionais (busca, operação, aside) preservados.
 */
export function DashboardAdmin({
  pedidos,
  produtos,
  profiles,
  clientesStats,
  periodo,
  setPeriodo,
  setAba,
  notLidas,
  marcarLida,
  busca,
  setBusca,
  setPedidoFoco,
  setProdutoFoco,
  setClienteFoco,
}: {
  pedidos: any[];
  produtos: any[];
  profiles: any[];
  clientesStats: any[];
  periodo: PeriodoKey;
  setPeriodo: (p: PeriodoKey) => void;
  setAba: (v: string) => void;
  notLidas: string[];
  marcarLida: (id: string) => void;
  busca: string;
  setBusca: (t: string) => void;
  setPedidoFoco: (v: string) => void;
  setProdutoFoco: (v: string) => void;
  setClienteFoco: (v: string) => void;
}) {
  const navigate = useNavigate();
  const lista = pedidos ?? [];
  const hojeStr = new Date().toDateString();
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toDateString();

  const doDia = useMemo(
    () =>
      lista.filter(
        (p: any) => new Date(p.created_at).toDateString() === hojeStr && p.status !== "cancelado",
      ),
    [lista, hojeStr],
  );
  const deOntem = useMemo(
    () =>
      lista.filter(
        (p: any) => new Date(p.created_at).toDateString() === ontemStr && p.status !== "cancelado",
      ),
    [lista, ontemStr],
  );
  const soma = (arr: any[]) => arr.reduce((a: number, p: any) => a + (Number(p.total) || 0), 0);
  const fatDia = soma(doDia);
  const fatOntem = soma(deOntem);

  const delta = (hoje: number, antes: number): number | null => {
    if (!(antes > 0)) return null;
    return ((hoje - antes) / antes) * 100;
  };
  const dPedidos = delta(doDia.length, deOntem.length);
  const dFat = delta(fatDia, fatOntem);
  const ticketMedio = doDia.length > 0 ? fatDia / doDia.length : 0;

  const ativos30 = useMemo(
    () =>
      (clientesStats ?? []).filter(
        (c: any) => c.dias_sem_comprar != null && c.dias_sem_comprar <= 30,
      ),
    [clientesStats],
  );

  const porStatus = useMemo(() => {
    const conta = (sts: string[]) => lista.filter((p: any) => sts.includes(p.status)).length;
    return {
      novos: conta(["recebido"]),
      producao: conta(["em_producao"]),
      prontos: conta(["pronto"]),
      entrega: conta(["aguardando_motoboy", "em_rota"]),
    };
  }, [lista]);

  /* Vendas por hora (somente hoje) */
  const porHora = useMemo(() => {
    const horas: { rotulo: string; total: number; pedidos: number }[] = [];
    for (let h = 0; h < 24; h++)
      horas.push({ rotulo: `${String(h).padStart(2, "0")}h`, total: 0, pedidos: 0 });
    for (const p of doDia) {
      const h = new Date(p.created_at).getHours();
      const cel = horas[h];
      if (!cel) continue;
      cel.total += Number(p.total) || 0;
      cel.pedidos += 1;
    }
    const first = horas.findIndex((h) => h.pedidos > 0);
    if (first === -1) return horas.slice(9, 23);
    let last = first;
    horas.forEach((h, i) => {
      if (h.pedidos > 0) last = i;
    });
    return horas.slice(Math.max(0, first - 1), Math.min(24, last + 2));
  }, [doDia]);

  /* Pedidos por modalidade (tipo_entrega real) */
  const porModalidade = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of doDia) {
      const key = String(p.tipo_entrega ?? "outros");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const cores: Record<string, string> = {
      entrega: ERP_COLORS.blue,
      retirada: ERP_COLORS.green,
      balcao: ERP_COLORS.green,
      delivery: ERP_COLORS.blue,
    };
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, cor: cores[name] ?? ERP_COLORS.gold }))
      .sort((a, b) => b.value - a.value);
  }, [doDia]);

  const recentes = useMemo(
    () =>
      [...doDia]
        .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 5),
    [doDia],
  );

  const prodPorNome = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of produtos ?? []) m.set(String(p.nome), p);
    return m;
  }, [produtos]);

  const topProdutos = useMemo(() => {
    const map = new Map<string, { nome: string; qtd: number; total: number }>();
    for (const p of lista) {
      if (p.status === "cancelado") continue;
      for (const i of (p as any).pedido_itens ?? []) {
        const cur = map.get(i.nome) ?? { nome: i.nome, qtd: 0, total: 0 };
        cur.qtd += i.quantidade;
        cur.total += Number(i.preco_unitario) * i.quantidade;
        map.set(i.nome, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  }, [lista]);

  const emFaltaProdutos = useMemo(
    () =>
      (produtos ?? []).filter(
        (p: any) =>
          Number(p.estoque_minimo ?? 0) > 0 && Number(p.estoque ?? 0) < Number(p.estoque_minimo),
      ),
    [produtos],
  );
  const emFalta = emFaltaProdutos.length;

  const { data: caixa } = useQuery({
    queryKey: ["dash-caixa-atual"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_sessoes")
        .select("aberta_em")
        .eq("status", "aberta")
        .order("aberta_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as any;
    },
  });

  const { data: filaCount } = useQuery({
    queryKey: ["dash-fila-pendentes"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("fila_impressao")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (error) throw error;
      return count ?? 0;
    },
  });

  /* Alertas com base em dados reais */
  const alertas = useMemo(
    () => [
      ...(emFalta > 0
        ? [
            {
              id: "estoque",
              titulo: "Estoque baixo",
              desc: `${emFalta} produto(s) abaixo do mínimo`,
              tom: "perigo" as const,
              aba: "insumos",
            },
          ]
        : []),
      ...(!caixa
        ? [
            {
              id: "caixa",
              titulo: "Caixa fechado",
              desc: "Nenhuma sessão de caixa aberta",
              tom: "atencao" as const,
              aba: "financeiro",
            },
          ]
        : []),
      ...(porStatus.novos > 0
        ? [
            {
              id: "novos",
              titulo: "Pedidos aguardando aceite",
              desc: `${porStatus.novos} pedido(s) recebido(s)`,
              tom: "info" as const,
              aba: "pedidos",
            },
          ]
        : []),
      ...(filaCount > 0
        ? [
            {
              id: "impressao",
              titulo: "Fila de impressão",
              desc: `${filaCount} trabalho(s) pendente(s)`,
              tom: "neutro" as const,
              aba: "impressao",
            },
          ]
        : []),
    ],
    [emFalta, caixa, porStatus.novos, filaCount],
  );

  const tooltipStyle = {
    background: "#17150F",
    border: "1px solid #D4A94A",
    borderRadius: 10,
    fontSize: 12,
    color: "#F4F1EA",
    boxShadow: "0 8px 24px -10px rgba(0,0,0,.7)",
  } as const;

  /* Canais do donut — mesmos nomes da referência (pedido real por tipo). */
  const canais = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of doDia) {
      const key = String(p.tipo_entrega ?? "outros");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const ordem = ["entrega", "delivery", "retirada", "balcao", "outros", "encomenda"];
    const rotulo = (k: string) =>
      k === "entrega" || k === "delivery"
        ? "Delivery"
        : k === "retirada" || k === "balcao"
          ? "Balcão"
          : k === "encomenda"
            ? "Encomendas"
            : "Outros";
    return [...map.entries()]
      .map(([k, v]) => ({
        key: k,
        nome: rotulo(k),
        valor: v,
        pct: doDia.length > 0 ? Math.round((v / doDia.length) * 100) : 0,
        cor:
          k === "entrega" || k === "delivery"
            ? ERP_COLORS.gold
            : k === "retirada" || k === "balcao"
              ? ERP_COLORS.orange
              : ERP_COLORS.green,
        icone:
          k === "entrega" || k === "delivery"
            ? Bike
            : k === "retirada" || k === "balcao"
              ? Store
              : MessageCircle,
      }))
      .sort((a, b) => ordem.indexOf(a.key) - ordem.indexOf(b.key));
  }, [doDia]);

  const totalPedidos = doDia.length;

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------------------
          PAINEL DE GESTÃO — composição da referência oficial:
          cabeçalho (marca + título + seletor de data) | 4 métricas |
          2 gráficos | 3 blocos (mais vendidos, últimos pedidos, alertas)
      ------------------------------------------------------------------ */}
      <section className="overflow-hidden rounded-2xl border border-[#D4A94A] bg-[#121110] shadow-card">
        <PainelCabecalho
          titulo="Painel de Gestão"
          subtitulo="Visão completa do seu negócio em tempo real"
          marca={
            <span className="grid size-10 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
              <Crown className="size-5 text-[#F2CE6B]" aria-hidden />
            </span>
          }
          acoes={
            <label className="flex min-h-[40px] items-center gap-2 rounded-xl border border-[#D4A94A] bg-[#1A1712] px-3">
              <CalendarDays className="size-4 shrink-0 text-[#F2CE6B]" aria-hidden />
              <span className="text-xs font-medium text-foreground">
                {dataLonga(new Date())}
              </span>
              <select
                aria-label="Período do painel"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as PeriodoKey)}
                className="max-w-[9rem] cursor-pointer bg-transparent text-[11px] uppercase tracking-wide text-muted-foreground outline-none"
              >
                {(Object.keys(PERIODO_LABEL) as PeriodoKey[]).map((k) => (
                  <option key={k} value={k} className="bg-[#17150F] text-foreground">
                    {PERIODO_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          }
        />

        <div className="space-y-3 p-3 sm:p-4">
          {/* Linha 1 — 4 métricas */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PainelMetrica
              icone={Banknote}
              label="Vendas do Dia"
              valor={brl(fatDia)}
              delta={<Delta delta={dFat} />}
              cor={ERP_COLORS.green}
              onClick={() => setAba("financeiro")}
            />
            <PainelMetrica
              icone={ShoppingCart}
              label="Pedidos"
              valor={String(totalPedidos)}
              delta={<Delta delta={dPedidos} />}
              cor={ERP_COLORS.blue}
              onClick={() => setAba("pedidos")}
            />
            <PainelMetrica
              icone={Calculator}
              label="Ticket Médio"
              valor={brl(ticketMedio)}
              delta={<Delta delta={dPedidos} />}
              cor={ERP_COLORS.orange}
              onClick={() => setAba("financeiro")}
            />
            <PainelMetrica
              icone={Users}
              label="Clientes Ativos"
              valor={String(ativos30.length)}
              delta={<Delta delta={dPedidos} />}
              cor={ERP_COLORS.gold}
              onClick={() => setAba("clientes")}
            />
          </div>

          {/* Linha 2 — Vendas por hora + Pedidos por canal */}
          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <ChartCard titulo="Vendas por Hora" altura="h-[260px]">
              <div className="h-[236px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={porHora} margin={{ left: -12, right: 8, top: 10 }}>
                  <defs>
                    <linearGradient id="gradVendasHora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F2CE6B" stopOpacity={0.42} />
                      <stop offset="100%" stopColor="#F2CE6B" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(201,162,75,.18)" />
                  <XAxis
                    dataKey="rotulo"
                    tick={{ fontSize: 10, fill: "#A09A8E" }}
                    axisLine={{ stroke: "rgba(201,162,75,.26)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(1)}k`}
                    tick={{ fontSize: 10, fill: "#A09A8E" }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#A09A8E" }}
                    formatter={(v: number) => [brl(v), "Vendas"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#F2CE6B"
                    strokeWidth={2.5}
                    fill="url(#gradVendasHora)"
                    dot={{ r: 3, fill: "#F2CE6B", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#F2CE6B", strokeWidth: 0 }}
                    name="Vendas"
                  />
                </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard titulo="Pedidos por Canal" altura="h-[260px]">
              <div className="flex h-[236px] items-center gap-3">
                <div className="relative h-[210px] w-[48%] min-w-[150px] shrink-0">
                  {canais.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={canais}
                          dataKey="valor"
                          nameKey="nome"
                          innerRadius="58%"
                          outerRadius="92%"
                          paddingAngle={3}
                          stroke="none"
                        >
                          {canais.map((c) => (
                            <Cell key={c.key} fill={c.cor} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelStyle={{ color: "#A09A8E" }}
                          formatter={(v: number, name: string) => [`${v} pedido(s)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="font-display text-2xl font-bold leading-none text-foreground">
                        {totalPedidos}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Pedidos
                      </p>
                    </div>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {canais.length > 0 ? (
                    canais.map((c) => {
                      const Icone = c.icone;
                      return (
                        <li key={c.key} className="flex items-center gap-2">
                          <span
                            className="grid size-7 shrink-0 place-items-center rounded-lg"
                            style={{ backgroundColor: `${c.cor}26`, color: c.cor }}
                          >
                            <Icone className="size-3.5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {c.nome}
                          </span>
                          <span className="text-xs font-bold text-foreground">{c.pct}%</span>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-xs text-muted-foreground">Sem pedidos no período.</li>
                  )}
                </ul>
              </div>
            </ChartCard>
          </div>

          {/* Linha 3 — mais vendidos, últimos pedidos, alertas */}
          <div className="grid gap-3 lg:grid-cols-3">
            <SectionCard titulo="Produtos Mais Vendidos">
              {topProdutos.length > 0 ? (
                <ol className="space-y-1">
                  {topProdutos.map((t, i) => {
                    const prod = prodPorNome.get(t.nome) as any;
                    const img = prod ? imagemProduto(prod.imagem_url, prod.categorias?.slug) : hero;
                    return (
                      <li key={t.nome} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                        <img
                          src={img}
                          alt=""
                          className="size-8 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-xs font-semibold text-foreground">{t.nome}</p>
                          <p className="text-[11px] text-muted-foreground">{t.qtd} un</p>
                        </div>
                        <span className="text-xs font-bold text-[#F2CE6B]">{brl(t.total)}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState titulo="Sem vendas ainda" />
              )}
            </SectionCard>

            <SectionCard
              titulo="Últimos Pedidos"
              acoes={
                <button
                  type="button"
                  onClick={() => setAba("pedidos")}
                  className="text-[11px] text-muted-foreground underline hover:text-foreground"
                >
                  Ver todos
                </button>
              }
              bodyClassName="p-0"
            >
              {recentes.length > 0 ? (
                <ul className="divide-y divide-[#2A2721]">
                  {recentes.map((p: any) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPedidoFoco(String(p.numero));
                          setAba("pedidos");
                        }}
                        className="flex min-h-[42px] w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#1E1C16]"
                      >
                        <span
                          className="inline-block size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: corStatus(p.status) }}
                          aria-hidden
                        />
                        <span className="font-display font-bold text-foreground">#{p.numero}</span>
                        <span className="text-muted-foreground">{hora(p.created_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {rotuloCanal(p.tipo_entrega)}
                        </span>
                        <span className="font-semibold text-[#F2CE6B]">{brl(p.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3">
                  <EmptyState titulo="Nenhum pedido hoje" />
                </div>
              )}
            </SectionCard>

            <SectionCard titulo="Alertas">
              {alertas.length > 0 ? (
                <ul className="space-y-1.5">
                  {alertas.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setAba(a.aba)}
                        className="flex w-full items-center gap-2 rounded-lg border border-[#2A2721] bg-[#17150F] px-2.5 py-2 text-left hover:border-[#D4A94A]"
                      >
                        <span
                          className="grid size-6 shrink-0 place-items-center rounded-md"
                          style={{
                            backgroundColor: `${corAlerta(a.tom)}26`,
                            color: corAlerta(a.tom),
                          }}
                        >
                          <TriangleAlert className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-xs font-semibold text-foreground">{a.titulo}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{a.desc}</p>
                        </div>
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-1 py-3 text-xs text-[#35C97C]">
                  <span className="inline-block size-2 rounded-full bg-[#35C97C]" aria-hidden />
                  Tudo em ordem — nenhum alerta ativo.
                </p>
              )}
            </SectionCard>
          </div>
        </div>
      </section>

      {/* Blocos funcionais preservados (busca, operação, atalhos, avisos) */}
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <BuscaGlobal
            termo={busca}
            onTermo={setBusca}
            pedidos={lista}
            produtos={produtos ?? []}
            profiles={profiles ?? []}
            onIrPedido={(numero) => {
              setPedidoFoco(String(numero));
              setAba("pedidos");
            }}
            onIrProduto={(nome) => {
              setProdutoFoco(nome);
              setAba("produtos");
            }}
            onIrCliente={(nome) => {
              setClienteFoco(nome);
              setAba("clientes");
            }}
          />


        <CentralOperacao
          pedidos={lista}
          produtos={produtos ?? []}
          clientes={clientesStats ?? []}
          periodo={periodo}
          setPeriodo={setPeriodo}
          setAba={setAba}
          notLidas={notLidas}
          marcarLida={marcarLida}
        />

        {/* Acesso rápido por módulo */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ModuloCard
            icone={Wallet}
            titulo="Financeiro"
            linha1="Movimentação do dia"
            valor={brl(fatDia)}
            onClick={() => setAba("financeiro")}
          />
          <ModuloCard
            icone={Wheat}
            titulo="Estoque"
            linha1="Itens em falta"
            valor={String(emFalta)}
            alerta={emFalta > 0}
            onClick={() => setAba("insumos")}
          />
          <ModuloCard
            icone={ChefHat}
            titulo="Produção"
            linha1="Em andamento"
            valor={`${porStatus.producao} pedidos`}
            onClick={() => navigate({ to: "/producao" })}
          />
          <ModuloCard
            icone={Truck}
            titulo="Entregas"
            linha1="Em rota"
            valor={`${porStatus.entrega} pedidos`}
            onClick={() => navigate({ to: "/central-entregas" })}
          />
        </div>
      </div>

      {/* Coluna direita */}
      <aside className="w-full shrink-0 space-y-4 xl:w-64">
        <section
          className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          aria-label="Ações rápidas"
        >
          <h2 className="text-sm font-bold">Ações Rápidas</h2>
          <div className="mt-2 space-y-1.5">
            <Acao
              icone={ShoppingCart}
              label="Novo Pedido"
              onClick={() => navigate({ to: "/pdv" })}
            />
            <Acao icone={Search} label="Consulta de Pedidos" onClick={() => setAba("pedidos")} />
            <Acao
              icone={Calculator}
              label="Calculadora"
              onClick={() => navigate({ to: "/calculadora" })}
            />
            <Acao icone={Heart} label="Favoritos" onClick={() => setAba("produtos")} />
            <Acao icone={Repeat2} label="Repetir Pedido" onClick={() => navigate({ to: "/pdv" })} />
          </div>
        </section>

        <section
          className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          aria-label="Caixa atual"
        >
          <h2 className="text-sm font-bold">Caixa Atual</h2>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm font-semibold">Caixa</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                caixa
                  ? "bg-[rgba(33,131,93,.12)] text-[#21835D]"
                  : "bg-[rgba(15,23,42,.06)] text-[#64748B]"
              }`}
            >
              {caixa ? "Aberto" : "Fechado"}
            </span>
          </div>
          {caixa ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Aberto às {hora(caixa.aberta_em)} •{" "}
              <button type="button" className="underline" onClick={() => setAba("financeiro")}>
                ver caixa
              </button>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhuma sessão aberta •{" "}
              <button type="button" className="underline" onClick={() => setAba("financeiro")}>
                abrir no financeiro
              </button>
            </p>
          )}
        </section>

        <section
          className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          aria-label="Impressão"
        >
          <div className="flex items-center gap-2">
            <Printer className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-sm font-bold">Impressão</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {filaCount === 0 ? "Fila zerada." : `${filaCount} trabalho(s) pendente(s).`}{" "}
            <button type="button" className="underline" onClick={() => setAba("impressao")}>
              ver fila
            </button>
          </p>
        </section>

        <div className="relative overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
          <img src={hero} alt="Salgados Néia" className="h-44 w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="absolute bottom-2 left-3 right-3 text-sm font-bold italic text-white">
            Mais que salgados, é tradição!
          </p>
        </div>
      </aside>
      </div>
    </div>
  );
}

/** Delta real vs. ontem — sem dado base, mostra "—". */
function Delta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[10px] text-muted-foreground">vs. ontem —</span>;
  const up = delta >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-semibold"
      style={{ color: up ? ERP_COLORS.green : ERP_COLORS.red }}
    >
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

/** Data por extenso em pt-BR (ex.: "Hoje, 23 de abril de 2026"). */
function dataLonga(d: Date): string {
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const texto = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  return mesmoDia ? `Hoje, ${texto}` : texto;
}

/** Cor do ponto de status do pedido (mesma usada nos badges do sistema). */
function corStatus(status: string): string {
  switch (status) {
    case "pronto":
      return ERP_COLORS.green;
    case "em_producao":
      return ERP_COLORS.blue;
    case "aguardando_motoboy":
    case "em_rota":
      return ERP_COLORS.orange;
    case "cancelado":
      return ERP_COLORS.red;
    default:
      return ERP_COLORS.gold;
  }
}

/** Canal do pedido no mesmo vocabulário da referência. */
function rotuloCanal(tipo: string | null | undefined): string {
  const t = String(tipo ?? "").toLowerCase();
  if (t === "entrega" || t === "delivery") return "Delivery";
  if (t === "retirada" || t === "balcao") return "Balcão";
  if (t === "encomenda") return "Encomendas";
  return "Outros";
}

/** Cor do ícone do alerta conforme a severidade. */
function corAlerta(tom: string): string {
  switch (tom) {
    case "perigo":
      return ERP_COLORS.red;
    case "atencao":
      return ERP_COLORS.orange;
    case "info":
      return ERP_COLORS.blue;
    case "ok":
      return ERP_COLORS.green;
    default:
      return ERP_COLORS.gold;
  }
}

function Acao({
  icone: Icone,
  label,
  onClick,
}: {
  icone: any;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[#F5EBD2]"
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-md text-[#202B3A]"
        style={{ backgroundColor: ERP_COLORS.gold }}
      >
        <Icone className="size-4" aria-hidden />
      </span>
      {label}
    </button>
  );
}

function ModuloCard({
  icone: Icone,
  titulo,
  linha1,
  valor,
  alerta,
  onClick,
}: {
  icone: any;
  titulo: string;
  linha1: string;
  valor: string;
  alerta?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] rounded-xl border border-[#E5E7EB] bg-white p-4 text-left shadow-card transition-colors hover:border-[rgba(196,154,67,.55)]"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-[#A9813A]">
        <Icone className="size-4" aria-hidden />
        {titulo}
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">{linha1}</span>
      <span className={`block font-display text-xl ${alerta ? "text-[#DC2626]" : ""}`}>{valor}</span>
    </button>
  );
}

function BuscaGlobal({
  termo,
  onTermo,
  pedidos,
  produtos,
  profiles,
  onIrPedido,
  onIrProduto,
  onIrCliente,
}: {
  termo: string;
  onTermo: (t: string) => void;
  pedidos: any[];
  produtos: any[];
  profiles: any[];
  onIrPedido: (numero: number) => void;
  onIrProduto: (nome: string) => void;
  onIrCliente: (nome: string) => void;
}) {
  const t = termo.trim().toLowerCase();
  const ped = t
    ? pedidos
        .filter(
          (p: any) =>
            String(p.numero).includes(t) ||
            (p.cliente_nome ?? "").toLowerCase().includes(t) ||
            (p.telefone ?? "").includes(t),
        )
        .slice(0, 5)
    : [];
  const prods = t
    ? produtos.filter((p: any) => (p.nome ?? "").toLowerCase().includes(t)).slice(0, 5)
    : [];
  const clis = t
    ? profiles
        .filter(
          (p: any) => (p.nome ?? "").toLowerCase().includes(t) || (p.telefone ?? "").includes(t),
        )
        .slice(0, 5)
    : [];
  const temResultado = ped.length + prods.length + clis.length > 0;
  return (
    <section
      className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
      aria-label="Pesquisa global"
    >
      <Input
        value={termo}
        onChange={(e) => onTermo(e.target.value)}
        placeholder="🔎 Buscar pedido nº, cliente, telefone ou produto…"
        className="max-w-xl"
      />
      {t ? (
        <div className="mt-3 space-y-2 text-sm">
          {!temResultado ? (
            <p className="text-muted-foreground">Nenhum resultado para “{termo.trim()}”.</p>
          ) : null}
          {ped.map((p: any) => (
            <PedidoLinha
              key={p.id}
              p={p}
              onClick={() => {
                onIrPedido(p.numero);
                onTermo("");
              }}
            />
          ))}
          {prods.map((p: any) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onIrProduto(p.nome);
                onTermo("");
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted"
            >
              <span className="font-semibold">{p.nome}</span>
              <span className="ml-auto text-muted-foreground">
                {brl(p.preco_promocional ?? p.preco)}
              </span>
            </button>
          ))}
          {clis.map((p: any) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onIrCliente(p.nome ?? p.telefone ?? "");
                onTermo("");
              }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted"
            >
              <span className="font-semibold">{p.nome || "Sem nome"}</span>
              <span className="text-muted-foreground">{p.telefone || ""}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PedidoLinha({ p, onClick }: { p: any; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted"
    >
      <span className="font-display">Pedido nº {p.numero}</span>
      <StatusBadge status={p.status} />
      <span className="text-muted-foreground">
        {p.cliente_nome} • {dataHora(p.created_at)}
      </span>
      <span className="ml-auto font-semibold text-primary">{brl(p.total)}</span>
    </button>
  );
}
