import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Target, Shield, Wallet, AlertTriangle, CheckCircle2, Plus, Search, ShoppingCart, FileText } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/preview/financeiro-premium")({
  head: () => ({ meta: [{ title: "Financeiro Premium — Néia Salgados" }] }),
  component: FinanceiroPremium,
});

type Lancamento = { id: string; data: string; descricao: string; categoria: string; tipo: "receita" | "despesa"; valor: number; status: string };
type Custo = { id: string; descricao: string; categoria: string; classificacao: "fixo"|"variavel"; valor: number; data: string; recorrencia?: string };
type Conta = { id: string; descricao: string; fornecedor: string; cliente: string; valor: number; vencimento: string; situacao: "pendente"|"pago"|"vencido"; categoria: string };
type CaixaMov = { id: string; tipo: "entrada"|"saida"; descricao: string; valor: number; meio: string; data: string };
type Obrigacao = { id: string; descricao: string; tipo: string; competencia: string; vencimento: string; valor?: number; situacao: "pendente"|"paga"|"vencida"; responsavel: string; observacoes?: string };

function brl(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function FinanceiroPremium() {
  const [periodo, setPeriodo] = useState("Abril/2025");
  const [aba, setAba] = useState<"lancamentos"|"custos"|"caixa"|"equilibrio"|"fiscal"|"relatorios">("lancamentos");
  const [showForm, setShowForm] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [simCustoFixo, setSimCustoFixo] = useState(12000);
  const [simCustoVar, setSimCustoVar] = useState(0.45);
  const [simReceita, setSimReceita] = useState(30000);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([
    { id:"1", data:"13/04/2025", descricao:"Venda PDV", categoria:"Vendas", tipo:"receita", valor:1480, status:"Conciliado"},
    { id:"2", data:"13/04/2025", descricao:"Compra Insumos", categoria:"Insumos", tipo:"despesa", valor:520, status:"Pago"},
    { id:"3", data:"12/04/2025", descricao:"Aluguel", categoria:"Fixos", tipo:"despesa", valor:3500, status:"Pago"},
    { id:"4", data:"12/04/2025", descricao:"Entrega", categoria:"Logística", tipo:"despesa", valor:210, status:"Pendente"},
  ]);
  const [form, setForm] = useState({ descricao:"", categoria:"", tipo:"receita" as "receita"|"despesa", valor:"", data:"", status:"Pendente" });
  const [custos, setCustos] = useState<Custo[]>([
    { id:"c1", descricao:"Aluguel", categoria:"Fixos", classificacao:"fixo", valor:3500, data:"2025-04-01" },
    { id:"c2", descricao:"Insumos", categoria:"Produção", classificacao:"variavel", valor:28400, data:"2025-04-01" },
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
  const [saldoInicial, setSaldoInicial] = useState(0);
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
    const custosVar = custos.filter(c=>c.classificacao==="variavel").reduce((a,b)=>a+Number(b.valor),0);
    const custosFix = custos.filter(c=>c.classificacao==="fixo").reduce((a,b)=>a+Number(b.valor),0);
    const entrada = caixa.filter(m=>m.tipo==="entrada").reduce((a,b)=>a+b.valor,0);
    const saida = caixa.filter(m=>m.tipo==="saida").reduce((a,b)=>a+b.valor,0);
    const saldoCaixa = saldoInicial + entrada - saida;
    return { receitaLiquida: receita || 72450, custosVariaveis: custosVar || 28400, custosFixos: custosFix || 18000, saldoCaixa: saldoCaixa || 18750 };
  }, [lancamentos, custos, saldoInicial, caixa]);

  const saldoCaixaCalc = useMemo(()=>{
    const entrada = caixa.filter(m=>m.tipo==="entrada").reduce((a,b)=>a+b.valor,0);
    const saida = caixa.filter(m=>m.tipo==="saida").reduce((a,b)=>a+b.valor,0);
    return { entrada, saida, saldo: entrada - saida };
  }, [caixa]);

  const calc = useMemo(() => {
    const receita = dadosBase.receitaLiquida;
    const variais = dadosBase.custosVariaveis;
    const fixos = dadosBase.custosFixos;
    const margem = receita - variais;
    const perc = receita > 0 ? margem / receita : 0;
    const pe = perc > 0 ? fixos / perc : Infinity;
    const margemSeg = receita > 0 && isFinite(pe) ? (receita - pe) / receita : 0;
    const resultado = receita - variais - fixos;
    return { receita, variais, fixos, margem, perc, pe, margemSeg, resultado };
  }, [dadosBase]);

  const sim = useMemo(() => {
    const receita = simReceita;
    const variais = receita * simCustoVar;
    const fixos = simCustoFixo;
    const margem = receita - variais;
    const perc = receita > 0 ? margem / receita : 0;
    const pe = perc > 0 ? fixos / perc : Infinity;
    const margemSeg = receita > 0 && isFinite(pe) ? (receita - pe) / receita : 0;
    const resultado = margem - fixos;
    return { receita, variais, fixos, margem, perc, pe, margemSeg, resultado };
  }, [simReceita, simCustoVar, simCustoFixo]);

  const chartEvolucao = useMemo(() => {
    const baseReceita = calc.receita / 6 || 12000;
    const baseCusto = calc.variais / 6 || 4000;
    const baseDesp = calc.fixos / 6 || 3000;
    return Array.from({ length: 6 }).map((_, i) => {
      const m = 1 + i;
      const fator = 0.9 + i * 0.04;
      return { mes: ['Nov','Dez','Jan','Fev','Mar','Abr'][m], receita: Math.round(baseReceita * fator * (0.9+Math.random()*0.2)), custos: Math.round(baseCusto * fator), despesas: Math.round(baseDesp * fator) };
    });
  }, [calc.receita, calc.variais, calc.fixos]);

  const chartDistribuicao = useMemo(() => {
    const cats = custos.reduce((acc, c) => { acc[c.categoria] = (acc[c.categoria]||0) + Number(c.valor); return acc; }, {} as Record<string, number>);
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [custos]);

  const chartFluxo = useMemo(() => {
    return caixa.reduce((acc, m, i) => {
      const key = m.data.slice(5,7);
      const entry = acc.find(x => x.mes === key) || { mes: key, entrada: 0, saida: 0 };
      if (m.tipo === 'entrada') entry.entrada += m.valor; else entry.saida += m.valor;
      if (!acc.includes(entry)) acc.push(entry);
      return acc;
    }, [] as {mes:string, entrada:number, saida:number}[]);
  }, [caixa]);

  const hoje = new Date();
  const riscos = useMemo(() => {
    const list: { nome:string; gravidade:'verde'|'âmbar'|'vermelho'|'cinza'; valor:number; explicacao:string; fonte:string; acao:string }[] = [];
    if (dadosBase.saldoCaixa < 5000) list.push({ nome:'Caixa projetado insuficiente', gravidade:'vermelho', valor:dadosBase.saldoCaixa, explicacao:'Saldo abaixo do limite operacional.', fonte:'Saldo de caixa', acao:'Revisar recebimentos e postergar despesas não essenciais.' });
    const vencidasPagar = contasPagar.filter(c=>c.situacao==='pendente' && new Date(c.vencimento) < hoje);
    if (vencidasPagar.length) list.push({ nome:'Contas a pagar vencidas', gravidade:'vermelho', valor:vencidasPagar.reduce((a,b)=>a+b.valor,0), explicacao:`${vencidasPagar.length} contas vencidas.`, fonte:'Contas a pagar', acao:'Priorizar liquidação e negociar prazos.' });
    const vencidasReceber = contasReceber.filter(c=>c.situacao==='pendente' && new Date(c.vencimento) < hoje);
    if (vencidasReceber.length) list.push({ nome:'Recebimentos atrasados', gravidade:'âmbar', valor:vencidasReceber.reduce((a,b)=>a+b.valor,0), explicacao:`${vencidasReceber.length} recebíveis em atraso.`, fonte:'Contas a receber', acao:'Acionar cobrança e revisar condições.' });
    if (calc.perc < 0.2) list.push({ nome:'Margem de contribuição baixa', gravidade:'âmbar', valor:calc.perc*100, explicacao:'Margem abaixo de 20%.', fonte:'Ponto de equilíbrio', acao:'Revisar preço de venda e custos variáveis.' });
    if (calc.receita < calc.pe) list.push({ nome:'Faturamento abaixo do ponto de equilíbrio', gravidade:'vermelho', valor:calc.receita, explicacao:'Receita não cobre custos fixos + variáveis.', fonte:'Indicadores', acao:'Acelerar vendas e reduzir custos fixos.' });
    if (calc.margemSeg < 0.1) list.push({ nome:'Margem de segurança reduzida', gravidade:'âmbar', valor:calc.margemSeg*100, explicacao:'Pouca folga sobre o ponto de equilíbrio.', fonte:'Indicadores', acao:'Plano de crescimento de receita.' });
    if (caixaAberto && Math.abs(valorContado - (saldoInicial + saldoCaixaCalc.saldo)) > 50) list.push({ nome:'Diferença no fechamento de caixa', gravidade:'âmbar', valor:Math.abs(valorContado - (saldoInicial + saldoCaixaCalc.saldo)), explicacao:'Divergência entre esperado e contado.', fonte:'Caixa', acao:'Conferir lançamentos e identificar extravio.' });
    const variavelRatio = calc.receita>0? calc.variais/calc.receita : 1;
    if (variavelRatio > 0.6) list.push({ nome:'Custos variáveis elevados', gravidade:'âmbar', valor:variavelRatio*100, explicacao:'Custos variáveis consomem >60% da receita.', fonte:'Custos', acao:'Negociar insumos e otimizar produção.' });
    if (!list.length) list.push({ nome:'Situação controlada', gravidade:'verde', valor:0, explicacao:'Indicadores dentro dos parâmetros.', fonte:'Geral', acao:'Manter monitoramento.' });
    return list;
  }, [dadosBase.saldoCaixa, contasPagar, contasReceber, calc, caixaAberto, valorContado, saldoInicial, saldoCaixaCalc]);

  const peValido = isFinite(calc.pe) && calc.pe > 0;
  const abaixoDoPe = peValido && calc.receita < calc.pe;
  const resultadoNegativo = calc.resultado < 0;

  const indicadores = [
    { label: "Faturamento líquido", valor: brl(calc.receita), var: "+12,6%", up: true, icon: <TrendingUp className="size-5 text-[#F2CE6B]"/> },
    { label: "Custos e despesas", valor: brl(calc.variais + calc.fixos), var: "+8,9%", up: false, icon: <FileText className="size-5 text-[#F2CE6B]"/> },
    { label: "Resultado estimado", valor: brl(calc.resultado), var: resultadoNegativo ? "Prejuízo" : "Lucro", up: !resultadoNegativo, icon: <DollarSign className="size-5 text-[#F2CE6B]"/> },
    { label: "Saldo de caixa", valor: brl(dadosBase.saldoCaixa), sub: "Disponível", icon: <Wallet className="size-5 text-[#F2CE6B]"/> },
    { label: "Ponto de equilíbrio", valor: peValido ? brl(calc.pe) : "Não calculável", sub: peValido ? "mês" : "margem insuficiente", icon: <Target className="size-5 text-[#F2CE6B]"/> },
    { label: "Margem de segurança", valor: `${(calc.margemSeg*100).toFixed(1)}%`, sub: !peValido ? "Não calculável" : (abaixoDoPe ? "Abaixo do ponto" : (calc.margemSeg>0.2?"Acima do ideal":"Atenção")), icon: <Shield className="size-5 text-[#F2CE6B]"/> },
  ];

  const filtrados = lancamentos.filter(l => l.descricao.toLowerCase().includes(filtro.toLowerCase()));

  const resetSim = () => { setSimCustoFixo(12000); setSimCustoVar(0.45); setSimReceita(30000); };

  const handleAddLancamento = () => {
    if (!form.descricao || !form.valor || Number(form.valor) <= 0) return;
    const novo: Lancamento = {
      id: Date.now().toString(),
      data: form.data || new Date().toISOString().slice(0,10).split("-").reverse().join("/"),
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
    if (!custoForm.descricao || !custoForm.valor) return;
    const novo: Custo = { id: Date.now().toString(), descricao: custoForm.descricao!, categoria: custoForm.categoria || "Geral", classificacao: custoForm.classificacao || "fixo", valor: Number(custoForm.valor), data: custoForm.data || new Date().toISOString().slice(0,10) };
    setCustos(prev => [novo, ...prev]);
    setCustoForm({ classificacao:"fixo" });
  };
  const deleteCusto = (id:string)=> setCustos(prev=>prev.filter(c=>c.id!==id));

  const addConta = (setFn: any, conta: Partial<Conta>) => {
    if (!conta.descricao || !conta.valor) return;
    const novo: Conta = { id: Date.now().toString(), descricao: conta.descricao!, valor: Number(conta.valor), vencimento: conta.vencimento || new Date().toISOString().slice(0,10), situacao: conta.situacao || "pendente", categoria: conta.categoria || "Geral", fornecedor: conta.fornecedor || "", cliente: conta.cliente || "" };
    setFn((prev: Conta[])=> [novo, ...prev]);
  };
  const toggleConta = (list:any, setFn:any, id:string, situacao:"pendente"|"pago"|"vencido") => setFn((prev: Conta[])=>prev.map(c=>c.id===id?{...c,situacao}:c));

  const registrarPagamento = (id:string) => {
    setContasPagar(prev=>prev.map(c=>c.id===id?{...c,situacao:"pago"}:c));
    setCaixa(prev=>[{ id:Date.now().toString(), tipo:"saida", descricao:"Pagamento conta", valor:0, meio:"Pix", data:new Date().toISOString().slice(0,10) },...prev]);
  };
  const registrarRecebimento = (id:string) => {
    setContasReceber(prev=>prev.map(c=>c.id===id?{...c,situacao:"pago"}:c));
    setCaixa(prev=>[{ id:Date.now().toString(), tipo:"entrada", descricao:"Recebimento conta", valor:0, meio:"Pix", data:new Date().toISOString().slice(0,10) },...prev]);
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

  return (
    <AdminShell aba="financeiro" onAba={() => {}} onRefresh={() => {}} usuario="preview@neia.local" modoPreview>
      <div className="min-h-screen p-3 sm:p-4">
        <div className="mx-auto max-w-[1600px]">
          <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA — Financeiro Premium. Dados demonstrativos locais, sem gravação.
          </p>
          <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h1 className="font-display text-2xl font-extrabold text-[#F2CE6B]">FINANCEIRO — VISÃO GERAL</h1>
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded border border-[#D4A94A]/40 text-[10px] text-[#F2CE6B]/80">PRÉVIA</span>
              <div className="text-xs border border-[#D4A94A]/40 rounded-full px-4 py-2 bg-[#141310]">Período: {periodo} • Dados demonstrativos</div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
            {indicadores.map((i, k) => (
              <div key={k} className="rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-b from-[#14130F] to-[#0F0E0C] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded bg-[#1A1712] border border-[#D4A94A]/30">{i.icon}</div>
                  <div className="text-xs uppercase tracking-wide text-[#F2CE6B]/70">{i.label}</div>
                </div>
                <div className="text-xl font-extrabold mt-1">{i.valor}</div>
                {i.var && <div className={`text-xs mt-1.5 ${i.up ? "text-green-400" : "text-red-400"}`}>{i.var}</div>}
                {i.sub && <div className="text-[11px] text-muted-foreground mt-1">{i.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
              <div className="font-bold mb-2">EVOLUÇÃO: RECEITAS x DESPESAS x PONTO DE EQUILÍBRIO</div>
              <div className="h-[240px] rounded-xl bg-[#0b0a08] border border-[#D4A94A]/20">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartEvolucao}>
                    <CartesianGrid stroke="#D4A94A22" />
                    <XAxis dataKey="mes" stroke="#F2CE6B" />
                    <YAxis stroke="#F2CE6B" />
                    <Tooltip contentStyle={{ background:'#0b0a08', border:'1px solid #D4A94A' }} />
                    <Legend />
                    <Line type="monotone" dataKey="receita" stroke="#22c55e" strokeWidth={2} />
                    <Line type="monotone" dataKey="custos" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="despesas" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
              <div className="font-bold mb-2">PONTO DE EQUILÍBRIO (RESUMO)</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Mensal:</span><b>{peValido ? brl(calc.pe) : "Não calculável"}</b></div>
                <div className="flex justify-between"><span>Diário (média):</span><b>{peValido ? brl(calc.pe/30) : "—"}</b></div>
                <div className="flex justify-between"><span>Faturamento no mês:</span><b>{brl(calc.receita)}</b></div>
                <div className="flex justify-between"><span>Situação:</span><span className={!peValido ? "text-muted-foreground" : (abaixoDoPe ? "text-red-400" : "text-green-400")}>{!peValido ? "Sem dados suficientes" : (abaixoDoPe ? "Abaixo do ponto" : "Acima do ponto")}</span></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
            <div className="rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
              <div className="font-bold mb-2">DESPESAS POR CATEGORIA</div>
              <div className="h-[220px] rounded-xl bg-[#0b0a08] border border-[#D4A94A]/20">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartDistribuicao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {chartDistribuicao.map((entry, idx) => (
                        <Cell key={idx} fill={['#D4A94A','#F2CE6B','#22c55e','#ef4444','#3b82f6'][idx%5]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background:'#0b0a08', border:'1px solid #D4A94A' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold mb-2">SAÚDE FINANCEIRA</div>
                <div className="text-[10px] uppercase tracking-wider text-[#F2CE6B]/60">Situação geral</div>
              </div>
              <div className={`text-2xl font-extrabold ${resultadoNegativo ? "text-red-400" : "text-green-400"}`}>
                {resultadoNegativo ? "Prejuízo" : "Saudável"}
              </div>
              <div className="mt-3 h-2 rounded bg-gradient-to-r from-red-800 via-yellow-800 to-green-800"></div>
              <div className="text-[11px] text-muted-foreground mt-2">
                {resultadoNegativo ? "Resultado contábil negativo. Verifique fluxo de caixa separadamente." : "Resultado dentro do esperado."}
              </div>
            </div>
            <div className="rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold mb-2">PRÓXIMOS COMPROMISSOS</div>
                <div className="text-[10px] uppercase tracking-wider text-[#F2CE6B]/60">Vencimentos</div>
              </div>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li className="flex justify-between"><span>25/04 — Verificar DAS / PGDAS-D</span><span className="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300">Atenção</span></li>
                <li className="flex justify-between"><span>26/04 — Conferir NFC-e</span><span className="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300">Atenção</span></li>
                <li className="flex justify-between"><span>30/04 — Acerto motoboys</span><span className="text-xs px-2 py-0.5 rounded bg-yellow-900/40 text-yellow-300">Pendente</span></li>
                <li className="flex justify-between"><span>05/05 — Pagamento aluguel</span><span className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-300">Programado</span></li>
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
            <div className="font-bold mb-3">LANÇAMENTOS E CADASTROS — ADICIONAR INFORMAÇÕES</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-2 mb-4">
              <button onClick={()=>setShowForm(true)} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <Plus className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Nova Receita</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Entrada</span>
              </button>
              <button onClick={()=>setShowForm(true)} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <DollarSign className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Nova Despesa</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Saída</span>
              </button>
              <button onClick={()=>setAba("custos")} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <TrendingDown className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Contas a Pagar</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Pendentes</span>
              </button>
              <button onClick={()=>setAba("caixa")} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <Wallet className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Contas a Receber</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Recebíveis</span>
              </button>
              <button onClick={()=>setAba("custos")} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <Target className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Cadastrar Custos</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Fixos e Variáveis</span>
              </button>
              <button onClick={()=>setAba("fiscal")} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <Shield className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Obrigações Fiscais</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Impostos e Taxas</span>
              </button>
              <button onClick={()=>setShowForm(true)} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <ShoppingCart className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Lançar Compra</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Insumos / Estoque</span>
              </button>
              <button onClick={abrirCaixa} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <CheckCircle2 className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Conferir Caixa</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Abertura / Fechamento</span>
              </button>
              <button onClick={()=>setAba("equilibrio")} className="rounded-xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-3 flex flex-col items-center gap-1.5 hover:bg-[#D4A94A]/10 transition">
                <Target className="size-5 text-[#F2CE6B]"/>
                <span className="text-xs font-semibold text-[#F2CE6B]">Simulador</span>
                <span className="text-[10px] text-[#F2CE6B]/60">Preços e Cenários</span>
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
            <div className="font-bold mb-3">CENTRAL DE RISCOS E SEGURANÇA FINANCEIRA</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {riscos
                .slice()
                .sort((a, b) => {
                  const ordem = { vermelho: 0, âmbar: 1, verde: 2, cinza: 3 };
                  return (ordem[a.gravidade] ?? 99) - (ordem[b.gravidade] ?? 99);
                })
                .map((r, i) => (
                  <div key={i} className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-sm">{r.nome}</div>
                      <span className={`text-xs px-2 py-0.5 rounded ${r.gravidade==='vermelho'?'bg-red-900/50 text-red-300 border border-red-500/30': r.gravidade==='âmbar'?'bg-yellow-900/50 text-yellow-300 border border-yellow-500/30': r.gravidade==='verde'?'bg-green-900/50 text-green-300 border border-green-500/30':'bg-gray-700 text-gray-300 border border-gray-600/30'}`}>{r.gravidade}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{r.explicacao}</div>
                    <div className="text-xs mt-1 flex items-center gap-1">
                      <span className="text-[#F2CE6B]/60">Valor:</span>
                      <b>{typeof r.valor==='number' && r.valor>1000 ? brl(r.valor) : r.valor}</b>
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-1">
                      <span className="text-[#F2CE6B]/60">Fonte:</span>
                      <span>{r.fonte}</span>
                    </div>
                    <div className="text-xs mt-2 text-[#F2CE6B]/80 flex items-center gap-1">
                      <span className="text-[#F2CE6B]/60">Ação:</span>
                      <span>{r.acao}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
            <div className="font-bold mb-3">RECOMENDAÇÕES PARA A EMPRESA</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {(() => {
                const recs: string[] = [];
                if (!peValido) recs.push('Ponto de equilíbrio não calculável. Insira custos fixos e variáveis para habilitar a análise.');
                else if (calc.margemSeg < 0.15) recs.push(`Faltam ${brl(Math.max(0, calc.pe - calc.receita))} para atingir ponto de equilíbrio. Considere campanhas de vendas.`);
                if (contasPagar.filter(c=>c.situacao==='pendente' && new Date(c.vencimento).getTime() - Date.now() < 7*86400000).length) recs.push('Há contas a pagar vencendo em até 7 dias. Planeje liquidação.');
                if (calc.perc < 0.25) recs.push(`Margem de contribuição ${(calc.perc*100).toFixed(1)}% abaixo de 25%. Revise preços ou negocie insumos.`);
                if (dadosBase.saldoCaixa < 10000) recs.push('Saldo de caixa reduzido. Priorize recebimentos e evite despesas discricionárias.');
                if (!recs.length) recs.push('Indicadores estáveis. Continue monitoramento mensal.');
                return recs.map((r,i)=> <div key={i} className="rounded-xl border border-[#D4A94A]/30 p-3 bg-[#0b0a08] text-xs text-muted-foreground">{r}</div>);
              })()}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="font-bold">GESTÃO FINANCEIRA</div>
              <div className="flex flex-wrap gap-2">
                {[
                  {k:"lancamentos",l:"Lançamentos"},
                  {k:"custos",l:"Custos"},
                  {k:"caixa",l:"Caixa"},
                  {k:"equilibrio",l:"Ponto de Equilíbrio"},
                  {k:"fiscal",l:"Fiscal"},
                  {k:"relatorios",l:"Relatórios"},
                ].map(item=>(
                  <button key={item.k} onClick={()=>setAba(item.k as any)} className={`px-3 py-1.5 rounded-full border text-xs transition ${aba===item.k?"bg-[#D4A94A] text-black border-[#D4A94A]":"border-[#D4A94A]/40 hover:border-[#D4A94A]/70"}`}>{item.l}</button>
                ))}
              </div>
            </div>

            {aba==="lancamentos" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"/>
                      <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar descrição..." className="pl-7 pr-3 py-2 rounded-lg bg-[#0b0a08] border border-[#D4A94A]/30 text-sm w-64"/>
                    </div>
                    <button onClick={()=>setShowForm(true)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#D4A94A] text-black text-sm font-semibold"><Plus className="h-4 w-4"/>Novo</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-[#F2CE6B]/70 bg-[#1A1712]">
                      <tr className="border-b border-[#D4A94A]/20">
                        <th className="px-2 py-2">Data</th>
                        <th className="px-2 py-2">Descrição</th>
                        <th className="px-2 py-2">Categoria</th>
                        <th className="px-2 py-2">Tipo</th>
                        <th className="px-2 py-2 text-right">Valor</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      {filtrados.map(l=>(
                        <tr key={l.id} className="border-t border-[#D4A94A]/20 hover:bg-[#1A1712]/30 transition">
                          <td className="px-2 py-2 text-xs">{l.data}</td>
                          <td className="px-2 py-2 text-xs">{l.descricao}</td>
                          <td className="px-2 py-2 text-xs">{l.categoria}</td>
                          <td className="px-2 py-2 text-xs">{l.tipo}</td>
                          <td className="px-2 py-2 text-xs text-right font-mono">{brl(l.valor)}</td>
                          <td className="px-2 py-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded ${l.status==='Conciliado'||l.status==='pago'?'bg-green-900/30 text-green-300 border border-green-500/30': l.status==='Pendente'?'bg-yellow-900/30 text-yellow-300 border border-yellow-500/30':'bg-gray-700 text-gray-300 border border-gray-600/30'}`}>{l.status}</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            {(l.status!=='Conciliado' && l.status!=='pago') ? (
                              <button onClick={()=>handleDelete(l.id)} className="text-xs text-red-400 hover:text-red-300">Excluir</button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {aba==="custos" && (
              <div>
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
              <div>
                <div className="font-semibold mb-3">Caixa</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {!caixaAberto ? <button onClick={abrirCaixa} className="px-3 py-1.5 rounded-lg bg-[#D4A94A] text-black text-xs font-semibold">Abrir caixa</button> : <button onClick={fecharCaixa} className="px-3 py-1.5 rounded-lg border border-[#D4A94A]/40 text-xs">Fechar caixa</button>}
                  {caixaAberto && <input placeholder="Valor contado" value={valorContado} onChange={e=>setValorContado(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-40"/>}
                  {caixaAberto && <input placeholder="Sangria" type="number" value={sangriaValor||''} onChange={e=>setSangriaValor(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-32"/>}
                  {caixaAberto && <button onClick={()=>{ if(sangriaValor>0){ setCaixa(p=>[{id:Date.now().toString(),tipo:"saida",descricao:"Sangria",valor:sangriaValor,meio:"Dinheiro",data:new Date().toISOString().slice(0,10)},...p]); setSangriaValor(0); }}} className="px-2 py-1 rounded border border-[#D4A94A]/30 text-xs">Registrar sangria</button>}
                  {caixaAberto && <input placeholder="Suprimento" type="number" value={suprimentoValor||''} onChange={e=>setSuprimentoValor(Number(e.target.value)||0)} className="bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-2 py-1 text-xs w-32"/>}
                  {caixaAberto && <button onClick={()=>{ if(suprimentoValor>0){ setCaixa(p=>[{id:Date.now().toString(),tipo:"entrada",descricao:"Suprimento",valor:suprimentoValor,meio:"Dinheiro",data:new Date().toISOString().slice(0,10)},...p]); setSuprimentoValor(0); }}} className="px-2 py-1 rounded border border-[#D4A94A]/30 text-xs">Registrar suprimento</button>}
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
                        <tr key={m.id} className="border-t border-[#D4A94A]/20"><td>{m.data}</td><td>{m.tipo}</td><td>{m.descricao}</td><td>{m.meio}</td><td className={m.tipo==="entrada"?"text-green-400":"text-red-400"}>{brl(m.valor)}</td></tr>
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
                          <tr key={c.id} className="border-t border-[#D4A94A]/20"><td>{c.descricao}</td><td>{c.vencimento}</td><td>{brl(c.valor)}</td><td>{c.situacao}</td><td>{c.situacao==="pendente" && <button onClick={()=>{setContasPagar(p=>p.map(x=>x.id===c.id?{...x,situacao:"pago"}:x)); setCaixa(p=>[{id:Date.now().toString(),tipo:"saida",descricao:`Pg ${c.descricao}`,valor:c.valor,meio:"Pix",data:new Date().toISOString().slice(0,10)},...p]);}} className="text-xs text-green-400">Pagar</button>}</td></tr>
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
                          <tr key={c.id} className="border-t border-[#D4A94A]/20"><td>{c.descricao}</td><td>{c.vencimento}</td><td>{brl(c.valor)}</td><td>{c.situacao}</td><td>{c.situacao==="pendente" && <button onClick={()=>{setContasReceber(p=>p.map(x=>x.id===c.id?{...x,situacao:"pago"}:x)); setCaixa(p=>[{id:Date.now().toString(),tipo:"entrada",descricao:`Rc ${c.descricao}`,valor:c.valor,meio:"Pix",data:new Date().toISOString().slice(0,10)},...p]);}} className="text-xs text-green-400">Receber</button>}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {aba==="equilibrio" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#D4A94A]/30 p-4 bg-[#0b0a08]">
                  <div className="font-bold mb-2">Análise detalhada</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Receita líquida</span><b>{brl(calc.receita)}</b></div>
                    <div className="flex justify-between"><span>Custos variáveis</span><b>{brl(calc.variais)}</b></div>
                    <div className="flex justify-between"><span>Custos fixos</span><b>{brl(calc.fixos)}</b></div>
                    <div className="flex justify-between"><span>Margem de contribuição</span><b>{brl(calc.margem)}</b></div>
                    <div className="flex justify-between"><span>Margem %</span><b>{(calc.perc*100).toFixed(1)}%</b></div>
                    <div className="flex justify-between"><span>Ponto de equilíbrio</span><b>{isFinite(calc.pe)?brl(calc.pe):"—"}</b></div>
                    <div className="flex justify-between"><span>Margem de segurança</span><b>{(calc.margemSeg*100).toFixed(1)}%</b></div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#D4A94A]/30 p-4 bg-[#0b0a08]">
                  <div className="font-bold mb-2">Simulador</div>
                  <label className="text-xs">Receita: R$ {simReceita}</label>
                  <input type="range" min="10000" max="100000" step="1000" value={simReceita} onChange={e=>setSimReceita(Number(e.target.value))} className="w-full"/>
                  <label className="text-xs mt-2">Custo variável %: {(simCustoVar*100).toFixed(0)}%</label>
                  <input type="range" min="0.2" max="0.8" step="0.01" value={simCustoVar} onChange={e=>setSimCustoVar(Number(e.target.value))} className="w-full"/>
                  <label className="text-xs mt-2">Custo fixo: R$ {simCustoFixo}</label>
                  <input type="range" min="5000" max="30000" step="500" value={simCustoFixo} onChange={e=>setSimCustoFixo(Number(e.target.value))} className="w-full"/>
                  <button onClick={resetSim} className="mt-3 px-3 py-1.5 rounded-lg border border-[#D4A94A]/40 text-xs">Restaurar</button>
                  <div className="mt-3 text-xs space-y-1">
                    <div>PE simulado: <b>{isFinite(sim.pe)?brl(sim.pe):"—"}</b></div>
                    <div>Margem segurança: <b>{(sim.margemSeg*100).toFixed(1)}%</b></div>
                    <div>Resultado estimado: <b>{brl(sim.resultado)}</b></div>
                  </div>
                </div>
              </div>
            )}

            {aba==="fiscal" && (
              <div>
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
              <div className="text-sm text-muted-foreground">Relatórios e simulador de cenários demonstrativos.</div>
            )}
          </div>
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#D4A94A]/50 bg-[#0F0E0C] p-5">
            <div className="font-bold mb-3">Novo lançamento</div>
            <div className="space-y-3 text-sm">
              <input placeholder="Descrição" value={form.descricao} onChange={e=>setForm({...form, descricao:e.target.value})} className="w-full bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2"/>
              <input placeholder="Categoria" value={form.categoria} onChange={e=>setForm({...form, categoria:e.target.value})} className="w-full bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2"/>
              <div className="flex gap-2">
                <select value={form.tipo} onChange={e=>setForm({...form, tipo:e.target.value as any})} className="flex-1 bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2">
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
                <input placeholder="Valor" value={form.valor} onChange={e=>setForm({...form, valor:e.target.value})} className="w-32 bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2"/>
              </div>
              <input type="date" value={form.data} onChange={e=>setForm({...form, data:e.target.value})} className="w-full bg-[#0b0a08] border border-[#D4A94A]/30 rounded-lg px-3 py-2"/>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setShowForm(false)} className="px-3 py-2 rounded-lg border border-[#D4A94A]/40 text-xs">Cancelar</button>
                <button onClick={handleAddLancamento} className="px-3 py-2 rounded-lg bg-[#D4A94A] text-black text-xs font-semibold">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
