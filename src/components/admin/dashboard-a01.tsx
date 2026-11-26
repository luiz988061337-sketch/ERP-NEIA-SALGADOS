import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Bike,
  CalendarDays,
  ChefHat,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Coins,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  UserRound,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { brl } from "@/lib/format";
import { TarefasA01 } from "@/components/admin/tarefas-a01";
import { gerarRecomendacoesNeia, rotuloNaturezaNeia } from "@/lib/neia-inteligencia";
import { estadoMaisRecente, useRecomendacoesA02 } from "@/lib/neia-recomendacoes";
import { rotuloSituacaoRecomendacao, situacaoEfetiva } from "@/lib/neia-recomendacoes-estado";
import { tarefasAtrasadas, useTarefasA01, type SugestaoTarefaA01 } from "@/lib/tarefas-a01";
import { hojeSP } from "@/lib/competencia";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import {
  cargaCozinha,
  contem,
  deslocarDia,
  faixaAnterior,
  faixaDashboard,
  margemDashboard,
  mediaMinutos,
  pertenceAoGrupo,
  resumirClientes,
  resumirVendas,
  serieVendas,
  STATUS_DASHBOARD,
  variacao,
  type FaixaDashboard,
  type GrupoPedido,
} from "@/lib/dashboard-a01";
import {
  financeiroDashboard,
  useBuscaDashboard,
  useClientesDashboard,
  useDadosDashboard,
  useInicioRotasDashboard,
} from "@/lib/dashboard-a01-dados";

type Props = {
  usuarioId: string;
  email?: string | null;
  abrirPedidos: (faixa?: FaixaDashboard, grupo?: GrupoPedido, pedidoId?: string) => void;
  abrirCadastro: (tipo: "produtos" | "clientes", busca: string) => void;
};

const numero = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const exibir = (valor: number | null | undefined, formato = (n: number) => numero.format(n)) =>
  valor === null || valor === undefined ? "—" : formato(valor);
const percentual = (n: number) => decimal.format(n) + "%";
const minutos = (n: number) => Math.round(n) + " min";
const dataBR = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const statusCores = [
  "azul",
  "verde",
  "ouro",
  "ouro",
  "azul",
  "verde",
  "vermelho",
  "vermelho",
  "ouro",
];

