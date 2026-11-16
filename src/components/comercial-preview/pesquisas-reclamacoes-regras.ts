export const DATA_REFERENCIA_C4 = "2026-11-16";

export type OrigemC4 = "Entrega" | "Retirada";
export type ResponsavelC4 = "Marina Lopes" | "Carlos Mendes" | "João Pedro";
export type StatusReclamacaoC4 = "Nova" | "Em análise" | "Aguardando cliente" | "Em resolução" | "Resolvida" | "Encerrada";
export type PrioridadeC4 = "Baixa" | "Normal" | "Alta" | "Urgente";
export type CategoriaC4 = "Pedido atrasado" | "Produto faltando" | "Sabor incorreto" | "Qualidade do produto" | "Atendimento" | "Entrega" | "Cobrança" | "Outros";
export type AvaliacaoC4 = {
  id: string; cliente: string; pedido: string; data: string; origem: OrigemC4; nota: 1 | 2 | 3 | 4 | 5;
  responsavel: ResponsavelC4; aguardandoResposta: boolean; comentario: string; reclamacaoId?: string;
};
export type RegistroHistoricoC4 = { data: string; autor: string; acao: string; status?: StatusReclamacaoC4 };
export type ReclamacaoC4 = {
  id: string; avaliacaoId?: string; cliente: string; pedido: string; dataAbertura: string; origem: OrigemC4;
  categoria: CategoriaC4; descricao: string; prioridade: PrioridadeC4; responsavel: ResponsavelC4;
  status: StatusReclamacaoC4; historico: RegistroHistoricoC4[]; solucao?: string; dataResolucao?: string; reaberturas: number;
};
export type FiltrosC4 = { periodo: "todos" | "7" | "30" | "90"; origem: "todas" | OrigemC4; responsavel: "todos" | ResponsavelC4 };
export type FiltrosAvaliacoesC4 = FiltrosC4 & { avaliacao: "todas" | "negativas" | "acompanhar" | "positivas"; status: "todos" | "aguardando" | "respondidas" };
export type FiltrosReclamacoesC4 = FiltrosC4 & { status: "todos" | StatusReclamacaoC4 };

export const AVALIACOES_DEMO_C4: AvaliacaoC4[] = [
  { id: "AV-108", cliente: "Ana Costa", pedido: "#5821", data: "2026-11-16", origem: "Entrega", nota: 5, responsavel: "Marina Lopes", aguardandoResposta: false, comentario: "Salgados chegaram quentinhos e bem embalados." },
  { id: "AV-107", cliente: "Ricardo Souza", pedido: "#5816", data: "2026-11-15", origem: "Retirada", nota: 2, responsavel: "Carlos Mendes", aguardandoResposta: true, comentario: "Faltou um pacote de coxinhas no pedido." },
  { id: "AV-106", cliente: "Luciana Melo", pedido: "#5809", data: "2026-11-14", origem: "Entrega", nota: 3, responsavel: "João Pedro", aguardandoResposta: true, comentario: "O pedido demorou um pouco além do previsto." },
  { id: "AV-105", cliente: "Paulo Nunes", pedido: "#5798", data: "2026-11-13", origem: "Entrega", nota: 1, responsavel: "Carlos Mendes", aguardandoResposta: false, comentario: "O sabor recebido estava diferente do escolhido.", reclamacaoId: "C4-104" },
  { id: "AV-104", cliente: "Beatriz Lima", pedido: "#5785", data: "2026-11-12", origem: "Retirada", nota: 4, responsavel: "Marina Lopes", aguardandoResposta: false, comentario: "Bom atendimento e produto fresco." },
  { id: "AV-103", cliente: "Camila Reis", pedido: "#5772", data: "2026-11-10", origem: "Entrega", nota: 2, responsavel: "João Pedro", aguardandoResposta: true, comentario: "A entrega chegou fria." },
  { id: "AV-102", cliente: "Diego Alves", pedido: "#5744", data: "2026-11-08", origem: "Retirada", nota: 5, responsavel: "Marina Lopes", aguardandoResposta: false, comentario: "Tudo excelente, voltarei a comprar." },
  { id: "AV-101", cliente: "Sofia Martins", pedido: "#5701", data: "2026-11-05", origem: "Entrega", nota: 1, responsavel: "Carlos Mendes", aguardandoResposta: false, comentario: "O pedido atrasou e um item veio faltando.", reclamacaoId: "C4-101" },
  { id: "AV-100", cliente: "Rafael Dias", pedido: "#5658", data: "2026-10-30", origem: "Retirada", nota: 4, responsavel: "João Pedro", aguardandoResposta: false, comentario: "Retirada rápida e salgados saborosos." },
  { id: "AV-099", cliente: "Nina Rocha", pedido: "#5590", data: "2026-10-20", origem: "Entrega", nota: 3, responsavel: "Marina Lopes", aguardandoResposta: false, comentario: "A embalagem poderia estar melhor fechada." },
];

