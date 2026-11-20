/**
 * Fixtures demonstrativas dos painéis de Contador, Relatório do Dono e Metas
 * (Lote 03 / Lote 02 visual). Dados fictícios alinhados às referências
 * aprovadas; nenhum valor é gravado ou enviado a nenhum backend.
 */

export type AlertaPremium = {
  icone: "insumos" | "margem" | "oportunidade" | "projeção" | "ritmo" | "nf" | "comprovante" | "fechamento" | "vendas";
  titulo: string;
  texto: string;
  acao?: string;
  cor: string;
};

export type LucroPremium = {
  nome: string;
  preco: number;
  custo: number;
  margem: number;
};

export const DONO_PREMIUM_DEMO = {
  faturamento: 14360.5,
  pagamentos: 13982.0,
  cmv: 6871.2,
  despesas: 2926.1,
  resultado: 4563.2,
  margemPct: 31.8,
  ticket: 33.55,
  qtdPedidos: 428,
  porDia: 13.9,
  vsMesAnterior: 12.7,
  previsao: 15210.0,
  previsaoRitmo: 21,
  lucratividade: {
    top: [
      { nome: "Coxinha de frango", preco: 8.5, custo: 2.1, margem: 75.3 },
      { nome: "Bolinho de queijo", preco: 6.5, custo: 1.8, margem: 72.3 },
      { nome: "Kibe", preco: 7.5, custo: 2.2, margem: 70.7 },
    ] as LucroPremium[],
    piores: [
      { nome: "Esfirra de carne", preco: 7.0, custo: 4.2, margem: 40.0 },
      { nome: "Enroladinho de salsicha", preco: 6.5, custo: 3.6, margem: 44.6 },
      { nome: "Empada de frango", preco: 7.5, custo: 3.9, margem: 48.0 },
    ] as LucroPremium[],
    semFicha: 2,
  },
  bairros: [
    { nome: "Centro", total: 3920.0, pct: 27.3 },
    { nome: "Vila Nova", total: 2860.5, pct: 19.9 },
    { nome: "Jardim América", total: 2310.0, pct: 16.1 },
    { nome: "Outros bairros", total: 5270.0, pct: 36.7 },
  ],
  canais: [
    { nome: "Dinheiro", total: 6412.0, pct: 44.7 },
    { nome: "PIX", total: 5180.5, pct: 36.1 },
    { nome: "Cartão", total: 2768.0, pct: 19.3 },
  ],
  horarios: [
    { rotulo: "Manhã", qtd: 92, pct: 21.5 },
    { rotulo: "Tarde", qtd: 208, pct: 48.6 },
    { rotulo: "Noite", qtd: 128, pct: 29.9 },
  ],
  alertas: [
    {
      icone: "insumos",
      titulo: "Custo de insumos em alta",
      texto: "Farinha de trigo subiu 8,0% no período — revisar preço de venda e margem.",
      acao: "Ver insumos",
      cor: "#F5A623",
    },
    {
      icone: "margem",
      titulo: "Margem abaixo do esperado",
      texto: "Esfirra de carne operou a 40,0% (meta mínima configurada em 50%).",
      acao: "Ver produto",
      cor: "#F16A6A",
    },
    {
      icone: "oportunidade",
      titulo: "Oportunidade de venda",
      texto: "Coxinha de frango com 18,4% acima da média de vendas e margem de 75,3%.",
      acao: "Criar promoção",
      cor: "#35C97C",
    },
  ] as AlertaPremium[],
};

export type MetaAtivaPremium = {
  tipo: string;
  periodo_ref: string;
  valor: number;
  realizado: number;
  pct: number;
  faltante: number;
  proxima: number;
  proximaVsMeta: number;
  ticketVsMeta: { valor: number; base: number; diffPct: number };
  ritmo: { decorridos: number; total: number; pct: number };
  mediaDiariaNecessaria: number;
  diasRestantes: number;
};

export const METAS_PREMIUM_DEMO = {
  ativa: {
    tipo: "Mensal",
    periodo_ref: "2026-01",
    valor: 18000.0,
    realizado: 12640.0,
    pct: 70.2,
    faltante: 5360.0,
    proxima: 19200.0,
    proximaVsMeta: 6.7,
    ticketVsMeta: { valor: 40.5, base: 37.5, diffPct: 8.0 },
    ritmo: { decorridos: 15, total: 31, pct: 48.4 },
    mediaDiariaNecessaria: 172.66,
    diasRestantes: 16,
  } as MetaAtivaPremium,
  metas: [
    { tipo: "Mensal", periodo_ref: "2026-01", valor: 18000.0, realizado: 12640.0, pct: 70.2, status: "no_prazo" },
    { tipo: "Mensal", periodo_ref: "2025-12", valor: 16000.0, realizado: 13200.0, pct: 82.5, status: "atencao" },
    { tipo: "Mensal", periodo_ref: "2025-11", valor: 15000.0, realizado: 16800.0, pct: 112.0, status: "superada" },
  ],
  historico: [
    { data: "15/01/2026", texto: "Meta revisada de R$ 16.000,00 para R$ 18.000,00 · Mensal · 2026-01", tipo: "Mensal", periodo: "2026-01" },
    { data: "02/01/2026", texto: "Meta criada · Mensal · 2026-01 com valor inicial de R$ 16.000,00", tipo: "Mensal", periodo: "2026-01" },
  ],
  alertas: [
    {
      icone: "projeção",
      titulo: "Projeção acima da meta",
      texto: `Projeção para o período de R$ 19.200,00 supera a meta em +6,7%.`,
      cor: "#35C97C",
    },
    {
      icone: "ritmo",
      titulo: "Faltam dias para o encerramento",
      texto: "Faltam 16 dias para o encerramento do período com R$ 5.360,00 em aberto.",
      cor: "#F5A623",
    },
  ] as AlertaPremium[],
  chart: {
    dias: [
      { dia: "01", vendido: 382.0 },
      { dia: "03", vendido: 410.0 },
      { dia: "05", vendido: 355.0 },
      { dia: "08", vendido: 442.0 },
      { dia: "10", vendido: 468.0 },
      { dia: "12", vendido: 395.0 },
      { dia: "15", vendido: 512.0 },
      { dia: "18", vendido: 468.0 },
      { dia: "21", vendido: 402.0 },
      { dia: "24", vendido: 355.0 },
      { dia: "27", vendido: 320.0 },
      { dia: "30", vendido: 285.0 },
    ],
    meta: 18000.0,
    proxima: 19200.0,
  },
};