function Cartao({
  titulo,
  icone: Icon,
  classe,
  children,
}: {
  titulo: string;
  icone: LucideIcon;
  classe?: string;
  children: ReactNode;
}) {
  return (
    <section className={"neia-a01-cartao " + (classe ?? "")}>
      <h2>
        <Icon size={19} aria-hidden="true" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Linhas({ dados }: { dados: [string, ReactNode][] }) {
  return (
    <dl className="neia-a01-linhas">
      {dados.map(([chave, valor]) => (
        <div key={chave}>
          <dt>{chave}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function EstadoDados({
  query,
}: {
  query: { isError: boolean; isPending: boolean; refetch: () => unknown };
}) {
  if (query.isError)
    return (
      <div className="neia-a01-estado" role="alert">
        Falha ao consultar os dados.{" "}
        <button type="button" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  return query.isPending ? (
    <p className="neia-a01-estado" role="status">
      Carregando dados…
    </p>
  ) : null;
}

function Metrica({
  titulo,
  valor,
  detalhe,
  icone: Icon,
  destaque,
  acao,
}: {
  titulo: string;
  valor: string;
  detalhe: ReactNode;
  icone: LucideIcon;
  destaque?: boolean;
  acao?: () => void;
}) {
  const classe = "neia-a01-metrica" + (destaque ? " neia-a01-metrica-verde" : "");
  const conteudo = (
    <>
      <span>
        <Icon size={21} aria-hidden="true" />
        {titulo}
      </span>
      <strong>{valor}</strong>
      <small>{detalhe}</small>
    </>
  );
  return acao ? (
    <button type="button" className={classe} onClick={acao}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

function comparacao(valor: number | null, pp = false) {
  return valor === null ? (
    "Sem base para comparação"
  ) : (
    <span className={valor < 0 ? "neia-a01-vermelho" : valor > 0 ? "neia-a01-verde" : ""}>
      {valor > 0 ? "+" : ""}
      {decimal.format(valor)}
      {pp ? " p.p." : "%"} vs. anterior
    </span>
  );
}

const datasAcoes = [
  { label: "Novo pedido", icon: ShoppingCart, to: "/pdv" },
  { label: "PDV / Balcão", icon: ClipboardList, to: "/pdv" },
  { label: "Ver produção", icon: ChefHat, to: "/producao" },
  { label: "Nova compra", icon: Package, to: "/admin", hash: "compras" },
  { label: "Fechar caixa", icon: Wallet, to: "/financeiro", hash: "caixa" },
  { label: "Relatórios", icon: BarChart3, to: "/financeiro", hash: "relatorios" },
] as const;

export function DashboardOperacional({ usuarioId, email, abrirPedidos, abrirCadastro }: Props) {
  const queryClient = useQueryClient();
  const [relogio, setRelogio] = useState(() => new Date());
  const hoje = hojeSP(relogio);
  const [modo, setModo] = useState<1 | 7 | 30 | "personalizado">(1);
  const [custom, setCustom] = useState<FaixaDashboard | null>(null);
  const [dialogo, setDialogo] = useState<
    "periodo" | "ajuda" | "alertas" | "perfil" | "vendas" | null
  >(null);
  const [erroPeriodo, setErroPeriodo] = useState("");
  const faixa =
    modo === "personalizado" && custom
      ? custom
      : faixaDashboard(deslocarDia(hoje, 1 - Number(modo)), hoje)!;
  const anterior = faixaAnterior(faixa);
  useEffect(() => {
    const id = window.setInterval(() => setRelogio(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [pedidosQuery, filaQuery, estoque, financeiro, entregas, notificacoes, campanhas] =
    useDadosDashboard(usuarioId, faixa);
  const crm = useClientesDashboard(usuarioId);
  const consultaTarefas = useTarefasA01(usuarioId);
  const persistidas = useRecomendacoesA02(usuarioId);
  const [sugestaoTarefa, setSugestaoTarefa] = useState<SugestaoTarefaA01 | null>(null);
  const minhasAtrasadas = tarefasAtrasadas(
    consultaTarefas.isError ? undefined : consultaTarefas.data,
    usuarioId,
    hoje,
  );
  const alertasPendentes =
    (notificacoes.isError ? 0 : (notificacoes.data?.pendentes ?? 0)) + minhasAtrasadas.length;
  const pedidos = pedidosQuery.isError ? undefined : pedidosQuery.data;
  const fila = filaQuery.isError ? undefined : filaQuery.data;
  const atual = pedidos?.filter((pedido) => contem(faixa, pedido.created_at));
  const vendas = atual && resumirVendas(atual);
  const base =
    pedidos && resumirVendas(pedidos.filter((pedido) => contem(anterior, pedido.created_at)));
  const pontos = vendas && base ? serieVendas(faixa, vendas.validos, base.validos) : [];
  const temVendas = Boolean(vendas && (vendas.quantidade || base?.quantidade));
  const pico = pontos.reduce<(typeof pontos)[number] | undefined>(
    (maximo, ponto) => (ponto.pedidos.length > (maximo?.pedidos.length ?? 0) ? ponto : maximo),
    undefined,
  );
  const [ponto, setPonto] = useState(0);
  const gradiente = useId();

  const saldos = estoque.isError ? undefined : estoque.data;
  const margem = vendas && saldos ? margemDashboard(vendas.validos, saldos.custos) : undefined;
  const margemBase = base && saldos ? margemDashboard(base.validos, saldos.custos) : undefined;
  const diferencaMargem =
    margem?.valor != null && margemBase?.valor != null && !margem.parcial && !margemBase.parcial
      ? margem.valor - margemBase.valor
      : null;
  const fin = useMemo(
    () =>
      financeiro.isError || !financeiro.data
        ? undefined
        : financeiroDashboard(financeiro.data, faixa),
    [financeiro.isError, financeiro.data, faixa.ini, faixa.fim],
  );
  const lucro =
    margem?.contribuicao != null && !margem.parcial && fin && !fin.parcial
      ? margem.contribuicao - fin.despesaSemInsumos
      : null;
  const cliente = crm.isError || !crm.data ? undefined : resumirClientes(crm.data, faixa);
  const grupos =
    pedidos &&
    STATUS_DASHBOARD.map(
      ([id]) =>
        pedidos.filter(
          (pedido) =>
            pertenceAoGrupo(pedido, id) &&
            contem(faixa, id === "agendados" ? pedido.agendado_para : pedido.created_at),
        ).length,
    );
  const entregues = pedidos?.filter(
    (pedido) =>
      pedido.tipo_entrega === "entrega" &&
      pedido.status === "entregue" &&
      contem(faixa, pedido.entregue_em),
  );
  const idsRotas = [
    ...new Set(
      entregues?.flatMap((pedido) => (!pedido.saiu_em && pedido.rota_id ? [pedido.rota_id] : [])) ??
        [],
    ),
  ].sort();
  const inicioRotas = useInicioRotasDashboard(usuarioId, idsRotas);
  const tempoEntrega =
    entregues && !inicioRotas.isError && (!idsRotas.length || inicioRotas.data)
      ? mediaMinutos(
          entregues.map((pedido) => [
            pedido.saiu_em ??
              (pedido.rota_id ? (inicioRotas.data?.get(pedido.rota_id) ?? null) : null),
            pedido.entregue_em,
          ]),
        )
      : null;
  const entregasDados = entregas.isError ? undefined : entregas.data;
  const filaEntrega = fila?.filter((pedido) => pedido.tipo_entrega === "entrega");
  const emProducao = fila?.filter((pedido) => pedido.status === "em_producao");
  const pedidosCarga = fila?.filter(
    (pedido) =>
      (pedido.status === "em_producao" || pertenceAoGrupo(pedido, "aceitos")) &&
      (!pedido.agendado_para ||
        Date.parse(pedido.agendado_para) <= relogio.getTime() + 90 * 60_000),
  );
  const carga = pedidosCarga && cargaCozinha(pedidosCarga);
  const previsaoAtraso =
    carga && !carga.incompleta && pedidosCarga
      ? pedidosCarga.filter(
          (pedido) =>
            pedido.agendado_para &&
            Date.parse(pedido.agendado_para) > relogio.getTime() &&
            Date.parse(pedido.agendado_para) < relogio.getTime() + carga.minutos * 60_000,
        ).length
      : null;
  const tempoProducao = pedidos
    ? mediaMinutos(
        pedidos
          .filter((pedido) => pedido.status !== "cancelado" && contem(faixa, pedido.pronto_em))
          .map((pedido) => [pedido.preparo_em, pedido.pronto_em]),
      )
    : null;
  const crescimento = variacao(vendas?.total ?? null, base?.total ?? null);
  const reposicao = saldos?.linhas.filter((linha) => linha.repor);
  const vencimentos = saldos?.linhas.filter((linha) => linha.vence || linha.vencido);
  const filaAtrasada = fila?.filter((pedido) => pertenceAoGrupo(pedido, "atrasados"));
  const esperandoMotoboy = filaEntrega?.filter((pedido) =>
    ["aguardando_motoboy", "pronto"].includes(pedido.status),
  ).length;

  const inteligencia = gerarRecomendacoesNeia(
    {
      atualizadoEm: relogio.toISOString(),
      estoque: saldos
        ? {
            reposicao: reposicao?.length ?? 0,
            vencendo: vencimentos?.filter((linha) => linha.vence).length ?? 0,
            vencidos: vencimentos?.filter((linha) => linha.vencido).length ?? 0,
          }
        : undefined,
      producao: fila
        ? {
            emProducao: emProducao?.length ?? 0,
            atrasados: filaAtrasada?.length ?? 0,
            minutosFila: carga && !carga.incompleta ? carga.minutos : null,
            prazosEmRisco: previsaoAtraso,
          }
        : undefined,
      entregas: filaEntrega
        ? {
            aguardandoColeta: esperandoMotoboy ?? 0,
            motoboysDisponiveis: entregasDados?.motoboys ?? null,
            tempoMedioMinutos: tempoEntrega,
          }
        : undefined,
      financeiro: fin
        ? {
            vencido: fin.vencido,
            lucro,
            margemParcial: Boolean(margem?.parcial && margem.total),
            custosCobertos: margem?.cobertos ?? null,
            custosTotal: margem?.total ?? null,
          }
        : undefined,
      comercial: pedidos
        ? {
            crescimento,
            totalAtual: vendas?.total ?? null,
            totalAnterior: base?.total ?? null,
            reativar60a89: cliente?.reativar[1] ?? null,
            campanhasProntas: campanhas.isError ? null : (campanhas.data ?? null),
          }
        : undefined,
    },
    { escopo: "a01" },
  );
  const recomendacoes = inteligencia.recomendacoes;
  // O resumo respeita a situação registrada: alertas resolvidos ou dispensados
  // não voltam para a lista do Dashboard, e os demais mostram a situação atual.
  const resumoInteligencia = recomendacoes
    .map((item) => {
      const estado = estadoMaisRecente(persistidas.estados, item.id);
      return { item, estado, situacao: situacaoEfetiva(estado, Date.now()) };
    })
    .filter(({ situacao }) => situacao !== "resolvida" && situacao !== "dispensada");

  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [mostrarBusca, setMostrarBusca] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setTermo(busca.trim()), 250);
    return () => window.clearTimeout(id);
  }, [busca]);
  const resultados = useBuscaDashboard(usuarioId, termo);
  const buscaValida = busca.trim().length >= 2 || /^\d+$/.test(busca.trim());
  const [marcando, setMarcando] = useState(false);
  const [erroLeitura, setErroLeitura] = useState(false);
  async function marcarLida(id: string) {
    setErroLeitura(false);
    setMarcando(true);
    try {
      const { data, error } = await supabase
        .from("notificacoes")
        .update({ lida: true })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new Error("Leitura não registrada");
      await queryClient.invalidateQueries({
        queryKey: ["dashboard-a01", usuarioId, "notificacoes"],
      });
    } catch {
      setErroLeitura(true);
    } finally {
      setMarcando(false);
    }
  }

  function aplicarPeriodo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const nova = faixaDashboard(String(form.get("inicio") ?? ""), String(form.get("fim") ?? ""));
    if (!nova || nova.ultimoDia > hoje || nova.dias > 366) {
      setErroPeriodo("Escolha um intervalo válido de até 366 dias, com término até hoje.");
      return;
    }
    setCustom(nova);
    setModo("personalizado");
    setDialogo(null);
  }

  function abrirVenda(index: number) {
    setPonto(index);
    setDialogo("vendas");
  }

  function fecharBusca() {
    setMostrarBusca(false);
    setBusca("");
  }

  return (
    <div className="neia-a01">
      <div className="neia-a01-topo">
        <div
          className="neia-a01-busca"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMostrarBusca(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMostrarBusca(false);
          }}
        >
          <Search size={20} aria-hidden="true" />
          <Input
            aria-label="Buscar pedidos, clientes e produtos"
            placeholder="Buscar no sistema"
            value={busca}
            onFocus={() => setMostrarBusca(true)}
            onChange={(e) => {
              setBusca(e.target.value);
              setMostrarBusca(true);
            }}
          />
          {mostrarBusca && buscaValida && (
            <div className="neia-a01-busca-lista" aria-label="Resultados da busca">
              {termo !== busca.trim() || resultados.isPending ? (
                <p role="status">Buscando…</p>
              ) : resultados.isError ? (
                <EstadoDados query={resultados} />
              ) : (
                <>
                  {resultados.data?.pedidos.map((pedido) => (
                    <button
                      key={pedido.id}
                      type="button"
                      onClick={() => {
                        abrirPedidos(undefined, undefined, pedido.id);
                        fecharBusca();
                      }}
                    >
                      Pedido #{pedido.numero} · {pedido.cliente_nome}
                    </button>
                  ))}
                  {resultados.data?.clientes.map((pessoa) => (
                    <button
                      key={pessoa.id}
                      type="button"
                      onClick={() => {
                        abrirCadastro("clientes", pessoa.nome);
                        fecharBusca();
                      }}
                    >
                      Cliente · {pessoa.nome}
                    </button>
                  ))}
                  {resultados.data?.produtos.map((produto) => (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => {
                        abrirCadastro("produtos", produto.nome);
                        fecharBusca();
                      }}
                    >
                      Produto · {produto.nome}
                    </button>
                  ))}
                  {resultados.data &&
                    !Object.values(resultados.data).some((lista) => lista.length) && (
                      <p>Nenhum resultado encontrado.</p>
                    )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="neia-a01-controles">
          <Button variant="ghost" onClick={() => setDialogo("alertas")}>
            <Bell size={20} />
            Alertas
            {alertasPendentes > 0 && <b className="neia-a01-contagem">{alertasPendentes}</b>}
          </Button>
          <Button variant="ghost" onClick={() => setDialogo("ajuda")}>
            <CircleHelp size={20} />
            Ajuda
          </Button>
          <Button variant="ghost" onClick={() => setDialogo("perfil")}>
            <UserRound size={20} />
            <span>
              Perfil<span className="neia-a01-perfil-papel">Administrador</span>
            </span>
          </Button>
        </div>
      </div>

      <header className="neia-a01-cabecalho">
        <div>
          <h1>A01. Dashboard — Relatório do Dono</h1>
          <p>Vendas, pedidos, produção, estoque, entregas e financeiro</p>
        </div>
        <div className="neia-a01-periodo">
          <span>
            <CalendarDays size={18} />
            {dataBR(faixa.inicio)}
            {faixa.dias > 1 && " a " + dataBR(faixa.ultimoDia)}
          </span>
          <div aria-label="Período do Dashboard">
            {(
              [
                [1, "Hoje"],
                [7, "7 dias"],
                [30, "30 dias"],
                ["personalizado", "Período"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                aria-pressed={modo === id}
                key={id}
                onClick={() => {
                  if (id === "personalizado") {
                    setErroPeriodo("");
                    setDialogo("periodo");
                  } else setModo(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="neia-a01-grade">
        <div className="neia-a01-principal">
          <div className="neia-a01-kpis">
            <Metrica
              titulo="Faturamento"
              valor={exibir(vendas?.total, brl)}
              detalhe={comparacao(crescimento)}
              icone={Coins}
              destaque
            />
            <Metrica
              titulo="Pedidos válidos"
              valor={exibir(vendas?.quantidade)}
              icone={ShoppingCart}
              detalhe={comparacao(variacao(vendas?.quantidade ?? null, base?.quantidade ?? null))}
              acao={() => abrirPedidos(faixa)}
            />
            <Metrica
              titulo="Ticket médio"
              valor={exibir(vendas?.ticket, brl)}
              detalhe={comparacao(variacao(vendas?.ticket ?? null, base?.ticket ?? null))}
              icone={Tag}
            />
            <Metrica
              titulo="Margem estimada"
              valor={exibir(margem?.valor, percentual)}
              icone={BarChart3}
              detalhe={
                margem?.parcial
                  ? margem.cobertos + "/" + margem.total + " pedidos com custo"
                  : comparacao(diferencaMargem, true)
              }
            />
            <Metrica
              titulo="Caixa em dinheiro"
              valor={exibir(fin?.saldoCaixa, brl)}
              icone={Wallet}
              detalhe={
                fin?.caixaIncompleto
                  ? "Movimentos a conferir"
                  : fin?.sessao
                    ? "Sessão em aberto"
                    : fin
                      ? "Sem caixa aberto"
                      : "Caixa indisponível"
              }
            />
          </div>

          <div className="neia-a01-operacao" data-vendas={temVendas ? "com-dados" : "sem-dados"}>
            <Cartao
              titulo={faixa.dias === 1 ? "Vendas por hora" : "Vendas por dia"}
              icone={BarChart3}
            >
              <EstadoDados query={pedidosQuery} />
              {temVendas ? (
                <>
                  <div
                    className="neia-a01-grafico"
                    aria-label="Comparação de faturamento com o período anterior"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={pontos}
                        margin={{ left: 4, right: 8, top: 10 }}
                        onClick={(e) => {
                          if (e?.activeTooltipIndex != null && e.activeTooltipIndex >= 0)
                            abrirVenda(e.activeTooltipIndex);
                        }}
                      >
                        <defs>
                          <linearGradient id={gradiente} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#ffce45" stopOpacity={0.65} />
                            <stop offset="100%" stopColor="#ffce45" stopOpacity={0.06} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#303941" vertical={false} />
                        <XAxis
                          dataKey="rotulo"
                          stroke="#d2d8df"
                          minTickGap={20}
                          tick={{ fontSize: 13 }}
                        />
                        <YAxis
                          stroke="#d2d8df"
                          width={48}
                          tick={{ fontSize: 13 }}
                          tickFormatter={(v) =>
                            Intl.NumberFormat("pt-BR", { notation: "compact" }).format(v)
                          }
                        />
                        <Tooltip
                          formatter={(valor: number) => brl(valor)}
                          contentStyle={{
                            color: "#f8fafc",
                            background: "#141a20",
                            borderColor: "#535c64",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="atual"
                          name="Selecionado"
                          stroke="#ffce45"
                          strokeWidth={3}
                          fill={"url(#" + gradiente + ")"}
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="anterior"
                          name="Anterior"
                          stroke="#9baebb"
                          strokeDasharray="5 5"
                          fill="none"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="neia-a01-legenda">
                    <span>● Selecionado</span>
                    <span>┄ Anterior</span>
                  </div>
                  {pico && (
                    <p className="neia-a01-nota">
                      Maior movimento em {pico.rotulo} · {pico.pedidos.length} pedido(s)
                    </p>
                  )}
                  <label className="neia-a01-detalhar">
                    Detalhar{" "}
                    <select value="" onChange={(e) => abrirVenda(Number(e.target.value))}>
                      <option value="" disabled>
                        Selecione {faixa.dias === 1 ? "uma hora" : "um dia"}
                      </option>
                      {pontos.map((linha, i) => (
                        <option key={linha.rotulo} value={i}>
                          {linha.rotulo} · {brl(linha.atual)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                vendas && <p className="neia-a01-nota">Nenhuma venda válida nos dois períodos.</p>
              )}
            </Cartao>

            <Cartao titulo="Pedidos por status" icone={ClipboardList}>
              <EstadoDados query={pedidosQuery} />
              <ul className="neia-a01-status">
                {STATUS_DASHBOARD.map(([id, label], index) => (
                  <li key={id}>
                    <button type="button" onClick={() => abrirPedidos(faixa, id)}>
                      <span className={"neia-a01-bolinha neia-a01-" + statusCores[index]} />
                      <span>{label}</span>
                      <strong>{exibir(grupos?.[index])}</strong>
                      <ChevronRight size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="neia-a01-nota">Atraso e agendamento são sinalizações adicionais.</p>
            </Cartao>

            <Cartao titulo="Produção e capacidade" icone={ChefHat}>
              <EstadoDados query={filaQuery} />
              <Linhas
                dados={[
                  ["Pedidos em produção", exibir(emProducao?.length)],
                  ["Capacidade utilizada", "Sem medição"],
                  ["Fritadeiras em operação", "Sem medição"],
                  [
                    "Forno turbo",
                    carga && !carga.incompleta
                      ? exibir(carga.assados) + " un. na fila"
                      : "Sem medição",
                  ],
                  ["Equipe disponível", "Sem registro"],
                  ["Tempo médio de produção", exibir(tempoProducao, minutos)],
                  [
                    "Fritadeiras estimadas",
                    carga && !carga.incompleta ? exibir(carga.fritadeiras) + " de 3" : "—",
                  ],
                  ["Carga estimada", carga && !carga.incompleta ? minutos(carga.minutos) : "—"],
                  ["Agendados em risco", exibir(previsaoAtraso)],
                ]}
              />
              <p className="neia-a01-nota">
                Fila atual, com agendamentos até 90 min.{" "}
                {carga?.incompleta
                  ? "Há itens sem classificação de preparo."
                  : "Sobrecarga real depende da equipe e dos equipamentos disponíveis."}
              </p>
              <Link className="neia-a01-atalho" to="/producao">
                Ver produção <ChevronRight size={16} />
              </Link>
            </Cartao>
          </div>

          <div className="neia-a01-resumos">
            <Cartao titulo="Salgados — Estoque" icone={Package} classe="neia-a01-estoque">
              <EstadoDados query={estoque} />
              {saldos?.linhas.length ? (
                <div
                  className="neia-a01-tabela-scroll"
                  role="region"
                  aria-label="Tabela de estoque"
                  tabIndex={0}
                >
                  <table role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        {["Sabor", "Disponível", "Reservado", "Físico", "Mínimo", "Situação"].map(
                          (label) => (
                            <th key={label} scope="col" role="columnheader">
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {saldos.linhas.slice(0, 6).map((linha) => (
                        <tr key={linha.id} role="row">
                          <th scope="row" role="rowheader">
                            <span>
                              {linha.imagem && (
                                <img
                                  src={linha.imagem}
                                  width={36}
                                  height={36}
                                  alt=""
                                  loading="lazy"
                                />
                              )}
                              {linha.nome}
                            </span>
                          </th>
                          <td
                            role="cell"
                            data-label="Disponível"
                            className={linha.repor ? "neia-a01-vermelho" : undefined}
                          >
                            {exibir(linha.disponivel)}
                          </td>
                          <td role="cell" data-label="Reservado">
                            {exibir(linha.reservado)}
                          </td>
                          <td role="cell" data-label="Físico">
                            {exibir(linha.fisico)}
                          </td>
                          <td role="cell" data-label="Mínimo">
                            {exibir(linha.minimo)}
                          </td>
                          <td role="cell" data-label="Situação">
                            {linha.alertas.length ? (
                              linha.alertas.map((alerta) => (
                                <small key={alerta.texto} className={"neia-a01-" + alerta.tom}>
                                  {alerta.texto}
                                </small>
                              ))
                            ) : (
                              <span className="neia-a01-verde">Regular</span>
                            )}
                            {linha.validadeProxima && (
                              <small>Validade {dataBR(linha.validadeProxima)}</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                saldos && <p className="neia-a01-nota">Nenhum sabor cadastrado no estoque.</p>
              )}
              {saldos?.linhas.some((linha) => linha.fisico === null) && (
                <p className="neia-a01-nota">
                  O saldo físico depende do cadastro de lotes por sabor.
                </p>
              )}
              <Link className="neia-a01-atalho" to="/admin" hash="estoque-salgados">
                Ver estoque completo <ChevronRight size={16} />
              </Link>
            </Cartao>

            <Cartao titulo="Entregas" icone={Bike}>
              <EstadoDados query={entregas} />
              {!!idsRotas.length && <EstadoDados query={inicioRotas} />}
              <Linhas
                dados={[
                  ["Motoboys disponíveis", exibir(entregasDados?.motoboys)],
                  ["Rotas em andamento", exibir(entregasDados?.rotas)],
                  ["Entregas realizadas", exibir(entregues?.length)],
                  ["Aguardando motoboy", exibir(esperandoMotoboy)],
                  [
                    "Pedidos em rota",
                    exibir(filaEntrega?.filter((pedido) => pedido.status === "em_rota").length),
                  ],
                  [
                    "Entregas atrasadas",
                    exibir(
                      filaEntrega && entregasDados
                        ? filaEntrega.filter(
                            (pedido) => pedido.atrasado || entregasDados.atrasos.has(pedido.id),
                          ).length
                        : undefined,
                    ),
                  ],
                  ["Tempo médio", exibir(tempoEntrega, minutos)],
                  [
                    "Taxa média",
                    exibir(
                      entregues?.length
                        ? entregues.reduce((total, pedido) => total + pedido.taxa_entrega, 0) /
                            entregues.length
                        : null,
                      brl,
                    ),
                  ],
                ]}
              />
              <Link className="neia-a01-atalho" to="/central-entregas">
                Central de Entregas <ChevronRight size={16} />
              </Link>
              <Link className="neia-a01-atalho" to="/central-entregas" hash="secao-mapa">
                Mapa operacional <ChevronRight size={16} />
              </Link>
            </Cartao>

            <Cartao titulo="Resumo financeiro" icone={Coins}>
              <EstadoDados query={financeiro} />
              <Linhas
                dados={[
                  ["Faturamento", exibir(vendas?.total, brl)],
                  ["Recebimentos efetivos", exibir(fin?.recebimentos, brl)],
                  ["Despesas realizadas", exibir(fin?.realizado, brl)],
                  ["Despesas previstas", exibir(fin?.previsto, brl)],
                  ["Contas a pagar", exibir(fin?.pagar, brl)],
                  ["Contas a receber", exibir(fin?.receber, brl)],
                  ["Lucro estimado", exibir(lucro, brl)],
                  ["Margem estimada", exibir(margem?.valor, percentual)],
                  ["Saldo inicial · caixa", exibir(fin?.sessao?.saldo_inicial, brl)],
                  ["Entradas · caixa", exibir(fin?.sessao ? fin.entradasCaixa : null, brl)],
                  ["Saídas · caixa", exibir(fin?.sessao ? fin.saidasCaixa : null, brl)],
                  ["Saldo atualizado · caixa", exibir(fin?.saldoCaixa, brl)],
                ]}
              />
              {fin?.parcial && (
                <p className="neia-a01-nota neia-a01-ouro">
                  Movimentos sem data confiável tornam o fluxo parcial.
                </p>
              )}
              {fin?.caixaIncompleto && (
                <p className="neia-a01-nota neia-a01-ouro">
                  Entradas e saídas do caixa são parciais. Há movimentos sem meio ou data
                  confirmados.
                </p>
              )}
              {lucro != null && (
                <p className="neia-a01-nota">
                  Lucro estimado usa custos por item e despesas pagas fora do custo dos produtos.
                </p>
              )}
              <Link className="neia-a01-atalho" to="/financeiro">
                Financeiro Premium <ChevronRight size={16} />
              </Link>
            </Cartao>

            <Cartao titulo="Clientes e Comercial" icone={Users}>
              <EstadoDados query={crm} />
              <EstadoDados query={campanhas} />
              <Linhas
                dados={[
                  ["Novos clientes", exibir(cliente?.novos)],
                  ["Clientes ativos", exibir(cliente?.ativos)],
                  ["Taxa de recompra", exibir(cliente?.recompra, percentual)],
                  ["Clientes inativos", exibir(cliente?.inativos)],
                  ["Campanhas prontas", exibir(campanhas.isError ? null : campanhas.data)],
                  ["Reativar · 30–59 dias", exibir(cliente?.reativar[0])],
                  ["Reativar · 60–89 dias", exibir(cliente?.reativar[1])],
                  ["Reativar · 90 dias ou mais", exibir(cliente?.reativar[2])],
                ]}
              />
              <p className="neia-a01-nota">Ativos e inativos refletem o estado atual do CRM.</p>
              <Link className="neia-a01-atalho" to="/campanhas">
                Ver campanhas e clientes <ChevronRight size={16} />
              </Link>
            </Cartao>
          </div>
        </div>

        <aside className="neia-a01-lateral">
          <Cartao titulo="Néia Inteligência" icone={Sparkles} classe="neia-a01-inteligencia">
            {resumoInteligencia.length ? (
              <ul>
                {resumoInteligencia.map(({ item, estado, situacao }) => (
                  <li key={item.id}>
                    <span className={"neia-a01-" + item.tom}>
                      {rotuloNaturezaNeia(item.natureza)}
                    </span>
                    <strong>{item.titulo}</strong>
                    <p>{item.motivo}</p>
                    {estado ? (
                      <p className="neia-a01-nota">
                        Situação: {rotuloSituacaoRecomendacao(situacao)}
                      </p>
                    ) : null}
                    <Link
                      to={item.destino.to}
                      {...(item.destino.hash ? { hash: item.destino.hash } : {})}
                    >
                      {item.destino.rotulo}
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={consultaTarefas.isError}
                      onClick={() =>
                        setSugestaoTarefa({
                          ...item.tarefa,
                          recomendacao_id: item.id,
                          rec_chave: estado?.chave ?? item.id,
                          rec_ocorrencia: estado?.ocorrencia ?? 1,
                          origemRotulo: item.titulo,
                        })
                      }
                    >
                      Sugerir tarefa
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="neia-a01-nota">Nenhum alerta gerado com os dados disponíveis.</p>
            )}
            <p className="neia-a01-nota">
              Sem base anterior suficiente, crescimento e tendência ficam indisponíveis. A fila
              estima tempo, sem medir utilização.
            </p>
            <Button asChild className="neia-a01-dourado">
              <Link to="/admin" hash="neia-inteligencia">
                <Sparkles size={18} />
                Consultar Néia Inteligência
              </Link>
            </Button>
            <p className="neia-a01-nota">
              Monitoramento preventivo disponível. Previsões e consulta inteligente dependem da
              A02.2 e A02.3.
            </p>
          </Cartao>
          <div id="a01-tarefas">
            <Cartao titulo="Minhas tarefas" icone={ClipboardList}>
              <TarefasA01
                usuarioId={usuarioId}
                admin
                hoje={hoje}
                consulta={consultaTarefas}
                sugestao={sugestaoTarefa}
                limparSugestao={() => setSugestaoTarefa(null)}
              />
              <Link className="neia-a01-atalho" to="/admin" hash="minhas-tarefas">
                Abrir painel de tarefas <ChevronRight size={16} />
              </Link>
            </Cartao>
          </div>
        </aside>
      </div>

      <Cartao titulo="Ações rápidas" icone={Zap} classe="neia-a01-rapidas">
        <div>
          {datasAcoes.map(({ label, icon: Icon, to, ...resto }) => (
            <Link key={label} to={to} {...resto}>
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </div>
      </Cartao>

      <Dialog
        open={dialogo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDialogo(null);
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          {dialogo === "periodo" && (
            <>
              <DialogHeader>
                <DialogTitle>Período personalizado</DialogTitle>
                <DialogDescription>Datas da operação no horário de São Paulo.</DialogDescription>
              </DialogHeader>
              <form className="neia-a01-form" onSubmit={aplicarPeriodo}>
                <label>
                  Data inicial{" "}
                  <Input
                    name="inicio"
                    type="date"
                    defaultValue={faixa.inicio}
                    max={hoje}
                    required
                  />
                </label>
                <label>
                  Data final{" "}
                  <Input
                    name="fim"
                    type="date"
                    defaultValue={faixa.ultimoDia}
                    max={hoje}
                    required
                  />
                </label>
                {erroPeriodo && (
                  <p className="neia-a01-vermelho" role="alert">
                    {erroPeriodo}
                  </p>
                )}
                <Button type="submit" className="neia-a01-dourado">
                  Aplicar período
                </Button>
              </form>
            </>
          )}
          {dialogo === "ajuda" && (
            <DialogHeader>
              <DialogTitle>Como ler o Dashboard</DialogTitle>
              <DialogDescription>
                O período filtra vendas, pedidos, novos clientes, recompra e os movimentos com data.
                Filas, estoque, contas em aberto e caixa em andamento mostram o estado atual.
                Valores em branco aguardam dados ou uma base confiável.
              </DialogDescription>
            </DialogHeader>
          )}
          {dialogo === "perfil" && (
            <>
              <DialogHeader>
                <DialogTitle>Perfil</DialogTitle>
                <DialogDescription>
                  Conta autenticada com acesso de administrador.
                </DialogDescription>
              </DialogHeader>
              <p>{email ?? "Administrador"}</p>
              <Link to="/admin" hash="usuarios" onClick={() => setDialogo(null)}>
                Gerenciar usuários e permissões
              </Link>
            </>
          )}
          {dialogo === "alertas" && (
            <>
              <DialogHeader>
                <DialogTitle>Central de notificações</DialogTitle>
                <DialogDescription>Avisos mais recentes do ERP.</DialogDescription>
              </DialogHeader>
              {!!minhasAtrasadas.length && (
                <div>
                  <h3 className="neia-a01-vermelho">
                    Minhas tarefas atrasadas ({minhasAtrasadas.length})
                  </h3>
                  <ul className="neia-a01-notificacoes">
                    {minhasAtrasadas.map((tarefa) => (
                      <li key={tarefa.id}>
                        <strong>{tarefa.titulo}</strong>
                        <p>Prazo {dataBR(tarefa.prazo!)}</p>
                      </li>
                    ))}
                  </ul>
                  <Link to="/admin" hash="minhas-tarefas" onClick={() => setDialogo(null)}>
                    Abrir tarefas
                  </Link>
                </div>
              )}
              <EstadoDados query={consultaTarefas} />
              <EstadoDados query={notificacoes} />
              {!notificacoes.isError &&
                notificacoes.data &&
                (notificacoes.data.lista.length ? (
                  <ul className="neia-a01-notificacoes">
                    {notificacoes.data.lista.map((aviso) => (
                      <li key={aviso.id}>
                        <strong>{aviso.titulo}</strong>
                        <p>{aviso.detalhe}</p>
                        {!aviso.lida && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={marcando}
                            onClick={() => void marcarLida(aviso.id)}
                          >
                            Marcar como lida
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma notificação.</p>
                ))}
              {erroLeitura && (
                <p role="alert" className="neia-a01-vermelho">
                  Não foi possível registrar a leitura.
                </p>
              )}
            </>
          )}
          {dialogo === "vendas" && pontos[ponto] && (
            <>
              <DialogHeader>
                <DialogTitle>Vendas em {pontos[ponto].rotulo}</DialogTitle>
                <DialogDescription>
                  {brl(pontos[ponto].atual)} · Anterior equivalente {brl(pontos[ponto].anterior)}
                </DialogDescription>
              </DialogHeader>
              {pontos[ponto].pedidos.length ? (
                <ul className="neia-a01-notificacoes">
                  {pontos[ponto].pedidos.map((pedido) => (
                    <li key={pedido.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDialogo(null);
                          abrirPedidos(undefined, undefined, pedido.id);
                        }}
                      >
                        #{pedido.numero} · {pedido.cliente_nome} · {brl(pedido.total)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum pedido válido nesse intervalo.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
