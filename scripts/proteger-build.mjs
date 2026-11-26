#!/usr/bin/env node
/**
 * Barreira de build (P0 de 26/11/2026).
 *
 * Uso:
 *   node scripts/proteger-build.mjs --exigir homologacao
 *   node scripts/proteger-build.mjs --exigir producao
 *
 *  - `homologacao`: exige Supabase de homologação, `NEIA_AMBIENTE=homologacao`
 *    e `VITE_DEMO_PREVIEW=0`. Bloqueia qualquer referência de produção.
 *  - `producao`: só permite quando o build roda na Vercel de produção
 *    (`VERCEL_ENV=production`) e a configuração aponta para produção.
 *
 * Exit 0 = liberado; 2 = bloqueado. Nunca imprime valores de chaves.
 */

import {
  PROJETO_HOMOLOGACAO,
  PROJETO_PRODUCAO,
  PROJETOS_PRODUCAO,
  carregarConfiguracao,
  ehExecucaoDireta,
  extrairRefDaUrl,
  limparValor,
  RAIZ_PROJETO,
} from "./ambiente-seguro.mjs";

function lerAlvo(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--exigir") return limparValor(argv[i + 1]).toLowerCase();
    if (String(argv[i]).startsWith("--exigir=")) return limparValor(String(argv[i]).split("=")[1]);
  }
  return "";
}

export function avaliarBuild({ exigir, raiz = RAIZ_PROJETO, env = process.env } = {}) {
  const { url, projeto, ambiente } = carregarConfiguracao(raiz, env);
  const refUrl = extrairRefDaUrl(url);
  const refs = [projeto, refUrl].filter(Boolean);
  const producao = refs.some((r) => PROJETOS_PRODUCAO.includes(r.toLowerCase()));
  const demo = limparValor(env.VITE_DEMO_PREVIEW);
  const vercelEnv = limparValor(env.VERCEL_ENV).toLowerCase();

  if (exigir === "homologacao") {
    if (producao) {
      return { ok: false, motivo: "configuração de produção detectada em build de homologação." };
    }
    if (projeto !== PROJETO_HOMOLOGACAO || refUrl !== PROJETO_HOMOLOGACAO) {
      return {
        ok: false,
        motivo: "URL e projeto precisam apontar para o Supabase de homologação.",
      };
    }
    if (ambiente !== "homologacao") {
      return { ok: false, motivo: "NEIA_AMBIENTE precisa ser homologacao." };
    }
    if (demo !== "0") {
      return { ok: false, motivo: "VITE_DEMO_PREVIEW precisa ser 0 na homologação." };
    }
    return { ok: true, motivo: "build de homologação autorizado." };
  }

  if (exigir === "producao") {
    if (projeto !== PROJETO_PRODUCAO || refUrl !== PROJETO_PRODUCAO) {
      return { ok: false, motivo: "build de produção exige a configuração de produção." };
    }
    if (vercelEnv !== "production") {
      return {
        ok: false,
        motivo: "build de produção só é liberado dentro da Vercel (VERCEL_ENV=production).",
      };
    }
    return { ok: true, motivo: "build de produção autorizado pela Vercel." };
  }

  return {
    ok: false,
    motivo: "informe --exigir homologacao ou --exigir producao (fail-closed).",
  };
}

function principal(argv = process.argv.slice(2)) {
  const exigir = lerAlvo(argv);
  const r = avaliarBuild({ exigir });
  if (r.ok) {
    console.log(`✔ ${r.motivo}`);
    return 0;
  }
  console.error(`✖ build bloqueado: ${r.motivo}`);
  console.error("  Nenhum build foi iniciado.");
  return 2;
}

if (ehExecucaoDireta(import.meta.url)) {
  process.exit(principal());
}

export { principal };
