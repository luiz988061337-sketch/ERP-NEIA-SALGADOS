/**
 * WhatsApp automático — camada preparada para API oficial/provedor.
 *
 * ATUALMENTE DESATIVADO. Nenhum provedor foi contratado.
 * A integração futura será feita via Edge Function (backend), nunca no navegador.
 *
 * Variáveis de ambiente futuras (configurar no backend/Edge Function, NUNCA em VITE_*):
 *   WHATSAPP_AUTOMATICO_ENABLED=false
 *   WHATSAPP_PROVIDER=
 *   WHATSAPP_API_URL=
 *   WHATSAPP_API_TOKEN=
 *   WHATSAPP_PHONE_NUMBER_ID=
 */

export interface WhatsAppProvider {
  enviarMensagem(params: {
    telefone: string;
    mensagem: string;
  }): Promise<{
    ok: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export const WHATSAPP_AUTOMATICO_ENABLED = false;

export async function enviarWhatsAppAutomatico(params: {
  telefone: string;
  mensagem: string;
}): Promise<{
  ok: boolean;
  motivo?: "desativado" | "nao-configurado" | "erro";
  error?: string;
}> {
  if (!WHATSAPP_AUTOMATICO_ENABLED) {
    return { ok: false, motivo: "desativado" };
  }
  // Futuro: chamar Edge Function whatsapp-enviar com API do provedor.
  // NÃO implementar aqui. NÃO usar window.open. NÃO usar wa.me.
  return { ok: false, motivo: "nao-configurado" };
}
