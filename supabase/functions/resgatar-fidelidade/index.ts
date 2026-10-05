// Edge Function: resgate de fidelidade (interface HTTP sobre o RPC servidor).
// O débito acontece em public.resgatar_fidelidade(p_telefone) — SECURITY DEFINER,
// com trava de saldo (FOR UPDATE) e bypass do trigger anti-fraude via app.pontos_ok.
// Débito direto em profiles aqui QUEBRARIA (trigger profiles_guard_pontos, 0002).
// O app prefere chamar o RPC direto (sem deploy); esta função serve a chamadas
// externas/integrações com a mesma regra.
//
// POST { telefone: string } com Authorization: Bearer <user JWT>
// Regra: meta pontos → cupom (FID-*, uso único, 30 dias, próprio telefone).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ERROS_HTTP: Record<string, number> = {
  nao_autenticado: 401,
  telefone_invalido: 400,
  pontos_insuficientes: 400,
  programa_desativado: 400,
  config_invalida: 500,
};

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response("unauthorized", { status: 401 });

  // Contexto do usuário (o RPC lê auth.uid(); a service key só dá acesso à API).
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return new Response("WhatsApp inválido.", { status: 400 });

  const { data: codigo, error } = await userClient.rpc("resgatar_fidelidade", {
    p_telefone: telefone,
  });
  if (error) {
    const msg = String((error as any)?.message ?? error ?? "");
    const chave = Object.keys(ERROS_HTTP).find((k) => msg.includes(k));
    const status = (chave && ERROS_HTTP[chave]) || 400;
    const amigavel: Record<string, string> = {
      nao_autenticado: "Não autenticado.",
      telefone_invalido: "WhatsApp inválido.",
      pontos_insuficientes: "Pontos insuficientes.",
      programa_desativado: "Programa desativado.",
      config_invalida: "Configuração inválida.",
    };
    return new Response((chave && amigavel[chave]) || "Falha ao resgatar.", { status });
  }
  return Response.json({ codigo: String(codigo ?? "") });
});
