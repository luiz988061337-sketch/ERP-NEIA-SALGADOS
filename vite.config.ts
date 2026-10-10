// @lovable.dev/vite-tanstack-config already includes the core plugin stack — do NOT add those manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// @lovable.dev/mcp-js quebra no Windows (compara "C:/..." com "C:\..." e aborta o
// build). Na nuvem Lovable (Linux) funciona, então só desativa localmente no win32.
// Os arquivos de rota já gerados ([.]lovable.oauth.consent, [.well-known]) continuam valendo.
const mcpPlugins = process.platform === "win32" ? [] : [mcpPlugin()];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
  plugins: [...mcpPlugins],
});
