import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Build estático do preview L1 isolado. NÃO usa o plugin TanStack,
// NÃO passa pelo proteger-dev.mjs e NÃO incorpora variáveis VITE_*
// (envPrefix aponta para prefixo inexistente). Saída: dist-l1-preview/.
export default defineConfig({
  root: "src/isolated-l1",
  base: "./",
  envPrefix: "L1_ISOLATED_",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "../../dist-l1-preview",
    emptyOutDir: true,
  },
});
