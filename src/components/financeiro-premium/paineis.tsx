import { CalendarCheck, CalendarDays, ChartNoAxesCombined, Check, CheckCircle2, CirclePlus, Download, ExternalLink, FileText, FlaskConical, HandCoins, HeartPulse, History, Info, Landmark, Layers, Lightbulb, ReceiptText, Shield, ShoppingCart, Target, TrendingUp, Wallet, X, AlertTriangle, Calculator } from "lucide-react";
import { Moedas as Coins } from "./icones";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Panel, Status } from "./layout";
import { coresCategoria, percentual, type calcularResumo } from "./dados";

type Resumo = ReturnType<typeof calcularResumo>;
type Risco = { nome: string; explicacao: string; gravidade: string; acao: string; fonte: string; valor: number };
type Obrigacao = { id: string; descricao: string; vencimento: string; situacao: string; valor?: number };
type Conta = { id: string; descricao: string; vencimento: string; valor: number; situacao: string };
type Aba = "lancamentos" | "custos" | "caixa" | "equilibrio" | "simulacoes" | "fiscal" | "relatorios";
const brl = (v: number) => Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const data = (v: string) => v.split("-").reverse().join("/");
const tone = (g: string) => g === "vermelho" ? "danger" : g === "âmbar" ? "warning" : g === "verde" ? "good" : "neutral";
const tooltip = { contentStyle: { background: "#101710", border: "1px solid #ffdc25", color: "#fff", borderRadius: 8 }, labelStyle: { color: "#ffdf00" } };

