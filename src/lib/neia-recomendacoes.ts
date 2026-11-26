/**
 * A02.1.2 — Persistência das situações das recomendações preventivas.
 *
 * Usa as tabelas `a02_recomendacoes` e `a02_recomendacoes_historico` (migration
 * 0126). As permissões são validadas no banco: somente administradores leem e
 * gerenciam; o histórico recebe gravação apenas pela trigger.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { lerDashboard } from "@/lib/dashboard-a01-dados";
import { decidirOcorrencia, type SituacaoRecomendacao } from "@/lib/neia-recomendacoes-estado";

export type EstadoRecomendacao = {
  id: string;
  recomendacao_id: string;
  chave: string;
  ocorrencia: number;
  situacao: SituacaoRecomendacao;
  prioridade: string;
  titulo: string;
  criado_por: string;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string;
  ciente_em: string | null;
  ciente_por: string | null;
  adiada_em: string | null;
  adiada_por: string | null;
  adiada_ate: string | null;
  dispensada_em: string | null;
  dispensada_por: string | null;
  dispensada_motivo: string | null;
  resolvida_em: string | null;
  resolvida_por: string | null;
  resolvida_dados: unknown;
  tarefa_id: string | null;
};

export type EventoRecomendacao = {
  id: number;
  estado_id: string;
  ator_id: string;
  ator_nome: string;
  acao:
    | "detectada"
    | "ciente"
    | "adiada"
    | "dispensada"
    | "resolvida"
    | "reaberta"
    | "ocorrencia"
    | "tarefa_vinculada";
  detalhe: Record<string, unknown> | null;
  ocorreu_em: string;
};

export const chaveRecomendacoes = (usuarioId: string) =>
  ["dashboard-a01", usuarioId, "neia-recomendacoes"] as const;

export function useRecomendacoesA02(usuarioId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel("neia-recomendacoes-" + usuarioId)
      .on("postgres_changes", { event: "*", schema: "public", table: "a02_recomendacoes" }, () => {
        void queryClient.invalidateQueries({ queryKey: chaveRecomendacoes(usuarioId) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [queryClient, usuarioId]);

  const estados = useQuery({
    queryKey: chaveRecomendacoes(usuarioId),
    refetchInterval: 60_000,
    queryFn: ({ signal }) =>
      lerDashboard<EstadoRecomendacao>((i, f) =>
        supabase
          .from("a02_recomendacoes")
          .select("*")
          .order("atualizado_em", { ascending: false })
          .range(i, f)
          .abortSignal(signal),
      ),
  });

  const historico = useQuery({
    queryKey: [...chaveRecomendacoes(usuarioId), "historico"],
    refetchInterval: 60_000,
    queryFn: ({ signal }) =>
      lerDashboard<EventoRecomendacao>((i, f) =>
        supabase
          .from("a02_recomendacoes_historico")
          .select("id,estado_id,ator_id,ator_nome,acao,detalhe,ocorreu_em")
          .order("ocorrido_em", { ascending: false })
          .range(i, f)
          .abortSignal(signal),
      ),
  });

  return {
    estados: estados.data ?? [],
    historico: historico.data ?? [],
    isLoading: estados.isLoading,
    isError: estados.isError || historico.isError,
    refetch: async () => {
      await estados.refetch();
      await historico.refetch();
    },
  };
}

function erroDaConsulta(error: { message: string; code?: string } | null, padrao: string) {
  if (!error) return padrao;
  if (error.code === "23505") return "Já existe um registro para esta ocorrência.";
  if (error.code === "42501") return "Operação não permitida para o seu perfil.";
  return error.message || padrao;
}

/** Estado mais recente de uma recomendação (maior ocorrência). */
export function estadoMaisRecente(
  estados: EstadoRecomendacao[],
  recomendacaoId: string,
): EstadoRecomendacao | undefined {
  return estados
    .filter((estado) => estado.recomendacao_id === recomendacaoId)
    .sort((a, b) => b.ocorrencia - a.ocorrencia)[0];
}

