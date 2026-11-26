#!/usr/bin/env node
/**
 * CLI da barreira de destino (P0 de 26/11/2026).
 *
 * Uso:
 *   node scripts/validar-destino.mjs --project-ref <ref>
 *   node scripts/validar-destino.mjs --project-ref <ref> --json
 *
 * Saída:
 *   0 = destino autorizado (homologação e configuração coerente)
 *   2 = bloqueado (produção, desconhecido, divergente ou não declarado)
 *   1 = erro de uso
 *
 * Não imprime valores de chaves. Não abre conexão com banco algum.
 */

import {
  PROJETO_HOMOLOGACAO,
  avaliarOperacao,
  ehExecucaoDireta,
  lerAlvoDosArgumentos,
  RAIZ_PROJETO,
} from "./ambiente-seguro.mjs";

function principal(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Barreira de destino dos bancos.",
        "",
        `Somente ${PROJETO_HOMOLOGACAO} pode receber escrita/migração.`,
        "O destino precisa ser declarado explicitamente em --project-ref",
        "(ou NEIA_PROJETO_ALVO). --linked e .env não são autoridade.",
        "",
        "Uso: node scripts/validar-destino.mjs --project-ref <ref> [--json]",
      ].join("\n"),
    );
    return 0;
  }

  const alvo = lerAlvoDosArgumentos(argv);
  const resultado = avaliarOperacao({ alvo, raiz: RAIZ_PROJETO });

  if (argv.includes("--json")) {
    console.log(
      JSON.stringify({
        ok: resultado.ok,
        codigo: resultado.codigo ?? null,
        motivo: resultado.motivo,
      }),
    );
  } else if (resultado.ok) {
    console.log(`✔ ${resultado.motivo}`);
  } else {
    console.error(`✖ operação bloqueada: ${resultado.motivo}`);
    console.error("  Nenhuma conexão foi aberta e nada foi executado.");
  }

  return resultado.ok ? 0 : 2;
}

if (ehExecucaoDireta(import.meta.url)) {
  process.exit(principal());
}

export { principal };
