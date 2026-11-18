import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TrendingUp, Target, Shield, Wallet, CheckCircle2, Plus, Search, ChartNoAxesCombined, CalendarDays, Layers, ReceiptText, ListChecks, ClipboardPen, Trash2, Info, Check, FlaskConical } from "lucide-react";
import { Moedas as Coins } from "@/components/financeiro-premium/icones";
import { FinanceiroPreviewLayout, Panel, Status } from "@/components/financeiro-premium/layout";
import { VisaoGeral, Atalhos, Analises } from "@/components/financeiro-premium/paineis";
import { calcularResumo, dataDemonstracao, historicoDemonstrativo, percentual } from "@/components/financeiro-premium/dados";

export const Route = createFileRoute("/preview/financeiro-premium")({
  head: () => ({
    meta: [{ title: "Financeiro Premium — Néia Salgados" }],
    links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;600;700&display=swap" }],
  }),
  component: FinanceiroPremium,
});

type Lancamento = { id: string; data: string; descricao: string; categoria: string; tipo: "receita" | "despesa"; valor: number; status: string; custoId?: string };
type Custo = { id: string; descricao: string; categoria: string; classificacao: "fixo"|"variavel"; valor: number; data: string; recorrencia?: string };
type Conta = { id: string; descricao: string; fornecedor: string; cliente: string; valor: number; vencimento: string; situacao: "pendente"|"pago"|"vencido"; categoria: string };
type CaixaMov = { id: string; tipo: "entrada"|"saida"; descricao: string; valor: number; meio: string; data: string };
type Obrigacao = { id: string; descricao: string; tipo: string; competencia: string; vencimento: string; valor?: number; situacao: "pendente"|"paga"|"vencida"; responsavel: string; observacoes?: string };

