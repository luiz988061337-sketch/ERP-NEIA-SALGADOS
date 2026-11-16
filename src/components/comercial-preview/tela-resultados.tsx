import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign,
  ClipboardList, Info, Percent, ShoppingBag, TrendingUp, Users,
} from "lucide-react";
import { useComercial } from "./contexto";
import { candidatoCampanha } from "./candidatos-campanha";
import {
  agregarResultados, alertasResultados, calcularResultadoCampanha,
  CAMPANHAS_RESULTADO_DEMO, classificarMargemDemo, contarRecuperacaoPorSegmentos,
  filtrarResultados, formatarCentavos, formatarPercentual,
  resumirRecuperacao, type FiltrosResultados, type SegmentoResultado,
} from "./resultados-regras";

const SEGMENTOS: { id: SegmentoResultado; label: string }[] = [
  { id: "inativos_30", label: "Inativos · 30–59 dias" },
  { id: "inativos_60", label: "Inativos · 60–89 dias" },
  { id: "inativos_90", label: "Inativos · 90+ dias" },
  { id: "recorrentes", label: "Clientes recorrentes" },
  { id: "vip", label: "Clientes VIP" },
  { id: "queda_frequencia", label: "Queda de frequência · em risco" },
  { id: "reclamacoes", label: "Histórico de reclamação" },
];
const SEGMENTO_LABEL = Object.fromEntries(SEGMENTOS.map((item) => [item.id, item.label])) as Record<SegmentoResultado, string>;
const FILTROS_INICIAIS: FiltrosResultados = {
  periodo: "todos", campanha: "todas", segmento: "todos", status: "todos", desempenho: "todos",
};
const dinheiro = (valor: number | null | undefined) => formatarCentavos(valor);
const percentual = (valor: number | null | undefined) => formatarPercentual(valor);

