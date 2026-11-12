import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  ChefHat,
  ChevronRight,
  Heart,
  Printer,
  Repeat2,
  Search,
  ShoppingCart,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { CentralOperacao } from "@/components/central-operacao";
import { StatusBadge } from "@/components/status-steps";
import { EmptyState } from "@/components/admin/ui-admin";
import {
  ERP_COLORS,
  MetricCard,
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
    background: "#1A1E20",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 8,
    fontSize: 12,
    color: "#F6F7F7",
  } as const;

  return (
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

        {/* Linha 1 — 4 métricas */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            icone={Banknote}
            label="Vendas do Dia"
            valor={brl(fatDia)}
            detalhe={<Delta delta={dFat} />}
            onClick={() => setAba("financeiro")}
          />
          <MetricCard
            icone={ShoppingCart}
            label="Pedidos do Dia"
            valor={String(doDia.length)}
            detalhe={<Delta delta={dPedidos} />}
            cor={ERP_COLORS.blue}
            onClick={() => setAba("pedidos")}
          />
          <MetricCard
            icone={Calculator}
            label="Ticket Médio"
            valor={brl(ticketMedio)}
            detalhe={doDia.length > 0 ? `${doDia.length} pedido(s)` : "—"}
            cor={ERP_COLORS.green}
            onClick={() => setAba("financeiro")}
          />
          <MetricCard
            icone={Users}
            label="Clientes Ativos"
            valor={String(ativos30.length)}
            detalhe="últimos 30 dias"
            cor={ERP_COLORS.orange}
            onClick={() => setAba("clientes")}
          />
        </div>

        {/* Faixa de status operacionais (dados reais, navegação preservada) */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: "Novos", v: porStatus.novos, cor: ERP_COLORS.gold },
              { label: "Em Produção", v: porStatus.producao, cor: ERP_COLORS.blue },
              { label: "Prontos", v: porStatus.prontos, cor: ERP_COLORS.green },
              { label: "Em Entrega", v: porStatus.entrega, cor: ERP_COLORS.orange },
            ] as const
          ).map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setAba("pedidos")}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,.08)] bg-[#15191B] px-3 py-1.5 text-xs text-[#C7CCCE] transition-colors hover:border-[rgba(226,160,52,.55)]"
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: s.cor }}
                aria-hidden
              />
              {s.label}
              <b className="font-display text-sm" style={{ color: s.cor }}>
                {s.v}
              </b>
            </button>
          ))}
        </div>

        {/* Linha 2 — 2 gráficos */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard titulo="Vendas por Hora (hoje)" altura="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={porHora} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,.08)"
                />
                <XAxis
                  dataKey="rotulo"
                  tick={{ fontSize: 10, fill: "#90989C" }}
                  axisLine={{ stroke: "rgba(255,255,255,.15)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(1)}k`}
                  tick={{ fontSize: 10, fill: "#90989C" }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "#C7CCCE" }}
                  formatter={(v: number) => [brl(v), "Vendas"]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={ERP_COLORS.gold}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: ERP_COLORS.goldBright, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: ERP_COLORS.goldBright, strokeWidth: 0 }}
                  name="Vendas"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard titulo="Pedidos por Modalidade (hoje)" altura="h-60">
            {porModalidade.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={porModalidade}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="52%"
                    outerRadius="82%"
                    paddingAngle={3}
                    stroke="none"
                  >
                    {porModalidade.map((m) => (
                      <Cell key={m.name} fill={m.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#C7CCCE" }}
                    formatter={(v: number, name: string) => [`${v} pedido(s)`, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    formatter={(value) => (
                      <span
                        style={{
                          color: "#C7CCCE",
                          fontSize: 11,
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center">
                <EmptyState titulo="Sem pedidos hoje" />
              </div>
            )}
          </ChartCard>
        </div>

        {/* Linha 3 — 3 cards: últimos pedidos, mais vendidos, alertas */}
        <div className="grid gap-3 lg:grid-cols-3">
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
              <ul className="divide-y divide-[rgba(255,255,255,.06)]">
                {recentes.map((p: any) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPedidoFoco(String(p.numero));
                        setAba("pedidos");
                      }}
                      className="flex min-h-[46px] w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[rgba(255,255,255,.03)]"
                    >
                      <span className="font-display font-bold text-[#F4B942]">#{p.numero}</span>
                      <span className="min-w-0 flex-1 truncate">{p.cliente_nome}</span>
                      <span className="font-semibold">{brl(p.total)}</span>
                      <span className="text-muted-foreground">{hora(p.created_at)}</span>
                      <StatusBadge status={p.status} />
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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

          <SectionCard
            titulo="Mais Vendidos"
            acoes={
              <button
                type="button"
                onClick={() => setAba("produtos")}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Ver todos
              </button>
            }
          >
            {topProdutos.length > 0 ? (
              <ol className="space-y-1">
                {topProdutos.map((t, i) => {
                  const prod = prodPorNome.get(t.nome) as any;
                  const img = prod ? imagemProduto(prod.imagem_url, prod.categorias?.slug) : hero;
                  return (
                    <li key={t.nome} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#141414]"
                        style={{ backgroundColor: ERP_COLORS.gold }}
                      >
                        {i + 1}
                      </span>
                      <img
                        src={img}
                        alt=""
                        className="size-9 shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-xs font-semibold">{t.nome}</p>
                        <p className="text-[11px] text-muted-foreground">{t.qtd} un.</p>
                      </div>
                      <span className="text-xs font-bold">{brl(t.total)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState titulo="Sem vendas ainda" />
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
                      className="flex w-full items-center gap-2 rounded-lg border border-[rgba(255,255,255,.06)] bg-[#1A1E20] px-2.5 py-2 text-left hover:border-[rgba(226,160,52,.5)]"
                    >
                      <TriangleAlert
                        className="size-4 shrink-0 text-[#F5A34A]"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-xs font-semibold">{a.titulo}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{a.desc}</p>
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-1 py-3 text-xs text-[#2ED988]">
                <span className="inline-block size-2 rounded-full bg-[#11B96A]" aria-hidden />
                Tudo em ordem — nenhum alerta ativo.
              </p>
            )}
          </SectionCard>
        </div>

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
                  ? "bg-[rgba(17,185,106,.18)] text-[#2ED988]"
                  : "bg-[rgba(255,255,255,.08)] text-[#90989C]"
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
  );
}

/** Delta real vs. ontem — sem dado base, mostra "—". */
function Delta({ delta }: { delta: number | null }) {
  if (delta == null) return <span>vs. ontem —</span>;
  const up = delta >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-semibold"
      style={{ color: up ? ERP_COLORS.green : ERP_COLORS.red }}
    >
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      {Math.abs(delta).toFixed(0)}% vs. ontem
    </span>
  );
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
      className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[rgba(244,185,66,.12)]"
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-md text-[#141414]"
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
      className="min-h-[44px] rounded-xl border border-[rgba(255,255,255,.08)] bg-[#15191B] p-4 text-left shadow-[0_6px_18px_rgba(0,0,0,.28)] transition-colors hover:border-[rgba(226,160,52,.55)]"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-[#F4B942]">
        <Icone className="size-4" aria-hidden />
        {titulo}
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">{linha1}</span>
      <span className={`block font-display text-xl ${alerta ? "text-[#F08374]" : ""}`}>{valor}</span>
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
