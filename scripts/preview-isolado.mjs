/**
 * Gera dist-l1-preview/ (site estático dos 4 ambientes L1, dados fictícios).
 * NÃO chama proteger-dev.mjs (nada aqui precisa de banco), NÃO lê .env para
 * o bundle (envPrefix L1_ISOLATED_* não existe) e NÃO inicia servidor.
 * Uso manual posterior: servir dist-l1-preview/ com qualquer servidor
 * estático local. Sem commit/push/deploy por este script.
 */
import { spawnSync } from "node:child_process";

const r = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--config", "vite.isolated.config.ts"],
  { stdio: "inherit", cwd: process.cwd() },
);
process.exit(r.status ?? 1);