export type ResumoRecomendacao = {
  id: string;
  titulo: string;
  prioridade: string;
};

/**
 * Mantém o estado persistido alinhado com a leitura atual do motor:
 * registra a ocorrência, reativa a que voltou e atualiza a prioridade quando
 * a recomendação continua pendente.
 *
 * Retorna quantas escritas foram feitas, para a tela saber se precisa
 * recarregar a lista.
 */
export async function sincronizarOcorrencias(
  recomendacoes: ResumoRecomendacao[],
  estados: EstadoRecomendacao[],
  agora: number,
): Promise<number> {
  let mudancas = 0;
  for (const recomendacao of recomendacoes) {
    const atual = estadoMaisRecente(estados, recomendacao.id);
    const decisao = decidirOcorrencia(atual, recomendacao.prioridade, agora);

    if (decisao === "nova-ocorrencia") {
      const ocorrencia = (atual?.ocorrencia ?? 0) + 1;
      const { error } = await supabase.from("a02_recomendacoes").insert({
        recomendacao_id: recomendacao.id,
        chave: recomendacao.id,
        ocorrencia,
        situacao: "pendente",
        prioridade: recomendacao.prioridade,
        titulo: recomendacao.titulo,
      });
      if (error && error.code !== "23505") {
        throw new Error(erroDaConsulta(error, "Não foi possível registrar a recomendação."));
      }
      if (!error) mudancas += 1;
      continue;
    }

    if (!atual) continue;

    if (decisao === "reativar") {
      const { error } = await supabase
        .from("a02_recomendacoes")
        .update({ situacao: "pendente", prioridade: recomendacao.prioridade })
        .eq("id", atual.id);
      if (error)
        throw new Error(erroDaConsulta(error, "Não foi possível reativar a recomendação."));
      mudancas += 1;
      continue;
    }

    if (atual.situacao === "pendente" && atual.prioridade !== recomendacao.prioridade) {
      const { error } = await supabase
        .from("a02_recomendacoes")
        .update({ prioridade: recomendacao.prioridade })
        .eq("id", atual.id);
      if (error) throw new Error(erroDaConsulta(error, "Não foi possível atualizar a prioridade."));
      mudancas += 1;
    }
  }
  return mudancas;
}

async function atualizarSituacao(
  estadoId: string,
  alteracoes: Record<string, unknown>,
  padrao: string,
): Promise<EstadoRecomendacao | null> {
  const { data, error } = await supabase
    .from("a02_recomendacoes")
    .update(alteracoes)
    .eq("id", estadoId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(erroDaConsulta(error, padrao));
  if (!data) throw new Error("A recomendação mudou de situação. Atualize a lista e tente de novo.");
  return data as EstadoRecomendacao;
}

export async function marcarCienteRecomendacao(estadoId: string) {
  return atualizarSituacao(
    estadoId,
    { situacao: "ciente" },
    "Não foi possível marcar como ciente.",
  );
}

export async function adiarRecomendacao(estadoId: string, ate: string) {
  return atualizarSituacao(
    estadoId,
    { situacao: "adiada", adiada_ate: ate },
    "Não foi possível adiar a recomendação.",
  );
}

export async function dispensarRecomendacao(estadoId: string, motivo: string) {
  return atualizarSituacao(
    estadoId,
    { situacao: "dispensada", dispensada_motivo: motivo.trim() },
    "Não foi possível dispensar a recomendação.",
  );
}

export async function resolverRecomendacao(estadoId: string, evidencia: unknown) {
  return atualizarSituacao(
    estadoId,
    { situacao: "resolvida", resolvida_dados: evidencia },
    "Não foi possível registrar a resolução.",
  );
}

export async function vincularTarefaRecomendacao(estadoId: string, tarefaId: string | null) {
  const { data, error } = await supabase
    .from("a02_recomendacoes")
    .update({ tarefa_id: tarefaId })
    .eq("id", estadoId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(erroDaConsulta(error, "Não foi possível vincular a tarefa."));
  return data as EstadoRecomendacao | null;
}
