/**
 * E3 — Liberação para cozinha + conferência final (integração preparada, DESATIVADA).
 *
 * Flags `VITE_FF_LIBERACAO_COZINHA` e `VITE_FF_CONFERENCIA_FINAL` (default "off"):
 * desligadas, nenhuma chamada remota é feita e os layouts seguem fictícios.
 * Escritas reais passam SOMENTE pelas RPCs da migration 0084. Este módulo
 * nunca grava direto em `pedidos` e nunca altera status/pagamento/promessa.
 */

function flag(nome: string): boolean {
  return (
    (typeof import.meta !== "undefined" &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.[nome]) === "on"
  );
}

export const E3_LIBERACAO_ATIVA = flag("VITE_FF_LIBERACAO_COZINHA");
export const E3_CONFERENCIA_ATIVA = flag("VITE_FF_CONFERENCIA_FINAL");

export type CodigoFluxo =
  | "ok"
  | "negado"
  | "inexistente"
  | "inelegivel"
  | "bloqueado"
  | "conflito"
  | "flag-desativada"
  | "erro-rede";

export type ResultadoFluxo = { ok: boolean; codigo: CodigoFluxo; detalhe: string };

export type PedidoLiberacao = {
  status: string;
  aceito_em_atendente: string | null;
  liberado_em: string | null;
  agendado_para: string | null;
};

export type PedidoConferencia = { status: string; conferido_em: string | null };

/** Pré-check local da liberação (quem decide é o banco). Em minutos. */
export function elegivelLiberacaoLocal(
  p: PedidoLiberacao,
  agoraMs: number,
  antecedenciaMin = 60,
): { elegivel: boolean; motivo: string } {
  if (p.status !== "recebido") return { elegivel: false, motivo: "fora de Novos/Aceitos" };
  if (!p.aceito_em_atendente) return { elegivel: false, motivo: "aceite ausente" };
  if (p.liberado_em) return { elegivel: false, motivo: "liberação duplicada" };
  if (p.agendado_para) {
    const janela = new Date(p.agendado_para).getTime() - antecedenciaMin * 60000;
    if (agoraMs < janela) return { elegivel: false, motivo: "agendado antes da janela" };
  }
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

/** Pré-check local da conferência (quem decide é o banco). */
export function elegivelConferenciaLocal(
  p: PedidoConferencia,
  confirmado: boolean,
): { elegivel: boolean; motivo: string } {
  if (p.status !== "em_producao") return { elegivel: false, motivo: "fora de Em preparo" };
  if (!confirmado) return { elegivel: false, motivo: "confirmação explícita ausente" };
  if (p.conferido_em) return { elegivel: false, motivo: "conferência duplicada" };
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

function mapear(data: unknown, error: unknown): ResultadoFluxo {
  if (error) return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  const linha = Array.isArray(data) ? (data[0] as { resultado?: string; detalhe?: string }) : null;
  const codigo = (linha?.resultado ?? "erro-rede") as CodigoFluxo;
  return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
}

export async function liberarPedidoCozinha(
  client: RpcClient,
  pedidoId: string,
  antecedenciaMin = 60,
): Promise<ResultadoFluxo> {
  if (!E3_LIBERACAO_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "liberação E3 desativada" };
  try {
    const { data, error } = await client.rpc("liberar_pedido_cozinha", {
      p_pedido_id: pedidoId,
      p_antecedencia_min: antecedenciaMin,
    });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}

export async function conferirPedidoCozinha(
  client: RpcClient,
  pedidoId: string,
  confirmado: boolean,
  obs?: string,
): Promise<ResultadoFluxo> {
  if (!E3_CONFERENCIA_ATIVA)
    return { ok: false, codigo: "flag-desativada", detalhe: "conferência E3 desativada" };
  try {
    const { data, error } = await client.rpc("conferir_pedido_cozinha", {
      p_pedido_id: pedidoId,
      p_confirmado: confirmado,
      p_obs: obs ?? null,
    });
    return mapear(data, error);
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}
