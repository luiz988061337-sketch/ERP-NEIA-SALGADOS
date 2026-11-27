import { AtalhosEntrega } from "@/components/entregas/atalhos-entrega";
import { podeOperarEntregas } from "@/lib/central-atribuicao";
import { limitePrometido } from "@/lib/prazo-pedido";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bike,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Eye,
  Package,
  Printer,
  Search,
  Store,
  Wallet,
  RefreshCw,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Hourglass,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DarkTable, DarkTableRow } from "@/components/admin/erp-ui";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import {
  executarAceiteAtendente,
  elegivelAceiteLocal,
  podeAceitarPerfil,
} from "@/lib/atendente-aceite";
import { decidirCancelamentoAtomico } from "@/lib/reserva-integracao";
import { faixaDashboard, type FaixaDashboard } from "@/lib/dashboard-a01";
import { lerDashboard } from "@/lib/dashboard-a01-dados";
import { downloadCSV } from "@/lib/export";
import { PAGAMENTO_LABEL, PAGAMENTO_STATUS_LABEL } from "@/lib/format";
import { impressaoDireta } from "@/lib/impressao";
import {
  carregarEventosLedgerPorPedido,
  linhasRecebimentosParaCSV,
  resumirRecebimentosPedido,
} from "@/lib/pedido-pagamento-ledger";
import { entradaJanelaProducao } from "@/lib/motor-producao";
import {
  COLUNAS_H02,
  FILTROS_H02,
  atrasoH02,
  correspondeH02,
  grupoH02,
  resumoH02,
  rotuloQuantidadePedido,
  unidadesSalgadosH02,
  type FiltrosH02,
  type PedidoH02,
  type ProdutoH02,
} from "@/lib/pedidos-h02";
import { dataH02, DetalhesPedidoH02, moedaH02, situacaoH02 } from "./pedidos-h02-detalhes";
import "./pedidos-h02.css";

export const CAMPOS_PEDIDOS_H02 =
  "*, pedido_itens(*, pedido_item_componentes(produto_id, quantidade))";

const outrosGrupos = [
  ["entrega", "Em entrega"],
  ["finalizados", "Finalizados"],
  ["cancelados", "Cancelados"],
  ["outros", "Outras situações"],
] as const;
const opcoesGrupo = [...COLUNAS_H02.map((g) => [g.id, g.titulo] as const), ...outrosGrupos];
const icones = [ClipboardList, CircleCheck, ChefHat, Package];
const iconesIndicadores = [
  ClipboardList,
  Hourglass,
  CircleCheck,
  ChefHat,
  Package,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Wallet,
  Wallet,
];

function InfoModalidade({ pedido }: { pedido: PedidoH02 }) {
  const Icone = pedido.tipo_entrega === "retirada" ? Store : Bike;
  return (
    <span className="h02-tag">
      <Icone size={17} aria-hidden />
      {pedido.tipo_entrega === "retirada"
        ? "Retirada"
        : pedido.tipo_entrega === "entrega"
          ? "Entrega"
          : "Modalidade indefinida"}
    </span>
  );
}

