import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hojeSP } from "@/lib/competencia";
import {
  atualizarTarefaA01,
  chaveTarefas,
  criarTarefaA01,
  excluirTarefaA01,
  nomeTarefa,
  reabrirTarefaA01,
  restaurarTarefaA01,
  salvarNomeTarefasA01,
  tarefasAtrasadas,
  tarefasAtivas,
  tarefasLixeira,
  PRIORIDADES_A01,
  useHistoricoTarefaA01,
  useNomesTarefasA01,
  useResponsaveisA01,
  useTarefasA01,
  type PrioridadeA01,
  type SugestaoTarefaA01,
  type TarefaA01,
} from "@/lib/tarefas-a01";

const acaoHistorico = {
  criada: "Criou a tarefa",
  editada: "Editou a tarefa",
  concluida: "Concluiu a tarefa",
  sugestao_aprovada: "Aprovou a sugestão",
  reaberta: "Reabriu a tarefa",
  excluida: "Excluiu a tarefa",
  restaurada: "Restaurou a tarefa",
};

const horario = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const diaBR = (s: string | null) => s?.split("-").reverse().join("/") ?? "Sem prazo";
const rotuloPrioridade = (s: string) => PRIORIDADES_A01.find(([id]) => s === id)?.[1] ?? s;

function mudancasTarefa(
  anterior: TarefaA01 | null,
  atual: TarefaA01,
  mostrarNome: (id: string, registrado: string) => string,
) {
  if (!anterior) return [];
  const campos = [
    ["Título", anterior.titulo, atual.titulo],
    ["Descrição", anterior.descricao, atual.descricao],
    ["Prioridade", rotuloPrioridade(anterior.prioridade), rotuloPrioridade(atual.prioridade)],
    ["Prazo", diaBR(anterior.prazo), diaBR(atual.prazo)],
    [
      "Visibilidade",
      anterior.compartilhada ? "Compartilhada" : "Individual",
      atual.compartilhada ? "Compartilhada" : "Individual",
    ],
    ["Lixeira", anterior.excluida ? "Excluída" : "Ativa", atual.excluida ? "Excluída" : "Ativa"],
    ["Motivo da exclusão", anterior.excluida_motivo ?? "", atual.excluida_motivo ?? ""],
  ];
  const alterados = campos.filter(([, antes, depois]) => antes !== depois);
  if (anterior.responsavel_id !== atual.responsavel_id) {
    alterados.push([
      "Responsável",
      mostrarNome(anterior.responsavel_id, anterior.responsavel_nome),
      mostrarNome(atual.responsavel_id, atual.responsavel_nome),
    ]);
  }
  return alterados;
}

type Props = {
  usuarioId: string;
  admin: boolean;
  hoje: string;
  consulta: ReturnType<typeof useTarefasA01>;
  sugestao?: SugestaoTarefaA01 | null;
  limparSugestao?: () => void;
  painelCompleto?: boolean;
};

