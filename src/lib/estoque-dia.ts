/**
 * Estoque do dia — contratos puros para integração (preparação local).
 *
 * Este módulo NÃO consulta banco, NÃO decide disponibilidade por conta própria
 * e NÃO substitui `src/lib/reserva-integracao.ts`. Ele apenas tipa o retorno
 * das RPCs canônicas da 0129 e classifica o estado devolvido pelo backend para
 * que a interface do Codex nunca transforme falha técnica em "esgotado".
 *
 * A fonte canônica é `public.vw_saldos_sabores_estoque` e as RPCs
 * `public.consultar_estoque_dia_salgados` / `public.avaliar_venda_salgado`.
 * Nenhum saldo, lote, margem ou compromisso é calculado aqui.
 */

export const RPC_ESTOQUE_DIA = {
  consultar: "consultar_estoque_dia_salgados",
  avaliarVenda: "avaliar_venda_salgado",
  avaliarPreparo: "avaliar_preparo_salgado",
  reservarSabor: "reservar_sabor_estoque",
  liberarReservaSabor: "liberar_reserva_sabor",
  solicitar: "solicitar_salgado",
  responder: "responder_solicitacao_salgado",
  reconhecer: "reconhecer_resposta_salgado",
  usarAutorizacao: "usar_autorizacao_salgado",
  bloquear: "bloquear_sabor_salgados",
  desbloquear: "desbloquear_sabor_salgados",
  registrarCompromisso: "registrar_compromisso_salgado",
  configurarSabor: "configurar_salgado_estoque",
  configurarModo: "configurar_modo_salgados",
} as const;

export type SituacaoSaborEstoque =
  | "nao_inventariado"
  | "divergencia"
  | "bloqueado"
  | "conferencia_vencidos"
  | "margem_atingida"
  | "operacional";

export interface ItemEstoqueDia {
  chave: string;
  categoria: string;
  nome: string;
  imagem_url: string | null;
  ordem: number;
  produto_id: string | null;
  fisico: number;
  reservado: number;
  disponivel: number;
  margem_seguranca: number;
  estoque_minimo: number;
  inventariado: boolean;
  vencidos: number;
  proxima_validade: string | null;
  compromissos_futuros: number;
  disponivel_imediato: number;
  bloqueado_hoje: boolean;
  solicitacoes_pendentes: number;
  situacao: SituacaoSaborEstoque;
  atualizado_em: string;
  data: string;
  bloqueado_na_data: boolean;
  compromissos_na_data: number;
  liberacao_ativa: number;
  disponivel_na_data: number;
}

export interface RespostaConsultaEstoqueDia {
  status: "ok" | "permissao_negada";
  data?: string;
  modo?: string;
  habilitado?: boolean;
  itens?: ItemEstoqueDia[];
}

/** Statuses possíveis de `public.avaliar_venda_salgado`. */
export type StatusViabilidade =
  | "disponivel"
  | "analise_necessaria"
  | "margem_atingida"
  | "indisponivel"
  | "bloqueado"
  | "nao_inventariado"
  | "divergencia"
  | "sabor_inexistente"
  | "permissao_negada"
  | "dados_invalidos";

export interface ViabilidadeSalgado {
  status: StatusViabilidade;
  chave?: string;
  data?: string;
  fisico?: number;
  reservado?: number;
  margem_seguranca?: number;
  compromissos_futuros?: number;
  liberacao_ativa?: number;
  inventariado?: boolean;
  disponivel_imediato?: number;
  quantidade?: number;
  pedido_id?: string | null;
  avaliacao?: unknown;
  mensagem?: string;
}

export type TipoSolicitacaoEstoque =
  | "conferencia"
  | "liberacao_excepcional"
  | "agendamento_analise";

export type DecisaoSolicitacaoEstoque = "aprovada" | "parcial" | "recusada";

export interface SolicitacaoEstoqueInput {
  tipo: TipoSolicitacaoEstoque;
  chave: string;
  quantidade: number;
  motivo: string;
  chaveIdempotencia: string;
  data?: string;
  pedidoId?: string | null;
}

export interface RespostaSolicitacaoInput {
  solicitacaoId: string;
  decisao: DecisaoSolicitacaoEstoque;
  quantidadeConferida?: number | null;
  quantidadeLiberada?: number | null;
  justificativa: string;
  expiraEm?: string | null;
  chaveIdempotencia?: string | null;
}