function brl(v: number) { return Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"; }

export function FinanceiroPremium() {
  const [periodo, setPeriodo] = useState("Abril/2025");
  const [aba, setAba] = useState<"lancamentos"|"custos"|"caixa"|"equilibrio"|"simulacoes"|"fiscal"|"relatorios">("lancamentos");
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [simCustoFixo, setSimCustoFixo] = useState(12000);
  const [simCustoVar, setSimCustoVar] = useState(0.45);
  const [simReceita, setSimReceita] = useState(30000);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([
    { id:"1", data:"13/04/2025", descricao:"Venda PDV", categoria:"Vendas", tipo:"receita", valor:1480, status:"Conciliado"},
    { id:"2", data:"13/04/2025", descricao:"Compra Insumos", categoria:"Insumos", tipo:"despesa", valor:520, status:"Pago", custoId:"c2"},
    { id:"3", data:"12/04/2025", descricao:"Aluguel", categoria:"Fixos", tipo:"despesa", valor:3500, status:"Pago", custoId:"c1"},
    { id:"4", data:"12/04/2025", descricao:"Entrega", categoria:"Logística", tipo:"despesa", valor:210, status:"Pendente"},
    { id:"demo-mes", data:"11/04/2025", descricao:"Vendas consolidadas do mês (demonstração)", categoria:"Vendas", tipo:"receita", valor:57000, status:"Conciliado"},
  ]);
  const [form, setForm] = useState({ descricao:"", categoria:"Vendas", tipo:"receita" as "receita"|"despesa", valor:"", data:dataDemonstracao, status:"Pendente" });
  const [custos, setCustos] = useState<Custo[]>([
    { id:"c1", descricao:"Aluguel", categoria:"Fixos", classificacao:"fixo", valor:3500, data:"2025-04-01" },
    { id:"c2", descricao:"Insumos", categoria:"Produção", classificacao:"variavel", valor:28400, data:"2025-04-01" },
    { id:"demo-equipe", descricao:"Equipe (demonstração mensal)", categoria:"Pessoal", classificacao:"fixo", valor:8700, data:"2025-04-01" },
    { id:"demo-servicos", descricao:"Energia e serviços (demonstração mensal)", categoria:"Serviços", classificacao:"fixo", valor:2300, data:"2025-04-01" },
  ]);
  const [contasPagar, setContasPagar] = useState<Conta[]>([
    { id:"p1", descricao:"Aluguel abril", fornecedor:"Imobiliária", cliente:"", valor:3500, vencimento:"2025-04-05", situacao:"pago", categoria:"Fixos" },
    { id:"p2", descricao:"Fornecedor Insumos", fornecedor:"Distribuidora", cliente:"", valor:1200, vencimento:"2025-04-20", situacao:"pendente", categoria:"Produção" },
  ]);
  const [contasReceber, setContasReceber] = useState<Conta[]>([
    { id:"r1", descricao:"Venda PDV #4598", fornecedor:"", cliente:"Ana", valor:180, vencimento:"2025-04-15", situacao:"pendente", categoria:"Vendas" },
  ]);
  const [caixa, setCaixa] = useState<CaixaMov[]>([
    { id:"m1", tipo:"entrada", descricao:"Venda", valor:1480, meio:"Pix", data:"2025-04-13" },
    { id:"m2", tipo:"saida", descricao:"Compra", valor:520, meio:"Pix", data:"2025-04-13" },
  ]);
  const [custoForm, setCustoForm] = useState<any>({ classificacao:"fixo" });
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState(15000);
  const [valorContado, setValorContado] = useState(0);
  const [responsavel, setResponsavel] = useState("Operador");
  const [sangriaValor, setSangriaValor] = useState(0);
  const [suprimentoValor, setSuprimentoValor] = useState(0);
  const [contaForm, setContaForm] = useState<Partial<Conta>>({ situacao:"pendente" });
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([
    { id:"o1", descricao:"DAS", tipo:"Tributo", competencia:"04/2025", vencimento:"2025-04-20", valor:1200, situacao:"pendente", responsavel:"Contador" },
    { id:"o2", descricao:"FGTS", tipo:"Obrigação", competencia:"04/2025", vencimento:"2025-04-07", valor:850, situacao:"paga", responsavel:"RH" },
  ]);
  const [obrigacaoForm, setObrigacaoForm] = useState<Partial<Obrigacao>>({ situacao:"pendente" });

  const dadosBase = useMemo(() => {
    const receita = lancamentos.filter(l=>l.tipo==="receita").reduce((a,b)=>a+b.valor,0);
    // Despesas vinculadas a um custo são apenas seu detalhamento: não duplicar.
    const despesasAvulsas = lancamentos.filter(l=>l.tipo==="despesa" && !custos.some(c=>c.id===l.custoId)).reduce((a,b)=>a+b.valor,0);
    const custosVar = custos.filter(c=>c.classificacao==="variavel").reduce((a,b)=>a+Number(b.valor),0) + despesasAvulsas;
    const custosFix = custos.filter(c=>c.classificacao==="fixo").reduce((a,b)=>a+Number(b.valor),0);
    const entrada = caixa.filter(m=>m.tipo==="entrada").reduce((a,b)=>a+b.valor,0);
    const saida = caixa.filter(m=>m.tipo==="saida").reduce((a,b)=>a+b.valor,0);
    const saldoCaixa = saldoInicial + entrada - saida;
    return { receitaLiquida: receita, custosVariaveis: custosVar, custosFixos: custosFix, saldoCaixa };
  }, [lancamentos, custos, saldoInicial, caixa]);

  const saldoCaixaCalc = useMemo(()=>{
    const entrada = caixa.filter(m=>m.tipo==="entrada").reduce((a,b)=>a+b.valor,0);
    const saida = caixa.filter(m=>m.tipo==="saida").reduce((a,b)=>a+b.valor,0);
    return { entrada, saida, saldo: entrada - saida };
  }, [caixa]);

  const calc = useMemo(() => {
    return calcularResumo(dadosBase.receitaLiquida, dadosBase.custosVariaveis, dadosBase.custosFixos);
  }, [dadosBase]);

  const sim = useMemo(() => {
    return calcularResumo(simReceita, simReceita * simCustoVar, simCustoFixo);
  }, [simReceita, simCustoVar, simCustoFixo]);

  const chartEvolucao = useMemo(() => {
    const serie = historicoDemonstrativo.map(m => ({ ...m, ...calcularResumo(m.receita, m.variaveis, m.fixos) }));
    return [...serie, { mes: "Abr/25", ...calc }].map(m => ({
      mes: m.mes, receita: m.receita, despesas: m.variais + m.fixos,
      pe: Number.isFinite(m.pe) && m.pe >= 0 ? m.pe : null,
    }));
  }, [calc.receita, calc.variais, calc.fixos]);

  const chartDistribuicao = useMemo(() => {
    const cats = custos.reduce((acc, c) => { acc[c.categoria] = (acc[c.categoria]||0) + Number(c.valor); return acc; }, {} as Record<string, number>);
    lancamentos.filter(l => l.tipo === "despesa" && !custos.some(c=>c.id===l.custoId)).forEach(l => { cats[l.categoria] = (cats[l.categoria] || 0) + l.valor; });
    return Object.entries(cats).filter(([, value]) => value > 0).sort((a,b) => b[1]-a[1]).map(([name, value]) => ({ name, value }));
  }, [custos, lancamentos]);

  const chartFluxo = useMemo(() => {
    return caixa.reduce((acc, m, i) => {
      const key = m.data.slice(5,7);
      const entry = acc.find(x => x.mes === key) || { mes: key, entrada: 0, saida: 0 };
      if (m.tipo === 'entrada') entry.entrada += m.valor; else entry.saida += m.valor;
      if (!acc.includes(entry)) acc.push(entry);
      return acc;
    }, [] as {mes:string, entrada:number, saida:number}[]);
  }, [caixa]);

  const hoje = useMemo(() => new Date(`${dataDemonstracao}T12:00:00`), []);
  const riscos = useMemo(() => {
    const list: { nome:string; gravidade:'verde'|'âmbar'|'vermelho'|'cinza'; valor:number; explicacao:string; fonte:string; acao:string }[] = [];
    const naoConciliados = lancamentos.filter(l=>l.status === "Pendente");
    if (naoConciliados.length) list.push({ nome:'Conciliação pendente', gravidade:'âmbar', valor:naoConciliados.reduce((s,l)=>s+l.valor,0), explicacao:`${naoConciliados.length} movimentação(ões) local(is) a conferir.`, fonte:'Lançamentos', acao:'Conferir comprovantes e conciliar movimentações.' });
    const limiteSemana = new Date(hoje.getTime()+7*86400000).toISOString().slice(0,10);
    const proximas = contasPagar.filter(c=>c.situacao === "pendente" && c.vencimento >= dataDemonstracao && c.vencimento <= limiteSemana);
    if (proximas.length) list.push({ nome:'Contas a pagar nesta semana', gravidade:'âmbar', valor:proximas.reduce((s,c)=>s+c.valor,0), explicacao:`${proximas.length} compromisso(s) previsto(s) em até 7 dias.`, fonte:'Contas a pagar', acao:'Reservar caixa para os próximos pagamentos.' });
    const recebimentos = contasReceber.filter(c=>c.situacao === "pendente" && c.vencimento >= dataDemonstracao);
    if (recebimentos.length) list.push({ nome:'Recebimentos a acompanhar', gravidade:'âmbar', valor:recebimentos.reduce((s,c)=>s+c.valor,0), explicacao:`${recebimentos.length} recebimento(s) ainda pendente(s).`, fonte:'Contas a receber', acao:'Acompanhar a entrada prevista no caixa.' });
    if (dadosBase.saldoCaixa < 5000) list.push({ nome:'Caixa projetado insuficiente', gravidade:'vermelho', valor:dadosBase.saldoCaixa, explicacao:'Saldo abaixo do limite operacional.', fonte:'Saldo de caixa', acao:'Revisar recebimentos e postergar despesas não essenciais.' });
    const vencidasPagar = contasPagar.filter(c=>c.situacao==='pendente' && new Date(c.vencimento) < hoje);
    if (vencidasPagar.length) list.push({ nome:'Contas a pagar vencidas', gravidade:'vermelho', valor:vencidasPagar.reduce((a,b)=>a+b.valor,0), explicacao:`${vencidasPagar.length} contas vencidas.`, fonte:'Contas a pagar', acao:'Priorizar liquidação e negociar prazos.' });
    const vencidasReceber = contasReceber.filter(c=>c.situacao==='pendente' && new Date(c.vencimento) < hoje);
    if (vencidasReceber.length) list.push({ nome:'Recebimentos atrasados', gravidade:'âmbar', valor:vencidasReceber.reduce((a,b)=>a+b.valor,0), explicacao:`${vencidasReceber.length} recebíveis em atraso.`, fonte:'Contas a receber', acao:'Acionar cobrança e revisar condições.' });
    if (calc.perc < 0.2) list.push({ nome:'Margem de contribuição baixa', gravidade:'âmbar', valor:calc.perc*100, explicacao:'Margem abaixo de 20%.', fonte:'Ponto de equilíbrio', acao:'Revisar preço de venda e custos variáveis.' });
    if (!Number.isFinite(calc.pe)) list.push({ nome:'Ponto de equilíbrio não calculável', gravidade:'vermelho', valor:0, explicacao:'Margem de contribuição insuficiente.', fonte:'Indicadores', acao:'Revisar receitas e custos variáveis.' });
    else if (calc.receita < calc.pe) list.push({ nome:'Faturamento abaixo do ponto de equilíbrio', gravidade:'vermelho', valor:calc.receita, explicacao:'Receita não cobre custos fixos + variáveis.', fonte:'Indicadores', acao:'Acelerar vendas e reduzir custos fixos.' });
    if (Number.isFinite(calc.pe) && calc.margemSeg < 0.1) list.push({ nome:'Margem de segurança reduzida', gravidade:'âmbar', valor:calc.margemSeg*100, explicacao:'Pouca folga sobre o ponto de equilíbrio.', fonte:'Indicadores', acao:'Plano de crescimento de receita.' });
    if (caixaAberto && Math.abs(valorContado - (saldoInicial + saldoCaixaCalc.saldo)) > 50) list.push({ nome:'Diferença no fechamento de caixa', gravidade:'âmbar', valor:Math.abs(valorContado - (saldoInicial + saldoCaixaCalc.saldo)), explicacao:'Divergência entre esperado e contado.', fonte:'Caixa', acao:'Conferir lançamentos e identificar extravio.' });
    const variavelRatio = calc.receita>0? calc.variais/calc.receita : 1;
    if (variavelRatio > 0.6) list.push({ nome:'Custos variáveis elevados', gravidade:'âmbar', valor:variavelRatio*100, explicacao:'Custos variáveis consomem >60% da receita.', fonte:'Custos', acao:'Negociar insumos e otimizar produção.' });
    if (!list.length) list.push({ nome:'Situação controlada', gravidade:'verde', valor:0, explicacao:'Indicadores dentro dos parâmetros.', fonte:'Geral', acao:'Manter monitoramento.' });
    return list;
  }, [dadosBase.saldoCaixa, contasPagar, contasReceber, lancamentos, calc, caixaAberto, valorContado, saldoInicial, saldoCaixaCalc, hoje]);

  const peValido = isFinite(calc.pe) && calc.pe >= 0;
  const abaixoDoPe = peValido && calc.receita < calc.pe;
  const resultadoNegativo = calc.resultado < 0;

  const saude = resultadoNegativo ? "Prejuízo" : (!peValido || abaixoDoPe || dadosBase.saldoCaixa < 5000 || calc.margemSeg < .1 ? "Atenção" : "Saudável");
  const indicadores = [
    { label: "Faturamento", valor: brl(calc.receita), sub: "Receitas demonstrativas", icon: ChartNoAxesCombined },
    { label: "Despesas", valor: brl(calc.variais + calc.fixos), sub: "Custos fixos e variáveis", icon: Coins },
    { label: "Lucro estimado", valor: brl(calc.resultado), badge: resultadoNegativo ? "Prejuízo" : "Resultado positivo", tone: resultadoNegativo ? "danger" : "good", icon: TrendingUp },
    { label: "Ponto de equilíbrio", valor: peValido ? brl(calc.pe) : "Não calculável", sub: peValido ? "(mensal)" : "Margem insuficiente", icon: Target },
    { label: "Margem de segurança", valor: peValido ? percentual(calc.margemSeg*100) : "—", badge: !peValido ? "Não calculável" : abaixoDoPe ? "Abaixo do ponto" : calc.margemSeg > .2 ? "Acima do ideal" : "Atenção", tone: !peValido || abaixoDoPe ? "danger" : calc.margemSeg > .2 ? "good" : "warning", icon: Shield },
    { label: "Saldo de caixa", valor: brl(dadosBase.saldoCaixa), sub: "Disponível", icon: Wallet },
  ];
  const filtrados = lancamentos.filter(l => l.descricao.toLowerCase().includes(filtro.toLowerCase()) && (tipoFiltro === "todos" || l.tipo === tipoFiltro) && (categoriaFiltro === "todas" || l.categoria === categoriaFiltro));

  const resetSim = () => { setSimCustoFixo(12000); setSimCustoVar(0.45); setSimReceita(30000); };

  const handleAddLancamento = () => {
    if (!form.descricao || !Number.isFinite(Number(form.valor)) || Number(form.valor) <= 0) return;
    const novo: Lancamento = {
      id: Date.now().toString(),
      data: (form.data || dataDemonstracao).split("-").reverse().join("/"),
      descricao: form.descricao,
      categoria: form.categoria || "Geral",
      tipo: form.tipo,
      valor: Number(form.valor),
      status: form.status,
    };
    setLancamentos(prev => [novo, ...prev]);
    setForm({ descricao:"", categoria:"", tipo:"receita", valor:"", data:"", status:"Pendente" });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Excluir lançamento?")) return;
    setLancamentos(prev => prev.filter(l => l.id !== id));
  };

  const addCusto = () => {
    if (!custoForm.descricao || !Number.isFinite(Number(custoForm.valor)) || Number(custoForm.valor) <= 0) return;
    const novo: Custo = { id: Date.now().toString(), descricao: custoForm.descricao!, categoria: custoForm.categoria || "Geral", classificacao: custoForm.classificacao || "fixo", valor: Number(custoForm.valor), data: custoForm.data || dataDemonstracao };
    setCustos(prev => [novo, ...prev]);
    setCustoForm({ classificacao:"fixo" });
  };
  const deleteCusto = (id:string)=> setCustos(prev=>prev.filter(c=>c.id!==id));

  const addConta = (setFn: any, conta: Partial<Conta>) => {
    if (!conta.descricao || !conta.valor) return;
    const novo: Conta = { id: Date.now().toString(), descricao: conta.descricao!, valor: Number(conta.valor), vencimento: conta.vencimento || dataDemonstracao, situacao: conta.situacao || "pendente", categoria: conta.categoria || "Geral", fornecedor: conta.fornecedor || "", cliente: conta.cliente || "" };
    setFn((prev: Conta[])=> [novo, ...prev]);
  };
  const toggleConta = (list:any, setFn:any, id:string, situacao:"pendente"|"pago"|"vencido") => setFn((prev: Conta[])=>prev.map(c=>c.id===id?{...c,situacao}:c));

  const registrarPagamento = (id:string) => {
    const conta = contasPagar.find(c=>c.id===id && c.situacao === "pendente");
    if (!conta) return;
    setContasPagar(prev=>prev.map(c=>c.id===id?{...c,situacao:"pago"}:c));
    setCaixa(prev=>[{ id:Date.now().toString(), tipo:"saida", descricao:`Pg ${conta.descricao}`, valor:conta.valor, meio:"Pix", data:dataDemonstracao },...prev]);
  };
  const registrarRecebimento = (id:string) => {
    const conta = contasReceber.find(c=>c.id===id && c.situacao === "pendente");
    if (!conta) return;
    setContasReceber(prev=>prev.map(c=>c.id===id?{...c,situacao:"pago"}:c));
    setCaixa(prev=>[{ id:Date.now().toString(), tipo:"entrada", descricao:`Rc ${conta.descricao}`, valor:conta.valor, meio:"Pix", data:dataDemonstracao },...prev]);
  };
  const abrirCaixa = () => { setCaixaAberto(true); };
  const fecharCaixa = () => { if (!valorContado) return alert("Informe valor contado"); setCaixaAberto(false); alert("Caixa fechado"); };

  const testePE = () => {
    const r = 30000, v = 18000, f = 8000;
    const m = r - v;
    const p = m / r;
    const pe = f / p;
    const ms = (r - pe) / r;
    return { m, p, pe, ms };
  };

  const navegar = (destino: typeof aba) => {
    setAba(destino);
    requestAnimationFrame(() => document.getElementById("gestao-financeira")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const novoLancamento = (tipo: "receita" | "despesa", categoria = "") => {
    setForm({ descricao: "", categoria, tipo, valor: "", data: dataDemonstracao, status: "Pendente" });
    setShowForm(true);
    navegar("lancamentos");
    requestAnimationFrame(() => document.getElementById("lancamento-descricao")?.focus({ preventScroll: true }));
  };

  return (
    <FinanceiroPreviewLayout onRelatorios={() => navegar("relatorios")}>
          <section className="fp-overview fp-frame">
            <header className="fp-page-heading">
              <Coins aria-hidden /><div><h1>FINANCEIRO — GESTÃO COMPLETA</h1><p>Controle de receitas, despesas, custos, ponto de equilíbrio e segurança da empresa</p></div>
              <div className="fp-heading-tools"><span className="fp-preview-badge">PRÉVIA • DADOS DEMONSTRATIVOS</span><label className="fp-period"><CalendarDays /><select aria-label="Período demonstrativo" value={periodo} onChange={e=>setPeriodo(e.target.value)}><option value="Abril/2025">Período: Abril/2025</option></select></label></div>
            </header>
            <div className="fp-kpis">{indicadores.map(i => <article key={i.label} className="fp-kpi" data-kpi={i.label}><i.icon aria-hidden /><div className="fp-kpi-content"><div className="fp-kpi-label">{i.label}</div><strong>{i.valor}</strong>{i.badge ? <Status tone={i.tone as "good" | "danger" | "warning"}>{i.badge}</Status> : <small>{i.sub}</small>}</div></article>)}</div>
          </section>
          <VisaoGeral calc={calc} chart={chartEvolucao} categorias={chartDistribuicao} riscos={riscos} obrigacoes={obrigacoes} contas={[...contasPagar, ...contasReceber]} saude={saude} />

          <Atalhos navegar={navegar} novo={novoLancamento} conferirCaixa={() => { abrirCaixa(); navegar("caixa"); }} />

          <nav className="fp-tabs fp-frame" id="gestao-financeira" aria-label="Gestão financeira">
            {([
              ["lancamentos", "Lançamentos", ListChecks], ["custos", "Custos (Fixos e Variáveis)", Layers], ["caixa", "Caixa", Wallet],
              ["fiscal", "Fiscal / Obrigações", ReceiptText], ["equilibrio", "Ponto de Equilíbrio", Target], ["simulacoes", "Simulações", FlaskConical], ["relatorios", "Relatórios", ChartNoAxesCombined],
            ] as const).map(([key,label,Icon]) => <button key={key} className={aba === key ? "is-active" : ""} onClick={() => setAba(key)} aria-current={aba === key ? "page" : undefined}><Icon />{label}</button>)}
          </nav>
          <div className="fp-management">

            {aba==="lancamentos" && (
              <div className="fp-ledger-grid">
                <section className="fp-ledger fp-frame">
                  <div className="fp-ledger-heading"><ListChecks /><div><h2>Lançamentos Financeiros</h2><p>Movimentações de receitas e despesas da empresa</p></div><button className="fp-button fp-button-gold" onClick={()=>novoLancamento("receita")}><Plus />Novo Lançamento</button></div>
                  <div className="fp-filters">
                    <select aria-label="Período dos lançamentos" value={periodo} onChange={e=>setPeriodo(e.target.value)}><option>Abril/2025</option></select>
                    <select aria-label="Filtrar tipo" value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)}><option value="todos">Tipo: Todos</option><option value="receita">Receita</option><option value="despesa">Despesa</option></select>
                    <select aria-label="Filtrar categoria" value={categoriaFiltro} onChange={e=>setCategoriaFiltro(e.target.value)}><option value="todas">Categoria: Todas</option>{[...new Set(lancamentos.map(l=>l.categoria))].map(c=><option key={c}>{c}</option>)}</select>
                    <label className="fp-search"><Search /><input aria-label="Buscar lançamento" value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar lançamento..." /></label>
                  </div>
                  <div className="fp-table-scroll"><table><thead><tr><th>Data ↓</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
                    <tbody>{filtrados.map(l=><tr key={l.id}>
                      <td><CalendarDays />{l.data}</td><td>{l.descricao}</td><td>{l.categoria}</td>
                      <td><Status tone={l.tipo === "receita" ? "good" : "danger"}>{l.tipo === "receita" ? "Receita" : "Despesa"}</Status></td>
                      <td className="fp-money">{brl(l.valor)}</td><td><Status tone={["conciliado","pago"].includes(l.status.toLowerCase()) ? "good" : "warning"}>{l.status === "Conciliado" && <CheckCircle2 />}{l.status}</Status></td>
                      <td>{!["conciliado","pago"].includes(l.status.toLowerCase()) ? <button className="fp-delete" onClick={()=>handleDelete(l.id)} aria-label={`Excluir ${l.descricao}`}><Trash2 /></button> : <span title="Lançamento conciliado ou pago">—</span>}</td>
                    </tr>)}</tbody></table></div>
                  {!filtrados.length && <p className="fp-empty">Nenhum lançamento encontrado.</p>}
                  <div className="fp-info"><Info /><span>Dica: mantenha os lançamentos em dia para que o ponto de equilíbrio, o lucro e os riscos estejam sempre atualizados.</span></div>
                </section>
                <form className="fp-entry-form fp-frame" onSubmit={e=>{e.preventDefault();handleAddLancamento();}}>
                  <div className="fp-panel-heading"><ClipboardPen /><h2>Cadastrar Lançamento</h2>{showForm && <Status tone="warning">Novo</Status>}</div>
                  <div className="fp-entry-fields">
                    <label>Tipo de lançamento *<select id="lancamento-tipo" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value as "receita"|"despesa"})}><option value="receita">🟢 Receita (Entrada)</option><option value="despesa">🔴 Despesa (Saída)</option></select></label>
                    <label>Categoria *<input aria-label="Categoria do lançamento" list="categorias-financeiras" value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})} placeholder="Vendas, insumos..." /><datalist id="categorias-financeiras">{["Vendas","Insumos","Fixos","Logística","Serviços"].map(c=><option key={c}>{c}</option>)}</datalist></label>
                    <label>Data *<input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} /></label>
                    <label>Valor (R$) *<input id="lancamento-valor" type="number" min="0.01" step="0.01" required value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})} placeholder="0,00" /></label>
                    <label className="fp-field-wide">Descrição *<input id="lancamento-descricao" required value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="Ex.: venda do dia, compra de insumos, aluguel, etc." /></label>
                    <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Pendente</option><option>Pago</option><option>Conciliado</option></select></label>
                  </div>
                  <p className="fp-form-hint">Demonstração local, sem gravação no banco. Campos * obrigatórios. Despesas avulsas entram no custo variável.</p>
                  <div className="fp-form-actions"><button type="button" className="fp-button" onClick={()=>{setForm({descricao:"",categoria:"",tipo:"receita",valor:"",data:"",status:"Pendente"});setShowForm(false);}}>Cancelar</button><button type="submit" className="fp-button fp-button-gold"><Check />Salvar Lançamento</button></div>
                </form>
              </div>
            )}

            {aba==="custos" && (
              <div className="fp-operational fp-frame" data-testid="custos-painel">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Custos</div>
                  <button onClick={addCusto} className="px-3 py-1.5 rounded-lg bg-[#D4A94A] text-black text-xs font-semibold">Adicionar custo</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <input placeholder="Descrição" value={custoForm.descricao||""} onChange={e=>setCustoForm({...custoForm, descricao:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Categoria" value={custoForm.categoria||""} onChange={e=>setCustoForm({...custoForm, categoria:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Valor" value={String(custoForm.valor||"")} onChange={e=>setCustoForm({...custoForm, valor:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input type="date" value={custoForm.data||""} onChange={e=>setCustoForm({...custoForm, data:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <select value={custoForm.classificacao} onChange={e=>setCustoForm({...custoForm, classificacao:e.target.value as any})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm">
                    <option value="fixo">Fixo</option>
                    <option value="variavel">Variável</option>
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[#F2CE6B]/70"><tr><th>Descrição</th><th>Categoria</th><th>Classificação</th><th>Valor</th><th></th></tr></thead>
                    <tbody className="text-muted-foreground">
                      {custos.map(c=>(
                        <tr key={c.id} className="border-t border-[#D4A94A]/20"><td>{c.descricao}</td><td>{c.categoria}</td><td>{c.classificacao}</td><td>{brl(Number(c.valor))}</td><td><button onClick={()=>deleteCusto(c.id)} className="text-xs text-red-400">Excluir</button></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">Total fixos: {brl(custos.filter(c=>c.classificacao==="fixo").reduce((a,b)=>a+Number(b.valor),0))} • Total variáveis: {brl(custos.filter(c=>c.classificacao==="variavel").reduce((a,b)=>a+Number(b.valor),0))}</div>
              </div>
            )}

            {aba==="caixa" && (
              <div className="fp-operational fp-frame">
                <div className="font-semibold mb-3">Caixa</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {!caixaAberto ? <button onClick={abrirCaixa} className="px-3 py-1.5 rounded-lg bg-[#D4A94A] text-black text-xs font-semibold">Abrir caixa</button> : <button onClick={fecharCaixa} className="px-3 py-1.5 rounded-lg border border-[#D4A94A]/40 text-xs">Fechar caixa</button>}
                  {caixaAberto && <input placeholder="Valor contado" value={valorContado} onChange={e=>setValorContado(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-40"/>}
                  {caixaAberto && <input placeholder="Sangria" type="number" value={sangriaValor||''} onChange={e=>setSangriaValor(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-32"/>}
                  {caixaAberto && <button onClick={()=>{ if(sangriaValor>0){ setCaixa(p=>[{id:Date.now().toString(),tipo:"saida",descricao:"Sangria",valor:sangriaValor,meio:"Dinheiro",data:dataDemonstracao},...p]); setSangriaValor(0); }}} className="px-2 py-1 rounded border border-[#D4A94A]/30 text-xs">Registrar sangria</button>}
                  {caixaAberto && <input placeholder="Suprimento" type="number" value={suprimentoValor||''} onChange={e=>setSuprimentoValor(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-32"/>}
                  {caixaAberto && <button onClick={()=>{ if(suprimentoValor>0){ setCaixa(p=>[{id:Date.now().toString(),tipo:"entrada",descricao:"Suprimento",valor:suprimentoValor,meio:"Dinheiro",data:dataDemonstracao},...p]); setSuprimentoValor(0); }}} className="px-2 py-1 rounded border border-[#D4A94A]/30 text-xs">Registrar suprimento</button>}
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">Saldo inicial <b className="block">{brl(saldoInicial)}</b></div>
                  <div className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">Entradas <b className="block text-green-400">{brl(saldoCaixaCalc.entrada)}</b></div>
                  <div className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">Saídas <b className="block text-red-400">{brl(saldoCaixaCalc.saida)}</b></div>
                </div>
                <div className="text-sm mb-2">Saldo esperado: <b>{brl(saldoInicial + saldoCaixaCalc.saldo)}</b> {caixaAberto && <span className="ml-4">Valor contado: {brl(valorContado)} • Diferença: {brl(valorContado - (saldoInicial + saldoCaixaCalc.saldo))}</span>}</div>
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[#F2CE6B]/70"><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Meio</th><th>Valor</th></tr></thead>
                    <tbody className="text-muted-foreground">
                      {caixa.map(m=>(
                        <tr key={m.id} className="border-t border-[#D4A94A]/20"><td>{m.data.split("-").reverse().join("/")}</td><td>{m.tipo}</td><td>{m.descricao}</td><td>{m.meio}</td><td className={m.tipo==="entrada"?"text-green-400":"text-red-400"}>{brl(m.valor)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">
                    <div className="font-semibold mb-2">Contas a Pagar</div>
                    <table className="w-full text-xs">
                      <thead className="text-left text-[#F2CE6B]/70"><tr><th>Descrição</th><th>Venc.</th><th>Valor</th><th>Sit.</th><th></th></tr></thead>
                      <tbody className="text-muted-foreground">
                        {contasPagar.map(c=>(
                          <tr key={c.id} className="border-t border-[#D4A94A]/20"><td>{c.descricao}</td><td>{c.vencimento.split("-").reverse().join("/")}</td><td>{brl(c.valor)}</td><td>{c.situacao}</td><td>{c.situacao==="pendente" && <button onClick={()=>registrarPagamento(c.id)} className="text-xs text-green-400">Pagar</button>}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">
                    <div className="font-semibold mb-2">Contas a Receber</div>
                    <table className="w-full text-xs">
                      <thead className="text-left text-[#F2CE6B]/70"><tr><th>Descrição</th><th>Venc.</th><th>Valor</th><th>Sit.</th><th></th></tr></thead>
                      <tbody className="text-muted-foreground">
                        {contasReceber.map(c=>(
                          <tr key={c.id} className="border-t border-[#D4A94A]/20"><td>{c.descricao}</td><td>{c.vencimento.split("-").reverse().join("/")}</td><td>{brl(c.valor)}</td><td>{c.situacao}</td><td>{c.situacao==="pendente" && <button onClick={()=>registrarRecebimento(c.id)} className="text-xs text-green-400">Receber</button>}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {(aba==="equilibrio" || aba==="simulacoes") && (
              <div className="fp-operational fp-frame grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#D4A94A]/30 p-4 bg-[#0b0a08]">
                  <div className="font-bold mb-2">Análise detalhada</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Receita líquida</span><b>{brl(calc.receita)}</b></div>
                    <div className="flex justify-between"><span>Custos variáveis</span><b>{brl(calc.variais)}</b></div>
                    <div className="flex justify-between"><span>Custos fixos</span><b>{brl(calc.fixos)}</b></div>
                    <div className="flex justify-between"><span>Margem de contribuição</span><b>{brl(calc.margem)}</b></div>
                    <div className="flex justify-between"><span>Margem %</span><b>{percentual(calc.perc*100)}</b></div>
                    <div className="flex justify-between"><span>Ponto de equilíbrio</span><b>{isFinite(calc.pe)?brl(calc.pe):"—"}</b></div>
                    <div className="flex justify-between"><span>Margem de segurança</span><b>{peValido ? percentual(calc.margemSeg*100) : "Não calculável"}</b></div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#D4A94A]/30 p-4 bg-[#0b0a08]">
                  <div className="font-bold mb-2">Simulador</div>
                  <label className="text-xs">Receita: {brl(simReceita)}</label>
                  <input type="range" min="10000" max="100000" step="1000" value={simReceita} onChange={e=>setSimReceita(Number(e.target.value))} className="w-full"/>
                  <label className="text-xs mt-2">Custo variável: {percentual(simCustoVar*100)}</label>
                  <input type="range" min="0.2" max="0.8" step="0.01" value={simCustoVar} onChange={e=>setSimCustoVar(Number(e.target.value))} className="w-full"/>
                  <label className="text-xs mt-2">Custo fixo: {brl(simCustoFixo)}</label>
                  <input type="range" min="5000" max="30000" step="500" value={simCustoFixo} onChange={e=>setSimCustoFixo(Number(e.target.value))} className="w-full"/>
                  <button onClick={resetSim} className="mt-3 px-3 py-1.5 rounded-lg border border-[#D4A94A]/40 text-xs">Restaurar</button>
                  <div className="mt-3 text-xs space-y-1">
                    <div>PE simulado: <b>{isFinite(sim.pe)?brl(sim.pe):"—"}</b></div>
                    <div>Margem segurança: <b>{Number.isFinite(sim.pe) ? percentual(sim.margemSeg*100) : "Não calculável"}</b></div>
                    <div>Resultado estimado: <b>{brl(sim.resultado)}</b></div>
                  </div>
                </div>
              </div>
            )}

            {aba==="fiscal" && (
              <div className="fp-operational fp-frame">
                <div className="font-semibold mb-3">SEGURANÇA FISCAL E OBRIGAÇÕES</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <input placeholder="Descrição" value={obrigacaoForm.descricao||""} onChange={e=>setObrigacaoForm({...obrigacaoForm, descricao:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Tipo" value={obrigacaoForm.tipo||""} onChange={e=>setObrigacaoForm({...obrigacaoForm, tipo:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Competência" value={obrigacaoForm.competencia||""} onChange={e=>setObrigacaoForm({...obrigacaoForm, competencia:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input type="date" value={obrigacaoForm.vencimento||""} onChange={e=>setObrigacaoForm({...obrigacaoForm, vencimento:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Valor" value={String(obrigacaoForm.valor||"")} onChange={e=>setObrigacaoForm({...obrigacaoForm, valor:Number(e.target.value)||undefined} as any)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                  <input placeholder="Responsável" value={obrigacaoForm.responsavel||""} onChange={e=>setObrigacaoForm({...obrigacaoForm, responsavel:e.target.value})} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <button onClick={()=>{ if(!obrigacaoForm.descricao) return; setObrigacoes(p=>[{id:Date.now().toString(), descricao:obrigacaoForm.descricao!, tipo:obrigacaoForm.tipo||'Geral', competencia:obrigacaoForm.competencia||'', vencimento:obrigacaoForm.vencimento||new Date().toISOString().slice(0,10), valor:obrigacaoForm.valor, situacao:obrigacaoForm.situacao||'pendente', responsavel:obrigacaoForm.responsavel||''} as Obrigacao,...p]); setObrigacaoForm({situacao:'pendente'}); }} className="px-3 py-1.5 rounded-lg bg-[#D4A94A] text-black text-xs font-semibold mb-4">Adicionar obrigação</button>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[#F2CE6B]/70"><tr><th>Descrição</th><th>Tipo</th><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Responsável</th><th></th></tr></thead>
                    <tbody className="text-muted-foreground">
                      {obrigacoes.map(o=>(
                        <tr key={o.id} className="border-t border-[#D4A94A]/20"><td>{o.descricao}</td><td>{o.tipo}</td><td>{o.competencia}</td><td>{o.vencimento}</td><td>{o.valor?brl(o.valor):'—'}</td><td>{o.situacao}</td><td>{o.responsavel}</td><td><button onClick={()=>setObrigacoes(p=>p.filter(x=>x.id!==o.id))} className="text-xs text-red-400">Remover</button></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground mt-3">Dados demonstrativos. Não presume regime tributário. Não declara regularidade fiscal.</div>
              </div>
            )}

            {aba==="relatorios" && (
              <Panel title="Resumo Financeiro Demonstrativo" icon={ChartNoAxesCombined}>
                <dl className="fp-metric-list"><div><dt>Receitas</dt><dd>{brl(calc.receita)}</dd></div><div><dt>Custos e despesas</dt><dd>{brl(calc.variais+calc.fixos)}</dd></div><div><dt>Resultado</dt><dd>{brl(calc.resultado)}</dd></div><div><dt>Saldo de caixa</dt><dd>{brl(dadosBase.saldoCaixa)}</dd></div></dl>
                <p className="fp-demo-note">Sem exportação contábil ou fiscal. Valores de demonstração, sem acesso ao banco.</p>
              </Panel>
            )}
          </div>
          <Analises calc={calc} riscos={riscos} obrigacoes={obrigacoes} saldo={dadosBase.saldoCaixa} navegar={navegar} />
    </FinanceiroPreviewLayout>
  );
}
