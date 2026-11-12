/**
 * Regras de liberação da Cozinha — lógica PURA (sem rede, sem banco).
 *
 * Baseado no modelo real do projeto:
 * - `pedidos.conferido_em` = "conferencia final da cozinha" (migration 0084).
 * - Fluxo de retirada (`STATUS_FLOW_RETIRADA` em `lib/format.ts`):
 *   recebido -> em_producao -> pronto -> entregue. Retirada NUNCA passa por
 *   `aguardando_motoboy`.
 * - `pedidos.retirado_em` = confirmação da retirada (fica reservada para o
 *   balcão/cliente; não é marcada automaticamente aqui).
 * - Aviso interno de caixa/balcão usa a tabela real `notificacoes`, lida pela
 *   Central de Pedidos (`op-avisos`).
 *
 * Nenhum status novo é inventado: as regras abaixo só usam os status e
 * colunas que já existem.
 */

/** Tipos de aviso interno (canal `notificacoes`). */
export const TIPO_AVISO_CAIXA = "pedido_pronto_caixa";
export const TIPO_AVISO_RETIRADA = "pedido_liberado_retirada";

export type PedidoLiberacaoCozinha = {
  id: string;
  status: string;
  tipo_entrega: string;
  conferido_em: string | null;
  retirado_em: string | null;
  motoboy_id?: string | null;
};

export type ResultadoElegibilidade = { elegivel: boolean; motivo: string };

/** Link interno do aviso (permite checar duplicidade pelo par tipo+link). */
export function linkAviso(pedidoId: string): string {
  return `/central-entregas?pedido=${pedidoId}`;
}

/**
 * "Avisar caixa" — pedido de ENTREGA, pronto e conferido.
 * Não exige (e não provoca) status novo: o pedido segue "pronto", disponível
 * para o fluxo correto da Central de Entregas.
 */
export function elegivelAvisoCaixa(p: PedidoLiberacaoCozinha): ResultadoElegibilidade {
  if (p.tipo_entrega === "retirada")
    return { elegivel: false, motivo: "retirada usa a liberacao de retirada" };
  if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
  if (!p.conferido_em) return { elegivel: false, motivo: "conferencia pendente" };
  return { elegivel: true, motivo: "elegivel" };
}

/**
 * "Liberar retirada" — pedido de RETIRADA, pronto, conferido e ainda sem
 * confirmação de retirada. Nunca vira `aguardando_motoboy` nem `entregue`.
 */
export function elegivelLiberacaoRetirada(p: PedidoLiberacaoCozinha): ResultadoElegibilidade {
  if (p.tipo_entrega !== "retirada")
    return { elegivel: false, motivo: "entrega usa o fluxo de motoboy" };
  if (p.status !== "pronto") return { elegivel: false, motivo: "fora de Prontos" };
  if (!p.conferido_em) return { elegivel: false, motivo: "conferencia pendente" };
  if (p.retirado_em) return { elegivel: false, motivo: "retirada ja confirmada" };
  return { elegivel: true, motivo: "elegivel" };
}

/**
 * Efeitos do aviso interno: registra que a Central/balcão foi avisado.
 * `status` do pedido NÃO muda, `motoboy_id` NÃO é tocado e não há
 * WhatsApp — é só o aviso interno.
 */
export function avisoInterno(
  p: PedidoLiberacaoCozinha & { numero: number; cliente_nome: string; observacoes?: string },
  canal: "caixa" | "retirada",
): { tipo: string; titulo: string; detalhe: string; link: string; lida: boolean } {
  const retirada = canal === "retirada";
  return {
    tipo: retirada ? TIPO_AVISO_RETIRADA : TIPO_AVISO_CAIXA,
    titulo: retirada
      ? `Pedido #${p.numero} liberado para retirada`
      : `Pedido #${p.numero} pronto para entrega`,
    detalhe: [
      `Cliente: ${p.cliente_nome}`,
      retirada ? "Modalidade: retirada no balcão" : "Modalidade: entrega",
      p.observacoes ? `Obs.: ${p.observacoes}` : null,
    ]
      .filter(Boolean)
      .join(" • "),
    link: linkAviso(p.id),
    lida: false,
  };
}

/** Chave de idempotência do aviso (mesmo padrão de `lib/notificacoes.ts`). */
export function chaveAviso(pedidoId: string, canal: "caixa" | "retirada", dia: string): string {
  return `${pedidoId}|pronto|${canal}|${dia}`;
}
