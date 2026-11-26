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
const rotulosEquipe: Record<string, string> = {
  admin: "Administração",
  atendente: "Atendimento",
  producao: "Produção",
  financeiro: "Financeiro",
  motoboy: "Entregas",
};

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
  /** Exclusão lógica: a tarefa sai das listas ativas e vai para a lixeira. */
  excluida: boolean;
  excluida_em: string | null;
  excluida_por: string | null;
  excluida_motivo: string | null;
  /** Vínculo com a recomendação que originou a tarefa. */
  recomendacao_id: string | null;
  rec_chave: string | null;
  rec_ocorrencia: number | null;
};

/** Sugestão vinda da Néia Inteligência, com o vínculo da recomendação de origem. */
export type SugestaoTarefaA01 = {
  titulo: string;
  descricao: string;
  prioridade?: PrioridadeA01;
  recomendacao_id?: string;
  rec_chave?: string;
  rec_ocorrencia?: number;
  /** Rótulo exibido no formulário para o administrador identificar a origem. */
  origemRotulo?: string;
};
type EdicaoTarefa = Pick<
  TarefaA01,
  "titulo" | "descricao" | "prioridade" | "prazo" | "compartilhada" | "responsavel_id"
> & {
  recomendacao_id?: string | null;
  rec_chave?: string | null;
  rec_ocorrencia?: number | null;
};
type EventoTarefa = {
  id: number;
  tarefa_id: string;
  ator_id: string;
  ator_nome: string;
  acao:
    | "criada"
    | "editada"
    | "concluida"
    | "sugestao_aprovada"
    | "reaberta"
    | "excluida"
    | "restaurada";
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

export function nomeRegistradoTarefa(valor: string | null | undefined) {
  const nome = valor?.trim();
  return nome && !/^Colaborador [a-f0-9]{8}$/i.test(nome) ? nome : null;
}

export function nomeTarefa(id: string, registrado: string, nomes?: ReadonlyMap<string, string>) {
  return nomeRegistradoTarefa(registrado) ?? nomes?.get(id) ?? "Nome não cadastrado";
}

async function lerNomes(ids: string[], signal: AbortSignal) {
  const nomes = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,nome")
      .in("id", ids.slice(i, i + 100))
      .abortSignal(signal);
    if (error) throw error;
    for (const pessoa of data ?? []) {
      const nome = nomeRegistradoTarefa(pessoa.nome);
      if (nome) nomes.set(pessoa.id, nome);
    }
  }
  return nomes;
}

export function useNomesTarefasA01(usuarioId: string, identidades: string[]) {
  const ids = [...new Set(identidades)].sort();
  return useQuery({
    queryKey: ["dashboard-a01", usuarioId, "nomes-tarefas", ids],
    enabled: ids.length > 0,
    queryFn: ({ signal }) => lerNomes(ids, signal),
  });
}

export async function salvarNomeTarefasA01(usuarioId: string, valor: string) {
  const nome = nomeRegistradoTarefa(valor);
  if (!nome || nome.length > 160)
    throw new Error("Informe o nome cadastrado, com até 160 caracteres.");
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: usuarioId, nome }, { onConflict: "id" })
    .select("nome")
    .single();
  if (error || !data?.nome) throw new Error("Não foi possível salvar o nome no seu perfil.");
  return String(data.nome);
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
      const nomes = await lerNomes(ids, signal);
      const funcoes = new Map<string, string[]>();
      for (const pessoa of equipe) {
        const rotulo = rotulosEquipe[pessoa.role];
        if (rotulo) funcoes.set(pessoa.user_id, [...(funcoes.get(pessoa.user_id) ?? []), rotulo]);
      }
      return ids
        .map((id) => ({ id, nome: nomes.get(id) ?? null, funcao: funcoes.get(id)?.join(" / ") }))
        .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
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
          .select("id,tarefa_id,ator_id,ator_nome,acao,ocorrido_em,anterior,atual")
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
        !tarefa.excluida &&
        tarefa.prazo !== null &&
        tarefa.prazo < hoje,
    ) ?? []
  );
}

/** Tarefas que continuam visíveis nas listas ativas. */
export function tarefasAtivas(tarefas: TarefaA01[] | undefined) {
  return (tarefas ?? []).filter((tarefa) => !tarefa.excluida);
}

/** Tarefas excluídas logicamente, disponíveis na lixeira. */
export function tarefasLixeira(tarefas: TarefaA01[] | undefined) {
  return (tarefas ?? []).filter((tarefa) => tarefa.excluida);
}

export async function criarTarefaA01(tarefa: EdicaoTarefa, origem: TarefaA01["origem"]) {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .insert({ ...tarefa, origem })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505")
      throw new Error("Já existe uma tarefa ativa para esta ocorrência da recomendação.");
    throw new Error("A tarefa não pôde ser criada. Verifique o responsável e tente novamente.");
  }
  return String(data.id);
}

/** Localiza a tarefa ativa vinculada a uma ocorrência da recomendação. */
export async function tarefaDaRecomendacao(
  recomendacaoId: string,
  chave: string,
  ocorrencia: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .select("id")
    .eq("recomendacao_id", recomendacaoId)
    .eq("rec_chave", chave)
    .eq("rec_ocorrencia", ocorrencia)
    .not("concluida", "is", true)
    .not("excluida", "is", true)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
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

/** Exclusão lógica: exige motivo e mantém a tarefa e o histórico. */
export async function excluirTarefaA01(tarefa: TarefaA01, motivo: string) {
  const texto = motivo.trim();
  if (!texto) throw new Error("Informe o motivo da exclusão.");
  const { data, error } = await supabase
    .from("a01_tarefas")
    .update({ excluida: true, excluida_motivo: texto })
    .eq("id", tarefa.id)
    .eq("versao", tarefa.versao)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message || "A exclusão não pôde ser registrada.");
  if (!data)
    throw new Error(
      "A tarefa foi alterada por outra pessoa ou você não tem permissão para excluí-la.",
    );
}

/** Restauração pela lixeira: devolve a tarefa às listas ativas. */
export async function restaurarTarefaA01(tarefa: TarefaA01) {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .update({ excluida: false })
    .eq("id", tarefa.id)
    .eq("versao", tarefa.versao)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message || "A restauração não pôde ser registrada.");
  if (!data)
    throw new Error(
      "A tarefa foi alterada por outra pessoa ou você não tem permissão para restaurá-la.",
    );
}

/** Reabertura: a tarefa volta ao estado pendente e a conclusão anterior fica no histórico. */
export async function reabrirTarefaA01(tarefa: TarefaA01) {
  const { data, error } = await supabase
    .from("a01_tarefas")
    .update({ concluida: false })
    .eq("id", tarefa.id)
    .eq("versao", tarefa.versao)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message || "A tarefa não pôde ser reaberta.");
  if (!data)
    throw new Error(
      "A tarefa foi alterada por outra pessoa ou você não tem permissão para reabrí-la.",
    );
}
