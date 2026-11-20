/**
 * Adaptador demonstrativo do aceite da atendente (FUNC-01-B2).
 *
 * Reproduz, em memória e com dados fictícios, as Mesmas garantias da RPC
 * `aceitar_pedido_atendente` da migration 0084:
 *   - exige usuário autenticado;
 *   - exige papel `atendente` ou `admin`;
 *   - exige `status = recebido` e nenhum aceite anterior;
 *   - grava somente `aceito_em_atendente` e `aceito_por`;
 *   - serializa tentativas concorrentes no estado local.
 *
 * Nenhuma rede, Supabase, SQL ou efeito externo é utilizado. O estado é
 * descartado quando a página/teste é recarregado.
 */

import { papeisAutorizadosAceite } from "@/lib/atendente-aceite";

export type PedidoAceiteMemoria = {
  id: string;
  status?: string | null;
  aceito_em_atendente?: string | null;
  aceito_por?: string | null;
  updated_at?: string | null;
  [chave: string]: unknown;
};

export type ResultadoAceiteMemoria = {
  resultado: "ok" | "negado" | "inexistente" | "inelegivel" | "conflito";
  detalhe: string;
};

type Registro = { pedido: PedidoAceiteMemoria };

/** Aceites confirmados no modo demonstrativo, indexados por pedido. */
const aceites = new Map<string, Registro>();

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function resultado(
  codigo: ResultadoAceiteMemoria["resultado"],
  detalhe: string,
): ResultadoAceiteMemoria {
  return { resultado: codigo, detalhe };
}

/**
 * Tentativa de aceite no estado em memória. A checagem e a gravação ocorrem
 * no mesmo bloco síncrono: duas tentativas simultâneas não produzem dois
 * aceites.
 */
export function aceitarPedidoEmMemoria(
  pedidos: PedidoAceiteMemoria[],
  papeis: readonly string[] | null | undefined,
  usuarioId: string | null | undefined,
  pedidoId: unknown,
  agoraISO = new Date().toISOString(),
): ResultadoAceiteMemoria {
  const uid = texto(usuarioId);
  if (!uid) return resultado("negado", "sem autenticação");
  if (!papeisAutorizadosAceite(papeis)) return resultado("negado", "sem papel de atendente");

  const id = texto(pedidoId);
  if (!id) return resultado("inexistente", "pedido não encontrado");

  const pedido = pedidos.find((p) => texto(p.id) === id);
  if (!pedido) return resultado("inexistente", "pedido não encontrado");
  if (texto(pedido.status) !== "recebido") return resultado("inelegivel", "fora de Novos");
  if (pedido.aceito_em_atendente || aceites.has(id)) {
    return resultado("conflito", "aceite duplicado");
  }

  const aceito: PedidoAceiteMemoria = {
    ...pedido,
    aceito_em_atendente: agoraISO,
    aceito_por: uid,
    updated_at: agoraISO,
  };
  Object.assign(pedido, {
    aceito_em_atendente: agoraISO,
    aceito_por: uid,
    updated_at: agoraISO,
  });
  aceites.set(id, { pedido: aceito });
  return resultado("ok", "aceite registrado (simulação local)");
}

/** Snapshot do aceite confirmado, para a prévia da Produção. */
export function obterAceiteMemoria(pedidoId: unknown): PedidoAceiteMemoria | null {
  const registro = aceites.get(texto(pedidoId));
  return registro ? ({ ...registro.pedido } as PedidoAceiteMemoria) : null;
}

/**
 * Aplica os aceites confirmados à fila simulada da Produção.
 * Pedidos aceitos que ainda não estejam na lista de fixtures são acrescentados
 * com seus dados fictícios, mantendo `status = recebido` conforme a RPC.
 */
export function pedidosComAceiteMemoria<T extends PedidoAceiteMemoria>(pedidos: T[]): T[] {
  const porId = new Map<string, T>();
  for (const pedido of pedidos) porId.set(texto(pedido.id), { ...pedido });

  for (const [id, registro] of aceites) {
    const aceito = registro.pedido;
    const atual = porId.get(id);
    if (atual) {
      porId.set(id, {
        ...atual,
        aceito_em_atendente: aceito.aceito_em_atendente,
        aceito_por: aceito.aceito_por,
        updated_at: aceito.updated_at,
      });
    } else if (texto(aceito.status) === "recebido") {
      porId.set(id, { ...aceito } as T);
    }
  }
  return [...porId.values()];
}

/** Uso exclusivo de testes: reinicia o estado simulado. */
export function limparAceitesMemoria(): void {
  aceites.clear();
}