export function VisaoGeral({ calc, chart, categorias, riscos, obrigacoes, contas, saude }: {
  calc: Resumo;
  chart: { mes: string; receita: number; despesas: number; pe: number | null }[];
  categorias: { name: string; value: number }[]; riscos: Risco[]; obrigacoes: Obrigacao[]; contas: Conta[]; saude: string;
}) {
  const valido = Number.isFinite(calc.pe) && calc.pe >= 0;
  const abaixo = valido && calc.receita < calc.pe;
  const ordem: Record<string, number> = { vermelho: 0, âmbar: 1, verde: 2, cinza: 3 };
  const ordenados = [...riscos].sort((a, b) => (ordem[a.gravidade] ?? 3) - (ordem[b.gravidade] ?? 3));
  const fiscais: Risco[] = obrigacoes.filter(o => o.situacao === "pendente" || o.situacao === "vencida").map(o => ({
    nome: `${o.descricao} a conferir`, gravidade: o.situacao === "vencida" ? "vermelho" : "âmbar", valor: o.valor || 0,
    explicacao: `Vencimento ${data(o.vencimento)} • obrigação demonstrativa.`, fonte: "Fiscal", acao: "Conferir obrigação e planejar pagamento.",
  }));
  const superiores = [...ordenados.filter(r => r.gravidade !== "verde"), ...fiscais];
  if (!superiores.length && ordenados[0]) superiores.push(ordenados[0]);
  const compromissos = [...obrigacoes.filter(o => !["paga", "pago"].includes(o.situacao)), ...contas.filter(c => c.situacao !== "pago")]
    .sort((a,b) => a.vencimento.localeCompare(b.vencimento)).slice(0,4);
  const total = categorias.reduce((a,c) => a+c.value,0);
  const maximo = Math.max(...chart.flatMap(m => [m.receita, m.despesas, m.pe ?? 0]), 1);
  const passo = Math.max(5000, Math.ceil(maximo/6/5000)*5000);
  const linhas = [
    [CalendarDays, "Mensal:", valido ? brl(calc.pe) : "Não calculável"],
    [CalendarDays, "Diário (média):", valido ? brl(calc.pe/30) : "—"],
    [ChartNoAxesCombined, "Faturamento no mês:", brl(calc.receita)],
  ] as const;
  return <>
    <div className="fp-top-row">
      <Panel title="EVOLUÇÃO: RECEITAS x DESPESAS x PONTO DE EQUILÍBRIO" icon={ChartNoAxesCombined} className="fp-chart-panel">
        <div className="fp-chart-key"><span><i className="fp-swatch" />Receitas</span><span><i className="fp-swatch fp-swatch-expense" />Despesas</span><span><i className="fp-swatch fp-swatch-line" />Ponto de Equilíbrio</span></div>
        <div className="fp-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{ top: 7, right: 4, bottom: 0, left: 0 }} barGap={3} barCategoryGap="20%">
          <defs><linearGradient id="fp-receita" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00f24b" /><stop offset="100%" stopColor="#008327" /></linearGradient><linearGradient id="fp-despesa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffe000" /><stop offset="100%" stopColor="#b07800" /></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#7b80572e" />
          <XAxis dataKey="mes" tick={{ fill: "#efefe4", fontSize: 11 }} stroke="#c9cab8" tickLine={false} height={22} />
          <YAxis domain={[0, passo*6]} ticks={Array.from({length:7},(_,i)=>i*passo)} interval={0} tick={({ x, y, payload }) => <text x={Number(x)-3} y={y} fill="#efefe4" fontSize={10} textAnchor="end" dominantBaseline="middle">R$ {Number(payload.value).toLocaleString("pt-BR")}</text>} tickLine={false} stroke="#c9cab8" width={64} />
          <Tooltip {...tooltip} formatter={(v: number, name: string) => [brl(v), name]} cursor={{ fill: "#ffffff0a" }} />
          <Bar dataKey="receita" name="Receitas" fill="url(#fp-receita)" stroke="#00df4b" radius={[3,3,0,0]} isAnimationActive={false} />
          <Bar dataKey="despesas" name="Despesas" fill="url(#fp-despesa)" stroke="#ffd000" radius={[3,3,0,0]} isAnimationActive={false} />
          <Line dataKey="pe" name="Ponto de equilíbrio" stroke="#fff" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 3, fill: "#071009", stroke: "#fff", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </ComposedChart></ResponsiveContainer></div>
        <p className="fp-chart-note">Série fictícia identificada • Abril calculado dos cadastros locais</p>
      </Panel>
      <Panel title="PONTO DE EQUILÍBRIO (RESUMO)" icon={Target}>
        <dl className="fp-metric-list">{linhas.map(([Icon, label, value]) => <div key={label}><dt><Icon />{label}</dt><dd>{value}</dd></div>)}
          <div><dt><Shield />Situação:</dt><dd><Status tone={!valido ? "warning" : abaixo ? "danger" : "good"}>{valido && !abaixo && <CheckCircle2 />}{!valido ? "Não calculável" : abaixo ? "Abaixo do ponto" : calc.receita === calc.pe ? "No ponto" : "Acima do ponto"}</Status></dd></div>
          <div><dt><CalendarCheck />Margem de segurança:</dt><dd><Status tone={!valido ? "neutral" : abaixo ? "danger" : "good"}>{valido ? percentual(calc.margemSeg*100) : "—"}</Status></dd></div>
        </dl>
      </Panel>
      <Panel title="CENTRAL DE RISCOS E CONFORMIDADE" icon={Shield} className="fp-risks" action={<Status tone="warning"><AlertTriangle />{superiores.filter(r => r.gravidade !== "verde").length} alertas</Status>}>
        <div className="fp-risk-list">{superiores.slice(0,4).map((r,i) => <div className={`fp-risk ${tone(r.gravidade)}`} key={`${r.nome}-${i}`}>
          <span className={`fp-risk-icon fp-risk-${tone(r.gravidade)}`}>{r.gravidade === "vermelho" ? <X /> : r.gravidade === "verde" ? <Check /> : <AlertTriangle />}</span>
          <div className="fp-risk-copy"><strong>{r.nome}</strong><p>{r.explicacao}</p></div><Status tone={tone(r.gravidade)}>{r.gravidade === "vermelho" ? "Crítico" : r.gravidade === "verde" ? "Controlado" : "Atenção"}</Status>
        </div>)}</div>
        <p className="fp-demo-note">Riscos derivados dos dados fictícios • sem certificação fiscal</p>
      </Panel>
    </div>
    <div className="fp-second-row">
      <Panel title="DESPESAS POR CATEGORIA (MÊS ATUAL)">
        <div className="fp-distribution"><div className="fp-donut">
          {total > 0 && <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categorias} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="95%" cx="50%" cy="50%" stroke="none" isAnimationActive={false}>{categorias.map((c,i) => <Cell key={c.name} fill={coresCategoria[i%coresCategoria.length]} />)}</Pie><Tooltip {...tooltip} formatter={(v: number) => brl(v)} /></PieChart></ResponsiveContainer>}
          <div className="fp-donut-total"><span>R$</span>{total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
        </div><ul className="fp-category-legend">{categorias.map((c,i) => <li key={c.name}><i style={{ background: coresCategoria[i%coresCategoria.length] }} /><span>{c.name}</span><b>{brl(c.value)}</b><em>{percentual(total > 0 ? c.value/total*100 : 0)}</em></li>)}</ul></div>
      </Panel>
      <Panel title="SAÚDE FINANCEIRA" icon={HeartPulse} className="fp-health">
        <div className="fp-health-state"><Status tone={saude === "Prejuízo" ? "danger" : saude === "Saudável" ? "good" : "warning"}><CheckCircle2 />{saude}</Status></div>
        <div className="fp-health-track" aria-label={`Saúde financeira: ${saude}`}><i style={{ left: saude === "Prejuízo" ? "10%" : saude === "Saudável" ? "78%" : "45%" }} /></div>
        <p>{saude === "Prejuízo" ? "Resultado negativo. Revisar receitas e custos." : saude === "Saudável" ? "Resultado positivo, caixa e margem com folga." : "Revisar margem, caixa e ponto de equilíbrio."}</p>
      </Panel>
      <Panel title="PRÓXIMOS COMPROMISSOS" icon={CalendarCheck} className="fp-next">
        <ul className="fp-commitments">{compromissos.map(c => <li key={c.id}><CalendarDays /><time dateTime={c.vencimento}>{data(c.vencimento).slice(0,5)}</time><span>{c.descricao}<small>{c.valor == null ? "Valor não informado" : brl(c.valor)}</small></span><Status tone={c.situacao === "vencida" || c.situacao === "vencido" ? "danger" : "warning"}>{c.situacao === "vencida" || c.situacao === "vencido" ? "Vencido" : "Pendente"}</Status></li>)}</ul>
        {!compromissos.length && <p className="fp-empty">Nenhum compromisso pendente.</p>}
        <p className="fp-demo-note">Agenda demonstrativa • referência: 13/04/2025</p>
      </Panel>
    </div>
  </>;
}

