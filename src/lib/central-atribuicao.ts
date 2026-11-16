/**
 * E4 — Reserva e atribuição transacional (integração preparada, DESATIVADA).
 *
 * Flag `VITE_FF_ATRIBUICAO_TX` (default "off"): desligada, nenhuma chamada
 * remota; layouts seguem fictícios. Escritas reais passam SOMENTE pela RPC
 * `atribuir_pedido_motoboy` (migration 0084). Identidade canônica:
 * pedidos.motoboy_id = auth.users.id; rotas_entrega.motoboy_id = motoboys.id;
 * ponte = motoboys.user_id. Nunca misturar.
 */

function flag(nome: string): boolean {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.[nome]) === "on"
  );
}

export const E4_ATRIBUICAO_ATIVA = flag("VITE_FF_ATRIBUICAO_TX");

export type CodigoAtribuicao =
  | "ok"
  | "negado"
  | "inexistente"
  | "inelegivel"
  | "bloqueado"
  | "conflito"
  | "flag-desativada"
  | "erro-rede";

export type ResultadoAtribuicao = { ok: boolean; codigo: CodigoAtribuicao; detalhe: string };

export type PedidoAtribuicao = {
  status: string;
  tipo_entrega: string;
  motoboy_id: string | null;
  conferido_em: string | null;
  emRotaAtiva: boolean;
};

export type MotoboyAtribuicao = { id: string; user_id: string | null; status: string };

/** Pré-check local (quem decide é o banco). */
export function elegivelAtribuicaoLocal(
  p: PedidoAtribuicao,
  m: MotoboyAtribuicao,
  exigirConferencia: boolean,
): { elegivel: boolean; motivo: string } {
  if (p.tipo_entrega !== "entrega") return { elegivel: false, motivo: "retirada sem motoboy" };
  if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
  if (exigirConferencia && !p.conferido_em) return { elegivel: false, motivo: "conferencia ausente" };
  if (p.motoboy_id) return { elegivel: false, motivo: "atribuição duplicada" };
  if (p.emRotaAtiva) return { elegivel: false, motivo: "pedido em rota ativa" };
  if (!m.user_id) return { elegivel: false, motivo: "motoboy sem vínculo" };
  if (m.status !== "disponivel_base") return { elegivel: false, motivo: "motoboy indisponível" };
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

/** Limite de rota: 3 paradas; 4ª+ só com autorização explícita auditável. */
export function cabeNaRota(paradas: number, autorizarExtra: boolean): boolean {
  if (paradas < 0) return false;
  if (paradas < 3) return true;
  return autorizarExtra;
}

/** Executa uma atribuição em lote em sequência e devolve resultados reais por pedido. */
export async function atribuirPedidosEmLote(
  pedidoIds: readonly string[],
  atribuir: (pedidoId: string) => Promise<boolean>,
): Promise<{ solicitados: number; atribuidos: string[]; falhas: string[] }> {
  const unicos = [...new Set(pedidoIds.map((id) => id.trim()).filter(Boolean))];
  const atribuidos: string[] = [];
  const falhas: string[] = [];
  for (const pedidoId of unicos) {
    try {
      if (await atribuir(pedidoId)) atribuidos.push(pedidoId);
      else falhas.push(pedidoId);
    } catch {
      falhas.push(pedidoId);
    }
  }
  return { solicitados: unicos.length, atribuidos, falhas };
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function atribuirPedidoMotoboy(
  client: RpcClient,
  pedidoId: string,
  motoboyId: string,
  opts?: { autorizarExtra?: boolean; exigirConferencia?: boolean },
): Promise<ResultadoAtribuicao> {
  if (!E4_ATRIBUICAO_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "atribuição E4 desativada" };
  try {
    const { data, error } = await client.rpc("atribuir_pedido_motoboy", {
      p_pedido_id: pedidoId,
      p_motoboy_id: motoboyId,
      p_autorizar_extra: opts?.autorizarExtra ?? false,
      p_exigir_conferencia: opts?.exigirConferencia ?? false,
    });
    if (error) return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
    const linha = Array.isArray(data) ? (data[0] as { resultado?: string; detalhe?: string }) : null;
    const codigo = (linha?.resultado ?? "erro-rede") as CodigoAtribuicao;
    return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}
