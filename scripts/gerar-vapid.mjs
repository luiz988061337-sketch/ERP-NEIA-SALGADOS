/**
 * Gera par de chaves VAPID (Web Push) com node:crypto, sem dependências.
 * Uso (UMA vez): node scripts/gerar-vapid.mjs
 * - VITE_VAPID_PUBLIC_KEY → .env (é pública, vai no bundle sem problema)
 * - VAPID_PRIVATE_KEY + VAPID_SUBJECT → secrets da Edge Function push-enviar
 *   (Dashboard → Edge Functions → Secrets). NUNCA no código nem no git.
 */
import { generateKeyPairSync } from "node:crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b, "base64");
}

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pubJwk = publicKey.export({ format: "jwk" });
const privJwk = privateKey.export({ format: "jwk" });

const x = unb64url(pubJwk.x);
const y = unb64url(pubJwk.y);
const ponto = Buffer.concat([Buffer.from([0x04]), x, y]); // 65 bytes, formato VAPID
const d = unb64url(privJwk.d); // 32 bytes

if (ponto.length !== 65 || d.length !== 32) {
  console.error("Falha ao gerar chaves (tamanhos inesperados).");
  process.exit(1);
}

console.log(`VITE_VAPID_PUBLIC_KEY=${b64url(ponto)}`);
console.log(`VAPID_PUBLIC_KEY=${b64url(ponto)}`);
console.log(`VAPID_PRIVATE_KEY=${b64url(d)}`);
console.log(`VAPID_SUBJECT=mailto:contato@neiasalgados.com.br`);
