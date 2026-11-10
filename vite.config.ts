// @lovable.dev/vite-tanstack-config already includes the core plugin stack — do NOT add those manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  nitro: {
    // Só usa o preset da Vercel quando o build roda NA Vercel (VERCEL=1).
    ...(process.env["VERCEL"] === "1" ? { preset: "vercel" } : {}),
  },
  plugins: [],
});