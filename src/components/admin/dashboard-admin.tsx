import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Heart,
  Minus,
  Printer,
  Repeat2,
  Search,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Wheat,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { CentralOperacao } from "@/components/central-operacao";
import { StatusBadge } from "@/components/status-steps";
import { EmptyState, StatusCard } from "@/components/admin/ui-admin";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { imagemProduto } from "@/lib/catalog";
import { brl, dataHora, hora } from "@/lib/format";
import type { PeriodoKey } from "@/lib/operacao";
import fritos from "@/assets/cat-fritos.jpg";
import hero from "@/assets/hero.jpg";

/**
 * Dashboard do Admin no visual do mockup (Projeto A1).
 * Layout igual à referência; todos os números vêm das consultas reais.
 * Sem deltas inventados: "vs. ontem" só aparece com base calculada;
 * sem base, mostra "—". Blocos funcionais (busca, operação) preservados.
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

  const ultimos7 = useMemo(() => {
    const dias: { rotulo: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      const total = lista
        .filter(
          (p: any) => new Date(p.created_at).toDateString() === ds && p.status !== "cancelado",
        )
        .reduce((a: number, p: any) => a + (Number(p.total) || 0), 0);
      dias.push({
        rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        total,
      });
    }
    return dias;
  }, [lista]);

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

  const emFalta = useMemo(
    () =>
      (produtos ?? []).filter(
        (p: any) =>
          Number(p.estoque_minimo ?? 0) > 0 && Number(p.estoque ?? 0) < Number(p.estoque_minimo),
      ).length,
    [produtos],
  );

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

        {/* Linha 1: banner + KPIs */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="relative min-h-44 overflow-hidden rounded-xl shadow-[var(--shadow-card)]">
            <img
              src={fritos}
              alt="Salgados Néia"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
            <div className="relative p-5">
              <p className="font-display text-3xl font-bold text-yellow-400">Néia Salgados</p>
              <p className="mt-1 text-sm italic text-white">O sabor que faz a diferença</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Kpi
              icone={ShoppingCart}
              rotulo="Pedidos Hoje"
              valor={String(doDia.length)}
              delta={dPedidos}
              base="vs. ontem"
              onClick={() => setAba("pedidos")}
            />
            <Kpi
              icone={Banknote}
              rotulo="Faturamento Hoje"
              valor={brl(fatDia)}
              delta={dFat}
              base="vs. ontem"
              onClick={() => setAba("financeiro")}
            />
            <Kpi
              icone={Users}
              rotulo="Clientes Ativos"
              valor={String(ativos30.length)}
              delta={null}
              base="últimos 30 dias"
              onClick={() => setAba("clientes")}
            />
          </div>
        </div>

        {/* Linha 2: status + gráfico 7 dias */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-2 lg:grid-cols-4">
            <StatusCard
              className="bg-yellow-400 text-black"
              icone={Clock}
              titulo="Novos"
              valor={porStatus.novos}
              onClick={() => setAba("pedidos")}
            />
            <StatusCard
              className="bg-blue-600 text-white"
              icone={ChefHat}
              titulo="Em Produção"
              valor={porStatus.producao}
              onClick={() => setAba("pedidos")}
            />
            <StatusCard
              className="bg-green-500 text-white"
              icone={CheckCircle2}
              titulo="Prontos"
              valor={porStatus.prontos}
              onClick={() => setAba("pedidos")}
            />
            <StatusCard
              className="bg-purple-500 text-white"
              icone={Truck}
              titulo="Em Entrega"
              valor={porStatus.entrega}
              onClick={() => setAba("pedidos")}
            />
          </div>
          <section
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            aria-label="Vendas dos últimos 7 dias"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Vendas dos Últimos 7 Dias</h2>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                7 dias
              </span>
            </div>
            <div className="mt-2 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ultimos7} margin={{ left: -8, right: 4, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
                  <YAxis
                    tickFormatter={(v) => `R$ ${(Number(v) / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="total" fill="#facc15" radius={[4, 4, 0, 0]} name="Vendas" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Linha 3: recentes + mais vendidos */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] lg:col-span-2"
            aria-label="Pedidos recentes"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Pedidos Recentes</h2>
              <button
                type="button"
                onClick={() => setAba("pedidos")}
                className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
              >
                Ver todos
              </button>
            </div>
            {recentes.length > 0 ? (
              <ul className="mt-1 divide-y divide-border">
                <li className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground sm:grid-cols-[64px_1fr_64px_88px_110px_56px_24px]">
                  <span>Nº</span>
                  <span>Cliente</span>
                  <span className="hidden sm:block">Itens</span>
                  <span>Total</span>
                  <span className="hidden sm:block">Status</span>
                  <span className="hidden sm:block">Horário</span>
                  <span />
                </li>
                {recentes.map((p: any) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPedidoFoco(String(p.numero));
                        setAba("pedidos");
                      }}
                      className="grid min-h-[44px] w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded px-1 py-1.5 text-left text-xs hover:bg-muted sm:grid-cols-[64px_1fr_64px_88px_110px_56px_24px] sm:text-[13px]"
                    >
                      <span className="font-bold">#{p.numero}</span>
                      <span className="truncate">{p.cliente_nome}</span>
                      <span className="hidden text-muted-foreground sm:block">
                        {(p.pedido_itens ?? []).reduce(
                          (s: number, i: any) => s + (Number(i.quantidade) || 0),
                          0,
                        )}{" "}
                        un.
                      </span>
                      <span className="font-semibold">{brl(p.total)}</span>
                      <span className="hidden sm:block">
                        <StatusBadge status={p.status} />
                      </span>
                      <span className="hidden text-muted-foreground sm:block">
                        {hora(p.created_at)}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2">
                <EmptyState titulo="Nenhum pedido hoje" />
              </div>
            )}
          </section>

          <section
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            aria-label="Produtos mais vendidos"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Produtos Mais Vendidos</h2>
              <button
                type="button"
                onClick={() => setAba("produtos")}
                className="min-h-[44px] px-2 text-xs text-muted-foreground underline"
              >
                Ver todos
              </button>
            </div>
            {topProdutos.length > 0 ? (
              <ol className="mt-1 space-y-1">
                {topProdutos.map((t, i) => {
                  const prod = prodPorNome.get(t.nome) as any;
                  const img = prod ? imagemProduto(prod.imagem_url, prod.categorias?.slug) : hero;
                  return (
                    <li key={t.nome} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-yellow-400 text-[11px] font-bold text-black">
                        {i + 1}
                      </span>
                      <img
                        src={img}
                        alt=""
                        className="size-9 shrink-0 rounded object-cover"
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
              <div className="mt-2">
                <EmptyState titulo="Sem vendas ainda" />
              </div>
            )}
          </section>
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

        {/* Linha 4: cartões escuros por módulo */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${caixa ? "bg-green-500 text-white" : "bg-neutral-300 text-neutral-700"}`}
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

function Kpi({
  icone: Icone,
  rotulo,
  valor,
  delta,
  base,
  onClick,
}: {
  icone: any;
  rotulo: string;
  valor: string;
  delta: number | null;
  base: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] rounded-xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-yellow-400"
    >
      <span className="inline-grid place-items-center rounded-lg bg-yellow-100 p-2 text-yellow-800">
        <Icone className="size-5" aria-hidden />
      </span>
      <span className="mt-2 block text-xs text-muted-foreground">{rotulo}</span>
      <span className="block font-display text-2xl">{valor}</span>
      <span className="mt-0.5 flex items-center gap-1 text-xs">
        {delta == null ? (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <Minus className="size-3" aria-hidden />—
          </span>
        ) : delta >= 0 ? (
          <span className="flex items-center gap-0.5 font-bold text-green-600">
            <ArrowUpRight className="size-3" aria-hidden />
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : (
          <span className="flex items-center gap-0.5 font-bold text-red-600">
            <ArrowDownRight className="size-3" aria-hidden />
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        <span className="text-muted-foreground">{base}</span>
      </span>
    </button>
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
      className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-left text-sm font-semibold hover:bg-yellow-100"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-yellow-400 text-black">
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
      className="min-h-[44px] rounded-xl bg-neutral-950 p-4 text-left text-white shadow-[var(--shadow-card)] transition-opacity hover:opacity-90"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-yellow-400">
        <Icone className="size-4" aria-hidden />
        {titulo}
      </span>
      <span className="mt-2 block text-xs text-neutral-400">{linha1}</span>
      <span className={`block font-display text-xl ${alerta ? "text-red-400" : ""}`}>{valor}</span>
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
