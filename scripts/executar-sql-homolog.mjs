#!/usr/bin/env node
/**
 * Executor de SQL exclusivamente para HOMOLOGAÇÃO, atrás da barreira de
 * destino (P0 de 26/11/2026).
 *
 * Uso:
 *   node scripts/executar-sql-homolog.mjs --arquivo caminho.sql --confirmar
 *
 * Regras:
 *  - o destino precisa ser declarado em --project-ref (ou NEIA_PROJETO_ALVO);
 *  - somente `lflzlcqinarrcgncafol` é aceito;
 *  - `--linked`, `.env` e produção são bloqueados antes de qualquer conexão;
 *  - `--confirmar` é obrigatório (sem ele o script apenas valida e para).
 *
 * Este script NÃO foi executado na entrega do P0: nenhuma migração remota foi
 * aplicada. Ele existe para que a próxima escrita passe pela mesma barreira.
 */

import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";
import {
  RAIZ_PROJETO,
  avaliarOperacao,
  ehExecucaoDireta,
  lerAlvoDosArgumentos,
  limparValor,
} from "./ambiente-seguro.mjs";

function lerArgumento(argv, nome) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] ?? "");
    if (arg === nome) return limparValor(argv[i + 1]);
    if (arg.startsWith(`${nome}=`)) return limparValor(arg.slice(nome.length + 1));
  }
  return "";
}

function principal(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Executor de SQL para homologação, atrás da barreira de destino.",
        "",
        "Uso: node scripts/executar-sql-homolog.mjs --arquivo <arquivo.sql> --confirmar",
        "     (o destino vem de --project-ref <ref> ou NEIA_PROJETO_ALVO)",
      ].join("\n"),
    );
    return 0;
  }

  const arquivo = lerArgumento(argv, "--arquivo");
  const confirmar = argv.includes("--confirmar");
  const alvo = lerAlvoDosArgumentos(argv);

  if (!arquivo) {
    console.error("✖ informe --arquivo <arquivo.sql>.");
    return 1;
  }

  const caminho = resolve(RAIZ_PROJETO, arquivo);
  const relativo = relative(RAIZ_PROJETO, caminho);
  if (relativo.startsWith("..") || !existsSync(caminho) || !statSync(caminho).isFile()) {
    console.error("✖ arquivo inválido: use um .sql existente dentro do repositório.");
    return 1;
  }
  if (!caminho.toLowerCase().endsWith(".sql")) {
    console.error("✖ apenas arquivos .sql são aceitos.");
    return 1;
  }

  const avaliacao = avaliarOperacao({ alvo, raiz: RAIZ_PROJETO });
  if (!avaliacao.ok) {
    console.error(`✖ operação bloqueada: ${avaliacao.motivo}`);
    console.error("  Nenhuma conexão foi aberta e nada foi executado.");
    return 2;
  }

  console.log(`✔ destino autorizado (homologação). Arquivo: ${relativo}`);
  if (!confirmar) {
    console.log("  Simulação: nada foi executado. Repita com --confirmar para aplicar.");
    return 0;
  }

  const comando = [
    "npx",
    "supabase",
    "db",
    "query",
    "--linked",
    "--project-ref",
    avaliacao.projeto,
    "-f",
    caminho,
  ];
  const r = spawnSync(comando[0], comando.slice(1), {
    cwd: RAIZ_PROJETO,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return typeof r.status === "number" ? r.status : 1;
}

if (ehExecucaoDireta(import.meta.url)) {
  process.exit(principal());
}

export { principal };
