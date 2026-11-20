/**
 * E2 — Aceite da atendente (integração preparada, DESATIVADA).
 *
 * Feature flag `VITE_FF_ACEITE_ATENDENTE` (default "off"): enquanto desligada,
 * nenhuma chamada remota é feita e o layout K9 segue 100% fictício.
 * As escritas reais passam SOMENTE pela RPC `aceitar_pedido_atendente`
 * (migration 0084, claim atômico). Este módulo nunca grava direto em `pedidos`.
 *
 * FUNC-01-B2: `executarAceiteAtendente` liga o botão da Central da Atendente a
 * essa RPC. No teste local explicitamente marcado, o cliente é o adaptador em
 * memória; em ambiente real, a chamada exige a flag E2 ligada e nunca é
 * simulada se a RPC falhar.
 */

import { ehModoTesteLocal } from "@/lib/isolamento-local";

export const E2_ACEITE_ATENDENTE_ATIVO =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.["VITE_FF_ACEITE_ATENDENTE"]) ===
  "on";

export type CodigoAceite =
  | "ok"
  | "negado"
  | "inexistente"
  | "inelegivel"
  | "conflito"
  | "flag-desativada"
  | "erro-rede";

export type ResultadoAceite = { ok: boolean; codigo: CodigoAceite; detalhe: string };

export type PedidoElegivel = {
  /** Necessário para a RPC; opcional para preservar chamadas antigas de pré-checagem. */
  id?: string;
  status: string;
  aceito_em_atendente: string | null;
  pagamento_status: string;
};

export type RegraPagamento = {
  forma_pagamento: string;
  pagamento_modalidade: string;
  pagamento_status: string;
};

/**
 * Pré-checagem local (só orienta a UI; quem decide é a função no banco).
 * Agendado NÃO é liberado pelo aceite — apenas registrado.
 */
export function elegivelAceiteLocal(p: PedidoElegivel): { elegivel: boolean; motivo: string } {
  if (p.status !== "recebido") return { elegivel: false, motivo: "fora de Novos" };
  if (p.aceito_em_atendente) return { elegivel: false, motivo: "aceite duplicado" };
  return { elegivel: true, motivo: "elegível (confirmação no banco)" };
}

/**
 * Política comercial existente (não inventa regra): Pix online exige pago;
 * dinheiro/cartão na entrega podem permanecer pendentes; demais casos
 * inconsistentes vão para análise. Nunca altera pagamento.
 */
export function bloqueioPagamentoComercial(p: RegraPagamento): "ok" | "analise" {
  const naEntrega = p.pagamento_modalidade === "na_entrega";
  const emMaos = p.forma_pagamento === "dinheiro" || p.forma_pagamento === "credito" || p.forma_pagamento === "debito";
  if (p.pagamento_status === "pago") return "ok";
  if (naEntrega && emMaos) return "ok";
  return "analise";
}

export type AutorAceite = {
  id: string | null | undefined;
  papeis?: readonly string[] | null;
};

/** Mesma regra da RPC 0084: somente atendente ou admin autenticados. */
export function papeisAutorizadosAceite(papeis: readonly string[] | null | undefined): boolean {
  return Boolean(papeis?.includes("atendente") || papeis?.includes("admin"));
}

/** Pré-checagem de perfil. A autoridade final continua sendo a RPC. */
export function podeAceitarPerfil(autor: AutorAceite): boolean {
  return Boolean(
    typeof autor.id === "string" && autor.id.trim() && papeisAutorizadosAceite(autor.papeis),
  );
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** Chamada real (só com flag ligada). Com flag off, retorna sem tocar a rede. */
export async function aceitarPedidoAtendente(
  client: RpcClient,
  pedidoId: string,
): Promise<ResultadoAceite> {
  if (!E2_ACEITE_ATENDENTE_ATIVO) {
    return { ok: false, codigo: "flag-desativada", detalhe: "integração E2 desativada (preview fictício)" };
  }
  try {
    const { data, error } = await client.rpc("aceitar_pedido_atendente", { p_pedido_id: pedidoId });
    if (error) return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
    const linha = Array.isArray(data) ? (data[0] as { resultado?: string; detalhe?: string }) : null;
    const codigo = (linha?.resultado ?? "erro-rede") as CodigoAceite;
    return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}

function interpretarRespostaRpc(resposta: { data: unknown; error: unknown }): ResultadoAceite {
  if (resposta.error) {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
  const linha = Array.isArray(resposta.data)
    ? (resposta.data[0] as { resultado?: string; detalhe?: string } | undefined)
    : null;
  const bruto = linha?.resultado;
  const codigo: CodigoAceite = [
    "ok",
    "negado",
    "inexistente",
    "inelegivel",
    "conflito",
    "erro-rede",
  ].includes(bruto ?? "")
    ? (bruto as CodigoAceite)
    : "erro-rede";
  return { ok: codigo === "ok", codigo, detalhe: linha?.detalhe ?? "" };
}

export type ExecutarAceiteOpcoes = {
  cliente: RpcClient;
  pedido: PedidoElegivel;
  autor: AutorAceite;
};

/**
 * Ação usada pelo botão da Central da Atendente (FUNC-01-B2).
 *
 * - valida perfil e transição antes da chamada;
 * - em teste local marcado, usa o cliente em memória (sem rede);
 * - em ambiente real, exige `VITE_FF_ACEITE_ATENDENTE=on`;
 * - não inventa sucesso: qualquer erro da RPC preserva o estado anterior.
 */
export async function executarAceiteAtendente({
  cliente,
  pedido,
  autor,
}: ExecutarAceiteOpcoes): Promise<ResultadoAceite> {
  if (!podeAceitarPerfil(autor)) {
    return {
      ok: false,
      codigo: "negado",
      detalhe: autor.id ? "sem papel de atendente" : "sem autenticação",
    };
  }

  const id = typeof pedido.id === "string" ? pedido.id.trim() : "";
  if (!id) return { ok: false, codigo: "inexistente", detalhe: "pedido não encontrado" };

  const pre = elegivelAceiteLocal(pedido);
  if (!pre.elegivel) {
    return {
      ok: false,
      codigo: pedido.aceito_em_atendente ? "conflito" : "inelegivel",
      detalhe: pre.motivo,
    };
  }

  const testeLocal = ehModoTesteLocal();
  if (!testeLocal && !E2_ACEITE_ATENDENTE_ATIVO) {
    return {
      ok: false,
      codigo: "flag-desativada",
      detalhe: "integração E2 desativada (preview fictício)",
    };
  }

  try {
    return interpretarRespostaRpc(
      await cliente.rpc("aceitar_pedido_atendente", { p_pedido_id: id }),
    );
  } catch {
    return { ok: false, codigo: "erro-rede", detalhe: "falha de comunicação" };
  }
}
