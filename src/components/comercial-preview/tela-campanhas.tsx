import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, CalendarDays, Check, CircleDollarSign, ClipboardList, Copy,
  Eye, History, Megaphone, Plus, Save, Send, ShieldAlert, UserRoundCheck,
  Users, X,
} from "lucide-react";
import { MetricCard, StatusBadge } from "@/components/admin/erp-ui";
import { DEFAULT_CRM_SETTINGS } from "@/lib/crm";
import { candidatoCampanha } from "./candidatos-campanha";
import { CHAVE_RASCUNHO_SUGESTAO, type RascunhoSugestao } from "./rascunho-sugestao";
import { useComercial } from "./contexto";
import { DATA_COMERCIAL, formatarData } from "./dados";
import {
  calcularPublico, periodoCampanhaValido, podeDecidir, substituirCamposMensagem,
  type PerfilDemo, type SegmentoCampanha, type StatusCampanha,
} from "./campanhas-regras";

type HistoricoEvento = { data: string; tipo: string; perfil: string; nota?: string };
type CampanhaC2 = {
  id: string; nome: string; objetivo: string; segmento: SegmentoCampanha;
  inicio: string; fim: string; mensagem: string; cupom: string;
  status: StatusCampanha; criador: string; criadaEm: string; solicitadaEm?: string;
  decisor?: string; decididaEm?: string; motivoRejeicao?: string; historico: HistoricoEvento[];
};
type FormCampanha = Pick<CampanhaC2, "nome" | "objetivo" | "segmento" | "inicio" | "fim" | "mensagem" | "cupom">;

const STORAGE_KEY = "neia-preview-comercial-campanhas-v1";
const INTERVALO_ANTI_SPAM = DEFAULT_CRM_SETTINGS.intervalo_min_campanhas_dias;
const PERFIS: Record<PerfilDemo, string> = {
  marketing: "Marina Lopes · Marketing (demonstração)",
  responsavel: "Carlos Mendes · Responsável (demonstração)",
};
const SEGMENTOS: { valor: SegmentoCampanha; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os clientes" },
  { valor: "inativos_30", rotulo: "Sem comprar há 30–59 dias" },
  { valor: "inativos_60", rotulo: "Sem comprar há 60–89 dias" },
  { valor: "inativos_90", rotulo: "Sem comprar há 90+ dias" },
  { valor: "vip", rotulo: "Clientes VIP (regra CRM)" },
  { valor: "recorrentes", rotulo: "Clientes recorrentes (4+ pedidos)" },
  { valor: "reclamacoes", rotulo: "Histórico de reclamação (demo)" },
  { valor: "recompra", rotulo: "Próximos da recompra (demo)" },
];
const CUPONS = [
  { codigo: "", rotulo: "Sem cupom" },
  { codigo: "VOLTA10", rotulo: "VOLTA10 · 10% (demonstrativo)" },
  { codigo: "SALGADO5", rotulo: "SALGADO5 · R$ 5 (demonstrativo)" },
  { codigo: "FRETEGRATIS", rotulo: "FRETEGRATIS · entrega (demonstrativo)" },
];
const PADRAO_FORM: FormCampanha = {
  nome: "", objetivo: "", segmento: "inativos_30", inicio: DATA_COMERCIAL,
  fim: "2026-11-30",
  mensagem: "Olá {{cliente}}! Sentimos sua falta na Néia Salgados. Já faz {{dias_sem_comprar}} dias desde seu último pedido. Use {{cupom}} na sua próxima compra. Esta é uma prévia demonstrativa.",
  cupom: "",
};

