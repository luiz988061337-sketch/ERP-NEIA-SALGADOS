import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock,
  Eye,
  Filter,
  History,
  MessageSquareText,
  Radar,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TarefasA01 } from "@/components/admin/tarefas-a01";
import { hojeSP } from "@/lib/competencia";
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
  variacao,
} from "@/lib/dashboard-a01";
import {
  financeiroDashboard,
  useClientesDashboard,
  useDadosDashboard,
  useInicioRotasDashboard,
} from "@/lib/dashboard-a01-dados";
import {
  CATEGORIAS_NEIA,
  categoriaDaRecomendacao,
  gerarRecomendacoesNeia,
  rotuloCategoriaNeia,
  rotuloNaturezaNeia,
  rotuloPrioridadeNeia,
  rotuloSituacaoFonteNeia,
  tomSituacaoFonteNeia,
  type CategoriaNeia,
  type SituacaoFonteNeia,
} from "@/lib/neia-inteligencia";
import {
  adiarRecomendacao,
  dispensarRecomendacao,
  estadoMaisRecente,
  marcarCienteRecomendacao,
  resolverRecomendacao,
  sincronizarOcorrencias,
  useRecomendacoesA02,
  vincularTarefaRecomendacao,
  type EstadoRecomendacao,
} from "@/lib/neia-recomendacoes";
import {
  SITUACOES_RECOMENDACAO,
  candidatosResolucao,
  correspondeFiltroSituacao,
  prazosAdiamento,
  rotuloSituacaoRecomendacao,
  situacaoEfetiva,
  validarAdiamento,
  validarMotivo,
  type FiltroSituacao,
  type SituacaoRecomendacao,
} from "@/lib/neia-recomendacoes-estado";
import { tarefasAtrasadas, useTarefasA01, type SugestaoTarefaA01 } from "@/lib/tarefas-a01";

const dataHoraBR = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

const secoes = [
  ["monitoramento", "Monitoramento preventivo", Radar],
  ["previsoes", "Previsões e cenários", CalendarClock],
  ["consulta", "Consulta inteligente", MessageSquareText],
] as const;

type ItemMonitoramento = {
  id: string;
  titulo: string;
  categoria: CategoriaNeia | undefined;
  prioridade: string;
  situacao: SituacaoRecomendacao;
  estado: EstadoRecomendacao | undefined;
  ativo: boolean;
  motivo: string;
  dados: string[];
  acao: string;
  destino: { to: string; hash?: string; rotulo: string };
  tarefa: { titulo: string; descricao: string; prioridade?: string };
};

