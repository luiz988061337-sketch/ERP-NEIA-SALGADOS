// Edge Function: resgate de fidelidade server-side (validação total, atômico).
// PREPARADO — requer deploy: `supabase functions deploy resgatar-fidelidade`
// e `supabase secrets set` se necessário. O app hoje usa o fluxo client-side
// limitado (policy 0010); migre o frontend para chamar esta função quando deployada.
//
// POST { telefone: string } com Authorization: Bearer <user JWT>
// Regra: 200 pontos → cupom R$20 (FID-*, uso único, 30 dias, próprio telefone).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PONTOS_PADRAO = 200;
const VALOR_PADRAO = 20;

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response("unauthorized", { status: 401 });

  // Sem SUPABASE_ANON_KEY: o JWT do usuário no header já identifica o chamador
  // (getUser valida o token; a service key aqui só dá acesso à API).
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const telefone = String(body.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return new Response("WhatsApp inválido.", { status: 400 });

  const { data: perfil } = await admin.from("profiles").select("pontos").eq("id", user.id).maybeSingle();
  let meta = PONTOS_PADRAO;
  let recompensa = VALOR_PADRAO;
  let fidAtivo = true;
  try {
    const { data: cfg } = await admin.from("crm_settings").select("fid_ativo, fid_meta_pontos, fid_recompensa_valor").eq("id", true).maybeSingle();
    if (cfg) {
      fidAtivo = (cfg as any).fid_ativo ?? true;
      meta = Number((cfg as any).fid_meta_pontos ?? PONTOS_PADRAO);
      recompensa = Number((cfg as any).fid_recompensa_valor ?? VALOR_PADRAO);
    }
  } catch {
    /* usa padrões */
  }
  if (!fidAtivo) return new Response("Programa desativado.", { status: 400 });
  if (recompensa <= 0 || recompensa > 100) return new Response("Recompensa fora do limite.", { status: 400 });
  if (!perfil || (perfil.pontos ?? 0) < meta) {
    return new Response("Pontos insuficientes.", { status: 400 });
  }

  const aleatorio = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(36).toUpperCase().padStart(2, "0")).join("").slice(-6);
  const codigo = `FID-${Date.now().toString(36).toUpperCase().slice(-4)}${aleatorio}`;
  const fim = new Date(Date.now() + 30 * 86400000).toISOString();
  const { error: e1 } = await admin.from("cupons").insert({
    codigo, tipo: "valor", valor: recompensa, minimo: 0, ativo: true,
    cliente_telefone: telefone, validade_fim: fim, max_usos: 1, produtos_ids: [],
  });
  if (e1) return new Response("Falha ao gerar cupom.", { status: 500 });

  // Débito condicional: duas chamadas concorrentes não geram 2 cupons com 1 saldo
  // (o UPDATE só afeta a linha se o saldo AINDA cobre a meta neste instante).
  const { data: debitado, error: e2 } = await admin.from("profiles")
    .update({ pontos: (perfil.pontos ?? 0) - meta })
    .eq("id", user.id)
    .gte("pontos", meta)
    .select("id");
  if (e2 || !debitado || debitado.length === 0) {
    await admin.from("cupons").update({ ativo: false }).eq("codigo", codigo);
    return new Response("Pontos insuficientes.", { status: 400 });
  }
  return Response.json({ codigo, valor: recompensa, validade_fim: fim });
});
