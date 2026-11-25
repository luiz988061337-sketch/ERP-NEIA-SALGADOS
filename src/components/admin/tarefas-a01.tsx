import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, History, Pencil, Plus } from "lucide-react";

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
  PRIORIDADES_A01,
  useHistoricoTarefaA01,
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
};

const horario = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const diaBR = (s: string | null) => s?.split("-").reverse().join("/") ?? "Sem prazo";
const rotuloPrioridade = (s: string) => PRIORIDADES_A01.find(([id]) => s === id)?.[1] ?? s;

function mudancasTarefa(anterior: TarefaA01 | null, atual: TarefaA01) {
  if (!anterior) return [];
  const campos = [
    ["Título", anterior.titulo, atual.titulo],
    ["Descrição", anterior.descricao, atual.descricao],
    ["Prioridade", rotuloPrioridade(anterior.prioridade), rotuloPrioridade(atual.prioridade)],
    ["Prazo", diaBR(anterior.prazo), diaBR(atual.prazo)],
    ["Responsável", anterior.responsavel_nome, atual.responsavel_nome],
    [
      "Visibilidade",
      anterior.compartilhada ? "Compartilhada" : "Individual",
      atual.compartilhada ? "Compartilhada" : "Individual",
    ],
  ];
  return campos.filter(([, antes, depois]) => antes !== depois);
}

type Props = {
  usuarioId: string;
  admin: boolean;
  hoje: string;
  consulta: ReturnType<typeof useTarefasA01>;
  sugestao?: SugestaoTarefaA01 | null;
  limparSugestao?: () => void;
};

export function TarefasA01({ usuarioId, admin, hoje, consulta, sugestao, limparSugestao }: Props) {
  const client = useQueryClient();
  const [verConcluidas, setVerConcluidas] = useState(false);
  const [limite, setLimite] = useState(5);
  const [editando, setEditando] = useState<TarefaA01 | "nova" | null>(null);
  const [concluir, setConcluir] = useState<TarefaA01 | null>(null);
  const [historico, setHistorico] = useState<TarefaA01 | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const editorAberto = !!editando || !!sugestao;
  const existente = editando && editando !== "nova" ? editando : null;
  const responsaveis = useResponsaveisA01(usuarioId, admin && editorAberto && !sugestao);
  const eventos = useHistoricoTarefaA01(usuarioId, historico?.id);
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
    const prioridade = String(form.get("prioridade") ?? "normal") as PrioridadeA01;
    if (!titulo || !PRIORIDADES_A01.some(([valor]) => prioridade === valor)) {
      setErro("Informe um título e uma prioridade válida.");
      return;
    }
    const patch = {
      titulo,
      descricao: String(form.get("descricao") ?? "").trim(),
      prazo: String(form.get("prazo") ?? "") || null,
      prioridade,
      compartilhada: alteraVisibilidade
        ? form.has("compartilhada")
        : (existente?.compartilhada ?? false),
      responsavel_id: sugestao
        ? usuarioId
        : String(form.get("responsavel") ?? existente?.responsavel_id ?? usuarioId),
    };
    if (existente) atualizar.mutate({ tarefa: existente, patch });
    else criar.mutate({ tarefa: patch, origem: sugestao ? "inteligencia" : "manual" });
  }

  const todas = consulta.isError ? undefined : consulta.data;
  const pendentes = todas?.filter((tarefa) => !tarefa.concluida);
  const concluidas = todas
    ?.filter((tarefa) => tarefa.concluida)
    .sort((a, b) => Date.parse(b.concluida_em ?? "") - Date.parse(a.concluida_em ?? ""));
  const selecionadas = verConcluidas ? concluidas : pendentes;

  return (
    <>
      <div className="neia-a01-tarefas-controles">
        <Button
          type="button"
          variant="outline"
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
            aria-pressed={!verConcluidas}
            onClick={() => {
              setVerConcluidas(false);
              setLimite(5);
            }}
          >
            Pendentes{pendentes ? " (" + pendentes.length + ")" : ""}
          </button>
          <button
            type="button"
            aria-pressed={verConcluidas}
            onClick={() => {
              setVerConcluidas(true);
              setLimite(5);
            }}
          >
            Concluídas
          </button>
        </div>
      </div>
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
                      Criada por {tarefa.criado_nome}
                      <br />
                      Responsável {tarefa.responsavel_nome}
                    </p>
                    {tarefa.descricao && (
                      <details>
                        <summary>Descrição</summary>
                        <p>{tarefa.descricao}</p>
                      </details>
                    )}
                    {podeEditar(tarefa) && (
                      <div className="neia-a01-tarefas-botoes">
                        {!tarefa.concluida && (
                          <>
                            <Button
                              type="button"
                              size="sm"
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
                              size="sm"
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
                        <Button
                          type="button"
                          size="sm"
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
            {verConcluidas ? "Nenhuma tarefa concluída." : "Nenhuma tarefa pendente."}
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
                <select name="prioridade" defaultValue={existente?.prioridade ?? "normal"}>
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
              {admin && !sugestao ? (
                <label>
                  Responsável{" "}
                  <select name="responsavel" defaultValue={existente?.responsavel_id ?? usuarioId}>
                    <option value={usuarioId}>Eu</option>
                    {existente?.responsavel_id &&
                      existente.responsavel_id !== usuarioId &&
                      !responsaveis.data?.some((p) => p.id === existente.responsavel_id) && (
                        <option value={existente.responsavel_id}>
                          {existente.responsavel_nome}
                        </option>
                      )}
                    {responsaveis.data
                      ?.filter((p) => p.id !== usuarioId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p>Responsável: {existente?.responsavel_nome ?? "Você"}</p>
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
                className="neia-a01-dourado"
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
            className="neia-a01-dourado"
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
                    {acaoHistorico[evento.acao]} · {evento.ator_nome}
                  </strong>
                  <p>{horario.format(new Date(evento.ocorrido_em))}</p>
                  {mudancasTarefa(evento.anterior, evento.atual).map(([campo, anterior, atual]) => (
                    <p key={campo}>
                      {campo}: {anterior || "—"} → {atual || "—"}
                    </p>
                  ))}
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
  const consulta = useTarefasA01(usuarioId);
  const [agora, setAgora] = useState(() => new Date());
  return (
    <div className="neia-a01 neia-a01-tarefas-equipe">
      <header className="neia-a01-cabecalho">
        <div>
          <h1>Minhas tarefas</h1>
          <p>Responsabilidades da operação Néia Salgados</p>
        </div>
        <Link to="/admin" hash="dashboard">
          Voltar
        </Link>
      </header>
      <section
        className="neia-a01-cartao"
        aria-label="Tarefas da equipe"
        onFocus={() => setAgora(new Date())}
      >
        <h2>
          <ClipboardList size={20} />
          Tarefas e histórico
        </h2>
        <TarefasA01 usuarioId={usuarioId} admin={admin} hoje={hojeSP(agora)} consulta={consulta} />
      </section>
    </div>
  );
}