export function TarefasA01({
  usuarioId,
  admin,
  hoje,
  consulta,
  sugestao,
  limparSugestao,
  painelCompleto = false,
}: Props) {
  const client = useQueryClient();
  const [verConcluidas, setVerConcluidas] = useState(false);
  const [limite, setLimite] = useState(5);
  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroPrazo, setFiltroPrazo] = useState("");
  const [editando, setEditando] = useState<TarefaA01 | "nova" | null>(null);
  const [concluir, setConcluir] = useState<TarefaA01 | null>(null);
  const [excluir, setExcluir] = useState<TarefaA01 | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [historico, setHistorico] = useState<TarefaA01 | null>(null);
  const [aba, setAba] = useState<"ativas" | "lixeira">("ativas");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const editorAberto = !!editando || !!sugestao;
  const existente = editando && editando !== "nova" ? editando : null;
  const responsaveis = useResponsaveisA01(usuarioId, admin && editorAberto);
  const eventos = useHistoricoTarefaA01(usuarioId, historico?.id);
  const identidades = (consulta.data ?? []).flatMap((tarefa) => [
    tarefa.criado_por,
    tarefa.responsavel_id,
  ]);
  for (const evento of eventos.data ?? []) {
    identidades.push(evento.ator_id, evento.atual.responsavel_id);
    if (evento.anterior) identidades.push(evento.anterior.responsavel_id);
  }
  const nomes = useNomesTarefasA01(usuarioId, identidades);
  const mostrarNome = (id: string, registrado: string) =>
    nomes.data?.get(id) ?? nomeTarefa(id, registrado);
  const nomeNoHistorico = (id: string, registrado: string) =>
    nomeTarefa(id, registrado, nomes.data);
  const nomeUsuario =
    nomes.data?.get(usuarioId) ??
    responsaveis.data?.find((pessoa) => pessoa.id === usuarioId)?.nome ??
    "Nome não cadastrado";
  const alteraVisibilidade = admin || !existente || existente.criado_por === usuarioId;
  const podeEditar = (tarefa: TarefaA01) =>
    admin || tarefa.criado_por === usuarioId || tarefa.responsavel_id === usuarioId;

  const onError = (falha: Error) => {
    setErro(falha.message);
    void client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
  };
  const atualizar = useMutation({
    mutationFn: async ({
      tarefa,
      patch,
    }: {
      tarefa: TarefaA01;
      patch: Parameters<typeof atualizarTarefaA01>[1];
    }) => atualizarTarefaA01(tarefa, patch),
    onSuccess: async (_, { patch }) => {
      setEditarFechado();
      setConcluir(null);
      setMsg("concluida" in patch ? "Tarefa concluída." : "Tarefa atualizada.");
      await client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
    },
    onError,
  });
  const criar = useMutation({
    mutationFn: ({
      tarefa,
      origem,
    }: {
      tarefa: Parameters<typeof criarTarefaA01>[0];
      origem: TarefaA01["origem"];
    }) => criarTarefaA01(tarefa, origem),
    onSuccess: async () => {
      setEditarFechado();
      setMsg("Tarefa criada.");
      await client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
    },
    onError,
  });
  const excluirMutacao = useMutation({
    mutationFn: ({ tarefa, motivo }: { tarefa: TarefaA01; motivo: string }) =>
      excluirTarefaA01(tarefa, motivo),
    onSuccess: async () => {
      setExcluir(null);
      setMotivoExclusao("");
      setMsg("Tarefa excluída e enviada para a lixeira. O histórico foi preservado.");
      await client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
    },
    onError,
  });
  const restaurarMutacao = useMutation({
    mutationFn: (tarefa: TarefaA01) => restaurarTarefaA01(tarefa),
    onSuccess: async () => {
      setMsg("Tarefa restaurada com os dados originais.");
      await client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
    },
    onError,
  });
  const reabrirMutacao = useMutation({
    mutationFn: (tarefa: TarefaA01) => reabrirTarefaA01(tarefa),
    onSuccess: async () => {
      setMsg("Tarefa reaberta e devolvida para pendente.");
      await client.invalidateQueries({ queryKey: chaveTarefas(usuarioId) });
    },
    onError,
  });

  function setEditarFechado() {
    setEditando(null);
    limparSugestao?.();
    setErro("");
  }

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (criar.isPending || atualizar.isPending) return;
    setErro("");
    const form = new FormData(e.currentTarget);
    const titulo = String(form.get("titulo") ?? "").trim();
    const prioridade = String(
      form.get("prioridade") ?? sugestao?.prioridade ?? "normal",
    ) as PrioridadeA01;
    if (!titulo || !PRIORIDADES_A01.some(([valor]) => prioridade === valor)) {
      setErro("Informe um título e uma prioridade válida.");
      return;
    }
    const responsavel = sugestao
      ? String(form.get("responsavel") ?? usuarioId)
      : String(form.get("responsavel") ?? existente?.responsavel_id ?? usuarioId);
    const patch = {
      titulo,
      descricao: String(form.get("descricao") ?? "").trim(),
      prazo: String(form.get("prazo") ?? "") || null,
      prioridade,
      compartilhada: alteraVisibilidade
        ? form.has("compartilhada")
        : (existente?.compartilhada ?? false),
      responsavel_id: responsavel,
      ...(sugestao?.recomendacao_id
        ? {
            recomendacao_id: sugestao.recomendacao_id,
            rec_chave: sugestao.rec_chave ?? null,
            rec_ocorrencia: sugestao.rec_ocorrencia ?? null,
          }
        : {}),
    };
    if (existente) atualizar.mutate({ tarefa: existente, patch });
    else
      criar.mutate({
        tarefa: patch,
        // A regra da A01 exige confirmação do responsável quando a tarefa nasce
        // de sugestão; atribuída a outro funcionário, o registro é criado como
        // tarefa administrativa já vinculada à recomendação.
        origem: sugestao && responsavel === usuarioId ? "inteligencia" : "manual",
      });
  }

  const todas = consulta.isError ? undefined : consulta.data;
  const ativas = tarefasAtivas(todas);
  const pendentes = ativas.filter((tarefa) => !tarefa.concluida);
  const concluidas = [...ativas]
    .filter((tarefa) => tarefa.concluida)
    .sort((a, b) => Date.parse(b.concluida_em ?? "") - Date.parse(a.concluida_em ?? ""));
  const lixeira = tarefasLixeira(todas);
  const opcoesResponsaveis = new Map(
    todas?.map((tarefa) => [
      tarefa.responsavel_id,
      mostrarNome(tarefa.responsavel_id, tarefa.responsavel_nome),
    ]),
  );
  const selecionadas = (
    aba === "lixeira" ? lixeira : verConcluidas ? concluidas : pendentes
  ).filter((tarefa) => {
    if (filtroResponsavel && tarefa.responsavel_id !== filtroResponsavel) return false;
    if (filtroPrioridade && tarefa.prioridade !== filtroPrioridade) return false;
    if (filtroPrazo === "sem-prazo") return tarefa.prazo === null;
    if (filtroPrazo === "hoje") return tarefa.prazo === hoje;
    if (filtroPrazo === "atrasadas")
      return !tarefa.concluida && tarefa.prazo !== null && tarefa.prazo < hoje;
    return true;
  });

  return (
    <>
      <div className="neia-a01-tarefas-controles">
        <Button
          type="button"
          className="neia-a01-dourado"
          disabled={consulta.isError}
          onClick={() => {
            setErro("");
            setMsg("");
            setEditando("nova");
          }}
        >
          <Plus size={17} />
          Nova tarefa
        </Button>
        <div aria-label="Visibilidade por estado">
          <button
            type="button"
            aria-pressed={aba === "ativas" && !verConcluidas}
            onClick={() => {
              setAba("ativas");
              setVerConcluidas(false);
              setLimite(5);
            }}
          >
            Pendentes{pendentes ? " (" + pendentes.length + ")" : ""}
          </button>
          <button
            type="button"
            aria-pressed={aba === "ativas" && verConcluidas}
            onClick={() => {
              setAba("ativas");
              setVerConcluidas(true);
              setLimite(5);
            }}
          >
            Concluídas
          </button>
          {admin ? (
            <button
              type="button"
              aria-pressed={aba === "lixeira"}
              onClick={() => {
                setAba("lixeira");
                setLimite(5);
              }}
            >
              Lixeira{lixeira ? " (" + lixeira.length + ")" : ""}
            </button>
          ) : null}
        </div>
      </div>
      {painelCompleto && (
        <fieldset className="neia-a01-filtros-tarefas">
          <legend>Filtrar tarefas</legend>
          <label>
            Responsável
            <select
              value={filtroResponsavel}
              onChange={(e) => {
                setFiltroResponsavel(e.target.value);
                setLimite(5);
              }}
            >
              <option value="">Todos</option>
              {[...opcoesResponsaveis].map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prioridade
            <select
              value={filtroPrioridade}
              onChange={(e) => {
                setFiltroPrioridade(e.target.value);
                setLimite(5);
              }}
            >
              <option value="">Todas</option>
              {PRIORIDADES_A01.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prazo
            <select
              value={filtroPrazo}
              onChange={(e) => {
                setFiltroPrazo(e.target.value);
                setLimite(5);
              }}
            >
              <option value="">Todos</option>
              <option value="hoje">Hoje</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="sem-prazo">Sem prazo</option>
            </select>
          </label>
        </fieldset>
      )}
      {msg && (
        <p className="neia-a01-verde" role="status">
          {msg}
        </p>
      )}
      {consulta.isError ? (
        <div className="neia-a01-estado" role="alert">
          Falha ao carregar tarefas.{" "}
          <button type="button" onClick={() => void consulta.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : consulta.isPending ? (
        <p className="neia-a01-nota" role="status">
          Carregando tarefas…
        </p>
      ) : null}
      {selecionadas &&
        (selecionadas.length ? (
          <>
            <ul className="neia-a01-tarefas-lista">
              {selecionadas.slice(0, limite).map((tarefa) => {
                const atrasada = !tarefa.concluida && tarefa.prazo !== null && tarefa.prazo < hoje;
                return (
                  <li key={tarefa.id}>
                    <strong>{tarefa.titulo}</strong>
                    <p className="neia-a01-nota">
                      {tarefa.compartilhada ? "Compartilhada" : "Individual"} ·{" "}
                      {rotuloPrioridade(tarefa.prioridade)}
                    </p>
                    <p className={atrasada ? "neia-a01-vermelho" : "neia-a01-nota"}>
                      {atrasada ? "Atrasada · " : ""}
                      {tarefa.concluida_em
                        ? "Concluída em " + horario.format(new Date(tarefa.concluida_em))
                        : diaBR(tarefa.prazo)}
                    </p>
                    <p className="neia-a01-nota">
                      Criada por {mostrarNome(tarefa.criado_por, tarefa.criado_nome)}
                      <br />
                      Responsável {mostrarNome(tarefa.responsavel_id, tarefa.responsavel_nome)}
                    </p>
                    {tarefa.excluida && (
                      <p className="neia-a01-vermelho">
                        Excluída em {horario.format(new Date(tarefa.excluida_em ?? ""))} ·{" "}
                        {tarefa.excluida_motivo}
                      </p>
                    )}
                    {tarefa.descricao && (
                      <details>
                        <summary>Descrição</summary>
                        <p>{tarefa.descricao}</p>
                      </details>
                    )}
                    {tarefa.recomendacao_id && (
                      <p className="neia-a01-nota">
                        Vinculada à recomendação {tarefa.recomendacao_id} (ocorrência{" "}
                        {tarefa.rec_ocorrencia ?? 1}).
                      </p>
                    )}
                    {podeEditar(tarefa) && (
                      <div className="neia-a01-tarefas-botoes">
                        {!tarefa.concluida && !tarefa.excluida && (
                          <>
                            <Button
                              type="button"
                              size="default"
                              variant="ghost"
                              onClick={() => {
                                setErro("");
                                setMsg("");
                                setEditando(tarefa);
                              }}
                            >
                              <Pencil size={15} />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="default"
                              variant="ghost"
                              onClick={() => {
                                setErro("");
                                setMsg("");
                                setConcluir(tarefa);
                              }}
                            >
                              <Check size={16} />
                              Concluir
                            </Button>
                          </>
                        )}
                        {tarefa.concluida && !tarefa.excluida && (
                          <Button
                            type="button"
                            size="default"
                            variant="ghost"
                            disabled={reabrirMutacao.isPending}
                            onClick={() => {
                              setErro("");
                              setMsg("");
                              reabrirMutacao.mutate(tarefa);
                            }}
                          >
                            <Undo2 size={15} />
                            Reabrir
                          </Button>
                        )}
                        {admin && !tarefa.excluida && (
                          <Button
                            type="button"
                            size="default"
                            variant="ghost"
                            onClick={() => {
                              setErro("");
                              setMsg("");
                              setExcluir(tarefa);
                            }}
                          >
                            <Trash2 size={15} />
                            Excluir
                          </Button>
                        )}
                        {admin && tarefa.excluida && (
                          <Button
                            type="button"
                            size="default"
                            variant="ghost"
                            disabled={restaurarMutacao.isPending}
                            onClick={() => {
                              setErro("");
                              setMsg("");
                              restaurarMutacao.mutate(tarefa);
                            }}
                          >
                            <RotateCcw size={15} />
                            Restaurar
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="default"
                          variant="ghost"
                          onClick={() => setHistorico(tarefa)}
                        >
                          <History size={16} />
                          Histórico
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {selecionadas.length > limite && (
              <Button
                variant="outline"
                type="button"
                onClick={() => setLimite((valor) => valor + 5)}
              >
                Mostrar mais tarefas
              </Button>
            )}
          </>
        ) : (
          <p className="neia-a01-nota">
            {filtroResponsavel || filtroPrioridade || filtroPrazo
              ? "Nenhuma tarefa corresponde aos filtros."
              : aba === "lixeira"
                ? "A lixeira está vazia."
                : verConcluidas
                  ? "Nenhuma tarefa concluída."
                  : "Nenhuma tarefa pendente."}
          </p>
        ))}

      <Dialog
        open={editorAberto}
        onOpenChange={(aberto) => {
          if (!aberto && !criar.isPending && !atualizar.isPending) setEditarFechado();
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>
              {sugestao
                ? "Aprovar sugestão de tarefa"
                : existente
                  ? "Editar tarefa"
                  : "Nova tarefa"}
            </DialogTitle>
            <DialogDescription>
              {sugestao
                ? "Confira a sugestão e confirme o registro sob sua responsabilidade."
                : "Defina o que precisa ser feito e quem deve acompanhar."}
            </DialogDescription>
          </DialogHeader>
          {editorAberto && (
            <form className="neia-a01-form" onSubmit={salvar}>
              <label>
                Título{" "}
                <Input
                  name="titulo"
                  required
                  maxLength={160}
                  defaultValue={sugestao?.titulo ?? existente?.titulo ?? ""}
                />
              </label>
              <label>
                Descrição{" "}
                <Textarea
                  name="descricao"
                  maxLength={2000}
                  defaultValue={sugestao?.descricao ?? existente?.descricao ?? ""}
                />
              </label>
              <label>
                Prioridade{" "}
                <select
                  name="prioridade"
                  defaultValue={existente?.prioridade ?? sugestao?.prioridade ?? "normal"}
                >
                  {PRIORIDADES_A01.map(([id, rotulo]) => (
                    <option key={id} value={id}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo <Input type="date" name="prazo" defaultValue={existente?.prazo ?? ""} />
              </label>
              {admin ? (
                <label>
                  Responsável{" "}
                  <select name="responsavel" defaultValue={existente?.responsavel_id ?? usuarioId}>
                    <option value={usuarioId}>{nomeUsuario}</option>
                    {existente?.responsavel_id &&
                      existente.responsavel_id !== usuarioId &&
                      !responsaveis.data?.some((p) => p.id === existente.responsavel_id) && (
                        <option value={existente.responsavel_id}>
                          {mostrarNome(existente.responsavel_id, existente.responsavel_nome)}
                        </option>
                      )}
                    {responsaveis.data
                      ?.filter((p) => p.id !== usuarioId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {(p.nome ?? "Nome não cadastrado") + (p.funcao ? " · " + p.funcao : "")}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p>
                  Responsável:{" "}
                  {existente
                    ? mostrarNome(existente.responsavel_id, existente.responsavel_nome)
                    : nomeUsuario}
                </p>
              )}
              {admin &&
                !sugestao &&
                responsaveis.data?.some((p) => p.id !== usuarioId && !p.nome) && (
                  <p>O nome cadastrado no perfil identifica o responsável na lista.</p>
                )}
              {responsaveis.isError && admin && !sugestao && (
                <p className="neia-a01-vermelho">
                  Falha ao carregar a equipe.{" "}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void responsaveis.refetch()}
                  >
                    Tentar novamente
                  </Button>
                </p>
              )}
              {alteraVisibilidade && (
                <label className="neia-a01-compartilhar">
                  <input
                    type="checkbox"
                    name="compartilhada"
                    defaultChecked={existente?.compartilhada ?? false}
                  />
                  Compartilhar com a equipe
                </label>
              )}
              {erro && (
                <p role="alert" className="neia-a01-vermelho">
                  {erro}
                </p>
              )}
              <Button
                type="submit"
                variant={existente && !sugestao ? "outline" : "default"}
                className={existente && !sugestao ? undefined : "neia-a01-dourado"}
                disabled={criar.isPending || atualizar.isPending}
              >
                {sugestao ? "Aprovar e criar tarefa" : existente ? "Salvar tarefa" : "Criar tarefa"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!concluir}
        onOpenChange={(aberto) => {
          if (!aberto && !atualizar.isPending) {
            setConcluir(null);
            setErro("");
          }
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>{concluir?.titulo}</DialogDescription>
          </DialogHeader>
          {erro && (
            <p role="alert" className="neia-a01-vermelho">
              {erro}
            </p>
          )}
          <Button
            variant="outline"
            disabled={atualizar.isPending}
            onClick={() => {
              if (concluir) {
                setErro("");
                atualizar.mutate({ tarefa: concluir, patch: { concluida: true } });
              }
            }}
          >
            Confirmar conclusão
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!excluir}
        onOpenChange={(aberto) => {
          if (!aberto && !excluirMutacao.isPending) {
            setExcluir(null);
            setMotivoExclusao("");
            setErro("");
          }
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Excluir tarefa</DialogTitle>
            <DialogDescription>
              {excluir?.titulo} — a tarefa sai das listas ativas e vai para a lixeira. O histórico é
              preservado e a restauração devolve o registro com os dados originais.
            </DialogDescription>
          </DialogHeader>
          <form
            className="neia-a01-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              const motivo = motivoExclusao.trim();
              if (!motivo) {
                setErro("Informe o motivo da exclusão.");
                return;
              }
              if (excluir) excluirMutacao.mutate({ tarefa: excluir, motivo });
            }}
          >
            <label>
              Motivo da exclusão
              <Textarea
                name="motivo"
                maxLength={500}
                required
                value={motivoExclusao}
                onChange={(evento) => setMotivoExclusao(evento.target.value)}
              />
            </label>
            {erro && (
              <p role="alert" className="neia-a01-vermelho">
                {erro}
              </p>
            )}
            <Button type="submit" variant="outline" disabled={excluirMutacao.isPending}>
              {excluirMutacao.isPending ? "Excluindo…" : "Confirmar exclusão"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!historico}
        onOpenChange={(aberto) => {
          if (!aberto) setHistorico(null);
        }}
      >
        <DialogContent className="neia-a01-dialogo">
          <DialogHeader>
            <DialogTitle>Histórico de alterações</DialogTitle>
            <DialogDescription>{historico?.titulo}</DialogDescription>
          </DialogHeader>
          {eventos.isPending && <p role="status">Carregando histórico…</p>}
          {eventos.isError && (
            <p role="alert">
              Falha ao consultar o histórico.{" "}
              <Button variant="outline" onClick={() => void eventos.refetch()}>
                Tentar novamente
              </Button>
            </p>
          )}
          {eventos.data?.length ? (
            <ul className="neia-a01-notificacoes">
              {eventos.data.map((evento) => (
                <li key={evento.id}>
                  <strong>
                    {acaoHistorico[evento.acao]} ·{" "}
                    {nomeNoHistorico(evento.ator_id, evento.ator_nome)}
                  </strong>
                  <p>{horario.format(new Date(evento.ocorrido_em))}</p>
                  {mudancasTarefa(evento.anterior, evento.atual, nomeNoHistorico).map(
                    ([campo, anterior, atual]) => (
                      <p key={campo}>
                        {campo}: {anterior || "—"} → {atual || "—"}
                      </p>
                    ),
                  )}
                </li>
              ))}
            </ul>
          ) : (
            eventos.isSuccess && <p>Nenhuma alteração registrada.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PainelEquipeTarefasA01({
  usuarioId,
  admin,
}: {
  usuarioId: string;
  admin: boolean;
}) {
  const client = useQueryClient();
  const consulta = useTarefasA01(usuarioId);
  const perfil = useNomesTarefasA01(usuarioId, [usuarioId]);
  const [agora, setAgora] = useState(() => new Date());
  const [editarNome, setEditarNome] = useState(false);
  const hoje = hojeSP(agora);
  const atrasadas = tarefasAtrasadas(consulta.isError ? undefined : consulta.data, usuarioId, hoje);
  const nomeAtual = perfil.data?.get(usuarioId);

  useEffect(() => {
    const timer = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const salvarNome = useMutation({
    mutationFn: (nome: string) => salvarNomeTarefasA01(usuarioId, nome),
    onSuccess: (nome) => {
      client.setQueryData(
        ["dashboard-a01", usuarioId, "nomes-tarefas", [usuarioId]],
        new Map([[usuarioId, nome]]),
      );
      void client.invalidateQueries({ queryKey: ["dashboard-a01", usuarioId] });
      setEditarNome(false);
    },
  });

  return (
    <div className="neia-a01 neia-a01-tarefas-equipe">
      <header className="neia-a01-cabecalho">
        <div>
          <h1>Minhas tarefas</h1>
          {nomeAtual && <p>{nomeAtual}</p>}
        </div>
        {perfil.isSuccess && nomeAtual && (
          <Button type="button" variant="outline" onClick={() => setEditarNome((valor) => !valor)}>
            {editarNome ? "Fechar perfil" : "Editar nome do perfil"}
          </Button>
        )}
      </header>
      {perfil.isError && (
        <p role="alert">
          Falha ao consultar o perfil.{" "}
          <Button type="button" variant="outline" onClick={() => void perfil.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {perfil.isSuccess && (!nomeAtual || editarNome) && (
        <form
          className="neia-a01-cartao neia-a01-form neia-a01-perfil-tarefas"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!salvarNome.isPending)
              salvarNome.mutate(String(new FormData(evento.currentTarget).get("nome") ?? ""));
          }}
        >
          <label>
            Seu nome no ERP{" "}
            <Input
              name="nome"
              autoComplete="name"
              maxLength={160}
              required
              defaultValue={nomeAtual ?? ""}
            />
          </label>
          <p className="neia-a01-nota">
            O nome do perfil identifica suas tarefas e ações no histórico.
          </p>
          {salvarNome.isError && (
            <p role="alert" className="neia-a01-vermelho">
              {salvarNome.error.message}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={salvarNome.isPending}>
            Salvar nome
          </Button>
        </form>
      )}
      {atrasadas.length > 0 && (
        <p role="status" className="neia-a01-vermelho neia-a01-aviso-tarefas">
          {atrasadas.length === 1
            ? "Você tem 1 tarefa atrasada."
            : "Você tem " + atrasadas.length + " tarefas atrasadas."}
        </p>
      )}
      <section className="neia-a01-cartao" aria-label="Tarefas da equipe">
        <h2>
          <ClipboardList size={20} />
          Tarefas e histórico
        </h2>
        <TarefasA01
          usuarioId={usuarioId}
          admin={admin}
          hoje={hoje}
          consulta={consulta}
          painelCompleto
        />
      </section>
    </div>
  );
}
