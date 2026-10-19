#!/usr/bin/env node
/**
 * BUILD DEFINITIVO DE CUTOVER - script local (NAO publica nada).
 *
 * Gera o build EXATO que sera usado na janela de corte, com as flags
 * compile-time corretas, e grava a identificacao/hash do artefato.
 *
 * Passos:
 *   1. fixa as variaveis de ambiente do bundle de corte;
 *   2. roda `npm run build`;
 *   3. PROVA que o caminho legado NAO esta no bundle (grep no artefato);
 *   4. PROVA que a versao do bundle esta gravada;
 *   5. grava `docs/auditoria/homologacao-staging/BUILD-CUTOVER.json`
 *      com hash, variaveis, data e resultados.
 *
 * Nao publica, nao deploya, nao toca em producao.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs", "auditoria", "homologacao-staging");
const OUT = path.join(ROOT, ".output");

// ---------------------------------------------------------------------------
// 1. Variaveis do bundle de corte
// ---------------------------------------------------------------------------
// A versao pode ser FIXADA por `BUILD_VERSION` (reproduzibilidade: o mesmo
// pin gera o mesmo bundle) ou gerada (epoch-ms, monotônica).
const versaoFixada = process.env["BUILD_VERSION"];
const versao = versaoFixada && /^\d{10,}$/.test(versaoFixada) ? versaoFixada : String(Date.now());
const rotulo =
  process.env["BUILD_LABEL"] ||
  `cutover-${new Date(Number(versao)).toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}`;

const VARS = {
  // --- Flags compile-time do bundle de corte -----------------------------
  VITE_FF_CRIACAO_ATOMICA: "on",
  VITE_FF_CONSUMO_RESERVA: "on",
  VITE_FF_CANCELAMENTO_ATOMICO: "on",
  // 0089 e chamada INTERNAMENTE pela 0095 (SECURITY DEFINER). O navegador
  // nunca a chama => flag OFF de proposito (ver src/lib/corte.ts).
  VITE_FF_RESERVA_ATOMICA: "off",
  // --- Protocolo de versao -----------------------------------------------
  VITE_BUILD_VERSION: versao,
  VITE_VERSAO_MINIMA: versao,
  VITE_BUILD_LABEL: rotulo,
};

console.log("=== BUILD DEFINITIVO DE CUTOVER (local, sem publicar) ===");
console.log(`versao : ${versao}`);
console.log(`rotulo : ${rotulo}`);
for (const [k, v] of Object.entries(VARS)) console.log(`  ${k}=${v}`);

// ---------------------------------------------------------------------------
// 2. Build
// ---------------------------------------------------------------------------
const env = { ...process.env, ...VARS };
console.log("\n--- npm run build ---");
const ehWindows = process.platform === "win32";
// `shell: true` e necessario no Windows (Node >= 20 falha com EINVAL ao
// spawnar .cmd). A string e fixa (sem entrada do usuario), logo nao ha
// injecao de shell.
execSync("npm run build", {
  cwd: ROOT,
  env,
  stdio: "inherit",
  ...(ehWindows ? { shell: true } : {}),
});

// ---------------------------------------------------------------------------
// 3. Prova: o caminho legado NAO esta no bundle
// ---------------------------------------------------------------------------
// A prova olha PADRAO DE CHAMADA (call site), nao simples mencao textual:
// mencoes em comentario/documentacao sao inofensivas; uma chamada e o que
// importa. Os padroes exigem aspas/aspas crase + parenteses, o que nao ocorre
// em prosa.
const PADROES_LEGADOS = [
  { nome: "rpc reservar_estoque_atomica", re: /rpc\(\s*["'`]reservar_estoque_atomica/g },
  { nome: "rpc liberar_reserva_atomica", re: /rpc\(\s*["'`]liberar_reserva_atomica/g },
  { nome: "insert direto reservas_estoque", re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*insert/g },
  { nome: "update direto reservas_estoque", re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*update/g },
  { nome: "delete direto reservas_estoque", re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*delete/g },
  { nome: "insert direto pedidos", re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/g },
  { nome: "insert direto estoque_movimentacoes", re: /from\(\s*["'`]estoque_movimentacoes["'`]\s*\)\s*\.\s*insert/g },
];

// RPCs novas que DEVEM estar presentes (o bundle de corte e o caminho novo).
const PADROES_NOVOS = [
  { nome: "rpc criar_pedido_com_reserva (0095)", re: /criar_pedido_com_reserva/g },
  { nome: "rpc cancelar_pedido_atomico (0093)", re: /cancelar_pedido_atomico/g },
  { nome: "rpc registrar_consumo_reserva (0091)", re: /registrar_consumo_reserva/g },
];

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

const todos = [...arquivos(path.join(OUT, "public")), ...arquivos(path.join(OUT, "server"))];
const ocorrencias = [];
const novosPresentes = new Set();
for (const f of todos) {
  if (!/\.(js|mjs|cjs)$/i.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  for (const p of PADROES_LEGADOS) {
    const m = txt.match(p.re);
    if (m) ocorrencias.push({ arquivo: path.relative(ROOT, f), padrao: p.nome, n: m.length });
  }
  for (const p of PADROES_NOVOS) {
    if (txt.match(p.re)) novosPresentes.add(p.nome);
  }
}

console.log("\n--- Prova de remocao do caminho legado (call sites) ---");
if (ocorrencias.length === 0) {
  console.log(`OK: nenhum call site legado em ${todos.length} arquivos de bundle.`);
} else {
  console.error("FALHA: call sites legados presentes no bundle:");
  for (const o of ocorrencias) console.error(`  ${o.padrao} x${o.n} em ${o.arquivo}`);
  process.exit(1);
}

console.log("\n--- Prova de presenca do fluxo novo ---");
for (const p of PADROES_NOVOS) {
  const ok = novosPresentes.has(p.nome);
  console.log(`${ok ? "OK" : "FALHA"}: ${p.nome}${ok ? "" : " AUSENTE"}`);
  if (!ok) process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Prova: a versao do bundle esta gravada
// ---------------------------------------------------------------------------
const temVersao = todos
  .filter((f) => /\.(js|mjs|cjs)$/i.test(f))
  .some((f) => readFileSync(f, "utf8").includes(versao));
console.log(`\n--- Prova de versao ---`);
console.log(`${temVersao ? "OK" : "FALHA"}: versao ${versao} gravada no bundle.`);
if (!temVersao) process.exit(1);

// ---------------------------------------------------------------------------
// 5. Hash do artefato + manifesto
// ---------------------------------------------------------------------------
const alvos = [];
for (const sub of ["public", "server"]) {
  for (const f of arquivos(path.join(OUT, sub))) {
    if (/\.(js|mjs|cjs|html|css|json)$/i.test(f)) alvos.push(f);
  }
}
alvos.sort();
const hash = createHash("sha256");
for (const f of alvos) {
  hash.update(path.relative(OUT, f).replace(/\\/g, "/"));
  hash.update(readFileSync(f));
}
const shaBuild = hash.digest("hex");

const manifesto = {
  gerado_em: new Date().toISOString(),
  versao_build: versao,
  versao_fixada: Boolean(versaoFixada),
  rotulo_build: rotulo,
  sha256_bundle: shaBuild,
  arquivos_no_bundle: alvos.length,
  variaveis: VARS,
  flags_observadas: {
    VITE_FF_CRIACAO_ATOMICA: "on",
    VITE_FF_RESERVA_ATOMICA:
      "off - 0089 e chamada internamente pela 0095 (SECURITY DEFINER); o cliente nunca a chama",
    VITE_FF_CONSUMO_RESERVA: "on",
    VITE_FF_CANCELAMENTO_ATOMICO: "on",
  },
  marcadores_legados_ausentes_no_bundle: PADROES_LEGADOS.map((p) => p.nome),
  fluxo_novo_presente_no_bundle: [...novosPresentes],
  publicacao: "NAO PUBLICADO - artefato somente local",
};

writeFileSync(
  path.join(DOCS, "BUILD-CUTOVER.json"),
  JSON.stringify(manifesto, null, 2) + "\n",
  "utf8",
);

console.log(`\nSHA-256 do bundle : ${shaBuild}`);
console.log("Manifesto gravado em docs/auditoria/homologacao-staging/BUILD-CUTOVER.json");
console.log("\nOK: build de corte pronto (local). NADA foi publicado.");
