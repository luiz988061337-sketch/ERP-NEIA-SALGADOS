/**
 * E8 — Sincronização dos três painéis (arquitetura preparada, sem ativação).
 *
 * Fonte única: `pedidos` (+ `motoboys`, `rotas_entrega`, `entrega_atrasos`).
 * Nenhuma tabela paralela de pedidos. Etapas finas derivadas das colunas
 * E1–E7. Este módulo é puro (sem rede): canais/polling vivem nas rotas.
 * Reutiliza os canais existentes; nada de novo sem necessidade.
 *
 * Canais existentes (leitura de código):
 * - producao: "producao-fila" ON pedidos.* + polling 15s + removeChannel.
 * - central: "central-entregas-pedidos" ON pedidos.* (5 chaves) e motoboys.*
 *   + removeChannel; sem polling (gap → fallback proposto, não criado).
 * - motoboy: "motoboy-geral" ON pedidos.* + GPS 15s com online/offline,
 *   visibilitychange e fila offline.
 * - atendente: SEM subscription e SEM polling de pedidos (gap registrado).
 * - admin-topbar: ping de conexão 60s (padrão de "online" da UI).
 */

export const CANAIS = {
  producao: { nome: "producao-fila", tabelas: ["pedidos"], pollingMs: 15000 },
  central: { nome: "central-entregas-pedidos", tabelas: ["pedidos", "motoboys"], pollingMs: 30000 },
  motoboy: { nome: "motoboy-geral", tabelas: ["pedidos"], pollingMs: 15000 },
  atendente: { nome: "atendente-pedidos", tabelas: ["pedidos"], pollingMs: 30000 },
} as const;

/** Limite para considerar a conexão desatualizada (3× o polling da produção). */
export const LIMITE_DESATUALIZADO_MS = 45000;

export type LinhaPedido = {
  id: string;
  status: string;
  tipo_entrega: string;
  motoboy_id: string | null;
  aceito_em_atendente: string | null;
  liberado_em: string | null;
  conferido_em: string | null;
  retirado_em: string | null;
  agendado_para: string | null;
  atrasado: boolean;
};

/** Visão da Atendente derivada da mesma linha (K9, sem duplicar). */
export function visaoAtendente(p: LinhaPedido): string {
  if (p.status === "cancelado") return "cancelados";
  if (p.status === "entregue") return "concluidos";
  if (p.status === "em_rota") return "entrega";
  if (p.status === "aguardando_motoboy") return p.motoboy_id ? "entrega" : "prontos";
  if (p.status === "pronto") return "prontos";
  if (p.status === "em_producao") return "producao";
  if (!p.aceito_em_atendente) return "novos";
  if (!p.liberado_em) return "aceitos";
  return "aceitos";
}

/** Visão da Produção derivada da mesma linha (K7.2). */
export function visaoProducao(p: LinhaPedido): string {
  if (p.status === "em_producao") return "preparo";
  if (p.status === "pronto") return "finalizados";
  if (p.status === "recebido") return "proximos";
  return "finalizados";
}

/** Visão da Central derivada da mesma linha (K8.2). */
export function visaoCentral(p: LinhaPedido): string {
  if (p.tipo_entrega === "retirada") return p.status === "entregue" ? "entregues" : "aguardando";
  if (p.status === "entregue") return "entregues";
  if (p.status === "em_rota") return "rota";
  if (p.status === "aguardando_motoboy") return p.motoboy_id ? "atribuidos" : "aguardando";
  if (p.status === "pronto") return "aguardando";
  return "aguardando";
}

export type Contadores = {
  novos: number;
  aceitos: number;
  agendados: number;
  producao: number;
  prontos: number;
  aguardandoMotoboy: number;
  emRota: number;
  entregues: number;
  atrasados: number;
  motoboysDisponiveis: number;
};

/** Contadores unificados: mesma origem dos cartões (sem divergência). */
export function contadores(
  pedidos: LinhaPedido[],
  motoboysDisponiveis: number,
): Contadores {
  const c: Contadores = {
    novos: 0, aceitos: 0, agendados: 0, producao: 0, prontos: 0,
    aguardandoMotoboy: 0, emRota: 0, entregues: 0, atrasados: 0,
    motoboysDisponiveis,
  };
  for (const p of pedidos) {
    const a = visaoAtendente(p);
    if (a === "novos") c.novos += 1;
    if (a === "aceitos") c.aceitos += 1;
    if (p.agendado_para && p.status !== "entregue" && p.status !== "cancelado") c.agendados += 1;
    if (a === "producao") c.producao += 1;
    if (a === "prontos") c.prontos += 1;
    const k = visaoCentral(p);
    if (k === "aguardando" && p.tipo_entrega === "entrega" && p.status !== "entregue") c.aguardandoMotoboy += 1;
    if (k === "rota") c.emRota += 1;
    if (k === "entregues") c.entregues += 1;
    if (p.atrasado && p.status !== "entregue" && p.status !== "cancelado") c.atrasados += 1;
  }
  return c;
}

/** Chave de dedupe de evento Realtime (repetido não re-executa ação). */
export function chaveEvento(tabela: string, id: string, commitTs: string): string {
  return `${tabela}:${id}:${commitTs}`;
}

/** Evento já visto dentro da janela (memória local do painel). */
export function jaVisto(vistos: string[], chave: string, limite = 200): boolean {
  return vistos.slice(-limite).includes(chave);
}

/** Conexão desatualizada quando o último sucesso passou do limite. */
export function conexaoDesatualizada(ultimoSucessoMs: number | null, agoraMs: number): boolean {
  if (ultimoSucessoMs == null) return true;
  return agoraMs - ultimoSucessoMs > LIMITE_DESATUALIZADO_MS;
}

/** Namespaces de uuid de impressão nunca colidem (E7 §7 resolvido). */
export function namespacesImpressao(): string[] {
  return [":pedido", ":ficha:liberado", ":reimp:"];
}