export type DocFiscalPremium = {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  valor: number;
  status: "AUTORIZADO" | "PENDENTE" | "REJEITADO" | "CANCELADO";
};

export const CONTADOR_PREMIUM_DEMO = {
  kpis: [
    { rotulo: "Fechamento do período", valor: "Aberto", detalhe: "2026-11 · fechamento em aberto", icone: "calendar", cor: "#D4A94A" },
    { rotulo: "Documentos fiscais", valor: "12", detalhe: "4 autorizados · 1 pendente", icone: "file", cor: "#D4A94A" },
    { rotulo: "Pendências documentais", valor: "3", detalhe: "para o fechamento", icone: "alerta", cor: "#F5A623" },
    { rotulo: "Resultado (DRE)", valor: "R$ 140,50", detalhe: "margem de 100,0%", icone: "calc", cor: "#35C97C" },
    { rotulo: "Contas sem comprovante", valor: "2", detalhe: "água e contas sem anexo", icone: "shield", cor: "#F16A6A" },
    { rotulo: "Exportações prontas", valor: "3", detalhe: "relatórios prontos para envio", icone: "download", cor: "#5B93F5" },
  ],
  fechamento: {
    status: "Aberto",
    statusTom: "atencao" as const,
    docsRejeitados: 0,
    contasSemComprovante: 2,
    dre: { resultado: 140.5, margemPct: 100.0 },
    observacao: "Competência em andamento. Aguardando envio dos comprovantes de pagamentos pendentes.",
  },
  docs: [
    { id: "nfe-154", numero: "000154", cliente: "Restaurante Boa Mesa Ltda", data: "18/11/2026", valor: 210.0, status: "AUTORIZADO" as const },
    { id: "nfe-155", numero: "000155", cliente: "Padaria Sabor & Cia", data: "19/11/2026", valor: 85.0, status: "PENDENTE" as const },
    { id: "nfe-156", numero: "000156", cliente: "Mercado Central Ltda", data: "19/11/2026", valor: 125.0, status: "REJEITADO" as const },
    { id: "nfe-157", numero: "000157", cliente: "Distribuidora Alfa", data: "20/11/2026", valor: 0.0, status: "CANCELADO" as const },
  ] as DocFiscalPremium[],
  vendasPorPagamento: [
    { meio: "Dinheiro", qtd: 2, total: 92.0 },
    { meio: "PIX", qtd: 1, total: 38.5 },
    { meio: "Cartão", qtd: 1, total: 10.0 },
  ],
  alertas: [
    {
      icone: "nf",
      titulo: "NF-e pendente de autorização",
      texto: "1 documento aguardando autorização no fechamento do período.",
      cor: "#F5A623",
    },
    {
      icone: "comprovante",
      titulo: "Comprovantes sem anexo",
      texto: "2 contas pagas sem comprovante anexado.",
      cor: "#F16A6A",
    },
    {
      icone: "fechamento",
      titulo: "Fechamento sem revisão completa",
      texto: "Fechamento do período em aberto para conferência contábil.",
      cor: "#5B93F5",
    },
  ] as AlertaPremium[],
  solicitacoes: [
    { id: "sol-1", texto: "Comprovante da conta de luz de novembro/2026", status: "aberta" },
    { id: "sol-2", texto: "Recibo de pagamento da taxa de entrega", status: "respondida", resposta: "Enviado pelo responsável financeiro." },
  ],
  acessos: [
    { dataHora: "20/11/2026 09:32", usuario: "demonstracao", perfil: "Administrador", acao: "Acessou o módulo Contador" },
    { dataHora: "19/11/2026 17:48", usuario: "contabilidade", perfil: "Contador", acao: "Exportou vendas (CSV)" },
    { dataHora: "18/11/2026 14:10", usuario: "demonstracao", perfil: "Administrador", acao: "Atualizou observações do fechamento" },
    { dataHora: "17/11/2026 10:27", usuario: "contabilidade", perfil: "Contador", acao: "Visualizou documentos fiscais" },
  ],
  exportacoes: [
    { nome: "Resumo fiscal do período", formato: "PDF", pronto: true },
    { nome: "Vendas por pagamento", formato: "CSV", pronto: true },
    { nome: "DRE do período", formato: "XLSX", pronto: true },
  ],
};