function criarSementes(): CampanhaC2[] {
  const ontem = "2026-11-13T15:30:00.000Z";
  const agora = "2026-11-14T12:00:00.000Z";
  const marketing = PERFIS.marketing;
  const responsavel = PERFIS.responsavel;
  return [
    {
      id: "camp-c2-demo-1", nome: "Reativação — faixa de 60 dias",
      objetivo: "Convidar clientes inativos a conhecer as novidades do cardápio.",
      segmento: "inativos_60", inicio: DATA_COMERCIAL, fim: "2026-11-30",
      mensagem: "Olá {{cliente}}! Sentimos sua falta. Use {{cupom}} na próxima compra.",
      cupom: "VOLTA10", status: "Rascunho", criador: marketing, criadaEm: agora,
      historico: [{ data: agora, tipo: "Rascunho criado", perfil: marketing }],
    },
    {
      id: "camp-c2-demo-2", nome: "Benefício para clientes VIP",
      objetivo: "Reconhecer clientes VIP com uma oferta demonstrativa.",
      segmento: "vip", inicio: DATA_COMERCIAL, fim: "2026-11-24",
      mensagem: "Olá {{cliente}}! Preparamos um benefício especial: {{cupom}}.",
      cupom: "SALGADO5", status: "Aguardando aprovação", criador: marketing,
      criadaEm: ontem, solicitadaEm: agora,
      historico: [
        { data: ontem, tipo: "Rascunho criado", perfil: marketing },
        { data: agora, tipo: "Aprovação solicitada", perfil: marketing },
      ],
    },
    {
      id: "camp-c2-demo-3", nome: "Retorno de clientes recorrentes",
      objetivo: "Agradecer a preferência e apresentar opções do cardápio.",
      segmento: "recorrentes", inicio: DATA_COMERCIAL, fim: "2026-11-27",
      mensagem: "Olá {{cliente}}! Obrigado por escolher a Néia. Confira {{cupom}}.",
      cupom: "FRETEGRATIS", status: "Aprovada", criador: marketing,
      criadaEm: "2026-11-12T11:00:00.000Z", solicitadaEm: ontem,
      decisor: responsavel, decididaEm: agora,
      historico: [
        { data: "2026-11-12T11:00:00.000Z", tipo: "Rascunho criado", perfil: marketing },
        { data: ontem, tipo: "Aprovação solicitada", perfil: marketing },
        { data: agora, tipo: "Aprovada · sem envio", perfil: responsavel },
      ],
    },
    {
      id: "camp-c2-demo-4", nome: "Pesquisa de retorno pós-atendimento",
      objetivo: "Retomar conversa com clientes de origem de reclamação.",
      segmento: "reclamacoes", inicio: DATA_COMERCIAL, fim: "2026-11-21",
      mensagem: "Olá {{cliente}}, queremos ouvir você. Fale com a nossa equipe.",
      cupom: "", status: "Rejeitada", criador: marketing,
      criadaEm: "2026-11-11T10:00:00.000Z", solicitadaEm: "2026-11-12T10:00:00.000Z",
      decisor: responsavel, decididaEm: ontem,
      motivoRejeicao: "Ajustar o texto e confirmar o fluxo de atendimento antes da aprovação.",
      historico: [
        { data: "2026-11-11T10:00:00.000Z", tipo: "Rascunho criado", perfil: marketing },
        { data: "2026-11-12T10:00:00.000Z", tipo: "Aprovação solicitada", perfil: marketing },
        { data: ontem, tipo: "Rejeitada", perfil: responsavel, nota: "Ajustar o texto e confirmar o fluxo de atendimento antes da aprovação." },
      ],
    },
  ];
}