const h = (autor: string, acao: string, status?: StatusReclamacaoC4): RegistroHistoricoC4 => ({ data: "2026-11-16T09:00:00-03:00", autor, acao, ...(status ? { status } : {}) });
export const RECLAMACOES_DEMO_C4: ReclamacaoC4[] = [
  { id: "C4-104", avaliacaoId: "AV-105", cliente: "Paulo Nunes", pedido: "#5798", dataAbertura: "2026-11-13T12:20:00-03:00", origem: "Entrega", categoria: "Sabor incorreto", descricao: "O cliente informou que recebeu outro sabor no pedido.", prioridade: "Alta", responsavel: "Carlos Mendes", status: "Em resolução", historico: [h("Marina Lopes", "Aberta a partir da avaliação AV-105.", "Nova"), h("Carlos Mendes", "Caso atribuído; conferência demonstrativa com a cozinha.", "Em resolução")], reaberturas: 0 },
  { id: "C4-103", cliente: "Camila Reis", pedido: "#5772", dataAbertura: "2026-11-10T19:10:00-03:00", origem: "Entrega", categoria: "Entrega", descricao: "Pedido recebido frio; cliente pediu retorno sobre a ocorrência.", prioridade: "Urgente", responsavel: "João Pedro", status: "Aguardando cliente", historico: [h("João Pedro", "Registro criado e retorno solicitado.", "Nova"), h("João Pedro", "Aguardando preferência de solução do cliente.", "Aguardando cliente")], reaberturas: 0 },
  { id: "C4-102", cliente: "Ricardo Souza", pedido: "#5760", dataAbertura: "2026-11-09T12:00:00-03:00", origem: "Retirada", categoria: "Cobrança", descricao: "Cliente questionou a descrição demonstrativa da cobrança.", prioridade: "Normal", responsavel: "Marina Lopes", status: "Resolvida", historico: [h("Marina Lopes", "Caso registrado para conferência.", "Nova"), h("Marina Lopes", "Explicação fornecida; sem alteração financeira.", "Resolvida")], solucao: "Contato com cliente — explicação registrada, sem estorno ou cobrança executados.", dataResolucao: "2026-11-10T15:00:00-03:00", reaberturas: 0 },
  { id: "C4-101", avaliacaoId: "AV-101", cliente: "Sofia Martins", pedido: "#5701", dataAbertura: "2026-11-05T20:10:00-03:00", origem: "Entrega", categoria: "Produto faltando", descricao: "Relato de atraso e item ausente no pedido.", prioridade: "Urgente", responsavel: "Carlos Mendes", status: "Em análise", historico: [h("Marina Lopes", "Aberta a partir da avaliação AV-101.", "Nova"), h("Carlos Mendes", "Conferindo relato demonstrativo.", "Em análise")], reaberturas: 1 },
  { id: "C4-100", cliente: "Beatriz Lima", pedido: "#5661", dataAbertura: "2026-10-29T13:45:00-03:00", origem: "Retirada", categoria: "Atendimento", descricao: "Solicitação sobre o atendimento no balcão.", prioridade: "Baixa", responsavel: "João Pedro", status: "Encerrada", historico: [h("João Pedro", "Registro e retorno realizados.", "Nova"), h("João Pedro", "Encerrada após confirmação do cliente.", "Encerrada")], solucao: "Contato com cliente — orientação registrada.", dataResolucao: "2026-10-30T10:00:00-03:00", reaberturas: 0 },
  { id: "C4-099", cliente: "Ana Costa", pedido: "#5610", dataAbertura: "2026-10-22T12:05:00-03:00", origem: "Entrega", categoria: "Qualidade do produto", descricao: "Cliente perguntou sobre a apresentação de um produto.", prioridade: "Normal", responsavel: "Marina Lopes", status: "Nova", historico: [h("Marina Lopes", "Reclamação registrada.", "Nova")], reaberturas: 0 },
];

