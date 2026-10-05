// Validação independente do BR Code gerado pelo app.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { gerarPix } = await import("@/lib/pix.ts");

// CRC16-CCITT independente (implementação diferente da do app)
function crcRef(s) {
  let c = 0xffff;
  const P = 0x1021;
  for (const ch of s) {
    c ^= ch.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ P) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, "0");
}
// Vetor conhecido: "123456789" em CRC16-CCITT-FALSE = 29B1
console.log("CRC sanity (esperado 29B1):", crcRef("123456789"));

// Parser TLV genérico
function parseTLV(s, ini = 0, fim = s.length) {
  const out = [];
  let i = ini;
  while (i + 4 <= fim) {
    const id = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4));
    if (!/^\d+$/.test(s.slice(i + 2, i + 4)) || Number.isNaN(n)) return { err: "tamanho inválido em " + i, out };
    const v = s.slice(i + 4, i + 4 + n);
    if (v.length !== n) return { err: `campo ${id} declara ${n} mas tem ${v.length}`, out };
    out.push([id, v]);
    i += 4 + n;
  }
  if (i !== fim) return { err: "sobra de " + (fim - i) + " chars", out };
  return { out };
}

for (const valor of [46, 46.9, 100]) {
  const pix = gerarPix({ chave: "24913937000116", valor, descricao: "Pedido Neia Salgados" });
  const s = pix.copiaECola;
  console.log("\n=== valor", valor, "===");
  console.log(s);
  const top = parseTLV(s);
  if (top.err) { console.log("FALHA TLV:", top.err); continue; }
  console.log("TLV ok:", top.out.map(([id, v]) => id + "(" + v.length + ")").join(" "));
  const g = Object.fromEntries(top.out);
  const gui = parseTLV(g["26"], 0, g["26"].length);
  console.log("GUI-26:", gui.err ? "FALHA " + gui.err : gui.out.map(([id, v]) => id + "=" + v).join(" | "));
  const ad = parseTLV(g["62"], 0, g["62"].length);
  console.log("AD-62:", ad.err ? "FALHA " + ad.err : ad.out.map(([id, v]) => id + "=" + v).join(" | "));
  const semCRC = s.slice(0, -4);
  console.log("CRC app:", s.slice(-4), "| CRC ref:", crcRef(semCRC), "|", s.slice(-4) === crcRef(semCRC) ? "OK" : "DIVERGE");
  console.log("valor-54:", JSON.stringify(g["54"]));
}
