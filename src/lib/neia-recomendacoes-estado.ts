/**
 * A02.1.2 — Situações das recomendações preventivas.
 *
 * Módulo puro (sem acesso ao banco) para que Dashboard, Minhas tarefas e
 * Néia Inteligência compartilhem a mesma regra de situação, resolução
 * automática e reativação.
 */

export type SituacaoRecomendacao = "pendente" | "ciente" | "adiada" | "dispensada" | "resolvida";

export const SITUACOES_RECOMENDACAO = [
  ["pendente", "Pendentes"],
  ["ciente", "Cientes"],
  ["adiada", "Adiadas"],
  ["com-tarefa", "Com tarefa"],
  ["resolvida", "Resolvidas"],
  ["dispensada", "Dispensadas"],
] as const;
export type FiltroSituacao = (typeof SITUACOES_RECOMENDACAO)[number][0] | "todas";

export const PRIORIDADE_ORDEM: Record<string, number> = {
  baixa: 0,
  normal: 1,
  alta: 2,
  critica: 3,
};

/** Estado mínimo exigido pelas regras puras. */
export type EstadoRecomendacaoMinimo = {
  id: string;
  recomendacao_id: string;
  situacao: SituacaoRecomendacao;
  prioridade: string;
  ocorrencia: number;
  adiada_ate: string | null;
  dispensada_em: string | null;
  resolvida_em: string | null;
};

export type SituacaoFonteMinima = "suficiente" | "parcial" | "sem-registros" | "falha";

/** Uma dispensa vale por 7 dias; depois disso a recomendação pode voltar. */
export const VALIDADE_DISPENSA_DIAS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Situação efetiva: uma recomendação adiada volta a ser pendente quando o
 * prazo termina. Dispensa e resolução dependem da reavaliação dos dados.
 */
export function situacaoEfetiva(
  estado: EstadoRecomendacaoMinimo | undefined,
  agora: number,
): SituacaoRecomendacao {
  if (!estado) return "pendente";
  if (estado.situacao === "adiada" && estado.adiada_ate) {
    if (Date.parse(estado.adiada_ate) <= agora) return "pendente";
  }
  return estado.situacao;
}

/** Uma recomendação adiada que ainda não venceu continua adiada. */
export function adiadaVigente(
  estado: EstadoRecomendacaoMinimo | undefined,
  agora: number,
): boolean {
  return (
    !!estado &&
    estado.situacao === "adiada" &&
    !!estado.adiada_ate &&
    Date.parse(estado.adiada_ate) > agora
  );
}

/** A dispensa deixou de valer? */
export function dispensaExpirada(
  estado: EstadoRecomendacaoMinimo | undefined,
  agora: number,
): boolean {
  if (!estado || estado.situacao !== "dispensada" || !estado.dispensada_em) return false;
  return agora - Date.parse(estado.dispensada_em) >= VALIDADE_DISPENSA_DIAS * DIA_MS;
}

/**
 * Decisão do motor de ocorrências:
 * - `nova-ocorrencia`: nunca vista ou voltou depois de resolvida;
 * - `reativar`: dispensada e expirada, ou com prioridade pior;
 * - `manter`: continua no estado atual.
 */
export function decidirOcorrencia(
  estado: EstadoRecomendacaoMinimo | undefined,
  prioridadeAtual: string,
  agora: number,
): "nova-ocorrencia" | "reativar" | "manter" {
  if (!estado) return "nova-ocorrencia";
  if (estado.situacao === "resolvida") return "nova-ocorrencia";
  if (estado.situacao === "dispensada") {
    if (dispensaExpirada(estado, agora)) return "reativar";
    return (PRIORIDADE_ORDEM[prioridadeAtual] ?? 1) > (PRIORIDADE_ORDEM[estado.prioridade] ?? 1)
      ? "reativar"
      : "manter";
  }
  return "manter";
}

/**
 * Recomendações que podem ser marcadas como resolvidas: o problema deixou de
 * aparecer na leitura atual e a fonte responsável tem dados suficientes.
 * Ausência de dados, falha de consulta ou tarefa concluída não resolvem.
 */
export function candidatosResolucao(
  estados: EstadoRecomendacaoMinimo[],
  idsAtivos: string[],
  categoriaDe: (id: string) => string | undefined,
  situacaoFonteDe: (categoria: string) => SituacaoFonteMinima | undefined,
  agora: number,
): EstadoRecomendacaoMinimo[] {
  const ativos = new Set(idsAtivos);
  return estados.filter((estado) => {
    if (ativos.has(estado.recomendacao_id)) return false;
    if (estado.situacao === "resolvida" || estado.situacao === "dispensada") return false;
    if (adiadaVigente(estado, agora)) return false;
    const categoria = categoriaDe(estado.recomendacao_id);
    if (!categoria) return false;
    return situacaoFonteDe(categoria) === "suficiente";
  });
}

/** Adiar alerta crítico é limitado a 24 horas. */
export const LIMITE_ADIAMENTO_CRITICO_MS = 24 * 60 * 60 * 1000;

export function validarAdiamento(prioridade: string, agora: number, ate: number): string | null {
  if (!Number.isFinite(ate) || ate <= agora) return "Escolha um prazo futuro para o adiamento.";
  if (prioridade === "critica" && ate - agora > LIMITE_ADIAMENTO_CRITICO_MS)
    return "Alerta crítico só pode ser adiado por até 24 horas.";
  return null;
}

/** Prazos rápidos de adiamento. */
export function prazosAdiamento(agora: number) {
  const hora = 60 * 60 * 1000;
  const dia = 24 * hora;
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  const amanha = inicio.getTime() + dia + 9 * hora;
  return [
    { id: "1h", rotulo: "Uma hora", ate: agora + hora },
    { id: "3h", rotulo: "Três horas", ate: agora + 3 * hora },
    { id: "amanha", rotulo: "Amanhã", ate: amanha },
    { id: "7d", rotulo: "Sete dias", ate: agora + 7 * dia },
    { id: "personalizado", rotulo: "Data e horário", ate: 0 },
  ] as const;
}

/** Correspondência do filtro de situação escolhido na tela. */
export function correspondeFiltroSituacao(
  situacao: SituacaoRecomendacao,
  filtro: FiltroSituacao,
  temTarefa: boolean,
): boolean {
  if (filtro === "todas") return true;
  if (filtro === "com-tarefa") return temTarefa;
  return situacao === filtro;
}

/** Motivo de exclusão/dispensa obrigatório. */
export function validarMotivo(motivo: string | null | undefined): string | null {
  const texto = motivo?.trim() ?? "";
  if (!texto) return "Informe o motivo.";
  if (texto.length > 500) return "O motivo deve ter no máximo 500 caracteres.";
  return null;
}

/** Rótulo da situação para exibição. */
export function rotuloSituacaoRecomendacao(situacao: SituacaoRecomendacao | "com-tarefa"): string {
  if (situacao === "com-tarefa") return "Com tarefa";
  return (
    SITUACOES_RECOMENDACAO.find(([id]) => id === situacao)?.[1] ??
    situacao.charAt(0).toUpperCase() + situacao.slice(1)
  );
}
