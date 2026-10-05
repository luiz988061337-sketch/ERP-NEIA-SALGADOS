// Edge Function: push-enviar — notificação de status sem WhatsApp.
// Web Push puro (RFC8291 aes128gcm + VAPID), sem Firebase/vendor, sem npm:
// ECDH/ECDSA/AES-GCM via WebCrypto + HKDF manual sobre HMAC.
// POST { pedido_id: string, status: string } com Authorization: Bearer <JWT>
// (staff qualquer pedido; cliente só o próprio). Secrets: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@neiasalgados.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Texto = { titulo: string; corpo: string };
function textoStatus(status: string, numero: number | null, nome: string, retirada: boolean): Texto | null {
  const n = numero != null ? ` nº ${numero}` : "";
  const quem = nome ? `Olá ${nome}, ` : "";
  switch (status) {
    case "recebido":
      return { titulo: `Pedido recebido!${n}`, corpo: `${quem}recebemos seu pedido${n}. Já já entra na cozinha.` };
    case "em_producao":
      return { titulo: `Em produção${n}`, corpo: `Seu pedido${n} já está na cozinha.` };
    case "pronto":
      return retirada
        ? { titulo: `Pronto para retirada${n}`, corpo: `Pode vir buscar seu pedido${n} na loja.` }
        : { titulo: `Pronto${n}!`, corpo: `Seu pedido${n} está pronto. Estamos chamando o entregador.` };
    case "aguardando_motoboy":
      return { titulo: `Quase lá${n}`, corpo: `Seu pedido${n} está pronto e o motoboy já foi chamado.` };
    case "em_rota":
      return { titulo: `Saiu para entrega${n}`, corpo: `O motoboy está a caminho com seu pedido${n}.` };
    case "entregue":
      return { titulo: `Entregue${n}!`, corpo: `Bom apetite${nome ? `, ${nome}` : ""}! Obrigado pela preferência.` };
    case "cancelado":
      return { titulo: `Pedido cancelado${n}`, corpo: `Seu pedido${n} foi cancelado. Fale com a loja se precisar.` };
    default:
      return null;
  }
}

// ---------- base64url ----------
function b64urlToBytes(s: string): Uint8Array {
  const b64 = String(s ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------- HKDF manual (Extract + Expand sobre HMAC-SHA-256) ----------
async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, dados));
}
function concat(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let off = 0;
  for (const p of partes) { out.set(p, off); off += p.length; }
  return out;
}
async function hkdfExtract(sal: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const s = sal.length === 0 ? new Uint8Array(32) : sal;
  return hmac(s, ikm);
}
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const out: number[] = [];
  let t = new Uint8Array(0);
  let i = 1;
  while (out.length < len) {
    t = await hmac(prk, concat(t, info, new Uint8Array([i])));
    for (const b of t) out.push(b);
    i++;
  }
  return new Uint8Array(out.slice(0, len));
}

// ---------- VAPID (JWT ES256) ----------
async function jwtVapid(audiencia: string): Promise<string> {
  const ponto = b64urlToBytes(VAPID_PUB); // 0x04||x||y (65B)
  const x = ponto.slice(1, 33);
  const y = ponto.slice(33, 65);
  const d = b64urlToBytes(VAPID_PRIV);
  const b64 = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const cab = b64({ typ: "JWT", alg: "ES256" });
  const pay = b64({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID_SUBJECT });
  const chave = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC", crv: "P-256",
      x: bytesToB64url(x), y: bytesToB64url(y), d: bytesToB64url(d),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    chave,
    new TextEncoder().encode(`${cab}.${pay}`),
  );
  return `${cab}.${pay}.${bytesToB64url(sig)}`;
}

