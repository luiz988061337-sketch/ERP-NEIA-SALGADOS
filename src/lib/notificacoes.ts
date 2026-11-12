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
 *
 * Toda tentativa é registrada em `notificacoes_log` (migration 0104) com
 * chave de idempotência `pedido|status|canal|dia` — reenvios e refresh da
 * página de operação não geram mensagem duplicada. Se a tabela ainda não
 * existe (migration não aplicada), o registro é silenciosamente ignorado:
 * a notificação em si nunca depende da auditoria.
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

  void registrarAuditoria(params, resultado);

  return resultado;
}

/** Normaliza telefone para auditoria (só dígitos, com DDI 55). */
function normalizarTelefone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function registrarAuditoria(
  params: ParamsNotificarPedido,
  resultado: ResultadoNotificacao,
): Promise<void> {
  try {
    const client = params.client;
    if (!client?.from || !params.pedidoId) return;
    const dia = new Date().toISOString().slice(0, 10);
    const userId = (await client.auth.getUser()).data?.user?.id ?? null;
    const linhas: Array<{
      pedido_id: string;
      status: string;
      canal: string;
      resultado: string;
      mensagem: string | null;
      telefone_norm: string | null;
      idempotencia: string;
      created_by: string | null;
    }> = [
      {
        pedido_id: params.pedidoId,
        status: params.status,
        canal: "push",
        resultado: resultado.push === "indisponivel" ? "indisponivel" : resultado.push,
        mensagem: null,
        telefone_norm: null,
        idempotencia: `${params.pedidoId}|${params.status}|push|${dia}`,
        created_by: userId,
      },
    ];
    if (params.telefone) {
      linhas.push({
        pedido_id: params.pedidoId,
        status: params.status,
        canal: "whatsapp",
        resultado: resultado.whatsapp === "desativado" ? "desativado" : resultado.whatsapp,
        mensagem: params.mensagem ?? null,
        telefone_norm: normalizarTelefone(params.telefone),
        idempotencia: `${params.pedidoId}|${params.status}|whatsapp|${dia}`,
        created_by: userId,
      });
    }
    // ON CONFLICT DO NOTHING: a chave única evita duplicidade em reenvio.
    const { error } = await client
      .from("notificacoes_log")
      .upsert(linhas, { onConflict: "idempotencia", ignoreDuplicates: true });
    // Migration não aplicada => tabela não existe. Auditoria é best-effort.
    if (error && !/does not exist|schema cache|notificacoes_log/i.test(String(error.message ?? ""))) {
      console.warn("Auditoria de notificação não registrada:", error.message);
    }
  } catch {
    // Nunca interromper a operação por falha de auditoria.
  }
}
