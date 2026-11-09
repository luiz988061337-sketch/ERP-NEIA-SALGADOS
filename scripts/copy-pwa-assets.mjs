/**
 * Script de pós-build para copiar arquivos PWA para .output/public
 * O Vite/TanStack Start nem sempre copia subpastas de public automaticamente.
 * Executa após npm run build para garantir que ícones e screenshots estejam disponíveis.
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, "public");
const OUTPUT_DIR = join(ROOT, ".output", "public");

function copyDir(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Copiar ícones
copyDir(join(PUBLIC_DIR, "icons"), join(OUTPUT_DIR, "icons"));
// Copiar screenshots
copyDir(join(PUBLIC_DIR, "screenshots"), join(OUTPUT_DIR, "screenshots"));

console.log("[pwa-copy-assets] Ícones e screenshots copiados para .output/public");
