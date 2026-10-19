/**
 * E5 — Motoboy, retirada e finalização (integração preparada, DESATIVADA).
 *
 * Flags `VITE_FF_RETIRADA` e `VITE_FF_FLUXO_MOTOBOY` (default "off"):
 * desligadas, nenhuma chamada remota; layouts seguem fictícios.
 * Escritas reais passam SOMENTE pelas RPCs da migration 0084.
 * Atribuição (E4) ≠ aceite do motoboy (E5) ≠ saída/entrega (fluxo existente).
 */

function flag(nome: string): boolean {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.[nome]) === "on"
  );
}

export const E5_RETIRADA_ATIVA = flag("VITE_FF_RETIRADA");
export const E5_FLUXO_MOTOBOY_ATIVO = flag("VITE_FF_FLUXO_MOTOBOY");

export type CodigoFim =
  | "ok"
  | "negado"
  | "inexistente"
  | "inelegivel"
  | "bloqueado"
  | "conflito"
  | "flag-desativada"
  | "erro-rede";

export type ResultadoFim = { ok: boolean; codigo: CodigoFim; detalhe: string };

export type PedidoAceiteMoto = {
  status: string;
  motoboy_id: string | null;
  aceito_motoboy_em: string | null;
  operador_uid: string;
  operador_eh_admin: boolean;
};

export type PedidoRetirada = {
  status: string;
  tipo_entrega: string;
  conferido_em: string | null;
  retirado_em: string | null;
};

/** Pré-check do aceite explícito (quem decide é o banco). */
export function elegivelAceiteMoto(p: PedidoAceiteMoto): { elegivel: boolean; motivo: string } {
  if (p.status !== "aguardando_motoboy") return { elegivel: false, motivo: "fora de Aguardando Motoboy" };
  if (!p.motoboy_id) return { elegivel: false, motivo: "sem atribuição" };
  if (p.motoboy_id !== p.operador_uid && !p.operador_eh_admin)
    return { elegivel: false, motivo: "pedido de outro motoboy" };
  if (p.aceito_motoboy_em) return { elegivel: false, motivo: "aceite duplicado" };
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

/** Pré-check da retirada física (quem decide é o banco). */
export function elegivelRetirada(
  p: PedidoRetirada,
  exigirConferencia: boolean,
): { elegivel: boolean; motivo: string } {
  if (p.tipo_entrega !== "retirada") return { elegivel: false, motivo: "entrega usa fluxo de motoboy" };
  if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
  if (exigirConferencia && !p.conferido_em) return { elegivel: false, motivo: "conferencia ausente" };
  if (p.retirado_em) return { elegivel: false, motivo: "retirada duplicada" };
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function mapear(data: unknown, error: unknown): ResultadoFim {
  if (error) return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  const linha = Array.isArray(data) ? (data[0] as { resultado?: string; detalhe?: string }) : null;
  const codigo = (linha?.resultado ?? "erro-rede") as CodigoFim;
  return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
}

export async function aceitarEntregaMotoboy(client: RpcClient, pedidoId: string): Promise<ResultadoFim> {
  if (!E5_FLUXO_MOTOBOY_ATIVO)
    return { ok: false, codigo: "flag-desativada", detalhe: "fluxo motoboy E5 desativado" };
  try {
    const { data, error } = await client.rpc("aceitar_entrega_motoboy", { p_pedido_id: pedidoId });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}

export async function retirarPedidoCliente(
  client: RpcClient,
  pedidoId: string,
  exigirConferencia = false,
): Promise<ResultadoFim> {
  if (!E5_RETIRADA_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "retirada E5 desativada" };
  try {
    const { data, error } = await client.rpc("retirar_pedido_cliente", {
      p_pedido_id: pedidoId,
      p_exigir_conferencia: exigirConferencia,
    });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}