export function TelaCampanhas() {
  const { clientes } = useComercial();
  const candidatos = useMemo(() => clientes.map(candidatoCampanha), [clientes]);
  const [perfil, setPerfil] = useState<PerfilDemo>("marketing");
  const [campanhas, setCampanhas] = useState<CampanhaC2[]>(() => criarSementes());
  const [pronto, setPronto] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todas");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<FormCampanha | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [decisao, setDecisao] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const nomePerfil = PERFIS[perfil];

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsed: unknown = JSON.parse(salvo);
        if (Array.isArray(parsed)) setCampanhas(parsed as CampanhaC2[]);
      }
    } catch {
      // A prévia continua disponível com os dados locais iniciais.
    } finally {
      setPronto(true);
    }
  }, []);
  useEffect(() => {
    if (!pronto) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(campanhas));
    } catch {
      // Sem persistência do navegador, o estado permanece apenas em memória.
    }
  }, [campanhas, pronto]);

  useEffect(() => {
    try {
      const salvo = window.sessionStorage.getItem(CHAVE_RASCUNHO_SUGESTAO);
      if (!salvo) return;
      window.sessionStorage.removeItem(CHAVE_RASCUNHO_SUGESTAO);
      const rascunho = JSON.parse(salvo) as Partial<RascunhoSugestao> | null;
      if (!rascunho || typeof rascunho.nome !== "string" ||
        typeof rascunho.objetivo !== "string" || typeof rascunho.mensagem !== "string") return;
      const segmento = SEGMENTOS.find((item) => item.valor === rascunho.segmento);
      if (!segmento) return;
      setForm({
        ...PADRAO_FORM, nome: rascunho.nome, objetivo: rascunho.objetivo,
        segmento: segmento.valor, mensagem: rascunho.mensagem,
      });
    } catch {
      // O editor C2 permanece disponível se a transferência não puder ser lida.
    }
  }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return campanhas.filter((c) =>
      (filtroStatus === "todas" || c.status === filtroStatus) &&
      (!q || (c.nome + " " + c.objetivo).toLocaleLowerCase("pt-BR").includes(q)),
    );
  }, [busca, campanhas, filtroStatus]);
  const publicoForm = form ? calcularPublico(candidatos, form.segmento, INTERVALO_ANTI_SPAM) : null;
  const mensagemPreview = form
    ? substituirCamposMensagem(form.mensagem, publicoForm?.elegiveis[0] ?? null, form.cupom)
    : "";
  const campanhaDetalhe = detalhe ? campanhas.find((c) => c.id === detalhe) : undefined;
  const campanhaDecisao = decisao ? campanhas.find((c) => c.id === decisao) : undefined;

  function abrirNova() {
    if (perfil !== "marketing") return;
    setErro(""); setEditando(null); setForm({ ...PADRAO_FORM });
  }
  function abrirEdicao(c: CampanhaC2) {
    if (perfil !== "marketing" || c.status !== "Rascunho" || c.criador !== nomePerfil) return;
    setErro(""); setEditando(c.id);
    setForm({ nome: c.nome, objetivo: c.objetivo, segmento: c.segmento, inicio: c.inicio, fim: c.fim, mensagem: c.mensagem, cupom: c.cupom });
  }
  function duplicar(c: CampanhaC2) {
    if (perfil !== "marketing") return;
    if (!periodoCampanhaValido(c.inicio, c.fim)) {
      setErro("Corrija o período do rascunho antes de duplicar a campanha."); return;
    }
    const agora = new Date().toISOString();
    const nova: CampanhaC2 = {
      id: "camp-c2-" + crypto.randomUUID(),
      nome: c.nome + " (cópia)",
      objetivo: c.objetivo,
      segmento: c.segmento,
      inicio: c.inicio,
      fim: c.fim,
      mensagem: c.mensagem,
      cupom: c.cupom,
      status: "Rascunho",
      criador: nomePerfil,
      criadaEm: agora,
      historico: [{ data: agora, tipo: "Cópia criada como rascunho", perfil: nomePerfil }],
    };
    setCampanhas((lista) => [nova, ...lista]);
    setErro("");
    setForm({ nome: nova.nome, objetivo: nova.objetivo, segmento: nova.segmento, inicio: nova.inicio, fim: nova.fim, mensagem: nova.mensagem, cupom: nova.cupom });
    setEditando(nova.id);
  }
  function salvarRascunho() {
    if (!form || perfil !== "marketing") return;
    const nome = form.nome.trim(); const objetivo = form.objetivo.trim(); const mensagem = form.mensagem.trim();
    if (!nome || !objetivo || !mensagem) {
      setErro("Preencha nome, objetivo e mensagem."); return;
    }
    if (!periodoCampanhaValido(form.inicio, form.fim)) {
      setErro("Informe datas de início e fim válidas. O fim deve ser igual ou posterior ao início."); return;
    }
    const agora = new Date().toISOString();
    if (editando) {
      setCampanhas((lista) => lista.map((c) =>
        c.id === editando && c.status === "Rascunho" && c.criador === nomePerfil
          ? { ...c, ...form, nome, objetivo, mensagem, historico: [...c.historico, { data: agora, tipo: "Rascunho editado", perfil: nomePerfil }] }
          : c,
      ));
    } else {
      setCampanhas((lista) => [{
        id: "camp-c2-" + crypto.randomUUID(), ...form, nome, objetivo, mensagem,
        status: "Rascunho", criador: nomePerfil, criadaEm: agora,
        historico: [{ data: agora, tipo: "Rascunho criado", perfil: nomePerfil }],
      }, ...lista]);
    }
    setForm(null); setErro("");
  }
  function solicitarAprovacao(c: CampanhaC2) {
    if (perfil !== "marketing" || c.status !== "Rascunho" || c.criador !== nomePerfil) return;
    if (!periodoCampanhaValido(c.inicio, c.fim)) {
      setErro("Corrija o período do rascunho antes de solicitar aprovação."); return;
    }
    const publico = calcularPublico(candidatos, c.segmento, INTERVALO_ANTI_SPAM);
    if (publico.elegiveis.length === 0) {
      setErro("Não é possível solicitar aprovação sem clientes elegíveis após opt-out e intervalo anti-spam."); return;
    }
    const agora = new Date().toISOString();
    setCampanhas((lista) => lista.map((item) => item.id === c.id ? {
      ...item, status: "Aguardando aprovação", solicitadaEm: agora,
      historico: [...item.historico, { data: agora, tipo: "Aprovação solicitada", perfil: nomePerfil }],
    } : item));
    setErro("");
  }
  function registrarDecisao(aprovar: boolean) {
    const c = campanhaDecisao;
    if (!c || !podeDecidir(c, perfil, nomePerfil)) return;
    const observacao = motivo.trim();
    if (!aprovar && !observacao) { setErro("Informe o motivo da rejeição."); return; }
    const agora = new Date().toISOString();
    const status: StatusCampanha = aprovar ? "Aprovada" : "Rejeitada";
    setCampanhas((lista) => lista.map((item) => item.id === c.id ? {
      ...item, status, decisor: nomePerfil, decididaEm: agora,
      ...(aprovar ? {} : { motivoRejeicao: observacao }),
      historico: [...item.historico, {
        data: agora, tipo: aprovar ? "Aprovada · sem envio" : "Rejeitada", perfil: nomePerfil,
        ...(!aprovar ? { nota: observacao } : {}),
      }],
    } : item));
    setDecisao(null); setMotivo(""); setErro("");
  }

  const rascunhos = campanhas.filter((c) => c.status === "Rascunho").length;
  const aguardando = campanhas.filter((c) => c.status === "Aguardando aprovação").length;
  const aprovadas = campanhas.filter((c) => c.status === "Aprovada").length;
  const rejeitadas = campanhas.filter((c) => c.status === "Rejeitada").length;

  return (
    <main className="c2-page" data-testid="campanhas-c2">
      <div className="c2-heading">
        <span className="c2-heading-icon"><Megaphone size={22} /></span>
        <div><p className="c2-eyebrow">COMERCIAL · C2 · SOMENTE DEMONSTRAÇÃO</p><h1>Campanhas e aprovação</h1><p>Prepare a campanha, confira o público e registre uma decisão demonstrativa.</p></div>
        <button className="c2-button c2-primary" type="button" onClick={abrirNova} disabled={perfil !== "marketing"}><Plus size={16} /> Criar campanha</button>
      </div>
      <div className="c2-warning" role="note"><ShieldAlert size={17} /><span><b>Ambiente de demonstração:</b> perfis e aprovações são fictícios. Aprovar não envia mensagens. Sem WhatsApp, SMS, e-mail, push, Edge Function, banco ou <code>sent_at</code>.</span></div>
      <section className="c2-profile" aria-label="Perfil demonstrativo atual">
        <div className="c2-profile-copy"><UserRoundCheck size={17} /><span><b>Perfil demonstrativo atual</b><small>Este seletor simula perfis; não representa autenticação ou autorização real.</small></span></div>
        <select aria-label="Perfil demonstrativo atual" value={perfil} onChange={(e) => { setPerfil(e.target.value as PerfilDemo); setErro(""); }}>
          <option value="marketing">Marina Lopes · Marketing (demonstração)</option>
          <option value="responsavel">Carlos Mendes · Responsável (demonstração)</option>
        </select>
      </section>
      <section className="c2-kpis" aria-label="Indicadores de campanhas">
        <MetricCard icone={ClipboardList} label="Campanhas" valor={campanhas.length} detalhe="estado local demonstrativo" />
        <MetricCard icone={Megaphone} label="Rascunhos" valor={rascunhos} detalhe="em preparação" />
        <MetricCard icone={CalendarDays} label="Aguardando aprovação" valor={aguardando} detalhe="sem envio" cor="#F5A623" />
        <MetricCard icone={BadgeCheck} label="Aprovadas" valor={aprovadas} detalhe="aprovadas, não enviadas" cor="#35C97C" />
        <MetricCard icone={X} label="Rejeitadas" valor={rejeitadas} detalhe="com motivo registrado" cor="#F16A6A" />
      </section>
      <section className="c2-list-card">
        <div className="c2-list-heading"><div><h2>Campanhas</h2><p>Rascunhos, solicitações e decisões da demonstração.</p></div>
          <div className="c2-filters"><input aria-label="Buscar campanha" placeholder="Buscar campanha..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select aria-label="Filtrar campanhas por status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="todas">Todos os status</option><option value="Rascunho">Rascunho</option><option value="Aguardando aprovação">Aguardando aprovação</option><option value="Aprovada">Aprovada</option><option value="Rejeitada">Rejeitada</option>
            </select>
          </div>
        </div>
        {erro && !form && !decisao ? <p className="c2-inline-error" role="alert">{erro}</p> : null}
        <div className="c2-table-wrap"><table className="c2-table">
          <thead><tr><th>Campanha</th><th>Público elegível</th><th>Período</th><th>Status</th><th>Criada por</th><th>Ações</th></tr></thead>
          <tbody>{filtradas.map((c) => {
            const publico = calcularPublico(candidatos, c.segmento, INTERVALO_ANTI_SPAM);
            const tom = c.status === "Aprovada" ? "ok" : c.status === "Aguardando aprovação" ? "atencao" : c.status === "Rejeitada" ? "perigo" : "neutro";
            return <tr key={c.id} data-testid={"campanha-" + c.id}>
              <td><b>{c.nome}</b><small>{c.objetivo}</small></td><td><b>{publico.elegiveis.length}</b><small>{publico.excluidos.length} excluídos</small></td>
              <td>{formatarData(c.inicio)} – {formatarData(c.fim)}</td><td><StatusBadge tom={tom}>{c.status}</StatusBadge></td>
              <td>{c.criador.split(" · ")[0]}<small>{c.solicitadaEm ? "Solicitada " + formatarData(c.solicitadaEm) : "sem solicitação"}</small></td>
              <td><div className="c2-row-actions">
                <button className="c2-icon-button" type="button" aria-label={"Consultar " + c.nome} title="Consultar detalhes" onClick={() => setDetalhe(c.id)}><Eye size={15} /></button>
                {perfil === "marketing" && c.status === "Rascunho" && c.criador === nomePerfil ? <>
                  <button className="c2-icon-button" type="button" aria-label={"Editar " + c.nome} title="Editar rascunho" onClick={() => abrirEdicao(c)}><ClipboardList size={15} /></button>
                  <button className="c2-icon-button c2-icon-gold" type="button" aria-label={"Solicitar aprovação de " + c.nome} title="Solicitar aprovação" onClick={() => solicitarAprovacao(c)}><Send size={15} /></button>
                </> : null}
                {perfil === "marketing" ? <button className="c2-icon-button" type="button" aria-label={"Duplicar " + c.nome} title="Duplicar como rascunho" onClick={() => duplicar(c)}><Copy size={15} /></button> : null}
                {c.status === "Aguardando aprovação" && perfil === "responsavel" ? <button className="c2-button c2-small" type="button" disabled={!podeDecidir(c, perfil, nomePerfil)} onClick={() => { setDecisao(c.id); setMotivo(""); setErro(""); }}><BadgeCheck size={14} /> Decidir</button> : null}
              </div></td>
            </tr>;
          })}</tbody>
        </table>{filtradas.length === 0 ? <p className="c2-empty">Nenhuma campanha neste filtro.</p> : null}</div>
        <p className="c2-footnote">Os registros são salvos somente no armazenamento local deste navegador. Não há envio real ou gravação operacional.</p>
      </section>

      {form ? <div className="c2-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setForm(null); }}>
        <section className="c2-dialog c2-editor" role="dialog" aria-modal="true" aria-labelledby="c2-editor-title">
          <header className="c2-dialog-head"><div><p className="c2-eyebrow">RASCUNHO · DADOS DEMONSTRATIVOS</p><h2 id="c2-editor-title">{editando ? "Editar campanha" : "Criar campanha"}</h2></div><button className="c2-icon-button" type="button" aria-label="Fechar" onClick={() => setForm(null)}><X size={18} /></button></header>
          <div className="c2-editor-grid"><div className="c2-form-fields">
            <label>Nome da campanha<input value={form.nome} maxLength={90} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Volte para o nosso cardápio" /></label>
            <label>Objetivo<textarea value={form.objetivo} rows={2} maxLength={220} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} placeholder="O que esta campanha pretende alcançar?" /></label>
            <label>Público e segmento<select value={form.segmento} onChange={(e) => setForm({ ...form, segmento: e.target.value as SegmentoCampanha })}>{SEGMENTOS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select></label>
            <div className="c2-date-grid"><label>Início<input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></label><label>Fim<input type="date" value={form.fim} min={form.inicio || undefined} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></label></div>
            <label>Cupom demonstrativo<select value={form.cupom} onChange={(e) => setForm({ ...form, cupom: e.target.value })}>{CUPONS.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}</select><small>Lista fictícia, sem consulta ou alteração de cupons operacionais.</small></label>
            <label>Mensagem<textarea value={form.mensagem} rows={5} maxLength={1000} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} /><small>Campos disponíveis: {"{{cliente}}"}, {"{{dias_sem_comprar}}"}, {"{{cupom}}"}.</small></label>
          </div>
          <aside className="c2-preview-column">
            <div className="c2-preview-card"><div className="c2-preview-title"><Eye size={16} /><b>Prévia da mensagem</b></div><p className="c2-message-preview">{mensagemPreview}</p><small>Exemplo de texto — nenhuma mensagem será enviada.</small></div>
            <div className="c2-audience-card"><div className="c2-preview-title"><Users size={16} /><b>Prévia de público</b></div>
              <div className="c2-audience-numbers"><span><b>{publicoForm?.selecionados.length ?? 0}</b> no segmento</span><span className="c2-eligible"><b>{publicoForm?.elegiveis.length ?? 0}</b> elegíveis</span><span className="c2-excluded"><b>{publicoForm?.excluidos.length ?? 0}</b> excluídos</span></div>
              <p className="c2-policy-note">Opt-out sempre excluído. Intervalo anti-spam do CRM: {INTERVALO_ANTI_SPAM} dias entre contatos.</p>
              <div className="c2-exclusion-list"><b>Motivos de exclusão</b>{publicoForm?.excluidos.length ? publicoForm.excluidos.slice(0, 5).map((c) => <div key={c.id}><span>{c.nome}</span><ul>{c.motivos.map((m) => <li key={m}>{m}</li>)}</ul></div>) : <p>Nenhum cliente excluído neste segmento.</p>}</div>
            </div>
          </aside></div>
          {erro ? <p className="c2-inline-error" role="alert">{erro}</p> : null}
          <footer className="c2-dialog-actions"><span>Criador: <b>{nomePerfil}</b> · armazenamento local demonstrativo</span><button className="c2-button" type="button" onClick={() => setForm(null)}>Cancelar</button><button className="c2-button c2-primary" type="button" onClick={salvarRascunho}><Save size={15} /> Salvar rascunho</button></footer>
        </section>
      </div> : null}

      {campanhaDetalhe ? <div className="c2-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetalhe(null); }}>
        <section className="c2-dialog c2-details" role="dialog" aria-modal="true" aria-labelledby="c2-detail-title">
          <header className="c2-dialog-head"><div><p className="c2-eyebrow">DETALHES · REGISTRO LOCAL</p><h2 id="c2-detail-title">{campanhaDetalhe.nome}</h2></div><button className="c2-icon-button" type="button" aria-label="Fechar" onClick={() => setDetalhe(null)}><X size={18} /></button></header>
          <p className="c2-detail-objective">{campanhaDetalhe.objetivo}</p>
          {(() => { const pub = calcularPublico(candidatos, campanhaDetalhe.segmento, INTERVALO_ANTI_SPAM); return <div className="c2-detail-stats">
            <span><b>{SEGMENTOS.find((s) => s.valor === campanhaDetalhe.segmento)?.rotulo}</b> · segmento</span><span><b>{pub.elegiveis.length}</b> elegíveis · <b>{pub.excluidos.length}</b> excluídos</span>
            <span><b>{formatarData(campanhaDetalhe.inicio)} – {formatarData(campanhaDetalhe.fim)}</b> · período</span><span><b>{campanhaDetalhe.cupom || "Sem cupom"}</b> · cupom demo</span>
          </div>; })()}
          <div className="c2-detail-message"><b>Prévia da mensagem</b><p>{substituirCamposMensagem(campanhaDetalhe.mensagem, calcularPublico(candidatos, campanhaDetalhe.segmento, INTERVALO_ANTI_SPAM).elegiveis[0] ?? null, campanhaDetalhe.cupom)}</p></div>
          <div className="c2-approval-summary"><span>Status: <b>{campanhaDetalhe.status}</b></span><span>Criador: <b>{campanhaDetalhe.criador}</b></span>
            {campanhaDetalhe.solicitadaEm ? <span>Solicitação: <b>{new Date(campanhaDetalhe.solicitadaEm).toLocaleString("pt-BR")}</b></span> : null}
            {campanhaDetalhe.decisor ? <span>Decisão por: <b>{campanhaDetalhe.decisor}</b></span> : null}
            {campanhaDetalhe.decididaEm ? <span>Decidida em: <b>{new Date(campanhaDetalhe.decididaEm).toLocaleString("pt-BR")}</b></span> : null}
            {campanhaDetalhe.motivoRejeicao ? <span>Motivo da rejeição: <b>{campanhaDetalhe.motivoRejeicao}</b></span> : null}
          </div>
          <div className="c2-history"><div className="c2-preview-title"><History size={16} /><b>Histórico demonstrativo</b></div><ol>{campanhaDetalhe.historico.map((h, i) => <li key={h.data + "-" + i}><span>{new Date(h.data).toLocaleString("pt-BR")}</span><b>{h.tipo}</b><small>{h.perfil}{h.nota ? " · " + h.nota : ""}</small></li>)}</ol></div>
          <footer className="c2-dialog-actions"><span>Aprovação não significa envio.</span><button className="c2-button" type="button" onClick={() => setDetalhe(null)}>Fechar</button></footer>
        </section>
      </div> : null}

      {campanhaDecisao ? <div className="c2-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDecisao(null); }}>
        <section className="c2-dialog c2-decision" role="dialog" aria-modal="true" aria-labelledby="c2-decision-title">
          <header className="c2-dialog-head"><div><p className="c2-eyebrow">PERFIL RESPONSÁVEL · DEMONSTRAÇÃO</p><h2 id="c2-decision-title">Decisão de aprovação</h2></div><button className="c2-icon-button" type="button" aria-label="Fechar" onClick={() => setDecisao(null)}><X size={18} /></button></header>
          <div className="c2-decision-campaign"><b>{campanhaDecisao.nome}</b><span>Criada por {campanhaDecisao.criador}</span><span>Solicitada em {campanhaDecisao.solicitadaEm ? new Date(campanhaDecisao.solicitadaEm).toLocaleString("pt-BR") : "—"}</span></div>
          {campanhaDecisao.criador === nomePerfil ? <p className="c2-inline-error" role="alert">O criador não pode aprovar ou rejeitar a própria campanha.</p> : null}
          <label className="c2-reject-reason">Motivo da rejeição (obrigatório para rejeitar)<textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Registre o motivo demonstrativo da rejeição" /></label>
          {erro ? <p className="c2-inline-error" role="alert">{erro}</p> : null}
          <footer className="c2-dialog-actions"><span>Decisor: <b>{nomePerfil}</b> · aprovação não envia campanha</span><button className="c2-button" type="button" onClick={() => registrarDecisao(false)} disabled={!podeDecidir(campanhaDecisao, perfil, nomePerfil)}><X size={15} /> Rejeitar</button><button className="c2-button c2-primary" type="button" onClick={() => registrarDecisao(true)} disabled={!podeDecidir(campanhaDecisao, perfil, nomePerfil)}><Check size={15} /> Aprovar · sem envio</button></footer>
        </section>
      </div> : null}
      <p className="c2-final-note"><CircleDollarSign size={14} /> Cupons, pessoas, contatos e perfis desta página são fictícios. A base de clientes é a mesma compartilhada com C1.</p>
    </main>
  );
}