function Cartao({
  pedido: p,
  produtos,
  agora,
  podeAceitar,
  podeDespachar,
  onDetalhes,
  onAceite,
}: {
  pedido: PedidoH02;
  produtos: Map<string, ProdutoH02>;
  agora: number;
  podeAceitar: boolean;
  podeDespachar: boolean;
  onDetalhes: () => void;
  onAceite: () => void;
}) {
  const atr = atrasoH02(p, agora);
  const prazo = limitePrometido(p);
  const unidades = unidadesSalgadosH02(p.pedido_itens, produtos);
  return (
    <article className="h02-cartao" data-atrasado={atr === true}>
      <div className="h02-linha">
        <strong>#{p.numero}</strong>
        <time className="h02-nota" dateTime={p.created_at}>
          {dataH02(p.created_at)}
        </time>
      </div>
      <h3>
        <UserRound size={16} aria-hidden /> {p.cliente_nome || "Cliente não identificado"}
      </h3>
      {p.telefone && <p className="h02-nota">{p.telefone}</p>}
      <div className="h02-linha">
        <InfoModalidade pedido={p} />
        <span className="h02-tag">{p.agendado_para ? "Agendado" : "Assim que possível"}</span>
      </div>
      <div className="h02-prazo">
        <CalendarClock size={17} aria-hidden />
        <span>
          {prazo ? "Prazo " + dataH02(prazo) : "Prazo não registrado"}
        </span>
        {atr && <strong className="neia-a01-vermelho">Em atraso</strong>}
      </div>
      <div className="h02-linha">
        <span>{rotuloQuantidadePedido(p.pedido_itens, unidades)}</span>
        <strong>{moedaH02(p.total)}</strong>
      </div>
      <p className="h02-nota">
        <Wallet size={16} aria-hidden />{" "}
        {PAGAMENTO_LABEL[p.forma_pagamento] ?? (p.forma_pagamento || "Forma indisponível")} ·{" "}
        {PAGAMENTO_STATUS_LABEL[p.pagamento_status] ??
          (p.pagamento_status || "Situação de pagamento indisponível")}
      </p>
      <p>
        <strong>{situacaoH02(p)}</strong>
      </p>
      {grupoH02(p) === "aceitos" &&
        p.agendado_para &&
        entradaJanelaProducao(p.agendado_para).getTime() > agora && (
          <p className="h02-nota">
            Entra na fila da cozinha em {dataH02(entradaJanelaProducao(p.agendado_para))}
          </p>
        )}
      {(p.problema || p.atraso_descricao || p.observacoes) && (
        <p className="h02-nota h02-observacoes">
          {p.problema || p.atraso_descricao || p.observacoes}
        </p>
      )}
      <div className="h02-acoes">
        {podeDespachar && <AtalhosEntrega pedido={p} className="h02-botao neia-a01-dourado" />}
        <button className="h02-botao h02-contorno-dourado" onClick={onDetalhes}>
          <Eye size={17} aria-hidden /> Ver detalhes
        </button>
        {podeAceitar && (
          <button className="h02-botao neia-a01-dourado" onClick={onAceite}>
            Aceitar pedido
          </button>
        )}
      </div>
    </article>
  );
}

