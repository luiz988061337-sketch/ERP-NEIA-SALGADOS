/**
 * Fonte financeira única para apresentação dos recebimentos de um pedido.
 *
 * Esta camada apenas LÊ `public.pedido_pagamento_eventos` (o ledger gravado
 * pelas migrations 0106/0139/0142). Não insere, atualiza nem estorna lançamentos:
 * a correção aqui é exclusivamente de apresentação. A soma canônica replicada
 * aqui (+ pagamento / - estorno) é a mesma usada pelas RPCs do banco, para que
 * painel, histórico, relatórios e exportações não discordem nem dupliquem
 * lançamentos.
 *
 * RLS do ledger continua intacta: admin/financeiro leem diretamente. Perfis sem
 * acesso recebem `disponivel = false` e uma mensagem explícita — nunca a
 * afirmação incorreta de que "não há valor recebido".
 *
 * A 0142 acrescenta colunas de forma efetiva/entregue/troco. Elas são lidas com
 * `select('*')` e tratadas como ausentes quando a migration ainda não foi
 * aplicada: nenhum registro anterior é reescrito e nenhum dado é inventado.
 */
import { brl, dataHora, PAGAMENTO_LABEL } from "@/lib/format";

export type EventoLedgerPedido = {
  id: string;
  pedido_id: string;
  tipo: "pagamento" | "estorno" | string;
  valor_centavos: number;
  forma_pagamento: string | null;
  forma_pagamento_efetiva?: string | null;
  valor_entregue_centavos?: number | null;
  troco_centavos?: number | null;
  chave_idempotencia: string | null;
  motivo: string | null;
  actor: string | null;
  created_at: string;
  autorNome?: string | null;
};

export type ResumoRecebimentosPedido = {
  pedidoId: string;
  totalCentavos: number;
  /** Líquido canônico: pagamentos - estornos (idêntico ao SQL da 0106/0139). */
  pagoCentavos: number;
  estornadoCentavos: number;
  saldoCentavos: number;
  quitado: boolean;
  eventos: EventoLedgerPedido[];
  trocoRegistradoCentavos: number;
  /** false quando o perfil não consegue ler o ledger (RLS) ou a consulta falha. */
  disponivel: boolean;
};

/** Cliente mínimo compatível com o PostgREST usado pelo front. */
type ClienteLedger = {
  from: (tabela: string) => any;
};

/** Soma canônica. Nunca arredonda valores já gravados em centavos. */
export function resumirRecebimentosPedido(
  pedidoId: string,
  eventos: readonly EventoLedgerPedido[],
  totalCentavos: number,
  disponivel = true,
): ResumoRecebimentosPedido {
  let pagoCentavos = 0;
  let estornadoCentavos = 0;
  let trocoRegistradoCentavos = 0;
  for (const evento of eventos) {
    const valor = Number(evento.valor_centavos) || 0;
    if (evento.tipo === "pagamento") {
      pagoCentavos += valor;
    } else {
      if (evento.tipo === "estorno") estornadoCentavos += valor;
      pagoCentavos -= valor;
    }
    trocoRegistradoCentavos += Number(evento.troco_centavos) || 0;
  }
  const total = Number(totalCentavos) || 0;
  return {
    pedidoId,
    totalCentavos: total,
    pagoCentavos,
    estornadoCentavos,
    saldoCentavos: Math.max(0, total - pagoCentavos),
    quitado: total > 0 && pagoCentavos >= total,
    eventos: [...eventos],
    trocoRegistradoCentavos,
    disponivel,
  };
}

/** Resolve actor → nome de perfil sem alterar RLS nem gravar nada. */
async function anexarNomes(
  cliente: ClienteLedger,
  eventos: EventoLedgerPedido[],
): Promise<EventoLedgerPedido[]> {
  const ids = [...new Set(eventos.map((e) => e.actor).filter((id): id is string => !!id))];
  if (!ids.length) return eventos;
  const { data: perfis } = await cliente.from("profiles").select("id, nome").in("id", ids);
  const nomes = new Map<string, string>(
    ((perfis ?? []) as Array<{ id: string; nome: string | null }>).map((p) => [p.id, p.nome ?? ""]),
  );
  return eventos.map((e) => ({
    ...e,
    autorNome: e.actor ? nomes.get(e.actor) || "Identificação indisponível" : null,
  }));
}

