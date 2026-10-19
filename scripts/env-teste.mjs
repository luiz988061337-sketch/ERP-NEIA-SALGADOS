/**
 * Helper dos testes LOCAIS (Node): prepara o stub de `import.meta.env`.
 *
 * O `scripts/alias-loader.mjs` reescreve `import.meta.env` para
 * `globalThis.__vite_env_stub__`. Este helper preenche esse stub.
 *
 * Uso típico (teste de um bundle de corte):
 *
 *   import { prepararEnv } from "./env-teste.mjs";
 *   prepararEnv({ VITE_FF_CRIACAO_ATOMICA: "on" });
 *   const C = await import("@/lib/criacao-atomica.ts");
 *
 * ATENÇÃO: o stub precisa estar pronto ANTES do import do módulo (o módulo
 * lê o env no topo do arquivo). Por isso use `await import(...)` DEPOIS do
 * `prepararEnv(...)`.
 */
export function prepararEnv(vars = {}) {
  globalThis.__vite_env_stub__ = { ...(globalThis.__vite_env_stub__ ?? {}), ...vars };
  return globalThis.__vite_env_stub__;
}

/** Estado padrão: todas as flags de build desligadas (build comum). */
export function prepararEnvPadrao() {
  globalThis.__vite_env_stub__ = {};
  return globalThis.__vite_env_stub__;
}