export function NeiaInteligencia({ usuarioId }: { usuarioId: string }) {
  const hoje = hojeSP();
  const [dias, setDias] = useState<1 | 7 | 30>(7);
  const [secao, setSecao] = useState<(typeof secoes)[number][0]>("monitoramento");
  const [filtro, setFiltro] = useState<CategoriaNeia | "todas">("todas");
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>("todas");
  const [sugestao, setSugestao] = useState<SugestaoTarefaA01 | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [adiarItem, setAdiarItem] = useState<ItemMonitoramento | null>(null);
  const [adiarAte, setAdiarAte] = useState("");
  const [dispensarItem, setDispensarItem] = useState<ItemMonitoramento | null>(null);
  const [dispensarMotivo, setDispensarMotivo] = useState("");
  const [historicoItem, setHistoricoItem] = useState<ItemMonitoramento | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  const faixa = faixaDashboard(deslocarDia(hoje, 1 - dias), hoje)!;
  const [pedidosQuery, filaQuery, estoque, financeiro, entregas, , campanhas] = useDadosDashboard(
    usuarioId,
    faixa,
  );
  const crm = useClientesDashboard(usuarioId);
  const consultaTarefas = useTarefasA01(usuarioId);
  const persistidas = useRecomendacoesA02(usuarioId);
  const atrasadas = tarefasAtrasadas(
    consultaTarefas.isError ? undefined : consultaTarefas.data,
    usuarioId,
    hoje,
  );

  const pedidos = pedidosQuery.isError ? undefined : pedidosQuery.data;
  const fila = filaQuery.isError ? undefined : filaQuery.data;
  const saldos = estoque.isError ? undefined : estoque.data;
  const entregasDados = entregas.isError ? undefined : entregas.data;
  const fin =
    financeiro.isError || !financeiro.data
      ? undefined
      : financeiroDashboard(financeiro.data, faixa);

  const anterior = faixaAnterior(faixa);
  const vendas = pedidos
    ? resumirVendas(pedidos.filter((pedido) => contem(faixa, pedido.created_at)))
    : undefined;
  const base = pedidos
    ? resumirVendas(pedidos.filter((pedido) => contem(anterior, pedido.created_at)))
    : undefined;
  const filaEntrega = fila?.filter((pedido) => pedido.tipo_entrega === "entrega");
  const emProducao = fila?.filter((pedido) => pedido.status === "em_producao");
  const pedidosCarga = fila?.filter(
    (pedido) =>
      (pedido.status === "em_producao" || pertenceAoGrupo(pedido, "aceitos")) &&
      (!pedido.agendado_para || Date.parse(pedido.agendado_para) <= Date.now() + 90 * 60_000),
  );
  const carga = pedidosCarga && cargaCozinha(pedidosCarga);
  const previsaoAtraso =
    carga && !carga.incompleta && pedidosCarga
      ? pedidosCarga.filter(
          (pedido) =>
            pedido.agendado_para &&
            Date.parse(pedido.agendado_para) > Date.now() &&
            Date.parse(pedido.agendado_para) < Date.now() + carga.minutos * 60_000,
        ).length
      : null;
  const filaAtrasada = fila?.filter((pedido) => pertenceAoGrupo(pedido, "atrasados"));
  const esperandoMotoboy = filaEntrega?.filter((pedido) =>
    ["aguardando_motoboy", "pronto"].includes(pedido.status),
  ).length;
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
  const margem = vendas && saldos ? margemDashboard(vendas.validos, saldos.custos) : undefined;
  const lucro =
    margem?.contribuicao != null && !margem.parcial && fin && !fin.parcial
      ? margem.contribuicao - fin.despesaSemInsumos
      : null;
  const crescimento = vendas && base ? variacao(vendas.total, base.total) : null;
  const cliente = crm.isError || !crm.data ? undefined : resumirClientes(crm.data, faixa);

  const situacaoEstoque: SituacaoFonteNeia = estoque.isError
    ? "falha"
    : !saldos
      ? "falha"
      : !saldos.linhas.length
        ? "sem-registros"
        : saldos.linhas.some((linha) => linha.fisico === null || linha.minimo === null)
          ? "parcial"
          : "suficiente";
  const situacaoProducao: SituacaoFonteNeia = filaQuery.isError
    ? "falha"
    : !fila
      ? "falha"
      : !fila.length
        ? "sem-registros"
        : carga?.incompleta
          ? "parcial"
          : "suficiente";
  const situacaoEntregas: SituacaoFonteNeia =
    entregas.isError || filaQuery.isError
      ? "falha"
      : !entregasDados || !filaEntrega
        ? "falha"
        : !filaEntrega.length && !entregasDados.rotas && !entregasDados.motoboys
          ? "sem-registros"
          : entregues && entregues.length && tempoEntrega === null
            ? "parcial"
            : "suficiente";
  const financeiroBruto = financeiro.data;
  const situacaoFinanceiro: SituacaoFonteNeia = financeiro.isError
    ? "falha"
    : !fin || !financeiroBruto
      ? "falha"
      : !financeiroBruto.contas.length &&
          !financeiroBruto.eventos.length &&
          !financeiroBruto.pedidosPagos.length
        ? "sem-registros"
        : fin.parcial
          ? "parcial"
          : "suficiente";
  const situacaoComercial: SituacaoFonteNeia = pedidosQuery.isError
    ? "falha"
    : !pedidos
      ? "falha"
      : !pedidos.length
        ? "sem-registros"
        : crm.isError || campanhas.isError || !cliente
          ? "parcial"
          : "suficiente";
  const carregandoFontes = [pedidosQuery, filaQuery, estoque, financeiro, entregas].some(
    (consulta) => consulta.isLoading,
  );

  const atualizadoEm = new Date().toISOString();
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    fontes: {
      estoque: situacaoEstoque,
      producao: situacaoProducao,
      entregas: situacaoEntregas,
      financeiro: situacaoFinanceiro,
      comercial: situacaoComercial,
    },
    estoque: saldos
      ? {
          reposicao: saldos.linhas.filter((linha) => linha.repor).length,
          vencendo: saldos.linhas.filter((linha) => linha.vence).length,
          vencidos: saldos.linhas.filter((linha) => linha.vencido).length,
          sabores: saldos.linhas.map((linha) => ({
            nome: linha.nome,
            fisico: linha.fisico,
            reservado: linha.reservado,
            disponivel: linha.disponivel,
            minimo: linha.minimo,
          })),
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
          atrasadas: entregasDados
            ? filaEntrega.filter((pedido) => entregasDados.atrasos.has(pedido.id)).length
            : null,
        }
      : undefined,
    financeiro: fin
      ? {
          vencido: fin.vencido,
          vencendo: fin.vencendo,
          recebimentosAtrasados: fin.receberAtrasado,
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
          reativar30a59: cliente?.reativar[0] ?? null,
          reativar60a89: cliente?.reativar[1] ?? null,
          reativar90mais: cliente?.reativar[2] ?? null,
          campanhasProntas: campanhas.isError ? null : (campanhas.data ?? null),
        }
      : undefined,
  });

  const agora = Date.now();
  const estados = persistidas.estados;
  const estadoDe = (id: string) => estadoMaisRecente(estados, id);
  // Só a ocorrência mais recente de cada recomendação participa da resolução
  // automática: ocorrências antigas já foram encerradas.
  const estadosRecentes = estados.filter(
    (estado) => estadoMaisRecente(estados, estado.recomendacao_id)?.id === estado.id,
  );

  // Registro das ocorrências: cria o estado da recomendação, reativa a que
  // voltou e mantém a prioridade alinhada com a leitura atual.
  const assinatura = resultado.recomendacoes
    .map((item) => item.id + ":" + item.prioridade)
    .join("|");
  const sincronizando = useRef(false);
  useEffect(() => {
    if (sincronizando.current) return;
    if (carregandoFontes || persistidas.isLoading || persistidas.isError) return;
    if (!assinatura) return;
    sincronizando.current = true;
    void sincronizarOcorrencias(
      resultado.recomendacoes.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        prioridade: item.prioridade,
      })),
      estados,
      agora,
    )
      .then(async (mudancas) => {
        if (mudancas > 0) await persistidas.refetch();
      })
      .catch((falha: Error) => setErro(falha.message))
      .finally(() => {
        sincronizando.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, estados.length, persistidas.isLoading, persistidas.isError, carregandoFontes]);

  // Resolução automática: a recomendação só é resolvida quando some de duas
  // leituras seguidas do mesmo período e a fonte tem dados suficientes.
  const situacaoPorCategoria = useMemo(
    () => ({
      estoque: situacaoEstoque,
      producao: situacaoProducao,
      entregas: situacaoEntregas,
      financeiro: situacaoFinanceiro,
      comercial: situacaoComercial,
    }),
    [situacaoEstoque, situacaoProducao, situacaoEntregas, situacaoFinanceiro, situacaoComercial],
  );
  const leituras = useRef(new Map<number, Set<string>>());
  const resolvendo = useRef(false);
  useEffect(() => {
    if (resolvendo.current) return;
    if (carregandoFontes || persistidas.isLoading || persistidas.isError) return;
    const ids = new Set(resultado.recomendacoes.map((item) => item.id));
    const anteriorDias = leituras.current.get(dias);
    leituras.current.set(dias, ids);
    if (!anteriorDias) return;
    const candidatos = candidatosResolucao(
      estadosRecentes,
      resultado.recomendacoes.map((item) => item.id),
      categoriaDaRecomendacao,
      (categoria) => situacaoPorCategoria[categoria as CategoriaNeia],
      agora,
    ).filter((estado) => anteriorDias.has(estado.recomendacao_id));
    if (!candidatos.length) return;
    resolvendo.current = true;
    void Promise.all(
      candidatos.map((estado) =>
        resolverRecomendacao(estado.id, {
          motivo: "A leitura atual não confirmou mais este alerta.",
          em: new Date().toISOString(),
        }).catch(() => null),
      ),
    )
      .then(async () => {
        await persistidas.refetch();
      })
      .finally(() => {
        resolvendo.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, estados.length, dias, carregandoFontes, persistidas.isLoading]);

  // Vínculo da tarefa criada a partir da sugestão com a recomendação de origem.
  const tarefas = consultaTarefas.isError ? undefined : consultaTarefas.data;
  useEffect(() => {
    if (!tarefas || persistidas.isLoading) return;
    for (const estado of estados) {
      if (estado.tarefa_id) continue;
      const tarefa = tarefas.find(
        (item) =>
          item.recomendacao_id === estado.recomendacao_id &&
          item.rec_chave === estado.chave &&
          item.rec_ocorrencia === estado.ocorrencia &&
          !item.concluida &&
          !item.excluida,
      );
      if (!tarefa) continue;
      void vincularTarefaRecomendacao(estado.id, tarefa.id)
        .then(() => persistidas.refetch())
        .catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefas, estados.length]);

  const itemDe = (recomendacaoId: string): ItemMonitoramento | undefined => {
    const estado = estadoDe(recomendacaoId);
    const gerada = resultado.recomendacoes.find((item) => item.id === recomendacaoId);
    if (gerada) {
      return {
        id: gerada.id,
        titulo: gerada.titulo,
        categoria: gerada.categoria,
        prioridade: gerada.prioridade,
        situacao: situacaoEfetiva(estado, agora),
        estado,
        ativo: true,
        motivo: gerada.motivo,
        dados: gerada.dados,
        acao: gerada.acao,
        destino: gerada.destino,
        tarefa: gerada.tarefa,
      };
    }
    if (!estado) return undefined;
    return {
      id: estado.recomendacao_id,
      titulo: estado.titulo,
      categoria: categoriaDaRecomendacao(estado.recomendacao_id),
      prioridade: estado.prioridade,
      situacao: situacaoEfetiva(estado, agora),
      estado,
      ativo: false,
      motivo:
        estado.situacao === "dispensada"
          ? "Dispensada: " + (estado.dispensada_motivo ?? "sem motivo registrado")
          : estado.situacao === "resolvida"
            ? "Resolvida pela reavaliação dos dados. A leitura atual não confirma mais este alerta."
            : "A leitura atual não confirmou mais este alerta.",
      dados: [],
      acao: "Consulte o histórico para ver quem registrou a decisão.",
      destino: { to: "/admin", hash: "neia-inteligencia", rotulo: "Ver recomendações" },
      tarefa: { titulo: estado.titulo, descricao: estado.titulo },
    };
  };

  const todosItens = useMemo(() => {
    const ids = new Set(resultado.recomendacoes.map((item) => item.id));
    const itens = resultado.recomendacoes.map((item) => itemDe(item.id)!);
    for (const estado of estados) {
      if (ids.has(estado.recomendacao_id)) continue;
      const historicoItem = itemDe(estado.recomendacao_id);
      if (historicoItem) itens.push(historicoItem);
    }
    return itens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, estados.length, agora]);

  const porCategoria =
    filtro === "todas" ? todosItens : todosItens.filter((item) => item.categoria === filtro);
  const recomendacoes = porCategoria.filter((item) =>
    correspondeFiltroSituacao(item.situacao, filtroSituacao, !!item.estado?.tarefa_id),
  );
  const indisponiveis = resultado.fontes.filter((fonte) => !fonte.disponivel);
  const ativas = todosItens.filter(
    (item) =>
      item.ativo &&
      (item.situacao === "pendente" || item.situacao === "ciente" || item.situacao === "adiada"),
  );
  const tarefasDe = (item: ItemMonitoramento) =>
    tarefas?.find(
      (tarefa) =>
        tarefa.recomendacao_id === item.id &&
        tarefa.rec_chave === (item.estado?.chave ?? item.id) &&
        tarefa.rec_ocorrencia === (item.estado?.ocorrencia ?? 1) &&
        !tarefa.concluida &&
        !tarefa.excluida,
    );

  async function recarregar() {
    await persistidas.refetch();
    await consultaTarefas.refetch();
  }

  async function acionar(acao: () => Promise<unknown>, mensagem: string) {
    setProcessando(true);
    setErro("");
    try {
      await acao();
      setMsg(mensagem);
      await recarregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível concluir a ação.");
    } finally {
      setProcessando(false);
    }
  }

  function sugerir(item: ItemMonitoramento) {
    setSugestao({
      titulo: item.tarefa.titulo,
      descricao: item.tarefa.descricao,
      prioridade: item.tarefa.prioridade as "baixa" | "normal" | "alta" | "critica",
      recomendacao_id: item.id,
      rec_chave: item.estado?.chave ?? item.id,
      rec_ocorrencia: item.estado?.ocorrencia ?? 1,
      origemRotulo: item.titulo,
    });
  }

  const prazos = prazosAdiamento(agora);
  const erroAdiamento = adiarItem
    ? validarAdiamento(adiarItem.prioridade, agora, adiarAte ? Date.parse(adiarAte) : Number.NaN)
    : null;

  return (
    <div className="neia-a01 neia-a02">
      <header className="neia-a01-cabecalho">
        <div>
          <h1>A02.1 — Néia Inteligência</h1>
          <p>Monitoramento preventivo de estoque, produção, entregas, financeiro e comercial.</p>
        </div>
        <div className="neia-a01-periodo">
          <span>
            <CalendarClock size={18} />
            Últimos {dias} {dias === 1 ? "dia" : "dias"}
          </span>
          <div aria-label="Período do monitoramento">
            {(
              [
                [1, "Hoje"],
                [7, "7 dias"],
                [30, "30 dias"],
              ] as const
            ).map(([id, rotulo]) => (
              <button type="button" key={id} aria-pressed={dias === id} onClick={() => setDias(id)}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="neia-a02-secoes" aria-label="Seções da Néia Inteligência">
        {secoes.map(([id, rotulo, Icone]) => (
          <button type="button" key={id} aria-pressed={secao === id} onClick={() => setSecao(id)}>
            <Icone size={17} />
            {rotulo}
          </button>
        ))}
      </nav>

      {secao === "monitoramento" ? (
        <>
          <div className="neia-a02-grade">
            <div className="neia-a01-metrica">
              <span>
                <Sparkles size={16} /> Recomendações
              </span>
              <strong>{ativas.length}</strong>
              <small>Geradas com os dados disponíveis neste período.</small>
            </div>
            <div className="neia-a01-metrica">
              <span>
                <CircleAlert size={16} /> Críticas
              </span>
              <strong>{ativas.filter((item) => item.prioridade === "critica").length}</strong>
              <small>Exigem conferência imediata do responsável.</small>
            </div>
            <div className="neia-a01-metrica">
              <span>
                <Filter size={16} /> Prioridade alta
              </span>
              <strong>{ativas.filter((item) => item.prioridade === "alta").length}</strong>
              <small>Acompanhar antes do próximo fechamento.</small>
            </div>
            <div className="neia-a01-metrica">
              <span>
                <ClipboardList size={16} /> Tarefas atrasadas
              </span>
              <strong>{consultaTarefas.isError ? "—" : atrasadas.length}</strong>
              <small>Somente as tarefas sob sua responsabilidade.</small>
            </div>
          </div>

          <section className="neia-a01-cartao neia-a02-fontes" aria-label="Fontes consultadas">
            <h2>
              <Radar size={18} /> Fontes consultadas
            </h2>
            {carregandoFontes ? (
              <p className="neia-a01-nota" role="status">
                Consultando as fontes…
              </p>
            ) : (
              <div className="neia-a02-etiquetas">
                {resultado.fontes.map((fonte) => (
                  <span
                    key={fonte.categoria}
                    className={"neia-a01-" + tomSituacaoFonteNeia(fonte.situacao)}
                  >
                    {rotuloCategoriaNeia(fonte.categoria)}:{" "}
                    {rotuloSituacaoFonteNeia(fonte.situacao)}
                  </span>
                ))}
              </div>
            )}
            {resultado.semDados ? (
              <p className="neia-a01-estado" role="alert">
                Sem dados suficientes para gerar recomendações. Nada é concluído sem leitura
                confirmada das fontes, e ausência de registros não é tratada como operação normal.
              </p>
            ) : indisponiveis.length ? (
              <p className="neia-a01-nota">
                {indisponiveis.length} de {resultado.fontes.length} áreas tiveram falha de consulta
                e ficam fora das conclusões desta leitura. Elas não geram alerta por suposição.
              </p>
            ) : resultado.fontes.some((fonte) => fonte.situacao === "sem-registros") ? (
              <p className="neia-a01-nota">
                Áreas sem registros aparecem separadas das áreas com dados suficientes e não são
                interpretadas como operação normal.
              </p>
            ) : resultado.fontes.some((fonte) => fonte.situacao === "parcial") ? (
              <p className="neia-a01-nota">
                As áreas com dados parciais geram apenas as conclusões sustentadas pelos registros
                disponíveis.
              </p>
            ) : null}
            {persistidas.isError ? (
              <p className="neia-a01-estado" role="alert">
                Não foi possível carregar a situação das recomendações. As decisões administrativas
                continuam registradas no servidor; recarregue a página para tentar de novo.
              </p>
            ) : null}
            {msg && (
              <p className="neia-a01-verde" role="status">
                {msg}
              </p>
            )}
            {erro && (
              <p className="neia-a01-vermelho" role="alert">
                {erro}
              </p>
            )}
          </section>

          <section className="neia-a01-cartao neia-a02-monitoramento">
            <h2>
              <Sparkles size={18} /> Recomendações preventivas
            </h2>
            <div className="neia-a02-filtros" role="group" aria-label="Filtrar por categoria">
              <button
                type="button"
                aria-pressed={filtro === "todas"}
                onClick={() => setFiltro("todas")}
              >
                Todas
              </button>
              {CATEGORIAS_NEIA.map(([id, rotulo]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={filtro === id}
                  onClick={() => setFiltro(id)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="neia-a02-filtros" role="group" aria-label="Filtrar por situação">
              <button
                type="button"
                aria-pressed={filtroSituacao === "todas"}
                onClick={() => setFiltroSituacao("todas")}
              >
                Todas as situações
              </button>
              {SITUACOES_RECOMENDACAO.map(([id, rotulo]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={filtroSituacao === id}
                  onClick={() => setFiltroSituacao(id)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {recomendacoes.length ? (
              <ul className="neia-a02-lista">
                {recomendacoes.map((item) => {
                  const expandida = aberta === item.id;
                  const tarefaVinculada = tarefasDe(item);
                  const podeAgir = !!item.estado && item.situacao !== "resolvida";
                  return (
                    <li key={item.id + (item.estado?.ocorrencia ?? 0)}>
                      <div className="neia-a02-etiquetas">
                        <span className={"neia-a01-" + (item.ativo ? "ouro" : "azul")}>
                          <strong>{rotuloSituacaoRecomendacao(item.situacao)}</strong>
                        </span>
                        <span>
                          {item.categoria ? rotuloCategoriaNeia(item.categoria) : "Geral"}
                        </span>
                        <span>
                          Prioridade{" "}
                          {rotuloPrioridadeNeia(
                            item.prioridade as Parameters<typeof rotuloPrioridadeNeia>[0],
                          )}
                        </span>
                        {item.estado ? <span>Ocorrência {item.estado.ocorrencia}</span> : null}
                        {tarefaVinculada ? <span>Tarefa vinculada</span> : null}
                      </div>
                      <strong>{item.titulo}</strong>
                      <p>{item.motivo}</p>
                      {item.estado?.situacao === "adiada" && item.estado.adiada_ate ? (
                        <p className="neia-a01-nota">
                          Adiada até {dataHoraBR.format(new Date(item.estado.adiada_ate))}
                          {situacaoEfetiva(item.estado, agora) === "pendente"
                            ? " — prazo vencido, o alerta voltou a ficar pendente."
                            : "."}
                        </p>
                      ) : null}
                      {item.estado?.situacao === "dispensada" && item.estado.dispensada_motivo ? (
                        <p className="neia-a01-nota">
                          Motivo da dispensa: {item.estado.dispensada_motivo}
                        </p>
                      ) : null}
                      <div className="neia-a02-acoes">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-expanded={expandida}
                          aria-controls={`recomendacao-${item.id}`}
                          onClick={() => setAberta(expandida ? null : item.id)}
                        >
                          <ChevronDown
                            size={16}
                            className={expandida ? "neia-a02-girar" : undefined}
                          />
                          {expandida ? "Fechar recomendação" : "Abrir recomendação"}
                        </Button>
                        {item.estado ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAberta(item.id);
                              setHistoricoItem(item);
                            }}
                          >
                            <History size={16} /> Histórico
                          </Button>
                        ) : null}
                      </div>
                      {expandida ? (
                        <div id={`recomendacao-${item.id}`} className="neia-a02-detalhe">
                          {item.dados.length ? (
                            <p className="neia-a01-nota">
                              Dados utilizados: {item.dados.join("; ")}.
                            </p>
                          ) : null}
                          <p className="neia-a01-nota">
                            Atualizado em{" "}
                            {dataHoraBR.format(
                              new Date(item.estado?.atualizado_em ?? atualizadoEm),
                            )}
                            .
                          </p>
                          <p>
                            <strong>Ação sugerida:</strong> {item.acao}
                          </p>
                          <div className="neia-a02-acoes">
                            <Link
                              to={item.destino.to}
                              {...(item.destino.hash ? { hash: item.destino.hash } : {})}
                            >
                              {item.destino.rotulo}
                            </Link>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={consultaTarefas.isError || !!tarefaVinculada}
                              onClick={() => sugerir(item)}
                            >
                              <ClipboardList size={16} />
                              {tarefaVinculada ? "Tarefa já criada" : "Sugerir tarefa"}
                            </Button>
                            {podeAgir && item.situacao === "pendente" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={processando}
                                onClick={() => {
                                  setErro("");
                                  setMsg("");
                                  void acionar(
                                    () => marcarCienteRecomendacao(item.estado!.id),
                                    "Recomendação marcada como ciente.",
                                  );
                                }}
                              >
                                <Eye size={16} /> Marcar ciente
                              </Button>
                            ) : null}
                            {podeAgir ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={processando}
                                onClick={() => {
                                  setErro("");
                                  setMsg("");
                                  setAdiarAte("");
                                  setAdiarItem(item);
                                }}
                              >
                                <Clock size={16} /> Adiar
                              </Button>
                            ) : null}
                            {podeAgir ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={processando}
                                onClick={() => {
                                  setErro("");
                                  setMsg("");
                                  setDispensarMotivo("");
                                  setDispensarItem(item);
                                }}
                              >
                                <Trash2 size={16} /> Dispensar
                              </Button>
                            ) : null}
                          </div>
                          {tarefaVinculada ? (
                            <p className="neia-a01-nota">
                              Tarefa "{tarefaVinculada.titulo}" criada a partir desta recomendação.
                              Concluir ou excluir a tarefa não resolve nem dispensa a recomendação.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="neia-a01-nota">
                Nenhuma recomendação nesta categoria com os dados disponíveis.
              </p>
            )}
          </section>

          <section className="neia-a01-cartao">
            <h2>
              <ClipboardList size={18} /> Sugestões e tarefas
            </h2>
            <p className="neia-a01-nota">
              A sugestão abre o formulário preenchido. A tarefa só é criada depois da confirmação do
              administrador, com registro de origem “inteligência” e vínculo com a recomendação.
            </p>
            <TarefasA01
              usuarioId={usuarioId}
              admin
              hoje={hoje}
              consulta={consultaTarefas}
              sugestao={sugestao}
              limparSugestao={() => setSugestao(null)}
            />
          </section>
        </>
      ) : (
        <section className="neia-a01-cartao neia-a02-pendente">
          <h2>
            <BrainCircuit size={18} />
            {secao === "previsoes"
              ? "Previsões e cenários (A02.2)"
              : "Consulta inteligente (A02.3)"}
          </h2>
          <p className="neia-a01-estado">
            {secao === "previsoes"
              ? "Esta etapa entrega somente o monitoramento preventivo. Cenários, projeções e simulações dependem da autorização da A02.2 e não são calculados aqui."
              : "A consulta em linguagem natural depende da A02.3 e não está ativa nesta etapa. Nenhuma resposta é simulada com dados fictícios."}
          </p>
          <p className="neia-a01-nota">
            Enquanto a etapa seguinte não for autorizada, use as recomendações do monitoramento com
            os links para Estoque, Produção, Entregas, Financeiro e Comercial.
          </p>
          <Button variant="outline" onClick={() => setSecao("monitoramento")}>
            Voltar ao monitoramento
          </Button>
        </section>
      )}

      <Dialog
        open={!!adiarItem}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setAdiarItem(null);
            setErro("");
          }
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Adiar recomendação</DialogTitle>
            <DialogDescription>
              {adiarItem?.titulo} — o alerta fica adiado até o prazo escolhido e volta a aparecer
              quando o prazo vencer.
            </DialogDescription>
          </DialogHeader>
          <div className="neia-a02-acoes">
            {prazos.map((prazo) => {
              const limite =
                adiarItem?.prioridade === "critica" &&
                prazo.ate !== 0 &&
                prazo.ate - agora > 24 * 60 * 60 * 1000;
              return (
                <Button
                  key={prazo.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={limite}
                  onClick={() =>
                    setAdiarAte(
                      prazo.ate === 0
                        ? ""
                        : new Date(prazo.ate - new Date(prazo.ate).getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 16),
                    )
                  }
                >
                  {prazo.rotulo}
                </Button>
              );
            })}
          </div>
          {adiarItem?.prioridade === "critica" ? (
            <p className="neia-a01-ouro">
              Alerta crítico: o adiamento é limitado a 24 horas e o limite fica sinalizado.
            </p>
          ) : null}
          <label>
            Data e hora do prazo
            <Input
              type="datetime-local"
              value={adiarAte}
              onChange={(evento) => setAdiarAte(evento.target.value)}
            />
          </label>
          {erroAdiamento ? (
            <p className="neia-a01-vermelho" role="alert">
              {erroAdiamento}
            </p>
          ) : null}
          <Button
            className="neia-a01-dourado"
            disabled={processando || !adiarAte || !!erroAdiamento}
            onClick={() => {
              if (!adiarItem || !adiarAte) return;
              const data = new Date(adiarAte);
              void acionar(
                () => adiarRecomendacao(adiarItem.estado!.id, data.toISOString()),
                "Recomendação adiada.",
              ).then(() => setAdiarItem(null));
            }}
          >
            Confirmar adiamento
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!dispensarItem}
        onOpenChange={(aberto) => {
          if (!aberto) {
            setDispensarItem(null);
            setErro("");
          }
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Dispensar recomendação</DialogTitle>
            <DialogDescription>
              {dispensarItem?.titulo} — registre o motivo. A dispensa vale por 7 dias e depois o
              alerta pode voltar.
            </DialogDescription>
          </DialogHeader>
          <label>
            Motivo da dispensa
            <Textarea
              maxLength={500}
              value={dispensarMotivo}
              onChange={(evento) => setDispensarMotivo(evento.target.value)}
            />
          </label>
          {validarMotivo(dispensarMotivo) ? (
            <p className="neia-a01-nota">{validarMotivo(dispensarMotivo)}</p>
          ) : null}
          <Button
            className="neia-a01-dourado"
            disabled={processando || !!validarMotivo(dispensarMotivo)}
            onClick={() => {
              if (!dispensarItem) return;
              void acionar(
                () => dispensarRecomendacao(dispensarItem.estado!.id, dispensarMotivo),
                "Recomendação dispensada com o motivo registrado.",
              ).then(() => setDispensarItem(null));
            }}
          >
            Confirmar dispensa
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!historicoItem}
        onOpenChange={(aberto) => {
          if (!aberto) setHistoricoItem(null);
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Histórico da recomendação</DialogTitle>
            <DialogDescription>{historicoItem?.titulo}</DialogDescription>
          </DialogHeader>
          {historicoItem?.estado ? (
            <ul className="neia-a01-notificacoes">
              {persistidas.historico
                .filter((evento) => evento.estado_id === historicoItem.estado!.id)
                .map((evento) => (
                  <li key={evento.id}>
                    <strong>
                      {evento.acao} · {evento.ator_nome}
                    </strong>
                    <p>{dataHoraBR.format(new Date(evento.ocorreu_em))}</p>
                    {evento.detalhe?.["motivo"] ? (
                      <p>Motivo: {String(evento.detalhe["motivo"])}</p>
                    ) : null}
                    {evento.detalhe?.["ate"] ? (
                      <p>Prazo: {dataHoraBR.format(new Date(String(evento.detalhe["ate"])))}</p>
                    ) : null}
                  </li>
                ))}
              {!persistidas.historico.some(
                (evento) => evento.estado_id === historicoItem.estado!.id,
              ) ? (
                <li>Nenhum evento registrado.</li>
              ) : null}
            </ul>
          ) : (
            <p className="neia-a01-nota">
              Esta recomendação ainda não foi registrada pelo servidor. Recarregue a página para
              atualizar a situação.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