export function PedidosH02({
  recentes,
  consultando,
  erro,
  recarregar,
  catalogo,
  usuarioId,
  papeis,
  etiquetaA01,
  limparA01,
  pedidoInicial,
  buscaInicial,
  somenteLeitura,
}: {
  recentes: PedidoH02[];
  consultando: boolean;
  erro: boolean;
  recarregar: () => void;
  catalogo: ProdutoH02[];
  usuarioId: string;
  papeis: readonly string[] | undefined;
  etiquetaA01?: string | undefined;
  limparA01: () => void;
  pedidoInicial?: string | undefined;
  buscaInicial?: string | undefined;
  somenteLeitura: boolean;
}) {
  const client = useQueryClient();
  const [filtros, setFiltros] = useState(() => ({ ...FILTROS_H02, busca: buscaInicial ?? "" }));
  const [periodo, setPeriodo] = useState<FaixaDashboard | null>(null);
  const [datas, setDatas] = useState({ de: "", ate: "" });
  const [erroPeriodo, setErroPeriodo] = useState("");
  const [janela, setJanela] = useState<{
    id: string;
    acao: "detalhes" | "cancelar" | "aceitar";
  } | null>(pedidoInicial ? { id: pedidoInicial, acao: "detalhes" } : null);
  const [limiteLista, setLimiteLista] = useState(30);
  const [motivo, setMotivo] = useState("");
  const [falha, setFalha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [agora, setAgora] = useState(Date.now);
  const emCurso = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const produtos = useMemo(() => new Map(catalogo.map((p) => [p.id, p])), [catalogo]);
  const porPeriodo = useQuery({
    queryKey: ["h02-pedidos-periodo", usuarioId, periodo],
    enabled: !!periodo && !etiquetaA01,
    queryFn: async ({ signal }) => {
      if (!periodo) return [];
      return lerDashboard<PedidoH02>((inicio, fim) =>
        supabase
          .from("pedidos")
          .select(CAMPOS_PEDIDOS_H02)
          .gte("created_at", periodo.ini)
          .lt("created_at", periodo.fim)
          .order("created_at", { ascending: false })
          .order("id")
          .range(inicio, fim)
          .abortSignal(signal),
      );
    },
  });
  const carregando = periodo ? porPeriodo.isPending : consultando;
  const falhou = periodo ? porPeriodo.isError : erro;
  const pedidos = periodo ? (porPeriodo.data ?? []) : recentes;
  const dadosDisponiveis = !carregando && !falhou;
  const filtrados = pedidos.filter((p) => correspondeH02(p, filtros, agora));
  const resumen = dadosDisponiveis
    ? resumoH02(
        pedidos.filter((p) => correspondeH02(p, { ...filtros, grupo: "" }, agora)),
        agora,
      )
    : null;
  const contagem = resumen?.grupos;
  const indicadores: Array<[string, string | number | null | undefined]> = [
    [
      "Recebidos no recorte",
      dadosDisponiveis ? Object.values(contagem ?? {}).reduce((a, b) => a + b, 0) : null,
    ],
    ["Aguardando aceitação", contagem?.novos],
    ["Aceitos", contagem?.aceitos],
    ["Em produção", contagem?.producao],
    ["Prontos", contagem?.prontos],
    ["Finalizados", contagem?.finalizados],
    ["Cancelados", contagem?.cancelados],
    [
      "Em atraso",
      resumen?.prazosSemCobertura && resumen.atrasados !== null
        ? "≥ " + resumen.atrasados
        : resumen?.atrasados,
    ],
    ["Valor total ativo", moedaH02(resumen?.total)],
    ["Pagamentos pendentes", resumen?.pendentes],
  ];
  const historico = filtrados.filter((p) => !COLUNAS_H02.some((g) => g.id === grupoH02(p)));
  const origens = [
    ...new Set(
      pedidos.flatMap((p) =>
        [p.origem_cliente?.trim(), p.campanha_origem?.trim()].filter((o): o is string => !!o),
      ),
    ),
  ].sort();
  const p = janela ? pedidos.find((pedido) => pedido.id === janela.id) : undefined;
  const autor = { id: usuarioId, papeis: papeis ?? [] };
  const podeAceitar = (pedido: PedidoH02) =>
    !somenteLeitura &&
    podeAceitarPerfil(autor) &&
    grupoH02(pedido) === "novos" &&
    elegivelAceiteLocal(pedido).elegivel;
  const podeCancelar = (pedido: PedidoH02) =>
    !somenteLeitura &&
    !!papeis?.includes("admin") &&
    ["novos", "aceitos", "producao", "prontos"].includes(grupoH02(pedido));
  const alterar = <K extends keyof FiltrosH02>(campo: K, valor: FiltrosH02[K]) => {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setLimiteLista(30);
  };
  function abrir(id: string, acao: NonNullable<typeof janela>["acao"] = "detalhes") {
    setFalha("");
    setMotivo("");
    setJanela({ id, acao });
  }
  function limpar() {
    setFiltros(FILTROS_H02);
    setPeriodo(null);
    setDatas({ de: "", ate: "" });
    setErroPeriodo("");
    setLimiteLista(30);
    if (etiquetaA01 || buscaInicial) limparA01();
  }
  async function exportarRecebimentos() {
    const recorte = historico.length ? historico : filtrados;
    if (!recorte.length) {
      setFalha("Nenhum pedido no recorte para exportar recebimentos.");
      return;
    }
    const { porPedido, disponivel } = await carregarEventosLedgerPorPedido(
      supabase,
      recorte.map((pedido) => pedido.id),
    );
    if (!disponivel) {
      setFalha("Ledger financeiro indisponível para este perfil. Nenhum dado foi exportado.");
      return;
    }
    const linhas = recorte.flatMap((pedido) => {
      const resumo = resumirRecebimentosPedido(
        pedido.id,
        porPedido[pedido.id] ?? [],
        Math.round(Number(pedido.total || 0) * 100),
      );
      return linhasRecebimentosParaCSV(resumo, pedido.numero, pedido.forma_pagamento);
    });
    if (!linhas.length) {
      setMensagem("Nenhum lançamento de recebimento no ledger para este recorte.");
      return;
    }
    downloadCSV("recebimentos-ledger.csv", linhas);
  }
  async function executar(acao: "aceitar" | "cancelar" | "imprimir") {
    if (
      !p ||
      emCurso.current ||
      somenteLeitura ||
      (acao === "aceitar" && !podeAceitar(p)) ||
      (acao === "cancelar" && (!podeCancelar(p) || motivo.trim().length < 3)) ||
      (acao === "imprimir" && !papeis?.includes("admin"))
    )
      return;
    emCurso.current = true;
    setOcupado(true);
    setFalha("");
    setMensagem("");
    try {
      if (acao === "aceitar") {
        const resposta = await executarAceiteAtendente({ cliente: supabase, pedido: p, autor });
        if (!resposta.ok)
          throw new Error(
            resposta.codigo === "flag-desativada"
              ? "O aceite ainda não está habilitado neste ambiente."
              : resposta.codigo === "conflito"
                ? "O pedido já foi aceito. Atualize a lista."
                : "O sistema não confirmou o aceite.",
          );
        setMensagem("Pedido #" + p.numero + " aceito.");
      } else if (acao === "cancelar") {
        const decisao = await decidirCancelamentoAtomico(supabase, p.id, motivo.trim());
        if (decisao.modo !== "atomico")
          throw new Error(
            decisao.modo === "erro"
              ? decisao.mensagem
              : "Cancelamento atômico indisponível neste ambiente.",
          );
        setMensagem("Cancelamento do pedido #" + p.numero + " confirmado.");
      } else {
        await impressaoDireta(supabase, p);
        setMensagem("Comanda do pedido #" + p.numero + " enviada à fila de impressão.");
      }
      abrir(p.id);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "A operação não foi confirmada.");
    } finally {
      void Promise.all(
        [
          "admin-pedidos",
          "dashboard-a01",
          "h02-pedidos-recentes",
          "h02-pedidos-periodo",
          "h02-historico",
          "central-pedidos",
          "fila-producao",
          "producao-reservas",
          "pedidos",
        ].map((k) => client.invalidateQueries({ queryKey: [k] })),
      );
      setOcupado(false);
      emCurso.current = false;
    }
  }
  function listarOpcoes<T extends readonly (readonly [string, string])[]>(opcoes: T) {
    return opcoes.map(([valor, label]) => (
      <option key={valor} value={valor}>
        {label}
      </option>
    ));
  }
  return (
    <main className="neia-a01 h02-pedidos" data-testid="central-pedidos-h02">
      <header className="neia-a01-cabecalho">
        <div>
          <h1>Central de Pedidos</h1>
          <p>Acompanhe aceitação, produção, retirada e entrega.</p>
        </div>
        <div className="h02-acoes">
          <Link to="/admin" hash="central-atendente" className="h02-botao neia-a01-dourado">
            Central da Atendente
          </Link>
          <Link to="/pdv" className="h02-botao neia-a01-dourado">
            Novo pedido no PDV
          </Link>
          <button
            type="button"
            className="h02-botao neia-a01-dourado"
            onClick={() => (periodo ? void porPeriodo.refetch() : recarregar())}
          >
            <RefreshCw size={16} aria-hidden /> Atualizar
          </button>
        </div>
      </header>
      <div className="h02-indicadores">
        {indicadores.map(([label, valor], i) => {
          const Icone = iconesIndicadores[i]!;
          return (
            <div className="neia-a01-metrica" key={label}>
              <span>
                <Icone size={16} aria-hidden /> {label}
              </span>
              <strong
                className={
                  i === 6 || i === 7 ? "neia-a01-vermelho" : i === 4 ? "neia-a01-verde" : undefined
                }
              >
                {valor ?? "—"}
              </strong>
            </div>
          );
        })}
      </div>
      <p className="h02-nota">
        {etiquetaA01 ??
          (periodo
            ? "Pedidos no período selecionado. Valor total exclui cancelamentos."
            : "Até 400 pedidos recentes. Valor total exclui cancelamentos.")}
      </p>
      <div className="h02-filtros">
        <label className="neia-a01-busca">
          <Search size={19} aria-hidden />
          <input
            type="search"
            aria-label="Buscar pedidos"
            placeholder="Número, cliente, telefone ou sabor"
            value={filtros.busca}
            onChange={(e) => alterar("busca", e.target.value)}
          />
        </label>
        <label>
          Situação
          <select value={filtros.grupo} onChange={(e) => alterar("grupo", e.target.value)}>
            <option value="">Todas as situações</option>
            {listarOpcoes(opcoesGrupo)}
          </select>
        </label>
        <label>
          Modalidade
          <select
            value={filtros.modalidade}
            onChange={(e) => alterar("modalidade", e.target.value)}
          >
            <option value="">Todas</option>
            <option value="entrega">Entrega</option>
            <option value="retirada">Retirada</option>
          </select>
        </label>
        <label>
          Forma de pagamento
          <select value={filtros.forma} onChange={(e) => alterar("forma", e.target.value)}>
            <option value="">Todas</option>
            {listarOpcoes(Object.entries(PAGAMENTO_LABEL))}
          </select>
        </label>
        <button type="button" className="h02-botao" onClick={limpar}>
          Limpar filtros
        </button>
      </div>
      <details className="neia-a01-cartao h02-filtros-detalhe">
        <summary>Mais filtros</summary>
        <div className="h02-filtros">
          <label>
            Agendamento
            <select value={filtros.agenda} onChange={(e) => alterar("agenda", e.target.value)}>
              <option value="">Todos</option>
              <option value="agendado">Agendados</option>
              <option value="imediato">Assim que possível</option>
            </select>
          </label>
          <label>
            Situação do pagamento
            <select
              value={filtros.pagamento}
              onChange={(e) => alterar("pagamento", e.target.value)}
            >
              <option value="">Todas</option>
              {listarOpcoes(Object.entries(PAGAMENTO_STATUS_LABEL))}
            </select>
          </label>
          <label>
            Canal de origem
            <select value={filtros.origem} onChange={(e) => alterar("origem", e.target.value)}>
              <option value="">Todos</option>
              {origens.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="h02-check">
            <input
              type="checkbox"
              checked={filtros.atrasados}
              onChange={(e) => alterar("atrasados", e.target.checked)}
            />{" "}
            Somente em atraso
          </label>
        </div>
        {!etiquetaA01 && (
          <form
            className="h02-filtros"
            onSubmit={(e) => {
              e.preventDefault();
              const faixa = faixaDashboard(datas.de, datas.ate);
              if (!faixa || faixa.dias > 366) {
                setErroPeriodo("Informe um período válido de até 366 dias.");
                return;
              }
              setPeriodo(faixa);
              setErroPeriodo("");
              setLimiteLista(30);
            }}
          >
            <label>
              Data inicial
              <input
                type="date"
                required
                value={datas.de}
                onChange={(e) => setDatas({ ...datas, de: e.target.value })}
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                required
                value={datas.ate}
                onChange={(e) => setDatas({ ...datas, ate: e.target.value })}
              />
            </label>
            <button className="h02-botao" type="submit">
              Aplicar período
            </button>
            {erroPeriodo && (
              <p role="alert" className="neia-a01-vermelho">
                {erroPeriodo}
              </p>
            )}
          </form>
        )}
      </details>
      {mensagem && (
        <p role="status" className="neia-a01-verde">
          {mensagem}
        </p>
      )}
      {falhou && (
        <p role="alert" className="neia-a01-vermelho">
          Não foi possível consultar os pedidos.{" "}
          <button
            className="h02-botao"
            onClick={() => (periodo ? void porPeriodo.refetch() : recarregar())}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {carregando && !falhou && <p role="status">Carregando pedidos…</p>}
      {dadosDisponiveis && (
        <>
          {!filtrados.length && (
            <p className="h02-nota" role="status">
              Nenhum pedido encontrado neste recorte.
            </p>
          )}
          <div className="h02-colunas">
            {COLUNAS_H02.map((g, i) => {
              const Icone = icones[i]!;
              const itens = filtrados
                .filter((pedido) => grupoH02(pedido) === g.id)
                .sort(
                  (a, b) =>
                    Number(atrasoH02(b, agora) === true) - Number(atrasoH02(a, agora) === true) ||
                    a.created_at.localeCompare(b.created_at),
                );
              return (
                <section className="h02-coluna" key={g.id} data-grupo-h02={g.id} data-cor={g.cor}>
                  <header>
                    <Icone size={20} aria-hidden />
                    <div>
                      <h2>
                        {g.titulo} <span>({itens.length})</span>
                      </h2>
                      <p>{g.descricao}</p>
                    </div>
                  </header>
                  <div className="h02-lista-cartoes">
                    {itens.length ? (
                      itens.map((pedido) => (
                        <Cartao
                          key={pedido.id}
                          pedido={pedido}
                          produtos={produtos}
                          agora={agora}
                          podeAceitar={podeAceitar(pedido)}
                          podeDespachar={!somenteLeitura && podeOperarEntregas(papeis)}
                          onDetalhes={() => abrir(pedido.id)}
                          onAceite={() => abrir(pedido.id, "aceitar")}
                        />
                      ))
                    ) : (
                      <p className="h02-nota">Nenhum pedido nesta coluna.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <section className="neia-a01-cartao h02-complementar">
            <div className="h02-linha">
              <h2>Pedidos em entrega, finalizados e cancelados</h2>
              {!!filtrados.length && (
                <button
                  className="h02-botao"
                  onClick={() =>
                    downloadCSV(
                      "pedidos.csv",
                      filtrados.map((pedido) => ({
                        numero: pedido.numero,
                        data: pedido.created_at,
                        cliente: pedido.cliente_nome,
                        telefone: pedido.telefone,
                        endereco: pedido.endereco,
                        bairro: pedido.bairro,
                        preferencia_pagamento: pedido.forma_pagamento,
                        subtotal: pedido.subtotal,
                        entrega: pedido.tipo_entrega,
                        taxa_entrega: pedido.taxa_entrega,
                        desconto: pedido.desconto,
                        total: pedido.total,
                        status: pedido.status,
                        evento: pedido.tipo_evento,
                        itens: pedido.pedido_itens
                          .map((i) => i.quantidade + "x " + i.nome)
                          .join(" | "),
                      })),
                    )
                  }
                >
                  Exportar CSV
                </button>
              )}
              {!!filtrados.length && (
                <button
                  className="h02-botao"
                  onClick={() => void exportarRecebimentos()}
                >
                  Exportar recebimentos do ledger
                </button>
              )}
            </div>
            <DarkTable
              className="h02-tabela"
              colunas={["Pedido", "Cliente", "Modalidade", "Situação", "Total", "Detalhes"]}
              vazio={historico.length ? undefined : "Nenhum pedido complementar neste recorte."}
            >
              {historico.slice(0, limiteLista).map((pedido) => (
                <DarkTableRow key={pedido.id}>
                  <td>
                    #{pedido.numero}
                    <p>{dataH02(pedido.created_at)}</p>
                  </td>
                  <td>{pedido.cliente_nome}</td>
                  <td>
                    <InfoModalidade pedido={pedido} />
                  </td>
                  <td>
                    {situacaoH02(pedido)}
                    {atrasoH02(pedido, agora) && <p className="neia-a01-vermelho">Em atraso</p>}
                  </td>
                  <td>{moedaH02(pedido.total)}</td>
                  <td>
                    <button className="h02-botao h02-contorno-dourado" onClick={() => abrir(pedido.id)}>
                      Ver detalhes
                    </button>
                  </td>
                </DarkTableRow>
              ))}
            </DarkTable>
            {historico.length > limiteLista && (
              <button className="h02-botao" onClick={() => setLimiteLista(limiteLista + 30)}>
                Mostrar mais pedidos
              </button>
            )}
          </section>
        </>
      )}
      {janela && p && (
        <Dialog
          open
          onOpenChange={(aberto) => {
            if (!aberto && !emCurso.current) setJanela(null);
          }}
        >
          <DialogContent className="neia-a01-dialogo h02-dialogo">
            <DialogHeader>
              <DialogTitle>
                {janela.acao === "cancelar"
                  ? "Cancelar pedido"
                  : janela.acao === "aceitar"
                    ? "Aceitar pedido"
                    : "Detalhes do pedido"}{" "}
                #{p.numero}
              </DialogTitle>
              <DialogDescription>
                {p.cliente_nome} · {situacaoH02(p)}
              </DialogDescription>
            </DialogHeader>
            {janela.acao === "detalhes" ? (
              <>
                <DetalhesPedidoH02
                  pedido={p}
                  produtos={produtos}
                  somenteLeitura={somenteLeitura}
                  papeis={papeis}
                />
                <div className="h02-acoes">
                  {podeAceitar(p) && (
                    <button
                      className="h02-botao neia-a01-dourado"
                      onClick={() => abrir(p.id, "aceitar")}
                    >
                      Aceitar pedido
                    </button>
                  )}
                  {podeCancelar(p) && (
                    <button
                      className="h02-botao h02-perigo"
                      onClick={() => abrir(p.id, "cancelar")}
                    >
                      Cancelar pedido
                    </button>
                  )}
                  {!somenteLeitura && papeis?.includes("admin") && (
                    <button
                      className="h02-botao"
                      disabled={ocupado}
                      onClick={() => void executar("imprimir")}
                    >
                      <Printer size={17} aria-hidden />
                      {p.impresso ? "Reimprimir comanda" : "Imprimir comanda"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <form
                className="neia-a01-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void executar(janela.acao === "cancelar" ? "cancelar" : "aceitar");
                }}
              >
                <p>
                  {janela.acao === "cancelar"
                    ? "Confirme o cancelamento e informe o motivo. A rotina existente libera somente reservas ainda não consumidas."
                    : "O aceite registra a confirmação da atendente. O início do preparo continua na fila da Cozinha."}
                </p>
                {janela.acao === "cancelar" && (
                  <label>
                    Justificativa
                    <textarea
                      required
                      minLength={3}
                      maxLength={240}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  </label>
                )}
                <div className="h02-acoes">
                  <button
                    className="h02-botao"
                    type="button"
                    disabled={ocupado}
                    onClick={() => abrir(p.id)}
                  >
                    Voltar aos detalhes
                  </button>
                  <button
                    className="h02-botao neia-a01-dourado"
                    type="submit"
                    disabled={
                      ocupado ||
                      (janela.acao === "cancelar"
                        ? !podeCancelar(p) || motivo.trim().length < 3
                        : !podeAceitar(p))
                    }
                  >
                    {ocupado
                      ? "Confirmando…"
                      : janela.acao === "cancelar"
                        ? "Confirmar cancelamento"
                        : "Confirmar aceite"}
                  </button>
                </div>
              </form>
            )}
            {mensagem && (
              <p role="status" className="neia-a01-verde">
                {mensagem}
              </p>
            )}
            {falha && (
              <p role="alert" className="neia-a01-vermelho">
                {falha}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