/** Um pedido. Usado na aba Pagamento, na Central e nos diálogos do H02. */
export async function carregarRecebimentosPedido(
  cliente: ClienteLedger,
  pedidoId: string,
  totalCentavos: number,
): Promise<ResumoRecebimentosPedido> {
  const { data, error } = await cliente
    .from("pedido_pagamento_eventos")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return resumirRecebimentosPedido(pedidoId, [], totalCentavos, false);
  const eventos = await anexarNomes(cliente, (data ?? []) as EventoLedgerPedido[]);
  return resumirRecebimentosPedido(pedidoId, eventos, totalCentavos, true);
}

/**
 * Vários pedidos de uma vez, para Histórico/relatórios/exportações.
 * Nenhum pedido é duplicado: cada evento do ledger aparece em uma única linha.
 */
export async function carregarEventosLedgerPorPedido(
  cliente: ClienteLedger,
  pedidoIds: readonly string[],
): Promise<{ porPedido: Record<string, EventoLedgerPedido[]>; disponivel: boolean }> {
  const ids = [...new Set(pedidoIds.filter(Boolean))];
  const porPedido: Record<string, EventoLedgerPedido[]> = {};
  if (!ids.length) return { porPedido, disponivel: true };
  const todos: EventoLedgerPedido[] = [];
  // Lotes pequenos evitam URL longa e mantêm o comportamento paginado do PostgREST.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await cliente
      .from("pedido_pagamento_eventos")
      .select("*")
      .in("pedido_id", ids.slice(i, i + 200))
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) return { porPedido: {}, disponivel: false };
    todos.push(...((data ?? []) as EventoLedgerPedido[]));
  }
  const comNomes = await anexarNomes(cliente, todos);
  for (const evento of comNomes) {
    (porPedido[evento.pedido_id] ??= []).push(evento);
  }
  return { porPedido, disponivel: true };
}

export function rotuloFormaLedger(forma: string | null | undefined): string {
  if (!forma) return "Não informado";
  return PAGAMENTO_LABEL[forma] ?? forma;
}

export function rotuloTipoLedger(tipo: string): string {
  return tipo === "estorno" ? "Estorno" : "Pagamento";
}

/** A preferência da criação continua visível, sem ser confundida com a forma usada. */
export function rotuloFormaOriginal(forma: string | null | undefined): string {
  return `${rotuloFormaLedger(forma)} (preferência original)`;
}

/** Só afirma a forma efetiva quando ela foi gravada no lançamento (0142). */
export function rotuloFormaEfetiva(evento: EventoLedgerPedido): string {
  return evento.forma_pagamento_efetiva
    ? rotuloFormaLedger(evento.forma_pagamento_efetiva)
    : "Não registrada neste lançamento";
}

/** Troco: somente quando registrado; nunca deduzido da preferência original. */
export function rotuloTrocoLedger(evento: EventoLedgerPedido): string {
  return evento.troco_centavos == null ? TROCO_NAO_REGISTRADO : brl(Number(evento.troco_centavos) / 100);
}

/** Linha padronizada para CSV/relatórios. Um evento = uma linha. */
export function linhasRecebimentosParaCSV(
  resumo: ResumoRecebimentosPedido,
  numero?: number | null,
  formaOriginal?: string | null,
): Array<Record<string, string | number>> {
  return resumo.eventos.map((evento) => ({
    pedido_id: resumo.pedidoId,
    numero: numero ?? "",
    tipo: rotuloTipoLedger(evento.tipo),
    forma_original: formaOriginal ? rotuloFormaLedger(formaOriginal) : "",
    forma_efetiva: rotuloFormaEfetiva(evento),
    valor_centavos: evento.valor_centavos,
    valor_reais: brl(Number(evento.valor_centavos || 0) / 100),
    valor_entregue_centavos: evento.valor_entregue_centavos ?? "",
    troco_centavos: evento.troco_centavos ?? "",
    data_hora: dataHora(evento.created_at),
    responsavel: evento.autorNome || "Identificação indisponível",
    motivo: evento.motivo || "",
    chave_idempotencia: evento.chave_idempotencia || "",
  }));
}

/**
 * Lançamentos anteriores à 0142 não gravaram troco. Mostrar um valor deduzido
 * seria inventar dado financeiro; o texto abaixo é usado em todos os painéis.
 */
export const TROCO_NAO_REGISTRADO = "Não registrado no lançamento";
