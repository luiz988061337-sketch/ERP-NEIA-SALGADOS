// Supabase Edge Function: enviar-lembretes (7d / 3d / 24h / dia)
// Deploy: supabase functions deploy enviar-lembretes
// Cron sugerido (Database → pg_cron, 1x/dia 09:00 America/Sao_Paulo):
//   select net.http_post('https://SEU-PROJETO.supabase.co/functions/v1/enviar-lembretes',
//     '{"":""}', headers := '{"Authorization":"Bearer SEU-SERVICE-ROLE"}');
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return new Response("sem env", { status: 500 });
  const sb = createClient(url, key);
  const agora = Date.now();
  const { data: pedidos } = await sb.from("pedidos")
    .select("id, numero, cliente_nome, telefone, agendado_para, status")
    .not("agendado_para", "is", null)
    .not("status", "in", "(cancelado,entregue)");
  let criados = 0;
  for (const p of pedidos ?? []) {
    const diffDias = (+new Date(p.agendado_para) - agora) / 86400000;
    const tipos: string[] = [];
    if (diffDias <= 7.5 && diffDias > 6.5) tipos.push("7d");
    if (diffDias <= 3.5 && diffDias > 2.5) tipos.push("3d");
    if (diffDias <= 1.5 && diffDias > 0.5) tipos.push("24h");
    if (diffDias <= 0.5 && diffDias > -0.2) tipos.push("dia");
    for (const t of tipos) {
      const { error } = await sb.from("pedido_lembretes").insert({ pedido_id: p.id, tipo: t });
      if (!error) criados++;
    }
  }
  return Response.json({ criados });
});
