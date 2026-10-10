// Supabase Edge Function: pix-confirm
// Responsável pela futura confirmação do pagamento.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PixConfirmRequest {
  event_id: string;
  order_id: string;
}

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return new Response("missing env", { status: 500 });
  }

  try {
    const body = (await req.json()) as PixConfirmRequest;
    const sb = createClient(url, serviceKey);

    // 1. Buscar evento
    const { data: event } = await sb.from("pix_notification_events").select("*").eq("id", body.event_id).maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ success: false, error: "Event not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar environment - APENAS PRODUCTION pode confirmar pagamentos reais
    if (event.environment !== 'PRODUCTION') {
      return new Response(
        JSON.stringify({ success: false, error: "Only production environment can confirm real payments" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Verificar se evento já está confirmado ou pago
    if (event.status === "CONFIRMED" || event.status === "pago") {
      return new Response(
        JSON.stringify({ success: false, error: "Already confirmed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Verificar matched_order_id - match deve ter sido validado anteriormente
    if (!event.matched_order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Event not matched to order yet. Run pix-match-order first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4b. Usar o matched_order_id do evento em vez do order_body (extra segurança)
    const safeOrderId = event.matched_order_id;

    // 5. Verificar se pedido existe
    const { data: pedido } = await sb.from("pedidos").select("id, forma_pagamento, pagamento_status, total, pagamento_em").eq("id", safeOrderId).single();

    if (!pedido) {
      return new Response(
        JSON.stringify({ success: false, error: "Order not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 6. Verificar se pedido é PIX
    if (pedido.forma_pagamento !== 'pix') {
      return new Response(
        JSON.stringify({ success: false, error: "Order not paid with Pix" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. Verificar se pedido já está pago
    if (pedido.pagamento_status === 'pago') {
      return new Response(
        JSON.stringify({ success: false, error: "Order already paid" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 8. Verificar divergência de valor
    if (event.amount !== null && pedido.total !== event.amount) {
      // Atualizar evento com status de divergência instead of confirming
      await sb.from("pix_notification_events").update({
        status: "DIVERGENCE",
        processed_at: new Date().toISOString(),
      }).eq("id", body.event_id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          classification: "DIVERGENCIA_VALOR",
          reason: "Value mismatch: order R$ " + pedido.total + ", Pix R$ " + event.amount
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 9. Confirmar pagamento no pedido - usando UPDATE condicional para idempotência
    const { error: pedidoError } = await sb.from("pedidos").update({
      pagamento_status: "pago",
      pagamento_em: new Date().toISOString(),
    }).eq("id", safeOrderId).eq("pagamento_status", "pending"); // Apenas se ainda não estava pago

    if (pedidoError) {
      // Se o update falhou, pode já estar pago ou bloqueado
      // Verificar status atual
      const { data: checkPedido } = await sb.from("pedidos").select("pagamento_status").eq("id", safeOrderId).single();
      if (checkPedido?.pagamento_status === 'pago') {
        // Já estava pago - evento considerado já confirmado
        await sb.from("pix_notification_events").update({
          status: "CONFIRMED",
          processed_at: new Date().toISOString(),
        }).eq("id", body.event_id);

        return new Response(
          JSON.stringify({ success: true, order_id: safeOrderId, event_id: body.event_id, already_confirmed: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "Error updating pedido" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Atualizar evento para CONFIRMED
    await sb.from("pix_notification_events").update({
      status: "CONFIRMED",
      processed_at: new Date().toISOString(),
    }).eq("id", body.event_id);

    return new Response(
      JSON.stringify({ success: true, order_id: safeOrderId, event_id: body.event_id }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("pix-confirm error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});