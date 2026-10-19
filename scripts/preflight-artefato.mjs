#!/usr/bin/env node
/**
 * PRÉ-FLIGHT: CONGELAMENTO E VERIFICAÇÃO DO ARTEFATO DE CORTE.
 *
 * NÃO executa o cutover. NÃO escreve em nenhum banco. Apenas lê:
 *   - `docs/auditoria/homologacao-staging/BUILD-CUTOVER.json`;
 *   - o artefato local em `.output/`;
 *   - o código-fonte (para detectar mudanças posteriores ao build);
 *   - as migrations 0087–0098.
 *
 * Saída: `PREFLIGHT_ARTEFATO_OK` ou `ARTEFATO_DIVERGIU`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".output");
const DOCS = path.join(ROOT, "docs", "auditoria", "homologacao-staging");

let divergencias = [];
let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) {
    falhas++;
    divergencias.push(nome);
  }
}

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

console.log("=== PRÉ-FLIGHT: CONGELAMENTO DO ARTEFATO ===");

// ---------------------------------------------------------------------------
// 1. Manifesto
// ---------------------------------------------------------------------------
const manifestoPath = path.join(DOCS, "BUILD-CUTOVER.json");
ok(existsSync(manifestoPath), "BUILD-CUTOVER.json existe");
const manifesto = JSON.parse(readFileSync(manifestoPath, "utf8"));

console.log(`  versão  : ${manifesto.versao_build}`);
console.log(`  rótulo  : ${manifesto.rotulo_build}`);
console.log(`  sha256  : ${manifesto.sha256_bundle}`);
console.log(`  gerado  : ${manifesto.gerado_em}`);
console.log(`  publicado: ${manifesto.publicacao}`);

// ---------------------------------------------------------------------------
// 2. Recalcula o SHA-256 do artefato em disco (mesmo algoritmo do build)
// ---------------------------------------------------------------------------
const alvos = [];
for (const sub of ["public", "server"]) {
  for (const f of arquivos(path.join(OUT, sub))) {
    if (/\.(js|mjs|cjs|html|css|json)$/i.test(f)) alvos.push(f);
  }
}
alvos.sort();
const h = createHash("sha256");
for (const f of alvos) {
  h.update(path.relative(OUT, f).split(path.sep).join("/"));
  h.update(readFileSync(f));
}
const sha = h.digest("hex");
console.log(`  recalculado: ${sha}`);
ok(sha === manifesto.sha256_bundle, "SHA-256 do artefato em disco confere com o manifesto");
ok(alvos.length === manifesto.arquivos_no_bundle, "contagem de arquivos confere", `${alvos.length} vs ${manifesto.arquivos_no_bundle}`);

// ---------------------------------------------------------------------------
// 3. Código-fonte mudou depois do build?
// ---------------------------------------------------------------------------
const geradoEm = new Date(manifesto.gerado_em).getTime();
const FONTES = [
  { rotulo: "src/", dir: path.join(ROOT, "src") },
  { rotulo: "drizzle/migrations/", dir: path.join(ROOT, "drizzle", "migrations") },
  { rotulo: "scripts/", dir: path.join(ROOT, "scripts") },
  { rotulo: "print-agent/", dir: path.join(ROOT, "print-agent") },
];
const ARQUIVOS_SOLTOS = [
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "eslint.config.js",
  "postcss.config.js",
];

const posteriores = [];
for (const f of ARQUIVOS_SOLTOS) {
  const p = path.join(ROOT, f);
  if (!existsSync(p)) continue;
  const mt = statSync(p).mtimeMs;
  if (mt > geradoEm) posteriores.push({ arquivo: f, mtime: new Date(mt).toISOString() });
}
for (const g of FONTES) {
  if (!existsSync(g.dir)) continue;
  for (const f of arquivos(g.dir)) {
    const mt = statSync(f).mtimeMs;
    if (mt > geradoEm) {
      posteriores.push({
        arquivo: path.relative(ROOT, f).split(path.sep).join("/"),
        mtime: new Date(mt).toISOString(),
      });
    }
  }
}

if (posteriores.length === 0) {
  console.log("  (nenhum arquivo de código-fonte alterado após o build)");
} else {
  console.log("  ARQUIVOS ALTERADOS APÓS O BUILD:");
  for (const p of posteriores) console.log(`    - ${p.arquivo}  (${p.mtime})`);
}

// O `scripts/build-cutover.mjs` é o GERADOR: alterá-lo não altera o bundle
// já gerado (ele não é importado pelo app). Ainda assim é listado, e a
// decisão é do responsável.
const geradorAlterado = posteriores.some((p) => p.arquivo === "scripts/build-cutover.mjs");
const funcionaisAlterados = posteriores.filter(
  (p) => !p.arquivo.startsWith("scripts/") && p.arquivo !== "scripts/build-cutover.mjs",
);
ok(
  funcionaisAlterados.length === 0,
  "nenhum arquivo FUNCIONAL alterado após o build",
  funcionaisAlterados.map((p) => p.arquivo).join(", "),
);
if (geradorAlterado) {
  console.log("  AVISO: o gerador do build foi alterado depois do build (não afeta o bundle em disco).");
}

// ---------------------------------------------------------------------------
// 4. Provas do bundle (re-executadas agora, sobre o artefato em disco)
// ---------------------------------------------------------------------------
const PADROES_LEGADOS = [
  { nome: "rpc reservar_estoque_atomica", re: /rpc\(\s*["'`]reservar_estoque_atomica/g },
  { nome: "rpc liberar_reserva_atomica", re: /rpc\(\s*["'`]liberar_reserva_atomica/g },
  { nome: "insert/update/delete direto reservas_estoque", re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*(insert|update|delete)/g },
  { nome: "insert direto pedidos", re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/g },
  { nome: "insert direto estoque_movimentacoes", re: /from\(\s*["'`]estoque_movimentacoes["'`]\s*\)\s*\.\s*insert/g },
  { nome: "update direto pedidos (cancelamento)", re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*update\(\s*\{\s*status\s*:\s*["'`]cancelado/g },
];
const PADROES_NOVOS = [
  { nome: "criar_pedido_com_reserva (0095)", re: /criar_pedido_com_reserva/g },
  { nome: "cancelar_pedido_atomico (0093)", re: /cancelar_pedido_atomico/g },
  { nome: "registrar_consumo_reserva (0091)", re: /registrar_consumo_reserva/g },
  { nome: "reservar_pedido_atomico (0089, interna)", re: /reservar_pedido_atomico/g },
  { nome: "endpoint /api/versao", re: /api\/versao/g },
  { nome: "guard de versao (x-neia-build)", re: /x-neia-build/g },
];
// NOTA: `liberar_pedido_atomico` (0090) NAO aparece no bundle por desenho:
// e uma funcao do BANCO, chamada internamente por `cancelar_pedido_atomico`
// (0093) como SECURITY DEFINER. O cliente nunca a chama. Sua presenca e
// verificada na migration 0093 (secao 4).

const legadoHits = [];
const novosHits = new Set();
let versaoNoBundle = false;
for (const f of alvos) {
  if (!/\.(js|mjs|cjs)$/i.test(f)) continue;
  const txt = readFileSync(f, "utf8");
  for (const p of PADROES_LEGADOS) {
    const m = txt.match(p.re);
    if (m) legadoHits.push({ padrao: p.nome, arquivo: path.relative(ROOT, f).split(path.sep).join("/"), n: m.length });
  }
  for (const p of PADROES_NOVOS) if (txt.match(p.re)) novosHits.add(p.nome);
  if (txt.includes(manifesto.versao_build)) versaoNoBundle = true;
}
ok(legadoHits.length === 0, "bundle: ZERO call site legado", JSON.stringify(legadoHits));
for (const p of PADROES_NOVOS) ok(novosHits.has(p.nome), `bundle: presente ${p.nome}`);
ok(versaoNoBundle, `bundle: versão ${manifesto.versao_build} gravada`);

// ---------------------------------------------------------------------------
// 5. Flags do build (do manifesto) e coerência com o código
// ---------------------------------------------------------------------------
const V = manifesto.variaveis;
ok(V.VITE_FF_CRIACAO_ATOMICA === "on", "flag VITE_FF_CRIACAO_ATOMICA = on");
ok(V.VITE_FF_CONSUMO_RESERVA === "on", "flag VITE_FF_CONSUMO_RESERVA = on");
ok(V.VITE_FF_CANCELAMENTO_ATOMICO === "on", "flag VITE_FF_CANCELAMENTO_ATOMICO = on");
ok(V.VITE_FF_RESERVA_ATOMICA === "off", "flag VITE_FF_RESERVA_ATOMICA = off");
ok(V.VITE_BUILD_VERSION === manifesto.versao_build, "VITE_BUILD_VERSION == versão do manifesto");
ok(V.VITE_VERSAO_MINIMA === manifesto.versao_build, "VITE_VERSAO_MINIMA == versão do manifesto");

// ---------------------------------------------------------------------------
// 6. Migrations 0087–0098 presentes
// ---------------------------------------------------------------------------
const MIG_DIR = path.join(ROOT, "drizzle", "migrations");
const mig = {};
for (const f of readdirSync(MIG_DIR)) {
  const m = /^(\d{4})_(.+)\.sql$/.exec(f);
  if (m) mig[m[1]] = f;
}
const esperadas = [
  "0087", "0088", "0089", "0090", "0091", "0092", "0093",
  "0094", "0095", "0096", "0097", "0098",
];
for (const n of esperadas) ok(!!mig[n], `migration ${n} presente`, mig[n] || "");
ok(!!mig["0094"], "0094 presente (ATIVA no corte)");
ok(!!mig["0096"], "0096 presente (ATIVA no corte)");
ok(!!mig["0097"], "0097 presente (modelagem de combo)");
ok(!!mig["0098"], "0098 presente (ACL menor privilégio)");

// ---------------------------------------------------------------------------
// 7. Chamadores VIVOS de reservar_estoque_atomica (exige PARAR se houver)
// ---------------------------------------------------------------------------
// Um chamador é considered VIVO se NÃO estiver dentro de um bloco aberto por
// `if (!BUILD_DE_CORTE ...)` (bloco eliminado por constant-folding no bundle
// de corte). A verificação usa INDENTAÇÃO: procura, para cima, o `if (
// !BUILD_DE_CORTE` mais próximo com indentação <= à do chamador.
function indentDe(linha) {
  return linha.length - linha.trimStart().length;
}
function blocoProtegidoAte(linhas, idx) {
  const alvo = indentDe(linhas[idx]);
  for (let i = idx; i >= 0; i--) {
    const l = linhas[i];
    if (!/if\s*\(!BUILD_DE_CORTE/.test(l)) continue;
    if (indentDe(l) <= alvo) return true;
  }
  return false;
}

const srcArquivos = arquivos(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const chamadores = [];
for (const f of srcArquivos) {
  const linhas = readFileSync(f, "utf8").split("\n");
  linhas.forEach((l, i) => {
    if (/rpc\(\s*["'`]reservar_estoque_atomica/.test(l)) {
      chamadores.push({
        arquivo: path.relative(ROOT, f).split(path.sep).join("/"),
        linha: i + 1,
        protegido: blocoProtegidoAte(linhas, i),
      });
    }
  });
}
const vivos = chamadores.filter((c) => !c.protegido);
ok(
  vivos.length === 0,
  "código-fonte: NENHUM chamador VIVO de reservar_estoque_atomica",
  vivos.map((v) => `${v.arquivo}:${v.linha}`).join(", "),
);
for (const c of chamadores) {
  console.log(
    `  (chamador em ${c.arquivo}:${c.linha} — ${c.protegido ? "protegido por BUILD_DE_CORTE (morto no bundle de corte)" : "VIVO"})`,
  );
}

// ---------------------------------------------------------------------------
// 7b. Quem chama a 0090 (liberar_pedido_atomico)? Deve ser a 0093, no banco.
// ---------------------------------------------------------------------------
{
  const m93 = readFileSync(path.join(MIG_DIR, mig["0093"]), "utf8");
  ok(
    /liberar_pedido_atomico/.test(m93),
    "0093 chama liberar_pedido_atomico (0090) no banco",
  );
  const m95 = readFileSync(path.join(MIG_DIR, mig["0095"]), "utf8");
  ok(/reservar_pedido_atomico/.test(m95), "0095 chama reservar_pedido_atomico (0089) no banco");
  const m91 = readFileSync(path.join(MIG_DIR, mig["0091"]), "utf8");
  ok(/reserva_consumos/.test(m91), "0091 grava em reserva_consumos (0087)");
}

// ---------------------------------------------------------------------------
// 8. Veredito
// ---------------------------------------------------------------------------
console.log("");
if (falhas === 0) {
  console.log("PREFLIGHT_ARTEFATO_OK");
} else {
  console.log("ARTEFATO_DIVERGIU");
  for (const d of divergencias) console.log(`  - ${d}`);
  process.exitCode = 1;
}
