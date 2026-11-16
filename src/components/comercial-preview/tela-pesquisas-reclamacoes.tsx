import { useMemo, useState, type FormEvent } from "react";
import { BarChart3, BadgeAlert, CheckCircle2, ClipboardList, Clock3, MessageSquareWarning, Plus, RotateCcw, ShieldAlert, Star, ThumbsUp, Users } from "lucide-react";
import {
  AVALIACOES_DEMO_C4, CATEGORIAS_C4, DATA_REFERENCIA_C4, PRIORIDADES_C4, RECLAMACOES_DEMO_C4,
  RESPONSAVEIS_C4, STATUS_C4, calcularIndicadoresC4, classificarAvaliacao, criarReclamacaoDeAvaliacao,
  criarReclamacaoManual, filtrarAvaliacoes, filtrarReclamacoes, mudarStatusReclamacao,
  registrarAcompanhamento, registrarSolucao, reabrirReclamacao, atualizarPrioridade, atualizarResponsavel,
  type AvaliacaoC4, type CategoriaC4, type FiltrosAvaliacoesC4, type FiltrosReclamacoesC4,
  type OrigemC4, type PrioridadeC4, type ReclamacaoC4, type ResponsavelC4, type StatusReclamacaoC4,
} from "./pesquisas-reclamacoes-regras";

type AbaC4 = "painel" | "avaliacoes" | "reclamacoes" | "pesquisas" | "relatorios";
type PerguntaC4 = { texto: string; tipo: "estrelas" | "comentario"; origem: "todas" | OrigemC4 };
type ModeloC4 = { id: string; nome: string; perguntas: PerguntaC4[] };
const MODELOS_INICIAIS: ModeloC4[] = [
  { id: "pedido", nome: "Experiência geral do pedido", perguntas: [
    { texto: "Como você avalia sua experiência geral?", tipo: "estrelas", origem: "todas" },
    { texto: "Como estava a qualidade dos salgados?", tipo: "estrelas", origem: "todas" },
    { texto: "Como avalia o atendimento?", tipo: "estrelas", origem: "todas" },
    { texto: "Como foi a experiência da entrega?", tipo: "estrelas", origem: "Entrega" },
    { texto: "Quer deixar um comentário?", tipo: "comentario", origem: "todas" },
  ] },
  { id: "retirada", nome: "Retirada no balcão", perguntas: [
    { texto: "Como avalia o tempo de preparo?", tipo: "estrelas", origem: "Retirada" },
    { texto: "Como estavam a temperatura e a apresentação?", tipo: "estrelas", origem: "Retirada" },
    { texto: "Como foi o atendimento?", tipo: "estrelas", origem: "Retirada" },
    { texto: "Quer deixar um comentário?", tipo: "comentario", origem: "todas" },
  ] },
];
const filtroInicial: FiltrosAvaliacoesC4 = { periodo: "30", avaliacao: "todas", status: "todos", origem: "todas", responsavel: "todos" };
const STATUS_ABERTOS = new Set<StatusReclamacaoC4>(["Nova", "Em análise", "Aguardando cliente", "Em resolução"]);
const dataHoje = () => new Date().toISOString();
const dataPt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: iso.includes("T") ? "short" : undefined }).format(new Date(iso));
const diasAberta = (data: string) => Math.max(0, Math.floor((Date.parse(`${DATA_REFERENCIA_C4}T12:00:00Z`) - Date.parse(`${data.slice(0, 10)}T12:00:00Z`)) / 86_400_000));