export function Atalhos({ navegar, novo, conferirCaixa }: { navegar: (aba: Aba) => void; novo: (tipo: "receita" | "despesa", categoria?: string) => void; conferirCaixa: () => void }) {
  const itens = [
    [Coins, "+ Nova Receita", "(Entrada)", () => novo("receita")], [Coins, "− Nova Despesa", "(Saída)", () => novo("despesa")],
    [CalendarDays, "Contas a Pagar", "(Prazos)", () => navegar("caixa")], [HandCoins, "Contas a Receber", "(Recebimentos)", () => navegar("caixa")],
    [Layers, "Cadastrar Custos", "(Fixos e Variáveis)", () => navegar("custos")], [ReceiptText, "Obrigações Fiscais", "(Impostos / Taxas)", () => navegar("fiscal")],
    [ShoppingCart, "Lançar Compra", "(Insumos e Estoque)", () => novo("despesa", "Insumos")], [Wallet, "Conferir Caixa", "(Abertura / Fechamento)", conferirCaixa],
    [Calculator, "Simulador", "(Preços e Cenários)", () => navegar("simulacoes")],
  ] as const;
  return <section className="fp-actions fp-frame"><div className="fp-section-title"><CirclePlus /><div><h2>LANÇAMENTOS E CADASTROS — ADICIONAR INFORMAÇÕES</h2><p>Registre receitas, despesas, custos, contas, impostos e demais dados da empresa.</p></div></div><div className="fp-actions-grid">{itens.map(([Icon,label,sub,onClick]) => <button key={label} className="fp-action" onClick={onClick}><Icon /><strong>{label}</strong><span>{sub}</span></button>)}</div></section>;
}

