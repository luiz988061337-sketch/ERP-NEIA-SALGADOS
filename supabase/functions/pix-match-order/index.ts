// Supabase Edge Function: pix-match-order
// Responsável pela identificação do pedido a partir do evento Pix detectado.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface MatchOrderRequest {
  event_id: string;
}

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    return new Response("missing env", { status: 500 });
  }

  try {
    const body = (await req.json()) as MatchOrderRequest;
    const sb = createClient(url, serviceKey);

    // Buscar evento não processado
    const { data: event } = await sb.from("pix_notification_events").select("*").eq("id", body.event_id).maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ success: false, error: "Event not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Se já foi identificado, retorna o matched_order_id
    if (event.matched_order_id) {
      return new Response(
        JSON.stringify({ success: true, matched_order_id: event.matched_order_id, already_matched: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Lógica de matching - validar environment primeiro
    if (event.environment === 'TEST') {
      // Em ambiente TEST, ainda faz o match para efeito de teste,
      // mas marca como test e não prossegue para confirmação real
      const { data: pedido } = await sb.from("pedidos").select("id, numero, cliente_nome, total, pagamento_status").ilike("referencia", event.reference).maybeSingle();

      let matchedOrderId: string | null = null;
      let classification = "AGUARDANDO_IDENTIFICACAO_TEST";

      if (pedido) {
        matchedOrderId = pedido.id;
        classification = "IDENTIFICADO_POR_REFERENCIA_TEST";
      }

      // Atualizar evento com matching (modo teste)
      await sb.from("pix_notification_events").update({
        matched_order_id: matchedOrderId,
        status: matchedOrderId ? "PROCESSED" : "INVALID",
        processed_at: new Date().toISOString(),
      }).eq("id", body.event_id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          matched_order_id: matchedOrderId, 
          classification,
          already_matched: false,
          test_mode: true 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Lógica de matching para ambiente PRODUCTION
    let matchedOrderId: string | null = null;
    let classification = "AGUARDANDO_IDENTIFICACAO";

    // 1 — Tentar identificar por referência
    if (event.reference) {
      const { data: pedido } = await sb.from("pedidos").select("id, numero, cliente_nome, total, pagamento_status").ilike("referencia", event.reference).maybeSingle();

      if (pedido) {
        // 2 — Verificar se valor do Pix bate com valor do pedido
        if (event.amount !== null && pedido.total !== event.amount) {
          // Divergência de valor - NÃO confirmar automaticamente
          // Atualizar evento com status de divergência
          await sb.from("pix_notification_events").update({
            matched_order_id: pedido.id,
            status: "DIVERGENCE",
            processed_at: new Date().toISOString(),
          }).eq("id", body.event_id);

          return new Response(
            JSON.stringify({ 
              success: false, 
              matched_order_id: pedido.id,
              classification: "DIVERGENCIA_VALOR",
              reason: "amount mismatch: pedido R$ " + pedido.total + ", Pix R$ " + event.amount
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // 3 — Verificar se pedido já está pago
        if (pedido.pagamento_status === 'pago') {
          // Já confirmado anteriormente
          await sb.from("pix_notification_events").update({
            matched_order_id: pedido.id,
            status: "ALREADY_PAID",
            processed_at: new Date().toISOString(),
          }).eq("id", body.event_id);

          return new Response(
            JSON.stringify({ 
              success: false, 
              matched_order_id: pedido.id,
              classification: "JÁ_PAGO",
              reason: "Pedido já foi pago anteriormente"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // 4 — Verificar forma de pagamento
        if (pedido.forma_pagamento !== 'pix') {
          await sb.from("pix_notification_events").update({
            matched_order_id: pedido.id,
            status: "INVALID_PAYMENT_METHOD",
            processed_at: new Date().toISOString(),
          }).eq("id", body.event_id);

          return new Response(
            JSON.stringify({ 
              success: false, 
              matched_order_id: pedido.id,
              classification: "FORMA_NAO_PIX",
              reason: "Pedido não foi pago com Pix"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }


        matchedOrderId = pedido.id;
        classification = "IDENTIFICADO_POR_REFERENCIA";
      }
    }

    // 5 — Se não encontrou por referência, classificar como AMBIGUOUS se houver valor mas sem referência confiável
    if (!matchedOrderId && event.amount !== null) {
      // Buscar pedidos com mesmo valor para verificar se há ambiguidade
      const { data: pedidosMesmoValor } = await sb.from("pedidos").select("id, numero, total, pagamento_status").eq("total", event.amount).neq("pagamento_status", 'pago').limit(5);

      if (pedidosMesmoValor && pedidosMesmoValor.length >= 2) {
        // Múltiplos pedidos com mesmo valor - classificar como AMBIGUOUS
        await sb.from("pix_notification_events").update({
          matched_order_id: null,
          status: "AMBIGUOUS",
          processed_at: new Date().toISOString(),
        }).eq("id", body.event_id);

        return new Response(
          JSON.stringify({ 
            success: false, 
            matched_order_id: null,
            classification: "AMBIGUOUS",
            reason: "Múltiplos pedidos com mesmo valor R$ " + event.amount + ", sem referência confiável"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (pedidosMesmoValor && pedidosMesmoValor.length === 1) {
        // Único pedido com esse valor - pode identificar
        matchedOrderId = pedidosMesmoValor[0].id;
        classification = "IDENTIFICADO_POR_VALOR";
      }
    }

    // Atualizar evento com matching
    await sb.from("pix_notification_events").update({
      matched_order_id: matchedOrderId,
      status: matchedOrderId ? "PROCESSED" : "INVALID",
      processed_at: new Date().toISOString(),
    }).eq("id", body.event_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        matched_order_id: matchedOrderId, 
        classification,
        already_matched: false 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("pix-match-order error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});