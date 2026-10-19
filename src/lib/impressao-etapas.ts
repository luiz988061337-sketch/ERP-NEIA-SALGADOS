/**
 * E6 — Impressão TANCA por etapa (integração preparada, DESATIVADA).
 *
 * Flag `VITE_FF_IMPRESSAO_ETAPA` (default "off"): desligada, nenhuma chamada
 * remota; impressão existente inalterada. Escritas reais passam SOMENTE
 * pelas RPCs da migration 0084, que usam a mesma `fila_impressao` e os
 * mesmos tipos/status do print-agent. Sem segundo sistema de impressão.
 */

function flag(nome: string): boolean {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.[nome]) === "on"
  );
}

export const E6_IMPRESSAO_ATIVA = flag("VITE_FF_IMPRESSAO_ETAPA");

export type EventoImpressao = "aceito" | "liberado" | "conferido" | "retirada" | "despacho";

/** Mapa evento → comportamento (evita duplicar a mesma necessidade). */
export const MAPA_EVENTO_IMPRESSAO: Record<EventoImpressao, { tipo: string; automatico: boolean }> = {
  aceito: { tipo: "pedido", automatico: false },
  liberado: { tipo: "ficha_cozinha", automatico: true },
  conferido: { tipo: "ficha_cozinha", automatico: false },
  retirada: { tipo: "pedido", automatico: false },
  despacho: { tipo: "pedido", automatico: false },
};

/** uuid determinístico por evento (retry/clique duplo não duplicam). */
export function trabalhoUuid(pedidoId: string, evento: EventoImpressao): string {
  const tipo = MAPA_EVENTO_IMPRESSAO[evento].tipo;
  return `${pedidoId}:${tipo === "ficha_cozinha" ? "ficha" : "pedido"}:${evento}`;
}

export type CodigoImp = "ok" | "ignorado" | "conflito" | "negado" | "inexistente" | "inelegivel" | "bloqueado" | "flag-desativada" | "erro-rede";
export type ResultadoImp = { ok: boolean; codigo: CodigoImp; detalhe: string };

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function mapear(data: unknown, error: unknown): ResultadoImp {
  if (error) return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  const linha = Array.isArray(data) ? (data[0] as { resultado?: string; detalhe?: string }) : null;
  const codigo = (linha?.resultado ?? "erro-rede") as CodigoImp;
  return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
}

export async function enfileirarEvento(client: RpcClient, pedidoId: string, evento: EventoImpressao): Promise<ResultadoImp> {
  if (!E6_IMPRESSAO_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "impressão E6 desativada" };
  try {
    const { data, error } = await client.rpc("enfileirar_evento_cozinha", {
      p_pedido_id: pedidoId,
      p_evento: evento,
    });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}

export async function solicitarReimpressao(
  client: RpcClient,
  pedidoId: string,
  motivo: string,
  tipo: "pedido" | "ficha_cozinha" = "pedido",
  idempotencia?: string,
): Promise<ResultadoImp> {
  if (!motivo.trim())
    return { ok: false, codigo: "bloqueado", detalhe: "motivo obrigatório (pré-check local)" };
  if (!E6_IMPRESSAO_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "impressão E6 desativada" };
  try {
    const { data, error } = await client.rpc("solicitar_reimpressao", {
      p_pedido_id: pedidoId,
      p_motivo: motivo.trim(),
      p_tipo: tipo,
      p_idempotencia: idempotencia ?? null,
    });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}