export function Analises({ calc, riscos, obrigacoes, saldo, navegar }: { calc: Resumo; riscos: Risco[]; obrigacoes: Obrigacao[]; saldo: number; navegar: (aba: Aba) => void }) {
  const valido = Number.isFinite(calc.pe);
  const recs = [
    ...(!valido ? ["Rever custos variáveis: a margem não permite calcular o ponto de equilíbrio."] : calc.receita < calc.pe ? [`Faltam ${brl(calc.pe-calc.receita)} para o ponto de equilíbrio.`] : ["Acompanhar o ponto de equilíbrio semanalmente."]),
    ...(calc.perc < .25 ? ["Revisar preços e negociar insumos para recuperar a margem."] : ["Manter controle dos custos de produção e entrega."]),
    ...(saldo < 10000 ? ["Priorizar recebimentos e proteger o saldo de caixa."] : ["Planejar pagamentos sem comprometer o caixa."]),
    "Conferir obrigações fiscais antes dos vencimentos.",
  ];
  return <section className="fp-details fp-frame" id="analises-financeiras"><div className="fp-section-title"><Landmark /><div><h2>DETALHAMENTOS E ANÁLISES</h2><p>Descrições, cálculos, riscos, obrigações e recomendações para a gestão da empresa</p></div></div>
    <div className="fp-detail-grid">
      <Panel title="Ponto de Equilíbrio — Detalhes" icon={Target}><p>É o faturamento necessário para cobrir os custos e não ter prejuízo.</p><dl className="fp-metric-list">
        <div><dt>Custos fixos (mensal)</dt><dd>{brl(calc.fixos)}</dd></div><div><dt>Custos variáveis</dt><dd>{brl(calc.variais)}</dd></div><div><dt>Margem de contribuição</dt><dd>{percentual(calc.perc*100)}</dd></div><div className="fp-highlight"><dt>Ponto de equilíbrio (mensal)</dt><dd>{valido ? brl(calc.pe) : "Não calculável"}</dd></div><div><dt>Ponto de equilíbrio (diário)</dt><dd>{valido ? brl(calc.pe/30) : "—"}</dd></div>
      </dl><p>{valido ? calc.receita >= calc.pe ? `${brl(calc.receita-calc.pe)} acima do ponto de equilíbrio.` : `${brl(calc.pe-calc.receita)} abaixo do ponto de equilíbrio.` : "Margem insuficiente para cobrir os custos fixos."}</p></Panel>
      <Panel title="Riscos Financeiros" icon={Shield}><p>Situações que podem afetar o caixa, a margem e o resultado.</p><ul className="fp-detail-list">{riscos.slice(0,4).map(r => <li key={r.nome} title={`${r.explicacao} ${r.acao}`}><Info /><span>{r.nome}</span></li>)}</ul><details className="fp-risk-details"><summary className="fp-button">Ver análise completa <ExternalLink /></summary><ul className="fp-detail-list">{riscos.map(r => <li key={r.nome}><span><strong>{r.nome}</strong><br />{r.explicacao}<br />Fonte: {r.fonte}<br />{r.acao}</span></li>)}</ul></details></Panel>
      <Panel title="Riscos Fiscais e Obrigações" icon={FileText}><p>Acompanhamento demonstrativo de obrigações. Não certifica regularidade fiscal.</p><ul className="fp-detail-list">{obrigacoes.map(o => <li key={o.id}>{o.situacao === "paga" ? <CheckCircle2 /> : <AlertTriangle />}<span>{o.descricao} • {data(o.vencimento)} • {o.situacao}</span></li>)}</ul><button className="fp-button" onClick={() => navegar("fiscal")}>Ver conformidade fiscal <ExternalLink /></button></Panel>
      <Panel title="Recomendações do Sistema" icon={Lightbulb}><p>Ações sugeridas com base nos dados demonstrativos e nas metas.</p><ul className="fp-detail-list">{recs.map(r => <li key={r}><CheckCircle2 /><span>{r}</span></li>)}</ul><button className="fp-button" onClick={() => navegar("equilibrio")}>Ver análise do ponto <ExternalLink /></button></Panel>
    </div>
    <div className="fp-bottom-grid"><Panel title="Simulador de Cenários" icon={Calculator}><p>Avalie o impacto de mudanças nos custos, preços ou vendas no ponto de equilíbrio e no lucro.</p><button className="fp-button" onClick={() => navegar("simulacoes")}><FlaskConical />Abrir simulador</button></Panel><Panel title="Evolução e Históricos" icon={TrendingUp}><p>Veja a série fictícia de receitas, despesas e ponto de equilíbrio. Abril reage aos cadastros.</p><button className="fp-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><History />Ver gráficos</button></Panel><Panel title="Relatórios e Exportações" icon={ListIcon}><p>Resumo financeiro demonstrativo para conferência dos valores calculados nesta página.</p><button className="fp-button" onClick={() => navegar("relatorios")}><Download />Ver relatórios</button></Panel></div>
  </section>;
}
const ListIcon = ReceiptText;