export const CATEGORIAS_C4: CategoriaC4[] = ["Pedido atrasado", "Produto faltando", "Sabor incorreto", "Qualidade do produto", "Atendimento", "Entrega", "Cobrança", "Outros"];
export const RESPONSAVEIS_C4: ResponsavelC4[] = ["Marina Lopes", "Carlos Mendes", "João Pedro"];
export const STATUS_C4: StatusReclamacaoC4[] = ["Nova", "Em análise", "Aguardando cliente", "Em resolução", "Resolvida", "Encerrada"];
export const PRIORIDADES_C4: PrioridadeC4[] = ["Baixa", "Normal", "Alta", "Urgente"];

export function classificarAvaliacao(nota: number) {
  if (nota <= 2) return "negativa" as const;
  if (nota === 3) return "acompanhar" as const;
  return "positiva" as const;
}

function noPeriodo(data: string, periodo: FiltrosC4["periodo"], referencia = DATA_REFERENCIA_C4) {
  if (periodo === "todos") return true;
  const diferenca = (Date.parse(`${referencia}T12:00:00Z`) - Date.parse(`${data.slice(0, 10)}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(diferenca) && diferenca >= 0 && diferenca < Number(periodo);
}

export function filtrarAvaliacoes(lista: AvaliacaoC4[], f: FiltrosAvaliacoesC4, referencia = DATA_REFERENCIA_C4) {
  return lista.filter((a) => noPeriodo(a.data, f.periodo, referencia) &&
    (f.avaliacao === "todas" || classificarAvaliacao(a.nota) === ({ negativas: "negativa", acompanhar: "acompanhar", positivas: "positiva" } as const)[f.avaliacao]) &&
    (f.status === "todos" || (f.status === "aguardando" ? a.aguardandoResposta : !a.aguardandoResposta)) &&
    (f.origem === "todas" || a.origem === f.origem) && (f.responsavel === "todos" || a.responsavel === f.responsavel));
}

export function filtrarReclamacoes(lista: ReclamacaoC4[], f: FiltrosReclamacoesC4, referencia = DATA_REFERENCIA_C4) {
  return lista.filter((r) => noPeriodo(r.dataAbertura, f.periodo, referencia) &&
    (f.status === "todos" || r.status === f.status) && (f.origem === "todas" || r.origem === f.origem) &&
    (f.responsavel === "todos" || r.responsavel === f.responsavel));
}

export function calcularIndicadoresC4(avaliacoes: AvaliacaoC4[], reclamacoes: ReclamacaoC4[]) {
  const resolvidas = reclamacoes.filter((r) => r.status === "Resolvida" || r.status === "Encerrada");
  const duracoes = resolvidas.flatMap((r) => r.dataResolucao ? [(Date.parse(r.dataResolucao) - Date.parse(r.dataAbertura)) / 86_400_000] : []);
  return {
    totalAvaliacoes: avaliacoes.length,
    notaMedia: avaliacoes.length ? avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length : 0,
    satisfeitos: avaliacoes.filter((a) => a.nota >= 4).length,
    negativas: avaliacoes.filter((a) => a.nota <= 2).length,
    reclamacoesAbertas: reclamacoes.filter((r) => r.status !== "Resolvida" && r.status !== "Encerrada").length,
    reclamacoesResolvidas: resolvidas.length,
    tempoMedioResolucao: duracoes.length ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length : 0,
    aguardandoResposta: avaliacoes.filter((a) => a.aguardandoResposta).length,
  };
}

function novoId(lista: ReclamacaoC4[]) {
  return `C4-${Math.max(100, ...lista.map((r) => Number(r.id.replace("C4-", "")) || 0)) + 1}`;
}

export function criarReclamacaoDeAvaliacao(a: AvaliacaoC4, lista: ReclamacaoC4[], autor: string, agora: string): { ok: true; reclamacao: ReclamacaoC4 } | { ok: false; motivo: string } {
  if (a.nota > 2) return { ok: false, motivo: "Somente avaliações de 1 ou 2 estrelas abrem reclamação." };
  const existente = lista.find((r) => r.avaliacaoId === a.id);
  if (existente) return { ok: false, motivo: `A avaliação já está vinculada à reclamação ${existente.id}.` };
  const reclamacao: ReclamacaoC4 = {
    id: novoId(lista), avaliacaoId: a.id, cliente: a.cliente, pedido: a.pedido, dataAbertura: agora, origem: a.origem,
    categoria: a.origem === "Entrega" ? "Entrega" : "Qualidade do produto", descricao: a.comentario || `Avaliação de ${a.nota} estrelas.`,
    prioridade: a.nota === 1 ? "Urgente" : "Alta", responsavel: a.responsavel, status: "Nova", reaberturas: 0,
    historico: [{ data: agora, autor, acao: `Reclamação aberta a partir da avaliação ${a.id}.`, status: "Nova" }],
  };
  return { ok: true, reclamacao };
}

export type NovaReclamacaoC4 = Pick<ReclamacaoC4, "cliente" | "pedido" | "origem" | "categoria" | "descricao" | "prioridade" | "responsavel">;
export function criarReclamacaoManual(dados: NovaReclamacaoC4, lista: ReclamacaoC4[], autor: string, agora: string): ReclamacaoC4 {
  return { id: novoId(lista), ...dados, dataAbertura: agora, status: "Nova", reaberturas: 0, historico: [{ data: agora, autor, acao: "Reclamação registrada manualmente.", status: "Nova" }] };
}

const TRANSICOES: Record<StatusReclamacaoC4, StatusReclamacaoC4[]> = {
  Nova: ["Em análise"], "Em análise": ["Aguardando cliente", "Em resolução", "Resolvida"],
  "Aguardando cliente": ["Em análise", "Em resolução"], "Em resolução": ["Aguardando cliente", "Resolvida"],
  Resolvida: ["Encerrada"], Encerrada: [],
};

export function mudarStatusReclamacao(r: ReclamacaoC4, status: StatusReclamacaoC4, autor: string, agora: string, justificativa = ""): { ok: true; reclamacao: ReclamacaoC4 } | { ok: false; motivo: string } {
  if (!TRANSICOES[r.status].includes(status)) return { ok: false, motivo: `Mudança de ${r.status} para ${status} não permitida.` };
  if (status === "Encerrada" && justificativa.trim().length < 5) return { ok: false, motivo: "Informe a justificativa para encerrar o caso." };
  const acao = status === "Encerrada" ? `Caso encerrado: ${justificativa.trim()}` : `Status alterado de ${r.status} para ${status}.`;
  return { ok: true, reclamacao: { ...r, status, historico: [...r.historico, { data: agora, autor, acao, status }], ...(status === "Resolvida" ? { dataResolucao: agora } : {}) } };
}

export function registrarAcompanhamento(r: ReclamacaoC4, nota: string, autor: string, agora: string) {
  if (!nota.trim()) return { ok: false as const, motivo: "Escreva uma observação antes de registrar." };
  return { ok: true as const, reclamacao: { ...r, historico: [...r.historico, { data: agora, autor, acao: nota.trim() }] } };
}

export function atualizarResponsavel(r: ReclamacaoC4, responsavel: ResponsavelC4, autor: string, agora: string): ReclamacaoC4 {
  if (r.responsavel === responsavel) return r;
  return { ...r, responsavel, historico: [...r.historico, { data: agora, autor, acao: `Responsável alterado para ${responsavel}.` }] };
}

export function atualizarPrioridade(r: ReclamacaoC4, prioridade: PrioridadeC4, autor: string, agora: string): ReclamacaoC4 {
  if (r.prioridade === prioridade) return r;
  return { ...r, prioridade, historico: [...r.historico, { data: agora, autor, acao: `Prioridade alterada para ${prioridade}.` }] };
}

export function registrarSolucao(r: ReclamacaoC4, proposta: string, autor: string, agora: string) {
  if (!proposta.trim()) return { ok: false as const, motivo: "Descreva uma proposta de solução." };
  return { ok: true as const, reclamacao: { ...r, solucao: proposta.trim(), historico: [...r.historico, { data: agora, autor, acao: `Proposta demonstrativa registrada: ${proposta.trim()}. Nenhuma compensação foi executada.` }] } };
}

export function reabrirReclamacao(r: ReclamacaoC4, justificativa: string, autor: string, agora: string) {
  if (r.status !== "Resolvida" && r.status !== "Encerrada") return { ok: false as const, motivo: "Somente casos resolvidos ou encerrados podem ser reabertos." };
  if (justificativa.trim().length < 5) return { ok: false as const, motivo: "Informe o motivo da reabertura." };
  return { ok: true as const, reclamacao: { ...r, status: "Em análise" as const, reaberturas: r.reaberturas + 1, historico: [...r.historico, { data: agora, autor, acao: `Caso reaberto: ${justificativa.trim()}`, status: "Em análise" as const }] } };
}
