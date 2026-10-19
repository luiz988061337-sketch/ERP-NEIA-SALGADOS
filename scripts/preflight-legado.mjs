#!/usr/bin/env node
/**
 * PRÉ-FLIGHT: AUDITORIA FINAL DOS CAMINHOS LEGADOS NO CÓDIGO-FONTE.
 *
 * NÃO executa o cutover. Apenas lê o código.
 *
 * Para cada padrão perigoso, classifica:
 *   - PROTEGIDO: está dentro de um bloco `if (!BUILD_DE_CORTE ...)` =>
 *     eliminado em tempo de build (comprovado no bundle: 0 call sites);
 *   - VIVO: alcançável no bundle de corte => **PAREI** (relatar).
 *
 * A evidência DEFINITIVA é o bundle (`scripts/preflight-artefato.mjs`), que
 * roda o mesmo grep sobre os 270 arquivos publicados. Este script é a
 * camada de defesa em profundidade no fonte.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

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

function indentDe(l) {
  return l.length - l.trimStart().length;
}

/** O chamador está dentro de um bloco `if (!BUILD_DE_CORTE ...)`? */
function dentroDeBlocoProtegido(linhas, idx) {
  const alvo = indentDe(linhas[idx]);
  for (let i = idx; i >= 0; i--) {
    const l = linhas[i];
    if (!/if\s*\(\s*!BUILD_DE_CORTE/.test(l)) continue;
    if (indentDe(l) <= alvo) return true;
  }
  return false;
}

const PADROES = [
  {
    id: "1. INSERT/UPSERT/DELETE direto em reservas_estoque",
    re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*(insert|upsert|delete)/,
  },
  {
    id: "2. UPDATE direto em reservas_estoque (cancelamento de reserva)",
    re: /from\(\s*["'`]reservas_estoque["'`]\s*\)\s*\.\s*update/,
  },
  { id: "3. RPC reservar_estoque_atomica", re: /rpc\(\s*["'`]reservar_estoque_atomica/ },
  { id: "4. RPC liberar_reserva_atomica", re: /rpc\(\s*["'`]liberar_reserva_atomica/ },
  {
    id: "5. Cancelamento direto de pedido (UPDATE status=cancelado)",
    re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*update\(\s*\{\s*status\s*:\s*["'`]cancelado/,
  },
  {
    id: "6. DELETE compensatório de pedido",
    re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*delete/,
  },
  {
    id: "7. INSERT direto em pedidos (criação sem 0095)",
    re: /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/,
  },
  {
    id: "8. INSERT/UPDATE direto em estoque_movimentacoes",
    re: /from\(\s*["'`]estoque_movimentacoes["'`]\s*\)\s*\.\s*(insert|update|delete)/,
  },
  {
    id: "9. INSERT direto em pedido_itens (fora da 0095)",
    re: /from\(\s*["'`]pedido_itens["'`]\s*\)\s*\.\s*insert/,
  },
];

const alvos = arquivos(path.join(ROOT, "src")).filter(
  (f) => /\.(ts|tsx)$/.test(f) && !f.includes(path.join("integrations", "supabase", "types")),
);

const relatorio = [];
let vivos = 0;
let protegidos = 0;

console.log("=== PRÉ-FLIGHT: AUDITORIA DE CAMINHOS LEGADOS (CÓDIGO-FONTE) ===");
for (const p of PADROES) {
  const hits = [];
  for (const f of alvos) {
    const linhas = readFileSync(f, "utf8").split("\n");
    linhas.forEach((l, i) => {
      if (p.re.test(l)) {
        hits.push({
          arquivo: path.relative(ROOT, f).split(path.sep).join("/"),
          linha: i + 1,
          texto: l.trim().slice(0, 110),
          protegido: dentroDeBlocoProtegido(linhas, i),
        });
      }
    });
  }
  const nVivos = hits.filter((h) => !h.protegido).length;
  const nProt = hits.length - nVivos;
  vivos += nVivos;
  protegidos += nProt;
  const status = nVivos === 0 ? "OK  " : "FALHA";
  console.log(
    `${status} ${p.id}  — total=${hits.length} vivos=${nVivos} protegidos=${nProt}`,
  );
  for (const h of hits) {
    console.log(
      `       ${h.protegido ? "PROTEGIDO" : ">>> VIVO  "} ${h.arquivo}:${h.linha}  ${h.texto}`,
    );
  }
  relatorio.push({ padrao: p.id, total: hits.length, vivos: nVivos, protegidos: nProt, hits });
}

console.log("");
console.log(`protected=${protegidos}  vivos=${vivos}`);

// ---------------------------------------------------------------------------
// Confirmação específica: PDV e atendimento SEMPRE passam pela 0095
// ---------------------------------------------------------------------------
console.log("");
console.log("=== PDV / ATENDIMENTO / CHECKOUT / RECORRENTES: usam a 0095? ===");
for (const rota of ["pdv.tsx", "atendente.tsx", "checkout.tsx", "recorrentes.tsx"]) {
  const f = path.join(ROOT, "src", "routes", rota);
  const txt = readFileSync(f, "utf8");
  const usa0095 = /decidirCriacaoAtomica/.test(txt);
  const temGuard = /if \(!BUILD_DE_CORTE && !atomico\)|if \(!BUILD_DE_CORTE && !criadoAtomico\)/.test(txt);
  const temInsertDireto = /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/.test(txt);
  console.log(
    `  ${rota.padEnd(18)} 0095=${usa0095 ? "SIM" : "NAO"}  guarda=${temGuard ? "SIM" : "NAO"}  insert-direto-presente-no-fonte=${temDireto(txt) ? "SIM (protegido)" : "NAO"}`,
  );
  if (!usa0095) console.log(`     >>> ATENÇÃO: ${rota} não usa a 0095!`);
}
function temDireto(txt) {
  return /from\(\s*["'`]pedidos["'`]\s*\)\s*\.\s*insert/.test(txt);
}

console.log("");
if (vivos === 0) {
  console.log("PREFLIGHT_LEGADO_OK");
} else {
  console.log("PREFLIGHT_LEGADO_COM_CAMINHO_VIVO");
  process.exitCode = 1;
}
