#!/usr/bin/env node
/**
 * Verificação pós-build de homologação (P0 de 26/11/2026).
 *
 * Uso: node scripts/verificar-bundle-homolog.mjs .output
 *
 * Falha (exit 1) se o bundle contiver qualquer referência de produção.
 * Exige ao menos uma referência ao projeto de homologação.
 * Não imprime segredos: apenas contagens e nomes de arquivos.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROJETO_HOMOLOGACAO, PROJETOS_PRODUCAO, RAIZ_PROJETO } from "./ambiente-seguro.mjs";

const EXTENSOES = new Set([".js", ".mjs", ".cjs", ".html", ".json", ".css", ".map"]);

function listar(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    let info;
    try {
      info = statSync(caminho);
    } catch {
      continue;
    }
    if (info.isDirectory()) saida.push(...listar(caminho));
    else if (EXTENSOES.has(caminho.slice(caminho.lastIndexOf(".")).toLowerCase()))
      saida.push(caminho);
  }
  return saida;
}

const ambienteVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV === "preview";
const diretorio = process.argv[2] ?? (ambienteVercel ? ".vercel/output" : ".output");
const alvo = resolve(RAIZ_PROJETO, diretorio);
let arquivos = [];
try {
  arquivos = listar(alvo);
} catch {
  console.error(`✖ diretório de build não encontrado: ${diretorio}`);
  process.exit(1);
}

let homolog = 0;
const producao = [];
for (const arquivo of arquivos) {
  let texto = "";
  try {
    texto = readFileSync(arquivo, "utf8");
  } catch {
    continue;
  }
  if (texto.includes(PROJETO_HOMOLOGACAO)) homolog += 1;
  for (const ref of PROJETOS_PRODUCAO) {
    if (texto.includes(ref)) producao.push(arquivo);
  }
}

console.log(`arquivos verificados: ${arquivos.length}`);
console.log(`arquivos com referência de homologação: ${homolog}`);
console.log(`arquivos com referência de produção: ${new Set(producao).size}`);

if (producao.length > 0) {
  console.error("✖ bundle contém referência de PRODUÇÃO. Publicação bloqueada.");
  process.exit(1);
}
if (homolog === 0) {
  console.error("✖ nenhuma referência ao projeto de homologação foi encontrada.");
  process.exit(1);
}
console.log("✔ bundle limpo: somente homologação.");
