import { notificarPush } from "./push";
import { enviarWhatsAppAutomatico } from "./whatsapp-api";

export type CanalStatus = "enviado" | "falhou" | "indisponivel" | "desativado";

export interface ResultadoNotificacao {
  push: CanalStatus;
  whatsapp: CanalStatus;
}

export interface ParamsNotificarPedido {
  client: any;
  pedidoId: string;
  status: string;
  telefone?: string | null;
  mensagem?: string;
}

/**
 * Camada central de notificação de pedido.
 * Coordena Push e WhatsApp automático de forma independente.
 * Falha em um canal NÃO afeta o outro.
 */
export async function notificarPedido(
  params: ParamsNotificarPedido,
): Promise<ResultadoNotificacao> {
  const resultado: ResultadoNotificacao = { push: "indisponivel", whatsapp: "desativado" };

  try {
    const pushOk = await notificarPush(params.client, params.pedidoId, params.status);
    resultado.push = pushOk ? "enviado" : "falhou";
  } catch {
    resultado.push = "falhou";
  }

  if (params.telefone && params.mensagem) {
    try {
      const wa = await enviarWhatsAppAutomatico({
        telefone: params.telefone,
        mensagem: params.mensagem,
      });
      if (wa.ok) {
        resultado.whatsapp = "enviado";
      } else if (wa.motivo === "desativado") {
        resultado.whatsapp = "desativado";
      } else {
        resultado.whatsapp = "falhou";
      }
    } catch {
      resultado.whatsapp = "falhou";
    }
  }

  return resultado;
}