/**
 * Classificação visual/operacional devolvida ao front. `erro_tecnico` NUNCA
 * usa rótulo de falta de estoque e nunca habilita confirmação automática.
 */
export type ClasseViabilidade =
  | "disponivel"
  | "analise"
  | "margem_atingida"
  | "indisponivel_real"
  | "bloqueado"
  | "erro_tecnico";

export interface ClassificacaoViabilidade {
  classe: ClasseViabilidade;
  titulo: string;
  mensagem: string;
  permiteConfirmacaoAutomatica: boolean;
  requerEncaminhamento: boolean;
}

const CLASSIFICACOES: Record<StatusViabilidade, ClassificacaoViabilidade> = {
  disponivel: {
    classe: "disponivel",
    titulo: "Disponível",
    mensagem: "Há cobertura física para a quantidade e data informadas.",
    permiteConfirmacaoAutomatica: true,
    requerEncaminhamento: false,
  },
  analise_necessaria: {
    classe: "analise",
    titulo: "Aguardando análise",
    mensagem: "O responsável precisa conferir antes da confirmação.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  margem_atingida: {
    classe: "margem_atingida",
    titulo: "Margem de segurança atingida",
    mensagem: "A venda depende de liberação excepcional pontual.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  indisponivel: {
    classe: "indisponivel_real",
    titulo: "Indisponibilidade real",
    mensagem: "Não há cobertura física suficiente para esta quantidade e data.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  bloqueado: {
    classe: "bloqueado",
    titulo: "Sabor bloqueado na data",
    mensagem: "A comercialização deste sabor foi bloqueada para a data.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  nao_inventariado: {
    classe: "analise",
    titulo: "Estoque não inventariado",
    mensagem: "O saldo ainda não foi conferido; não significa falta de estoque.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  divergencia: {
    classe: "analise",
    titulo: "Divergência de conferência",
    mensagem: "Reservas excedem o físico cadastrado; pedir conferência.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  sabor_inexistente: {
    classe: "erro_tecnico",
    titulo: "Falha técnica na consulta",
    mensagem: "O sabor não foi reconhecido. Não interpretar como estoque esgotado.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  permissao_negada: {
    classe: "erro_tecnico",
    titulo: "Falha técnica de acesso",
    mensagem: "A consulta não foi autorizada. Não interpretar como estoque esgotado.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
  dados_invalidos: {
    classe: "erro_tecnico",
    titulo: "Falha técnica na solicitação",
    mensagem: "Os dados informados não foram aceitos. Não interpretar como estoque esgotado.",
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  },
};

/** Erros de transporte/PostgREST também são técnicos, nunca "esgotado". */
export type MotivoErroTecnico =
  | "rpc_indisponivel"
  | "rpc_sem_permissao"
  | "nao_autenticado"
  | "erro_rede"
  | "resposta_invalida";

export function classificarErroConsultaEstoque(motivo: MotivoErroTecnico): ClassificacaoViabilidade {
  const mensagens: Record<MotivoErroTecnico, string> = {
    rpc_indisponivel: "A RPC de estoque não está disponível.",
    rpc_sem_permissao: "A RPC de estoque recusou o acesso.",
    nao_autenticado: "A sessão não está autenticada.",
    erro_rede: "Não foi possível concluir a consulta.",
    resposta_invalida: "A resposta do estoque não pôde ser validada.",
  };
  return {
    classe: "erro_tecnico",
    titulo: "Falha técnica na consulta",
    mensagem: `${mensagens[motivo]} Não interpretar como estoque esgotado.`,
    permiteConfirmacaoAutomatica: false,
    requerEncaminhamento: true,
  };
}

export function classificarViabilidade(status: StatusViabilidade): ClassificacaoViabilidade {
  return CLASSIFICACOES[status];
}

/** Resumo para o modo monitoramento: mostra, nunca bloqueia sozinho. */
export function rotuloModoOperacao(modo: string | undefined, habilitado: boolean | undefined): string {
  if (!habilitado) return "Monitoramento — consulta sem bloqueio automático";
  if (modo === "validacao_assistida") return "Validação assistida — conferência orientada";
  if (modo === "controle_operacional") return "Controle operacional — regras ativas";
  return "Monitoramento — consulta sem bloqueio automático";
}