export function TelaResultados() {
  const { clientes } = useComercial();
  const [filtros, setFiltros] = useState<FiltrosResultados>(FILTROS_INICIAIS);
  const [selecionada, setSelecionada] = useState(CAMPANHAS_RESULTADO_DEMO[0]!.id);
  const [analiseAberta, setAnaliseAberta] = useState(false);
  const [alertasAbertos, setAlertasAbertos] = useState(false);
  const campanhas = useMemo(() => filtrarResultados(CAMPANHAS_RESULTADO_DEMO, filtros), [filtros]);
  const resumo = useMemo(() => agregarResultados(campanhas), [campanhas]);
  const campanhaAtual = campanhas.find((campanha) => campanha.id === selecionada) ?? campanhas[0] ?? null;
  const resultadoAtual = campanhaAtual ? calcularResultadoCampanha(campanhaAtual) : null;
  const avisos = useMemo(() => alertasResultados(campanhas), [campanhas]);
  const candidatos = useMemo(() => new Map(clientes.map((cliente) => {
    const candidato = candidatoCampanha(cliente);
    return [cliente.id, { vip: candidato.vip, recorrente: candidato.recorrente }] as const;
  })), [clientes]);
  const segmentosSelecionados = [...new Set(campanhas.map((campanha) => campanha.segmento))];
  const recuperacaoUnica = useMemo(
    () => contarRecuperacaoPorSegmentos(clientes, candidatos, segmentosSelecionados),
    [clientes, candidatos, campanhas],
  );
  const recuperacao = useMemo(
    () => resumirRecuperacao(clientes, candidatos, segmentosSelecionados),
    [clientes, candidatos, campanhas],
  );
  const porSegmento = SEGMENTOS.map((segmento) => {
    const linhas = campanhas.filter((campanha) => campanha.segmento === segmento.id && campanha.dados);
    const alcancados = linhas.reduce((total, campanha) => total + campanha.dados!.alcancados, 0);
    const pedidos = linhas.reduce((total, campanha) => total + campanha.dados!.pedidosAtribuidos, 0);
    return { ...segmento, alcancados, pedidos, conversao: alcancados ? pedidos / alcancados * 100 : null };
  }).filter((linha) => linha.alcancados > 0);
  const evolucao = useMemo(() => {
    const meses = new Map<string, { receitaLiquidaCentavos: number; margemCentavos: number; linhasComMargem: number; linhas: number }>();
    for (const campanha of campanhas) {
      const metricas = calcularResultadoCampanha(campanha);
      if (!metricas || metricas.receitaLiquidaCentavos === null) continue;
      const mes = campanha.fim.slice(0, 7);
      const acumulado = meses.get(mes) ?? { receitaLiquidaCentavos: 0, margemCentavos: 0, linhasComMargem: 0, linhas: 0 };
      acumulado.receitaLiquidaCentavos += metricas.receitaLiquidaCentavos;
      acumulado.linhas += 1;
      if (metricas.margemContribuicaoCentavos !== null) {
        acumulado.margemCentavos += metricas.margemContribuicaoCentavos;
        acumulado.linhasComMargem += 1;
      }
      meses.set(mes, acumulado);
    }
    return [...meses.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([mes, valores]) => ({
      periodo: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${mes}-15T12:00:00Z`)),
      ...valores,
      margemCentavos: valores.linhasComMargem ? valores.margemCentavos : null,
    }));
  }, [campanhas]);
  const maiorReceitaEvolucao = Math.max(1, ...evolucao.map((item) => item.receitaLiquidaCentavos));
  const campanhasComMargem = campanhas
    .map((campanha) => ({ campanha, metricas: calcularResultadoCampanha(campanha) }))
    .filter((item) => item.metricas?.margemContribuicaoCentavos !== null && item.metricas?.margemContribuicaoCentavos !== undefined);
  const melhor = [...campanhasComMargem].sort((a,b) => b.metricas!.margemContribuicaoCentavos! - a.metricas!.margemContribuicaoCentavos!)[0];
  const pior = [...campanhasComMargem].sort((a,b) => a.metricas!.margemContribuicaoCentavos! - b.metricas!.margemContribuicaoCentavos!)[0];
  const recoveryCards = recuperacao.map((linha) => {
    const amostras = campanhas.filter((campanha) => campanha.segmento === linha.segmento && campanha.dados);
    const receitas = amostras.map((campanha) => calcularResultadoCampanha(campanha)?.receitaLiquidaCentavos);
    const receitasConhecidas = receitas.filter((valor): valor is number => valor !== null && valor !== undefined);
    return { ...linha, receitaAtribuidaCentavos: receitasConhecidas.length ? receitasConhecidas.reduce((total, valor) => total + valor, 0) : null };
  });
  const margemNegativa = avisos.find((aviso) => aviso.nivel === "critico");
  const alertasInsuficientes = avisos.filter((aviso) => aviso.id.endsWith("-insuficiente")).length;
  const resumoAlertas = margemNegativa
    ? margemNegativa
    : alertasInsuficientes
      ? { titulo: `${alertasInsuficientes} campanha(s) com dados insuficientes`, descricao: "A análise completa mostra quais valores faltam." }
      : avisos.length
        ? { titulo: `${avisos.length} sinal(is) comparativo(s) para revisar`, descricao: "Alertas relativos ao conjunto demonstrativo." }
        : { titulo: "Nenhum alerta na amostra filtrada", descricao: "Os alertas são apenas demonstrativos." };
  const metricCards = [
    { label: "Vendas com promoções", value: dinheiro(resumo.receitaBrutaCentavos), detail: "Produtos com marcador demonstrativo", icon: ShoppingBag, tone: "gold" },
    { label: "Descontos concedidos", value: dinheiro(resumo.descontosCentavos), detail: "Descontos da amostra selecionada", icon: ArrowDownRight, tone: "warning" },
    { label: "Margem estimada", value: dinheiro(resumo.margemContribuicaoCentavos), detail: `${resumo.campanhasComMargem} campanha(s) com custos conhecidos`, icon: TrendingUp, tone: resumo.margemContribuicaoCentavos !== null && resumo.margemContribuicaoCentavos < 0 ? "danger" : "positive" },
    { label: "Clientes que voltaram", value: String(recuperacaoUnica.retornaram), detail: "Contagem única na base C1 filtrada", icon: Users, tone: "positive" },
    { label: "Pedidos com promoção", value: String(resumo.pedidos), detail: "Pedidos com marcador demonstrativo", icon: ClipboardList, tone: "gold" },
  ];
  const metricasAvancadas = [
    { label: "Receita líquida estimada", value: dinheiro(resumo.receitaLiquidaCentavos), detail: "Bruta − descontos − reembolsos", icon: CircleDollarSign },
    { label: "Reembolsos", value: dinheiro(resumo.reembolsosCentavos), detail: "Deduzidos uma única vez", icon: ArrowDownRight },
    { label: "Custos variáveis", value: dinheiro(resumo.custosVariaveisCentavos), detail: `${resumo.campanhasComMargem} com custos conhecidos`, icon: CircleDollarSign },
    { label: "Margem percentual", value: percentual(resumo.margemPercentual), detail: "Calculada sobre receita com custo conhecido", icon: Percent },
    { label: "Ticket médio", value: dinheiro(resumo.ticketMedioCentavos), detail: "Receita líquida ÷ pedidos com receita", icon: CircleDollarSign },
    { label: "Conversão", value: percentual(resumo.conversaoPercentual), detail: "Pedidos com promoção ÷ alcançados", icon: Percent },
    { label: "Resultado incremental estimado", value: dinheiro(resumo.incrementalCentavos), detail: `${resumo.gruposControle} comparação(ões) com grupo demo`, icon: ArrowUpRight },
    { label: "Elegíveis / alcançados", value: `${resumo.elegiveis} / ${resumo.alcancados}`, detail: "Público e alcance das amostras filtradas", icon: Users },
  ];

  function abrirDetalhes(campanhaId: string) {
    setSelecionada(campanhaId);
    setAnaliseAberta(true);
  }

  return (
    <main className="c5-page" data-testid="resultados-c5">
      <header className="c5-heading">
        <span className="c5-heading-icon"><BarChart3 size={24} /></span>
        <div><p className="c5-eyebrow">COMERCIAL · C5 · SOMENTE DEMONSTRAÇÃO</p><h1>Resultados e Rentabilidade</h1><p>Um resumo simples do desempenho das promoções.</p></div>
      </header>

      <div className="c5-demo-note" role="note"><Info size={19} /><p><b>Dados inteiramente fictícios.</b> Os valores são simulações locais, independentes de pedidos ou pagamentos. Campanha aprovada no fluxo C2 não significa envio. Vínculos por marcador são demonstrativos e não comprovam causalidade.</p></div>

      <section className="c5-filters c5-primary-filters" aria-label="Filtros principais">
        <label>Período<select value={filtros.periodo} onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value as FiltrosResultados["periodo"] })}><option value="todos">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option></select></label>
        <label>Campanha<select value={filtros.campanha} onChange={(e) => setFiltros({ ...filtros, campanha: e.target.value })}><option value="todas">Todas as campanhas</option>{CAMPANHAS_RESULTADO_DEMO.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      </section>
      <details className="c5-more-filters"><summary>Mais filtros</summary><div className="c5-filters c5-secondary-filters">
        <label>Segmento<select value={filtros.segmento} onChange={(e) => setFiltros({ ...filtros, segmento: e.target.value as FiltrosResultados["segmento"] })}><option value="todos">Todos os segmentos</option>{SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Status<select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value as FiltrosResultados["status"] })}><option value="todos">Todos os status</option><option>Rascunho</option><option>Aguardando aprovação</option><option>Aprovada</option><option>Rejeitada</option></select></label>
        <label>Resultado<select value={filtros.desempenho} onChange={(e) => setFiltros({ ...filtros, desempenho: e.target.value as FiltrosResultados["desempenho"] })}><option value="todos">Todos os resultados</option><option value="com-dados">Com dados simulados</option><option value="sem-dados">Dados insuficientes</option><option value="abaixo-comparacao">Abaixo do período comparável</option><option value="conversao-inferior">Conversão abaixo da média</option></select></label>
      </div></details>

      <section className="c5-kpis c5-primary-kpis" aria-label="Resumo de resultados">
        {metricCards.map((card) => <article className={`c5-kpi ${card.tone}`} key={card.label}><span><card.icon size={20} /></span><div><p>{card.label}</p><strong>{card.value}</strong><small>{card.detail}</small>{card.label === "Margem estimada" && <small className="c5-margin-note">Após descontos e custos conhecidos. Não é o lucro total da loja.</small>}</div></article>)}
      </section>
      {(resumo.dadosInsuficientes > 0 || resumo.campanhasComMargem < resumo.campanhasComDados) && <p className="c5-coverage-note"><Info size={16} /> Margem calculada somente onde há custo variável conhecido ({resumo.campanhasComMargem} de {resumo.campanhasComDados} amostra(s)). {resumo.dadosInsuficientes} campanha(s) sem base suficiente; margem e resultado incremental não são presumidos.</p>}

      <section className={`c5-alert-summary ${margemNegativa ? "critical" : avisos.length ? "attention" : "neutral"}`} aria-live="polite">
        <div><AlertTriangle size={19} /><span><b>{resumoAlertas.titulo}</b><small>{resumoAlertas.descricao}</small>{margemNegativa && <small>{margemNegativa.descricao}</small>}</span></div>
        {avisos.length > 0 && <button type="button" className="c5-text-button" onClick={() => { setAnaliseAberta(true); setAlertasAbertos(true); }}>Ver alertas ({avisos.length})</button>}
      </section>

      <section className="c5-panel c5-simple-results" aria-labelledby="c5-results-title">
        <div className="c5-panel-heading"><div><h2 id="c5-results-title">Resumo das campanhas</h2><p>Vendas e margem da simulação filtrada. Os rótulos são comparativos e demonstrativos.</p></div><span className="c5-demo-badge">SIMULAÇÃO</span></div>
        <p className="c5-classification-note">“Margem baixa” indica contribuição igual ou abaixo de zero. As demais situações comparam a campanha ao período anterior ou a pares demonstrativos; sem base comparável, o rótulo é neutro. Não existe margem mínima empresarial definida.</p>
        <div className="c5-simple-table-wrap"><table className="c5-simple-table"><thead><tr><th>Campanha</th><th>Vendas</th><th>Margem estimada</th><th>Situação</th><th>Ação</th></tr></thead><tbody>
          {campanhas.map((campanha) => {
            const m = calcularResultadoCampanha(campanha);
            const situacao = classificarMargemDemo(campanha, campanhas);
            const tone = situacao === "Boa margem" ? "positive" : situacao === "Margem baixa" ? "negative" : situacao === "Atenção à margem" ? "warning" : "neutral";
            return <tr key={campanha.id}>
              <td data-label="Campanha"><b>{campanha.nome}</b><small>{SEGMENTO_LABEL[campanha.segmento]}</small></td>
              <td data-label="Vendas">{dinheiro(m?.receitaBrutaCentavos)}</td>
              <td data-label="Margem estimada">{dinheiro(m?.margemContribuicaoCentavos)}<small>{percentual(m?.margemPercentual)}</small></td>
              <td data-label="Situação"><span className={`c5-status ${tone}`}>{situacao}</span></td>
              <td data-label="Ação"><button type="button" className="c5-detail-button" onClick={() => abrirDetalhes(campanha.id)}>Ver detalhes</button></td>
            </tr>;
          })}
          {!campanhas.length && <tr><td className="c5-empty" colSpan={5}>Nenhuma campanha corresponde aos filtros.</td></tr>}
        </tbody></table></div>
      </section>

      <details className="c5-advanced" open={analiseAberta} onToggle={(event) => setAnaliseAberta(event.currentTarget.open)}>
        <summary>Ver análise completa</summary>
        <div className="c5-advanced-content">
          <section className="c5-advanced-metrics" aria-label="Métricas complementares">
            {metricasAvancadas.map((card) => <article key={card.label}><span><card.icon size={18} /></span><div><p>{card.label}</p><b>{card.value}</b><small>{card.detail}</small></div></article>)}
          </section>

          {campanhaAtual && <section className="c5-panel c5-detail"><div className="c5-panel-heading"><div><p className="c5-eyebrow">DETALHE DA SIMULAÇÃO</p><h2>{campanhaAtual.nome}</h2><p>{SEGMENTO_LABEL[campanhaAtual.segmento]} · {formatarData(campanhaAtual.inicio)} a {formatarData(campanhaAtual.fim)}</p></div><span className="c5-status neutral">Fluxo: {campanhaAtual.statusFluxo}</span></div>
            {campanhaAtual.dados && resultadoAtual ? <>
              <div className="c5-formula-flow"><div><small>Receita bruta dos produtos</small><b>{dinheiro(resultadoAtual.receitaBrutaCentavos)}</b></div><span>−</span><div><small>Descontos concedidos</small><b>{dinheiro(resultadoAtual.descontosCentavos)}</b></div><span>−</span><div><small>Reembolsos</small><b>{dinheiro(resultadoAtual.reembolsosCentavos)}</b></div><span>=</span><div className="highlight"><small>Receita líquida estimada</small><b>{dinheiro(resultadoAtual.receitaLiquidaCentavos)}</b></div></div>
              <div className="c5-cost-flow"><span>Custos variáveis dos produtos <b>{dinheiro(resultadoAtual.custosProdutosCentavos)}</b></span><span>Custos variáveis adicionais <b>{dinheiro(resultadoAtual.custosAdicionaisCentavos)}</b></span><span>Taxa de entrega arrecadada para terceiros <b>{dinheiro(resultadoAtual.taxasEntregaTerceirosCentavos)}</b></span></div>
              <div className={`c5-contribution ${resultadoAtual.margemContribuicaoCentavos !== null && resultadoAtual.margemContribuicaoCentavos < 0 ? "negative" : ""}`}><div><small>Margem de contribuição estimada</small><strong>{dinheiro(resultadoAtual.margemContribuicaoCentavos)}</strong></div><b>{percentual(resultadoAtual.margemPercentual)}</b><p>Receita líquida − custos variáveis conhecidos. Taxa de entrega de terceiros fica separada e fora da receita da loja.</p></div>
              <div className="c5-detail-stats"><span><small>Clientes que voltaram nesta amostra</small><b>{campanhaAtual.dados.clientesRetornaram ?? "Dados insuficientes"}</b></span><span><small>Com vínculo demonstrativo</small><b>{campanhaAtual.dados.clientesComVinculoCampanhaDemo ?? "Dados insuficientes"}</b></span><span><small>Conversão / ticket médio</small><b>{percentual(resultadoAtual.conversaoPercentual)} · {dinheiro(resultadoAtual.ticketMedioCentavos)}</b></span><span><small>Elegíveis / alcançados</small><b>{campanhaAtual.dados.elegiveis} / {campanhaAtual.dados.alcancados}</b></span></div>
              {resultadoAtual.incrementalCentavos !== null ? <p className="c5-incremental"><TrendingUp size={17} /> Incremental estimado: {dinheiro(resultadoAtual.incrementalCentavos)} contra grupo de comparação; {campanhaAtual.dados.grupoControle?.metodo}. Não é previsão nem garantia causal.</p> : <p className="c5-insufficient"><Info size={16} /> Resultado incremental não calculado: não há comparação demonstrativa suficiente.</p>}
              {campanhaAtual.dados.comparacaoAnterior && <p className="c5-comparison-note">Comparação anterior demonstrativa: receita líquida {dinheiro(campanhaAtual.dados.comparacaoAnterior.receitaLiquidaCentavos)} · contribuição {dinheiro(campanhaAtual.dados.comparacaoAnterior.margemContribuicaoCentavos)}.</p>}
            </> : <p className="c5-insufficient"><Info size={16} /> Sem alcance, pedidos e custos rastreáveis suficientes. Métricas financeiras e retorno incremental não calculados.</p>}
          </section>}

          <section className="c5-panel c5-recovery"><div className="c5-panel-heading"><div><h2>Recuperação de clientes por segmento</h2><p>Clientes retornados vêm da base fictícia C1. Segmentos se sobrepõem; as linhas não devem ser somadas para obter clientes únicos.</p></div><Users size={21} /></div>
            <div className="c5-recovery-grid">{recoveryCards.map((linha) => <article key={linha.segmento}><b>{SEGMENTO_LABEL[linha.segmento]}</b><span>{linha.clientesNoSegmento} clientes na faixa</span><strong>{linha.retornaram} voltaram</strong><small>{linha.retornoComVinculoDemo} com evento de campanha e retorno no histórico</small><small>{linha.frequenciaQuatroMais === null ? "Dados insuficientes" : `${percentual(linha.frequenciaQuatroMais)} com 4+ pedidos na base`}</small><small>Inatividade média antes do retorno: {linha.mediaDiasInatividadeAntesRetorno === null ? "dados insuficientes" : `${linha.mediaDiasInatividadeAntesRetorno.toLocaleString("pt-BR", {maximumFractionDigits:1})} dias`}</small><small>Receita líquida com marcador C5: {dinheiro(linha.receitaAtribuidaCentavos)}</small></article>)}</div>
            <p className="c5-recovery-note">Associação temporal não comprova causalidade nem receita incremental.</p>
          </section>

          <section className="c5-advanced-reports">
            <div className="c5-report-grid">
              <article className="c5-panel"><div className="c5-panel-heading"><div><h2>Evolução do período filtrado</h2><p>Receita líquida e margem das campanhas que correspondem aos filtros.</p></div><BarChart3 size={20} /></div>{evolucao.length ? <><div className="c5-chart">{evolucao.map((item) => <div className="c5-chart-row" key={item.periodo}><span>{item.periodo}</span><div className="c5-bars"><i className="revenue" style={{ width: `${item.receitaLiquidaCentavos / maiorReceitaEvolucao * 100}%` }} title={`Receita líquida ${dinheiro(item.receitaLiquidaCentavos)}`} /><i className="margin" style={{ width: `${Math.max(0, item.margemCentavos ?? 0) / maiorReceitaEvolucao * 100}%` }} title={item.margemCentavos === null ? "Margem: dados insuficientes" : `Margem ${dinheiro(item.margemCentavos)}`} /></div><b>{dinheiro(item.receitaLiquidaCentavos)}</b></div>)}</div><div className="c5-legend"><span><i className="revenue" /> Receita líquida</span><span><i className="margin" /> Margem de contribuição</span></div></> : <p className="c5-empty">Dados mensais insuficientes para os filtros selecionados.</p>}</article>
              <article className="c5-panel"><div className="c5-panel-heading"><div><h2>Conversão por segmento</h2><p>Pedidos com marcador demo ÷ alcançados na amostra.</p></div></div>{porSegmento.map((linha) => <div className="c5-segment-bar" key={linha.id}><span>{linha.label}</span><div><i style={{ width: `${Math.min(linha.conversao ?? 0, 100)}%` }} /></div><b>{percentual(linha.conversao)}</b></div>)}{!porSegmento.length && <p className="c5-empty">Dados insuficientes para comparar segmentos.</p>}</article>
            </div>
            <div className="c5-bottom-grid"><article className="c5-panel"><div className="c5-panel-heading"><div><h2>Comparação entre períodos</h2><p>Contribuição por campanha versus o período anterior demonstrativo.</p></div></div>{campanhasComMargem.length ? <div className="c5-comparison-list">{campanhasComMargem.map(({ campanha, metricas }) => <div key={campanha.id}><span>{campanha.nome}</span><b>{dinheiro(metricas!.margemContribuicaoCentavos)}</b><small>Anterior: {dinheiro(campanha.dados?.comparacaoAnterior?.margemContribuicaoCentavos)}</small><span className={`c5-delta ${(metricas!.variacaoMargemAnteriorCentavos ?? 0) < 0 ? "negative" : "positive"}`}>{metricas!.variacaoMargemAnteriorCentavos === null ? "Sem comparação" : `${(metricas!.variacaoMargemAnteriorCentavos ?? 0) < 0 ? "−" : "+"}${dinheiro(Math.abs(metricas!.variacaoMargemAnteriorCentavos ?? 0))}`}</span></div>)}</div> : <p className="c5-empty">Dados insuficientes para comparar.</p>}</article>
              <article className="c5-panel c5-highlights"><div className="c5-panel-heading"><div><h2>Destaques do conjunto</h2><p>Ordenados pela contribuição estimada, sem inferir causalidade.</p></div></div><p><ArrowUpRight size={18} /><span className="c5-highlight-copy"><span>Maior contribuição</span><b>{melhor?.campanha.nome ?? "Dados insuficientes"}</b></span>{melhor ? <strong>{dinheiro(melhor.metricas!.margemContribuicaoCentavos)}</strong> : null}</p><p><ArrowDownRight size={18} /><span className="c5-highlight-copy"><span>Menor contribuição</span><b>{pior?.campanha.nome ?? "Dados insuficientes"}</b></span>{pior ? <strong>{dinheiro(pior.metricas!.margemContribuicaoCentavos)}</strong> : null}</p><p className="c5-highlight-note">Taxas de terceiros ficam separadas; descontos entram uma vez e custos desconhecidos não são estimados.</p></article></div>
          </section>

          <section className="c5-panel c5-full-alerts"><div className="c5-panel-heading"><div><h2>Alertas detalhados</h2><p>Todos os sinais são relativos à amostra demonstrativa e não aprovam, bloqueiam ou cancelam campanhas.</p></div><AlertTriangle size={20} /></div><details open={alertasAbertos} onToggle={(event) => setAlertasAbertos(event.currentTarget.open)}><summary>{alertasAbertos ? "Ocultar alertas" : "Ver explicações dos alertas"}</summary><div className="c5-alert-list">{avisos.map((aviso) => <div className={`c5-alert ${aviso.nivel}`} key={aviso.id}><AlertTriangle size={18} /><span><b>{aviso.titulo}</b><small>{aviso.descricao}</small></span></div>)}{!avisos.length && <p className="c5-empty">Sem alertas para os filtros selecionados.</p>}</div></details></section>
        </div>
      </details>
    </main>
  );
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}