export function TelaPesquisasReclamacoes() {
  const [avaliacoes, setAvaliacoes] = useState(AVALIACOES_DEMO_C4);
  const [reclamacoes, setReclamacoes] = useState(RECLAMACOES_DEMO_C4);
  const [filtros, setFiltros] = useState(filtroInicial);
  const [statusReclamacao, setStatusReclamacao] = useState<FiltrosReclamacoesC4["status"]>("todos");
  const [aba, setAba] = useState<AbaC4>("painel");
  const [selecionada, setSelecionada] = useState("C4-104");
  const [feedback, setFeedback] = useState("");
  const [statusNovo, setStatusNovo] = useState<StatusReclamacaoC4>("Em análise");
  const [justificativa, setJustificativa] = useState("");
  const [nota, setNota] = useState("");
  const [proposta, setProposta] = useState("");
  const [modelos, setModelos] = useState(MODELOS_INICIAIS);
  const [modeloSelecionado, setModeloSelecionado] = useState("pedido");
  const [origemPreview, setOrigemPreview] = useState<OrigemC4>("Entrega");
  const [respostaPreview, setRespostaPreview] = useState(0);

  const avaliacoesFiltradas = useMemo(() => filtrarAvaliacoes(avaliacoes, filtros), [avaliacoes, filtros]);
  const filtrosR: FiltrosReclamacoesC4 = { periodo: filtros.periodo, origem: filtros.origem, responsavel: filtros.responsavel, status: statusReclamacao };
  const reclamacoesFiltradas = useMemo(() => filtrarReclamacoes(reclamacoes, filtrosR), [reclamacoes, filtrosR]);
  const metricas = useMemo(() => calcularIndicadoresC4(avaliacoesFiltradas, reclamacoesFiltradas), [avaliacoesFiltradas, reclamacoesFiltradas]);
  const atual = reclamacoes.find((r) => r.id === selecionada) ?? reclamacoesFiltradas[0];
  const respostas = avaliacoesFiltradas.filter((a) => a.aguardandoResposta);
  const modelo = modelos.find((m) => m.id === modeloSelecionado) ?? modelos[0]!;
  const perguntasPreview = modelo.perguntas.filter((p) => p.origem === "todas" || p.origem === origemPreview);

  function atualizarReclamacao(id: string, alterar: (r: ReclamacaoC4) => ReclamacaoC4) {
    setReclamacoes((lista) => lista.map((r) => r.id === id ? alterar(r) : r));
  }
  function abrirDeAvaliacao(a: AvaliacaoC4) {
    const resultado = criarReclamacaoDeAvaliacao(a, reclamacoes, "Marina Lopes", dataHoje());
    if (!resultado.ok) { setFeedback(resultado.motivo); return; }
    setReclamacoes((lista) => [resultado.reclamacao, ...lista]);
    setAvaliacoes((lista) => lista.map((item) => item.id === a.id ? { ...item, reclamacaoId: resultado.reclamacao.id } : item));
    setSelecionada(resultado.reclamacao.id);
    setAba("reclamacoes");
    setFeedback(`${resultado.reclamacao.id} criada em demonstração. Nenhum pedido foi alterado.`);
  }
  function registrarManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nova = criarReclamacaoManual({
      cliente: String(f.get("cliente") ?? "").trim(), pedido: String(f.get("pedido") ?? "").trim(),
      origem: String(f.get("origem") ?? "Entrega") as OrigemC4, categoria: String(f.get("categoria") ?? "Outros") as CategoriaC4,
      descricao: String(f.get("descricao") ?? "").trim(), prioridade: String(f.get("prioridade") ?? "Normal") as PrioridadeC4,
      responsavel: String(f.get("responsavel") ?? "Marina Lopes") as ResponsavelC4,
    }, reclamacoes, "Marina Lopes", dataHoje());
    setReclamacoes((lista) => [nova, ...lista]); setSelecionada(nova.id); setFeedback(`${nova.id} registrada localmente.`); e.currentTarget.reset();
  }
  function registrarNota() {
    if (!atual) return;
    const resultado = registrarAcompanhamento(atual, nota, "Marina Lopes", dataHoje());
    if (!resultado.ok) { setFeedback(resultado.motivo); return; }
    atualizarReclamacao(atual.id, () => resultado.reclamacao); setNota(""); setFeedback("Acompanhamento acrescentado ao histórico demonstrativo.");
  }
  function salvarProposta() {
    if (!atual) return;
    const resultado = registrarSolucao(atual, proposta, "Marina Lopes", dataHoje());
    if (!resultado.ok) { setFeedback(resultado.motivo); return; }
    atualizarReclamacao(atual.id, () => resultado.reclamacao); setProposta(""); setFeedback("Proposta registrada; nenhuma compensação ou pagamento foi executado.");
  }
  function salvarStatus() {
    if (!atual) return;
    const resultado = mudarStatusReclamacao(atual, statusNovo, "Marina Lopes", dataHoje(), justificativa);
    if (!resultado.ok) { setFeedback(resultado.motivo); return; }
    atualizarReclamacao(atual.id, () => resultado.reclamacao); setJustificativa(""); setFeedback(`Status atualizado para “${statusNovo}” no estado local.`);
  }
  function reabrir() {
    if (!atual) return;
    const resultado = reabrirReclamacao(atual, justificativa, "Marina Lopes", dataHoje());
    if (!resultado.ok) { setFeedback(resultado.motivo); return; }
    atualizarReclamacao(atual.id, () => resultado.reclamacao); setStatusNovo("Em análise"); setJustificativa(""); setFeedback("Caso reaberto; histórico anterior preservado.");
  }
  function criarModelo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const nome = String(f.get("nomeModelo") ?? "").trim();
    if (!nome) return;
    const novo = { id: `modelo-${Date.now()}`, nome, perguntas: [
      { texto: "Como avalia sua experiência geral?", tipo: "estrelas" as const, origem: "todas" as const },
      { texto: "Como avalia a qualidade do pedido?", tipo: "estrelas" as const, origem: "todas" as const },
      { texto: "Quer deixar um comentário?", tipo: "comentario" as const, origem: "todas" as const },
      { texto: "Como foi sua experiência com a entrega?", tipo: "estrelas" as const, origem: "Entrega" as const },
    ] };
    setModelos((itens) => [...itens, novo]); setModeloSelecionado(novo.id); setFeedback("Modelo demonstrativo criado. Nenhuma pesquisa foi enviada."); e.currentTarget.reset();
  }
  function mudarResponsavel(valor: ResponsavelC4) {
    if (atual) atualizarReclamacao(atual.id, (r) => atualizarResponsavel(r, valor, "Marina Lopes", dataHoje()));
  }
  function mudarPrioridade(valor: PrioridadeC4) {
    if (atual) atualizarReclamacao(atual.id, (r) => atualizarPrioridade(r, valor, "Marina Lopes", dataHoje()));
  }

  const abas: { id: AbaC4; nome: string }[] = [ { id: "painel", nome: "Visão geral" }, { id: "avaliacoes", nome: "Avaliações" }, { id: "reclamacoes", nome: "Reclamações" }, { id: "pesquisas", nome: "Modelos de pesquisa" }, { id: "relatorios", nome: "Relatórios" } ];
  const metricCards = [
    { label: "Avaliações recebidas", value: metricas.totalAvaliacoes, icon: ClipboardList, detail: "no período filtrado" },
    { label: "Nota média", value: metricas.notaMedia ? `${metricas.notaMedia.toFixed(1).replace(".", ",")} / 5` : "—", icon: Star, detail: "padrão demonstrativo" },
    { label: "Clientes satisfeitos", value: metricas.satisfeitos, icon: ThumbsUp, detail: "4 ou 5 estrelas" },
    { label: "Avaliações negativas", value: metricas.negativas, icon: BadgeAlert, detail: "1 ou 2 estrelas" },
    { label: "Reclamações abertas", value: metricas.reclamacoesAbertas, icon: MessageSquareWarning, detail: "aguardando tratamento" },
    { label: "Reclamações resolvidas", value: metricas.reclamacoesResolvidas, icon: CheckCircle2, detail: "resolvidas ou encerradas" },
    { label: "Tempo médio de resolução", value: `${metricas.tempoMedioResolucao.toFixed(1).replace(".", ",")} dias`, icon: Clock3, detail: "estimativa demonstrativa" },
    { label: "Aguardando resposta", value: metricas.aguardandoResposta, icon: Users, detail: "avaliações sem retorno" },
  ];
  const recentes = reclamacoesFiltradas.filter((r) => STATUS_ABERTOS.has(r.status)).sort((a,b) => (b.prioridade === "Urgente" ? 1 : 0) - (a.prioridade === "Urgente" ? 1 : 0) || diasAberta(b.dataAbertura) - diasAberta(a.dataAbertura));

  return (
    <main className="c4-page" aria-label="Pesquisas de satisfação e reclamações">
      <header className="c4-heading"><div className="c4-heading-icon"><MessageSquareWarning size={24} /></div><div><p className="c4-eyebrow">COMERCIAL · C4 · SOMENTE DEMONSTRAÇÃO</p><h1>Pesquisas de satisfação e reclamações</h1><p>Acompanhe avaliações e registre tratativas locais, sem integrar com pedidos ou finanças.</p></div></header>
      <div className="c4-warning" role="note"><ShieldAlert size={19} /><span>Dados fictícios e locais. Nenhuma pesquisa é enviada; propostas de solução não executam crédito, cupom, reembolso ou alteração de pedido.</span></div>
      <section className="c4-filters" aria-label="Filtros de período e origem">
        <label>Período<select value={filtros.periodo} onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value as FiltrosAvaliacoesC4["periodo"] })}><option value="todos">Todo o período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
        <label>Origem<select value={filtros.origem} onChange={(e) => setFiltros({ ...filtros, origem: e.target.value as FiltrosAvaliacoesC4["origem"] })}><option value="todas">Todas</option><option>Entrega</option><option>Retirada</option></select></label>
        <label>Responsável<select value={filtros.responsavel} onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value as FiltrosAvaliacoesC4["responsavel"] })}><option value="todos">Todos</option>{RESPONSAVEIS_C4.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Avaliações<select value={filtros.avaliacao} onChange={(e) => setFiltros({ ...filtros, avaliacao: e.target.value as FiltrosAvaliacoesC4["avaliacao"] })}><option value="todas">Todas as notas</option><option value="negativas">Negativas · 1–2</option><option value="acompanhar">Acompanhar · 3</option><option value="positivas">Positivas · 4–5</option></select></label>
        <label>Resposta<select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value as FiltrosAvaliacoesC4["status"] })}><option value="todos">Todas</option><option value="aguardando">Aguardando resposta</option><option value="respondidas">Respondidas</option></select></label>
      </section>
      <nav className="c4-tabs" aria-label="Seções C4">{abas.map((item) => <button key={item.id} type="button" className={aba === item.id ? "is-active" : ""} onClick={() => setAba(item.id)}>{item.nome}</button>)}</nav>
      {feedback && <p className="c4-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback("")} aria-label="Fechar aviso">×</button></p>}

      {aba === "painel" && <>
        <section className="c4-metrics" aria-label="Indicadores de satisfação e reclamações">{metricCards.map(({ label, value, icon: Icon, detail }) => <article className="c4-metric" key={label}><span className="c4-metric-icon"><Icon size={20} /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>)}</section>
        <section className="c4-dashboard-grid">
          <article className="c4-card"><div className="c4-card-heading"><div><h2>Avaliações recentes</h2><p>Classificação demonstrativa: 1–2 negativa · 3 acompanhar · 4–5 positiva</p></div><button className="c4-link-button" onClick={() => setAba("avaliacoes")}>Ver avaliações</button></div>
            <div className="c4-review-list">{avaliacoesFiltradas.slice(0, 4).map((a) => <ReviewCard key={a.id} review={a} existing={Boolean(reclamacoes.find((r) => r.avaliacaoId === a.id))} onComplaint={() => abrirDeAvaliacao(a)} />)}</div>
          </article>
          <article className="c4-card"><div className="c4-card-heading"><div><h2>Casos que pedem atenção</h2><p>Urgência e tempo em aberto ajudam a priorizar o contato.</p></div><BadgeAlert size={21} /></div>
            <div className="c4-urgent-list">{recentes.slice(0, 5).map((r) => <button key={r.id} onClick={() => { setSelecionada(r.id); setAba("reclamacoes"); }} className={`c4-urgent ${r.prioridade === "Urgente" || diasAberta(r.dataAbertura) >= 7 ? "is-urgent" : ""}`}><span><b>{r.id} · {r.cliente}</b><small>{r.categoria} · {r.status}</small></span><strong>{diasAberta(r.dataAbertura)} d</strong></button>)}</div>
          </article>
        </section>
        <section className="c4-card c4-pending"><div><h2>Avaliações aguardando resposta</h2><p>{respostas.length} cliente(s) estão sinalizados para acompanhamento neste filtro.</p></div><button className="c4-button c4-button-primary" onClick={() => { setFiltros({ ...filtros, status: "aguardando" }); setAba("avaliacoes"); }}>Revisar fila</button></section>
      </>}

      {aba === "avaliacoes" && <section className="c4-card"><div className="c4-card-heading"><div><h2>Avaliações de clientes</h2><p>{avaliacoesFiltradas.length} registro(s) conforme os filtros. Avaliações negativas podem originar um caso sem duplicação.</p></div></div><div className="c4-review-list">{avaliacoesFiltradas.map((a) => <ReviewCard key={a.id} review={a} existing={Boolean(reclamacoes.find((r) => r.avaliacaoId === a.id))} onComplaint={() => abrirDeAvaliacao(a)} />)}{!avaliacoesFiltradas.length && <p className="c4-empty">Nenhuma avaliação corresponde aos filtros.</p>}</div></section>}

      {aba === "reclamacoes" && <section className="c4-complaints-layout">
        <article className="c4-card c4-complaint-list"><div className="c4-card-heading"><div><h2>Central de reclamações</h2><p>{reclamacoesFiltradas.length} caso(s) · histórico preservado</p></div><MessageSquareWarning size={21} /></div>
          <div className="c4-status-filter"><label>Status do caso<select value={statusReclamacao} onChange={(e) => setStatusReclamacao(e.target.value as FiltrosReclamacoesC4["status"])}><option value="todos">Todos</option>{STATUS_C4.map((s) => <option key={s}>{s}</option>)}</select></label></div>
          <div className="c4-case-list">{reclamacoesFiltradas.map((r) => <button type="button" key={r.id} className={`c4-case-row ${selecionada === r.id ? "is-selected" : ""} ${r.prioridade === "Urgente" ? "is-urgent" : ""}`} onClick={() => { setSelecionada(r.id); setStatusNovo(r.status === "Resolvida" || r.status === "Encerrada" ? "Em análise" : "Em resolução"); }}><span className="c4-case-top"><b>{r.id} · {r.cliente}</b><StatusPill status={r.status} /></span><span>{r.categoria} · Pedido {r.pedido}</span><small>{r.prioridade} · {diasAberta(r.dataAbertura)} dia(s) · {r.responsavel}</small></button>)}{!reclamacoesFiltradas.length && <p className="c4-empty">Nenhum caso neste filtro.</p>}</div>
          <details className="c4-new-case"><summary><Plus size={18} /> Registrar reclamação</summary><form onSubmit={registrarManual} className="c4-form-grid">
            <label>Cliente<input name="cliente" required placeholder="Nome demonstrativo" /></label><label>Pedido relacionado<input name="pedido" required placeholder="#0000" /></label>
            <label>Origem<select name="origem"><option>Entrega</option><option>Retirada</option></select></label><label>Categoria<select name="categoria">{CATEGORIAS_C4.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Prioridade<select name="prioridade">{PRIORIDADES_C4.map((p) => <option key={p}>{p}</option>)}</select></label><label>Responsável<select name="responsavel">{RESPONSAVEIS_C4.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label className="c4-full">Descrição<textarea name="descricao" required minLength={5} rows={3} placeholder="Descreva o relato" /></label><button className="c4-button c4-button-primary c4-full" type="submit">Registrar localmente</button>
          </form></details>
        </article>
        {atual ? <article className="c4-card c4-case-detail"><div className="c4-card-heading"><div><p className="c4-eyebrow">DOSSIÊ DEMONSTRATIVO</p><h2>{atual.id} · {atual.cliente}</h2><p>Pedido {atual.pedido} · Aberta em {dataPt(atual.dataAbertura)} · {atual.origem}</p></div><StatusPill status={atual.status} /></div>
          <div className="c4-case-summary"><span><small>Categoria</small><b>{atual.categoria}</b></span><span><small>Prioridade</small><b className={`priority-${atual.prioridade.toLowerCase()}`}>{atual.prioridade}</b></span><span><small>Tempo em aberto</small><b>{diasAberta(atual.dataAbertura)} dia(s)</b></span></div>
          <p className="c4-description">{atual.descricao}</p>
          <div className="c4-controls"><label>Responsável<select value={atual.responsavel} onChange={(e) => mudarResponsavel(e.target.value as ResponsavelC4)}>{RESPONSAVEIS_C4.map((r) => <option key={r}>{r}</option>)}</select></label><label>Prioridade<select value={atual.prioridade} onChange={(e) => mudarPrioridade(e.target.value as PrioridadeC4)}>{PRIORIDADES_C4.map((r) => <option key={r}>{r}</option>)}</select></label></div>
          {(atual.status === "Resolvida" || atual.status === "Encerrada") ? <div className="c4-action-box"><label>Justificativa para reabertura<textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Explique por que o caso deve voltar à análise" /></label><button className="c4-button" type="button" onClick={reabrir}><RotateCcw size={17} /> Reabrir caso</button></div> : <>
            <div className="c4-action-box"><label>Observação de acompanhamento<textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Registre contato ou atualização" /></label><button className="c4-button" type="button" onClick={registrarNota}>Adicionar ao histórico</button></div>
            <div className="c4-action-box"><label>Proposta demonstrativa de solução<select value={proposta} onChange={(e) => setProposta(e.target.value)}><option value="">Escolha uma proposta</option><option>Pedido corrigido</option><option>Novo envio</option><option>Contato com cliente</option><option>Crédito futuro (proposta não executada)</option><option>Cupom de compensação (proposta não executada)</option><option>Solicitação de reembolso (não executada)</option></select></label><button className="c4-button" type="button" onClick={salvarProposta}>Registrar proposta</button></div>
            <div className="c4-action-box"><label>Novo status<select value={statusNovo} onChange={(e) => setStatusNovo(e.target.value as StatusReclamacaoC4)}>{STATUS_C4.map((s) => <option key={s}>{s}</option>)}</select></label>{statusNovo === "Encerrada" && <label>Justificativa de encerramento<textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} required placeholder="Justificativa obrigatória" /></label>}<button className="c4-button c4-button-primary" type="button" onClick={salvarStatus}>Atualizar status</button></div>
          </>}
          {atual.solucao && <p className="c4-solution"><CheckCircle2 size={17} /> Proposta registrada: {atual.solucao} <b>· Ainda não executada</b></p>}
          <div className="c4-history"><h3>Histórico de acompanhamento</h3><ol>{atual.historico.map((h, i) => <li key={`${h.data}-${i}`}><time>{dataPt(h.data)}</time><span><b>{h.autor}</b><small>{h.status ? ` · ${h.status}` : ""}</small></span><p>{h.acao}</p></li>)}</ol></div>
        </article> : <article className="c4-card c4-empty">Selecione uma reclamação para consultar os detalhes.</article>}
      </section>}

      {aba === "pesquisas" && <section className="c4-survey-grid"><article className="c4-card"><div className="c4-card-heading"><div><h2>Modelos demonstrativos</h2><p>As perguntas mudam conforme entrega ou retirada. Nenhum disparo automático é feito.</p></div></div><form className="c4-create-model" onSubmit={criarModelo}><label>Novo modelo<input name="nomeModelo" required placeholder="Nome do modelo" /></label><button className="c4-button c4-button-primary" type="submit"><Plus size={17} /> Criar modelo</button></form><div className="c4-model-list">{modelos.map((m) => <button type="button" className={m.id === modelo?.id ? "is-selected" : ""} key={m.id} onClick={() => setModeloSelecionado(m.id)}><ClipboardList size={18} /><span><b>{m.nome}</b><small>{m.perguntas.length} perguntas · modelo local</small></span></button>)}</div></article>
        <article className="c4-card c4-survey-preview"><div className="c4-card-heading"><div><p className="c4-eyebrow">VISÃO DO CLIENTE</p><h2>{modelo?.nome}</h2><p>Prévia do questionário — não enviado</p></div><span className="c4-demo-tag">DEMONSTRATIVO</span></div><label>Tipo de pedido<select value={origemPreview} onChange={(e) => { setOrigemPreview(e.target.value as OrigemC4); setRespostaPreview(0); }}><option>Entrega</option><option>Retirada</option></select></label><div className="c4-question-list">{perguntasPreview.map((p) => <div key={p.texto}><b>{p.texto}</b>{p.tipo === "estrelas" ? <div className="c4-stars" aria-label="Avaliação de uma a cinco estrelas">{[1,2,3,4,5].map((n) => <button key={n} type="button" aria-label={`${n} estrelas`} aria-pressed={respostaPreview === n} onClick={() => setRespostaPreview(n)}><Star size={21} fill={respostaPreview >= n ? "currentColor" : "none"} /></button>)}</div> : <textarea rows={3} placeholder="Comentário opcional" />}</div>)}</div><p className="c4-safe-note"><ShieldAlert size={17} /> Prévia local. Não existe envio de pesquisa nesta etapa.</p></article></section>}

      {aba === "relatorios" && <section className="c4-report-grid"><article className="c4-card"><div className="c4-card-heading"><div><h2>Satisfação por nota</h2><p>Distribuição das avaliações filtradas.</p></div><BarChart3 size={20} /></div>{[1,2,3,4,5].map((n) => { const qtd = avaliacoesFiltradas.filter((a) => a.nota === n).length; const max = Math.max(1, ...[1,2,3,4,5].map((x) => avaliacoesFiltradas.filter((a) => a.nota === x).length)); return <div className="c4-bar-row" key={n}><span>{n} estrela(s)</span><div><i style={{ width: `${qtd / max * 100}%` }} /></div><b>{qtd}</b></div>; })}</article><article className="c4-card"><div className="c4-card-heading"><div><h2>Reclamações por categoria</h2><p>Categoria, status e origem nos dados demonstrativos.</p></div></div>{CATEGORIAS_C4.map((cat) => { const qtd = reclamacoesFiltradas.filter((r) => r.categoria === cat).length; return <div className="c4-category-row" key={cat}><span>{cat}</span><b>{qtd}</b></div>; })}<h3 className="c4-report-subhead">Por status</h3>{STATUS_C4.map((status) => <div className="c4-category-row" key={status}><span>{status}</span><b>{reclamacoesFiltradas.filter((r) => r.status === status).length}</b></div>)}<p className="c4-report-foot">{reclamacoesFiltradas.filter((r) => r.origem === "Entrega").length} caso(s) de entrega · {reclamacoesFiltradas.filter((r) => ["Produto faltando", "Sabor incorreto", "Qualidade do produto"].includes(r.categoria)).length} relato(s) de produto/produção · {reclamacoesFiltradas.filter((r) => r.reaberturas > 0).length} reaberto(s). Tempo médio de resolução: {metricas.tempoMedioResolucao.toFixed(1).replace(".", ",")} dia(s).</p></article></section>}
    </main>
  );
}

