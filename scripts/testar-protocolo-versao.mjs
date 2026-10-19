#!/usr/bin/env node
/**
 * TESTE LOCAL DO PROTOCOLO DE VERSÃO (endpoint + cache do documento).
 *
 * Sobe o build em preset `node-server` (porta local), verifica:
 *   1. `GET /api/versao` responde 200;
 *   2. a resposta tem `cache-control: no-store` (bundle velho nao pode ler
 *      uma minima cacheada);
 *   3. `minimo` == `atual` == a versao do build;
 *   4. `corte` == true;
 *   5. o DOCUMENTO HTML tem `cache-control: no-store` (o navegador nao pode
 *      ficar preso no HTML antigo, que aponta para o bundle antigo);
 *   6. o bundle nao contem nenhum call site legado.
 *
 * Nao toca producao, nao publica nada.
 *
 * ATENCAO: o build e refeito com preset node-server. Ao final, rode
 * `node scripts/build-cutover.mjs` para restaurar o artefato de corte
 * (preset de producao).
 */
import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PORTA = Number(process.env["TESTE_VERSAO_PORTA"] || 4598);
const versao = String(Date.now());
const rotulo = "cutover-teste-local";

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

// ---------------------------------------------------------------------------
// 1. Build (preset node-server, só para teste local)
// ---------------------------------------------------------------------------
const env = {
  ...process.env,
  NITRO_PRESET: "node-server",
  VITE_FF_CRIACAO_ATOMICA: "on",
  VITE_FF_CONSUMO_RESERVA: "on",
  VITE_FF_CANCELAMENTO_ATOMICO: "on",
  VITE_FF_RESERVA_ATOMICA: "off",
  VITE_BUILD_VERSION: versao,
  VITE_VERSAO_MINIMA: versao,
  VITE_BUILD_LABEL: rotulo,
};
console.log(`--- build (node-server) para teste local, versao ${versao} ---`);
execSync("npm run build", { cwd: ROOT, env, stdio: "pipe", shell: true });

// ---------------------------------------------------------------------------
// 2. Sobe o servidor
// ---------------------------------------------------------------------------
const srv = spawn(process.execPath, [".output/server/index.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORTA) },
  stdio: "ignore",
});
const encerrar = () => {
  try {
    srv.kill();
  } catch {
    /* ignore */
  }
};
process.on("exit", encerrar);
process.on("SIGINT", () => {
  encerrar();
  process.exit(130);
});

async function esperar(url, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status) return r;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

const base = `http://127.0.0.1:${PORTA}`;

// ---------------------------------------------------------------------------
// 3. Endpoint de versão
// ---------------------------------------------------------------------------
const resp = await esperar(`${base}/api/versao`);
ok(!!resp, "servidor local respondeu");
if (resp) {
  ok(resp.status === 200, `endpoint /api/versao => 200 (obtido ${resp.status})`);
  const cc = resp.headers.get("cache-control") ?? "";
  ok(/no-store/.test(cc), "endpoint: cache-control com no-store", cc);
  const body = await resp.json();
  ok(body.ok === true, "endpoint: ok=true");
  ok(body.atual === versao, "endpoint: atual == versao do build", `${body.atual}`);
  ok(body.minimo === versao, "endpoint: minimo == versao do build", `${body.minimo}`);
  ok(body.corte === true, "endpoint: corte=true");
}

// ---------------------------------------------------------------------------
// 4. Documento HTML sem cache
// ---------------------------------------------------------------------------
const doc = await esperar(`${base}/`);
if (doc) {
  const cc = doc.headers.get("cache-control") ?? "";
  ok(/no-store/.test(cc), "documento HTML: cache-control com no-store", cc);
  const ct = doc.headers.get("content-type") ?? "";
  ok(ct.includes("text/html"), "documento: content-type text/html", ct);
}

// ---------------------------------------------------------------------------
// 5. Bundle sem call site legado
// ---------------------------------------------------------------------------
function arquivos(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...arquivos(p));
    else out.push(p);
  }
  return out;
}
const PADROES = [
  /rpc\(\s*["'`]reservar_estoque_atomica/g,
  /rpc\(\s*["'`]liberar_reserva_atomica/g,
  /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*(insert|update|delete)/g,
  /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/g,
];
let legados = 0;
for (const f of [...arquivos(path.join(ROOT, ".output", "public")), ...arquivos(path.join(ROOT, ".output", "server"))]) {
  if (!/\.(js|mjs|cjs)$/i.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  for (const p of PADROES) if (txt.match(p)) legados++;
}
ok(legados === 0, "bundle: nenhum call site legado", `ocorrências=${legados}`);

// ---------------------------------------------------------------------------
// 6. Fecha o servidor
// ---------------------------------------------------------------------------
encerrar();
const hash = createHash("sha256");
for (const f of arquivos(path.join(ROOT, ".output", "public")).sort()) {
  hash.update(path.basename(f));
  hash.update(readFileSync(f));
}
console.log(`\n(fingerprint do bundle de teste: ${hash.digest("hex").slice(0, 16)}…)`);

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) no protocolo de versão.`);
  process.exit(1);
}
console.log("\nProtocolo de versão: teste local OK.");
console.log("LEMBRETE: rode `node scripts/build-cutover.mjs` para restaurar o artefato de corte (preset de produção).");
