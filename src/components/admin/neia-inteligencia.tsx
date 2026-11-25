import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BrainCircuit,
  CalendarClock,
  CircleAlert,
  ClipboardList,
  Filter,
  MessageSquareText,
  Radar,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  gerarRecomendacoesNeia,
  rotuloCategoriaNeia,
  rotuloNaturezaNeia,
  rotuloPrioridadeNeia,
  type CategoriaNeia,
} from "@/lib/neia-inteligencia";
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

export function NeiaInteligencia({ usuarioId }: { usuarioId: string }) {
  const hoje = hojeSP();
  const [dias, setDias] = useState<1 | 7 | 30>(7);
  const [secao, setSecao] = useState<(typeof secoes)[number][0]>("monitoramento");
  const [filtro, setFiltro] = useState<CategoriaNeia | "todas">("todas");
  const [sugestao, setSugestao] = useState<SugestaoTarefaA01 | null>(null);

  const faixa = faixaDashboard(deslocarDia(hoje, 1 - dias), hoje)!;
  const [pedidosQuery, filaQuery, estoque, financeiro, entregas, , campanhas] = useDadosDashboard(
    usuarioId,
    faixa,
  );
  const crm = useClientesDashboard(usuarioId);
  const consultaTarefas = useTarefasA01(usuarioId);
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

  const atualizadoEm = new Date().toISOString();
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    estoque: saldos
      ? {
          reposicao: saldos.linhas.filter((linha) => linha.repor).length,
          vencendo: saldos.linhas.filter((linha) => linha.vence).length,
          vencidos: saldos.linhas.filter((linha) => linha.vencido).length,
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
  });

  const recomendacoes =
    filtro === "todas"
      ? resultado.recomendacoes
      : resultado.recomendacoes.filter((item) => item.categoria === filtro);
  const indisponiveis = resultado.fontes.filter((fonte) => !fonte.disponivel);

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
              <strong>{resultado.recomendacoes.length}</strong>
              <small>Geradas com os dados disponíveis neste período.</small>
            </div>
            <div className="neia-a01-metrica">
              <span>
                <CircleAlert size={16} /> Críticas
              </span>
              <strong>{resultado.resumo.critica}</strong>
              <small>Exigem conferência imediata do responsável.</small>
            </div>
            <div className="neia-a01-metrica">
              <span>
                <Filter size={16} /> Prioridade alta
              </span>
              <strong>{resultado.resumo.alta}</strong>
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
            <div className="neia-a02-etiquetas">
              {resultado.fontes.map((fonte) => (
                <span
                  key={fonte.categoria}
                  className={fonte.disponivel ? "neia-a01-verde" : "neia-a01-ouro"}
                >
                  {rotuloCategoriaNeia(fonte.categoria)}:{" "}
                  {fonte.disponivel ? "dados disponíveis" : "indisponível nesta consulta"}
                </span>
              ))}
            </div>
            {resultado.semDados ? (
              <p className="neia-a01-estado" role="alert">
                Sem dados suficientes para gerar recomendações. Nada é concluído sem leitura
                confirmada das fontes.
              </p>
            ) : indisponiveis.length ? (
              <p className="neia-a01-nota">
                As áreas indisponíveis ficam fora das conclusões desta consulta e não geram alerta
                por suposição.
              </p>
            ) : null}
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

            {recomendacoes.length ? (
              <ul className="neia-a02-lista">
                {recomendacoes.map((item) => (
                  <li key={item.id}>
                    <div className="neia-a02-etiquetas">
                      <span className={"neia-a01-" + item.tom}>
                        <strong>{rotuloNaturezaNeia(item.natureza)}</strong>
                      </span>
                      <span>{rotuloCategoriaNeia(item.categoria)}</span>
                      <span>Prioridade {rotuloPrioridadeNeia(item.prioridade)}</span>
                    </div>
                    <strong>{item.titulo}</strong>
                    <p>{item.motivo}</p>
                    <p className="neia-a01-nota">Dados utilizados: {item.dados.join("; ")}.</p>
                    <p className="neia-a01-nota">
                      Atualizado em {dataHoraBR.format(new Date(item.atualizadoEm))}.
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
                        disabled={consultaTarefas.isError}
                        onClick={() => setSugestao(item.tarefa)}
                      >
                        <ClipboardList size={16} /> Sugerir tarefa
                      </Button>
                    </div>
                  </li>
                ))}
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
              administrador, com registro de origem “inteligência”.
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
    </div>
  );
}