function ReviewCard({ review, existing, onComplaint }: { review: AvaliacaoC4; existing: boolean; onComplaint: () => void }) {
  const classe = classificarAvaliacao(review.nota);
  return <article className={`c4-review c4-review-${classe}`}><div className="c4-review-top"><div><b>{review.cliente}</b><span>Pedido {review.pedido} · {review.origem} · {dataPt(review.data)}</span></div><span className="c4-stars-display" aria-label={`${review.nota} de 5 estrelas`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} size={16} fill={i < review.nota ? "currentColor" : "none"} />)}</span></div><p>{review.comentario || "Sem comentário"}</p><div className="c4-review-bottom"><span className={`c4-rating-pill ${classe}`}>{classe === "negativa" ? "Negativa · revisar" : classe === "acompanhar" ? "Acompanhar" : "Positiva"}</span><span>Responsável: {review.responsavel}</span>{review.aguardandoResposta && <span className="c4-awaiting">Aguardando resposta</span>}{review.nota <= 2 && <button type="button" className="c4-button c4-review-action" disabled={existing} onClick={onComplaint}>{existing ? `Reclamação ${review.reclamacaoId ?? "vinculada"}` : "Abrir reclamação"}</button>}</div></article>;
}

function StatusPill({ status }: { status: StatusReclamacaoC4 }) {
  const tom = status === "Resolvida" || status === "Encerrada" ? "success" : status === "Nova" ? "danger" : "warning";
  return <span className={`c4-status ${tom}`}>{status}</span>;
}
