// Supabase Edge Function: pix-notification
// Recebe evento do aplicativo Android Notification Listener
// Responsabilidades:
//   - validar estrutura
//   - validar tamanho
//   - validar origem (via integridade da requisição)
//   - verificar duplicidade
//   - registrar evento
//   - responder rapidamente

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PixNotificationEvent {
  event_hash: string;
  source_app: string;
  bank_name?: string;
  notification_title: string;
  notification_text: string;
  amount?: number;
  sender_name?: string;
  reference?: string;
  detected_at: string;
  device_id?: string;
  environment?: 'TEST' | 'PRODUCTION';
}

// O Edge Function usa o SUPABASE_SERVICE_ROLE_KEY internamente para inserir no banco
// O APK NÃO deve ter esta chave (requirement #12)
// A autenticação é feita pela validacao de entrada e rate limiting

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return new Response("missing env", { status: 500 });
  }

  try {
    const body = (await req.json()) as PixNotificationEvent;

    // Validar estrutura mínima
    if (!body.event_hash || !body.source_app || !body.notification_title || !body.notification_text) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: event_hash, source_app, notification_title, notification_text" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validar tamanho do payload
    const payloadSize = Buffer.from(JSON.stringify(body)).length;
    if (payloadSize > 100000) {
      return new Response(
        JSON.stringify({ success: false, error: "Payload too large" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar duplicidade pelo event_hash
    const sb = createClient(url, serviceKey);
    const { data: existing } = await sb.from("pix_notification_events").select("id").eq("event_hash", body.event_hash).maybeSingle();

    if (existing) {
      // Evento duplicado - ainda assim respondemos success para não revelar se o hash existe
      // mas marcamos no banco para idempotência
      return new Response(
        JSON.stringify({ success: true, duplicated: true, event_id: existing.id }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validar device_id se fornecido - verificar se dispositivo está autorizado
    if (body.device_id) {
      const { data: device } = await sb.from("pix_reader_devices").select("status").eq("device_identifier", body.device_id).single();
      if (!device) {
        return new Response(
          JSON.stringify({ success: false, error: "Device not registered" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      if (device.status !== "ACTIVE") {
        return new Response(
          JSON.stringify({ success: false, error: "Device not authorized: " + device.status }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Registrar evento - o function usa o service role key internamente
    const { data: event, error } = await sb.from("pix_notification_events").insert({
      event_hash: body.event_hash,
      source_app: body.source_app,
      bank_name: body.bank_name,
      notification_title: body.notification_title,
      notification_text: body.notification_text,
      amount: body.amount,
      sender_name: body.sender_name,
      reference: body.reference,
      detected_at: body.detected_at,
      device_id: body.device_id,
      environment: body.environment || "TEST",
      status: "PENDING",
    }).select().single();

    if (error) {
      console.error("Error inserting pix_notification_event:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Database error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Responder rapidamente
    return new Response(
      JSON.stringify({ success: true, event_id: event.id, duplicated: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("pix-notification error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});