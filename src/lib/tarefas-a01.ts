import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { lerDashboard } from "@/lib/dashboard-a01-dados";

export const PAPEIS_TAREFAS_A01 = [
  "admin",
  "atendente",
  "producao",
  "financeiro",
  "motoboy",
] as const;
export const PRIORIDADES_A01 = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
  ["critica", "Crítica"],
] as const;
export type PrioridadeA01 = (typeof PRIORIDADES_A01)[number][0];

export type TarefaA01 = {
  id: string;
  titulo: string;
  descricao: string;
  prioridade: PrioridadeA01;
  prazo: string | null;
  compartilhada: boolean;
  origem: "manual" | "inteligencia";
  criado_por: string;
  criado_nome: string;
  responsavel_id: string;
  responsavel_nome: string;
  criada_em: string;
  atualizada_em: string;
  concluida: boolean;
  concluida_em: string | null;
  concluida_por: string | null;
  versao: number;
};

export type SugestaoTarefaA01 = { titulo: string; descricao: string };
type EdicaoTarefa = Pick<
  TarefaA01,
  "titulo" | "descricao" | "prioridade" | "prazo" | "compartilhada" | "responsavel_id"
>;
type EventoTarefa = {
  id: number;
  tarefa_id: string;
  ator_nome: string;
  acao: "criada" | "editada" | "concluida" | "sugestao_aprovada";
  ocorrido_em: string;
  anterior: TarefaA01 | null;
  atual: TarefaA01;
};

export const chaveTarefas = (usuarioId: string) => ["dashboard-a01", usuarioId, "tarefas"] as const;

export function useTarefasA01(usuarioId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel("tarefas-a01-" + usuarioId)
      .on("postgres_changes", { event: "*", schema: "public", table: "a01_tarefas" }, () => {
        void queryClient.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [queryClient, usuarioId]);
  return useQuery({
    queryKey: chaveTarefas(usuarioId),
    refetchInterval: 30_000,
    queryFn: ({ signal }) =>
      lerDashboard<TarefaA01>((i, f) =>
        supabase
          .from("a01_tarefas")
          .select("*")
          .order("concluida")
          .order("prazo", { nullsFirst: false })
          .order("atualizada_em", { ascending: false })
          .order("id")
          .range(i, f)
          .abortSignal(signal),
      ),
  });
}

export function useResponsaveisA01(usuarioId: string, habilitar: boolean) {
  return useQuery({
    queryKey: ["dashboard-a01", usuarioId, "responsaveis-tarefas"],
    enabled: habilitar,
    queryFn: async ({ signal }) => {
      const equipe = await lerDashboard<{ user_id: string; role: string }>((i, f) =>
        supabase
          .from("user_roles")
          .select("user_id,role")
          .in("role", PAPEIS_TAREFAS_A01)
          .order("user_id")
          .order("role")
          .range(i, f)
          .abortSignal(signal),
      );
      const ids = [...new Set([usuarioId, ...equipe.map((item) => item.user_id)])];
      const nomes = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,nome")
          .in("id", ids.slice(i, i + 100))
          .abortSignal(signal);
        if (error) throw error;
        for (const pessoa of data ?? []) if (pessoa.nome) nomes.set(pessoa.id, pessoa.nome);
      }
      return ids
        .map((id) => ({ id, nome: nomes.get(id) ?? "Colaborador " + id.slice(0, 8) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

export function useHistoricoTarefaA01(usuarioId: string, tarefaId: string | undefined) {
  return useQuery({
    queryKey: [...chaveTarefas(usuarioId), "historico", tarefaId],
    enabled: Boolean(tarefaId),
    queryFn: ({ signal }) =>
      lerDashboard<EventoTarefa>((i, f) =>
        supabase
          .from("a01_tarefas_historico")
          .select("id,tarefa_id,ator_nome,acao,ocorrido_em,anterior,atual")
          .eq("tarefa_id", tarefaId)
          .order("versao", { ascending: false })
          .range(i, f)
          .abortSignal(signal),
      ),
  });
}

export function tarefasAtrasadas(
  tarefas: TarefaA01[] | undefined,
  usuarioId: string,
  hoje: string,
) {
  return (
    tarefas?.filter(
      (tarefa) =>
        tarefa.responsavel_id === usuarioId &&
        !tarefa.concluida &&
        tarefa.prazo !== null &&
        tarefa.prazo < hoje,
    ) ?? []
  );
}

export async function criarTarefaA01(tarefa: EdicaoTarefa, origem: TarefaA01["origem"]) {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .insert({ ...tarefa, origem })
    .select("id")
    .single();
  if (error || !data)
    throw new Error("A tarefa não pôde ser criada. Verifique o responsável e tente novamente.");
}

export async function atualizarTarefaA01(
  tarefa: TarefaA01,
  alteracoes: Partial<EdicaoTarefa> | { concluida: true },
) {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .update(alteracoes)
    .eq("id", tarefa.id)
    .eq("versao", tarefa.versao)
    .select("id")
    .maybeSingle();
  if (error)
    throw new Error("A alteração não pôde ser salva. Confira suas permissões e tente novamente.");
  if (!data)
    throw new Error(
      "A tarefa foi atualizada por outra pessoa ou ficou indisponível. Atualize a lista e revise a alteração.",
    );
}