// ---------- Criptografia aes128gcm (RFC8291) ----------
async function criptografarPush(
  clientePonto: Uint8Array, clienteAuth: Uint8Array, texto: Uint8Array,
): Promise<{ corpo: Uint8Array; chaveServidor: Uint8Array }> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const parServidor = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const pubServidor = new Uint8Array(await crypto.subtle.exportKey("raw", parServidor.publicKey));
  const pubCliente = await crypto.subtle.importKey("raw", clientePonto, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const segredo = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: pubCliente }, parServidor.privateKey, 256),
  );
  const enc = new TextEncoder();
  // RFC8291 §3.4: IKM = segredo ECDH || ("WebPush: info" || 0x00 || pub_cli || pub_srv),
  // sal = segredo auth; cek/nonce expandidos sem as chaves no info.
  const prkContexto = await hkdfExtract(
    clienteAuth,
    concat(segredo, enc.encode("WebPush: info"), new Uint8Array([0]), clientePonto, pubServidor),
  );
  const cek = await hkdfExpand(prkContexto, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prkContexto, enc.encode("Content-Encoding: nonce\0"), 12);
  const chaveAes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const claro = concat(texto, new Uint8Array([0x02]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chaveAes, claro));
  const rs = new Uint8Array([0, 0, 0x10, 0x00]); // 4096
  const corpo = concat(sal, rs, new Uint8Array([pubServidor.length]), pubServidor, cifrado);
  return { corpo, chaveServidor: pubServidor };
}

async function enviarUma(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<"ok" | "morta" | "falha"> {
  try {
    const url = new URL(sub.endpoint);
    const texto = new TextEncoder().encode(JSON.stringify(payload));
    const { corpo } = await criptografarPush(b64urlToBytes(sub.p256dh), b64urlToBytes(sub.auth), texto);
    const jwt = await jwtVapid(url.origin);
    const resp = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization: `vapid t=${jwt}, k=${VAPID_PUB}`,
        TTL: "86400",
      },
      body: corpo,
    });
    if (resp.status === 404 || resp.status === 410) return "morta";
    return resp.status === 200 || resp.status === 201 || resp.status === 202 ? "ok" : "falha";
  } catch {
    return "falha";
  }
}

// ---------- handler ----------
async function exigirDonoOuStaff(supabase: any, req: Request, pedidoUserId: string | null): Promise<void> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw Object.assign(new Error("Não autenticado."), { status: 401 });
  const { data, error } = await supabase.auth.getUser(jwt);
  const userId = (data as any)?.user?.id;
  if (error || !userId) throw Object.assign(new Error("Sessão inválida."), { status: 401 });
  if (pedidoUserId && pedidoUserId === userId) return; // dono avisando do próprio pedido
  const [{ data: okAdmin }, { data: okFin }, { data: okAten }, { data: okProd }, { data: okMoto }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "financeiro" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "atendente" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "producao" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "motoboy" }),
  ]);
  if (!okAdmin && !okFin && !okAten && !okProd && !okMoto) {
    throw Object.assign(new Error("Sem permissão."), { status: 403 });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!VAPID_PUB || !VAPID_PRIV) {
    return new Response(JSON.stringify({ erro: "VAPID não configurado (secrets)." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const { pedido_id, status } = (await req.json()) as { pedido_id?: string; status?: string };
    if (!pedido_id || !status) {
      return new Response(JSON.stringify({ erro: "pedido_id e status são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pedido, error: ePed } = await supabase
      .from("pedidos")
      .select("id, numero, cliente_nome, user_id, tipo_entrega")
      .eq("id", pedido_id)
      .maybeSingle();
    if (ePed || !pedido) {
      return new Response(JSON.stringify({ erro: "Pedido não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await exigirDonoOuStaff(supabase, req, (pedido as any).user_id ?? null);

    const texto = textoStatus(status, (pedido as any).numero ?? null, (pedido as any).cliente_nome ?? "", (pedido as any).tipo_entrega === "retirada");
    if (!texto) {
      return new Response(JSON.stringify({ enviados: 0, ignorado: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", (pedido as any).user_id)
      .limit(50);
    let ok = 0, falhas = 0;
    const mortas: string[] = [];
    for (const s of (subs ?? []) as any[]) {
      const r = await enviarUma(s, { ...texto, url: `/pedido/${pedido_id}`, pedido: pedido_id });
      if (r === "ok") ok++;
      else if (r === "morta") { mortas.push(s.id); ok++; }
      else falhas++;
    }
    if (mortas.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", mortas);
    }
    // "morta" conta como entregue (limpeza feita; próxima tentativa não repete)
    return new Response(JSON.stringify({ enviados: ok, falhas, removidas: mortas.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro em push-enviar:", e);
    const status = Number((e as any)?.status) || 500;
    return new Response(JSON.stringify({ erro: e instanceof Error ? e.message : String(e) }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
