import { atrasoCentral, colunaDoPedido, idPedidoDoAviso, TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA, type AvisoCozinha, type PedidoCentral } from "./central-pedidos";
import { passouDoPrazo } from "./prazo-pedido";

export const MENSAGENS_ALERTA = {
  novo: "Atenção! Novo pedido chegou. Aguardando aceitação.",
  lembrete: "Lembrete! Você possui pedidos aguardando aceitação.",
  retirada: "Atenção! Pedido pronto, aguardando retirada do cliente.",
  entrega: "Lembrete! Entrega pronta, aguardando motoboy.",
  atraso: "Atenção! Existe um pedido em atraso. Verifique imediatamente.",
} as const;

export type SomAlerta = keyof typeof MENSAGENS_ALERTA;
export type ModoAlerta = "toque" | "voz" | "toque-voz";
export type AlertaOperacional = {
  chave: string;
  tipo: Exclude<SomAlerta, "lembrete">;
  pedido: PedidoCentral;
};

export function permissoesAlerta(papeis: readonly string[]) {
  const admin = papeis.includes("admin");
  return { atendimento: admin || papeis.includes("atendente"), entregas: admin || papeis.includes("producao") };
}

export function alertasOperacionais(
  pedidos: PedidoCentral[],
  avisos: AvisoCozinha[],
  papeis: readonly string[],
  agora: number,
): AlertaOperacional[] {
  const { atendimento, entregas } = permissoesAlerta(papeis);
  const porPedido = new Map(pedidos.map((p) => [p.id, p]));
  const alertas = new Map<string, AlertaOperacional>();
  for (const pedido of pedidos) {
    const coluna = colunaDoPedido(pedido);
    if (atendimento && coluna === "analise") {
      alertas.set(pedido.id, { chave: pedido.id, tipo: "novo", pedido });
    }
    const atrasoEmRota = entregas && pedido.tipo_entrega === "entrega" && pedido.status === "em_rota" &&
      (pedido.atrasado || passouDoPrazo(pedido, agora));
    if (atrasoEmRota || ((atendimento || (entregas && pedido.tipo_entrega === "entrega")) &&
        coluna && atrasoCentral(pedido, agora) === true)) {
      const chave = "atraso:" + pedido.id;
      alertas.set(chave, { chave, tipo: "atraso", pedido });
    }
  }
  for (const aviso of avisos) {
    const pedido = porPedido.get(idPedidoDoAviso(aviso) ?? "");
    if (!pedido || colunaDoPedido(pedido) !== "pronto") continue;
    const retirada = aviso.tipo === TIPO_AVISO_RETIRADA && pedido.tipo_entrega === "retirada";
    const entrega = aviso.tipo === TIPO_AVISO_CAIXA && pedido.tipo_entrega === "entrega";
    if (!(retirada && atendimento) && !(entrega && (atendimento || entregas))) continue;
    const chave = aviso.tipo + ":" + pedido.id;
    alertas.set(chave, { chave, tipo: retirada ? "retirada" : "entrega", pedido });
  }
  return [...alertas.values()];
}

export function gruposSonoros(pendentes: AlertaOperacional[], conhecidos: Set<string>, lembrete: boolean): SomAlerta[] {
  const grupos = new Set<SomAlerta>(pendentes.flatMap(({ chave, tipo }) => {
    if (!lembrete && conhecidos.has(chave)) return [];
    return [tipo === "novo" && conhecidos.has(chave) ? "lembrete" : tipo];
  }));
  if (grupos.has("novo")) grupos.delete("lembrete");
  return [...grupos];
}
