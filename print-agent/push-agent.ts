/**
 * Agente local Windows — Web Push sem Edge/deploy.
 * Varrer pedidos a cada POLL: mudou de etapa + cliente assinou → push.
 * Mesma criptografia da Edge push-enviar (VAPID + aes128gcm RFC8291);
 * textos espelham a Edge (fonte canônica). Rode no notebook da loja
 * junto do agente de impressão.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const URL = process.env.SUPABASE_URL ?? "";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? "";
const VAPID_PUB = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:contato@neiasalgados.com.br";
const POLL = Number(process.env.POLL_PUSH_MS ?? 20000);

if (!URL || (!PUBLISHABLE && !ANON) || !STAFF_EMAIL || !STAFF_PASSWORD) {
  console.error("Configure no .env do print-agent: SUPABASE_URL + (SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY) + STAFF_EMAIL + STAFF_PASSWORD.");
  process.exit(1);
}
if (!VAPID_PUB || !VAPID_PRIV) {
  console.error("Configure no .env: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT).");
  process.exit(1);
}

const sb = createClient(URL, PUBLISHABLE || ANON);
const { error } = await sb.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
if (error) {
  console.error("Login do agente push falhou.", error.message);
  process.exit(1);
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

// ---------- HKDF manual ----------
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
  return hmac(sal.length === 0 ? new Uint8Array(32) : sal, ikm);
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

// ---------- VAPID + aes128gcm (igual à Edge) ----------
async function jwtVapid(audiencia: string): Promise<string> {
  const ponto = b64urlToBytes(VAPID_PUB);
  const d = b64urlToBytes(VAPID_PRIV);
  const b64 = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const cab = b64({ typ: "JWT", alg: "ES256" });
  const pay = b64({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID_SUBJECT });
  const chave = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: bytesToB64url(ponto.slice(1, 33)), y: bytesToB64url(ponto.slice(33, 65)), d: bytesToB64url(d) },
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(`${cab}.${pay}`));
  return `${cab}.${pay}.${bytesToB64url(sig)}`;
}

async function enviarUma(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<"ok" | "morta" | "falha"> {
  try {
    const url = new URL(sub.endpoint);
    const texto = new TextEncoder().encode(JSON.stringify(payload));
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const parServidor = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    const pubServidor = new Uint8Array(await crypto.subtle.exportKey("raw", parServidor.publicKey));
    const pubCliente = await crypto.subtle.importKey("raw", b64urlToBytes(sub.p256dh), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pubCliente }, parServidor.privateKey, 256));
    const enc = new TextEncoder();
    const prk = await hkdfExtract(
      b64urlToBytes(sub.auth),
      concat(segredo, enc.encode("WebPush: info"), new Uint8Array([0]), b64urlToBytes(sub.p256dh), pubServidor),
    );
    const cek = await hkdfExpand(prk, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdfExpand(prk, enc.encode("Content-Encoding: nonce\0"), 12);
    const chaveAes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chaveAes, concat(texto, new Uint8Array([0x02]))));
    const corpo = concat(sal, new Uint8Array([0, 0, 0x10, 0x00]), new Uint8Array([pubServidor.length]), pubServidor, cifrado);
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

function textoStatus(status: string, numero: number | null, nome: string, retirada: boolean): { titulo: string; corpo: string } | null {
  const n = numero != null ? ` nº ${numero}` : "";
  const quem = nome ? `Olá ${nome}, ` : "";
  switch (status) {
    case "recebido": return { titulo: `Pedido recebido!${n}`, corpo: `${quem}recebemos seu pedido${n}. Já já entra na cozinha.` };
    case "em_producao": return { titulo: `Em produção${n}`, corpo: `Seu pedido${n} já está na cozinha.` };
    case "pronto": return retirada
      ? { titulo: `Pronto para retirada${n}`, corpo: `Pode vir buscar seu pedido${n} na loja.` }
      : { titulo: `Pronto${n}!`, corpo: `Seu pedido${n} está pronto. Estamos chamando o entregador.` };
    case "aguardando_motoboy": return { titulo: `Quase lá${n}`, corpo: `Seu pedido${n} está pronto e o motoboy já foi chamado.` };
    case "em_rota": return { titulo: `Saiu para entrega${n}`, corpo: `O motoboy está a caminho com seu pedido${n}.` };
    case "entregue": return { titulo: `Entregue${n}!`, corpo: `Bom apetite${nome ? `, ${nome}` : ""}! Obrigado pela preferência.` };
    case "cancelado": return { titulo: `Pedido cancelado${n}`, corpo: `Seu pedido${n} foi cancelado. Fale com a loja se precisar.` };
    default: return null;
  }
}

// Observados nesta execução: boot semeia em silêncio (sem inundar).
const vistos = new Map<string, string>();

async function tick(): Promise<void> {
  const { data: pedidos } = await sb.from("pedidos")
    .select("id, numero, cliente_nome, user_id, tipo_entrega, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  for (const p of (pedidos ?? []) as any[]) {
    const anterior = vistos.get(p.id);
    vistos.set(p.id, p.status);
    if (anterior === undefined) continue; // boot: semeia
    if (anterior === p.status) continue; // sem mudança
    const texto = textoStatus(p.status, p.numero ?? null, p.cliente_nome ?? "", p.tipo_entrega === "retirada");
    if (!texto || !p.user_id) continue;
    const { data: subs } = await sb.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", p.user_id)
      .limit(20);
    if (!subs || subs.length === 0) continue;
    let ok = 0;
    const mortas: string[] = [];
    for (const s of subs as any[]) {
      const r = await enviarUma(s, { ...texto, url: `/pedido/${p.id}`, pedido: p.id });
      if (r === "ok") ok++;
      else if (r === "morta") { mortas.push(s.id); ok++; }
    }
    if (mortas.length > 0) await sb.from("push_subscriptions").delete().in("id", mortas);
    console.log(`push #${p.numero} ${p.status}: ${ok}/${subs.length}`);
  }
}

setInterval(() => { tick().catch(console.error); }, POLL);
console.log(`Agente push rodando: poll=${POLL}ms`);
void tick();
