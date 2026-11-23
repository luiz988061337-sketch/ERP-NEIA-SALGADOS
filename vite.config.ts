// @lovable.dev/vite-tanstack-config already includes the core plugin stack — do NOT add those manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// @lovable.dev/mcp-js quebra no Windows (compara "C:/..." com "C:\..." e aborta o
// build). Na nuvem Lovable (Linux) funciona, então só desativa localmente no win32.
// Os arquivos de rota já gerados ([.]lovable.oauth.consent, [.well-known]) continuam valendo.
const mcpPlugins = process.platform === "win32" ? [] : [mcpPlugin()];

if (process.env["VERCEL_GIT_COMMIT_REF"] === "resgate-visual-h01-h07-codex") {
  const projeto = "lflzlcqinarrcgncafol";
  const url = `https://${projeto}.supabase.co`;
  if (
    process.env["VERCEL_ENV"] !== "preview" ||
    process.env["NEIA_AMBIENTE"] !== "homologacao" ||
    process.env["VITE_DEMO_PREVIEW"] !== "0" ||
    process.env["VITE_SUPABASE_PROJECT_ID"] !== projeto ||
    process.env["SUPABASE_PROJECT_ID"] !== projeto ||
    process.env["VITE_SUPABASE_URL"] !== url ||
    process.env["SUPABASE_URL"] !== url ||
    !process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.startsWith("sb_publishable_") ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] !== process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]
  ) {
    throw new Error("Resgate H01–H07 exige Preview com o Supabase de homologação e dados operacionais.");
  }
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  nitro: {
    // Só usa o preset da Vercel quando o build roda NA Vercel (VERCEL=1).
    // Incondicional quebrava a publicação pelo Lovable (J.1 item 3).
    ...(process.env["VERCEL"] === "1" ? { preset: "vercel" } : {}),
  },
  plugins: [...mcpPlugins],
});
