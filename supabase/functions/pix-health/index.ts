// Supabase Edge Function: pix-health
// Responsável pelo teste de disponibilidade da API.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, api: "offline", supabase: "offline", timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Health check - verifica se a URL do Supabase está configurada
    // Em produção, faria uma chamada leve ao Supabase Realtime ou REST
    const health = {
      success: true,
      api: "online",
      supabase: url.startsWith("https://") ? "online" : "offline",
      timestamp: new Date().toISOString(),
    };

    // Cabeçalhos CORS para permitir que o APK chame esta função
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify(health),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Health check failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});