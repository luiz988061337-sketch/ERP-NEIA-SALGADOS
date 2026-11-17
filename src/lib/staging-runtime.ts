export function runtimePreviewIsolado(urlEsperada: string | undefined, chaveEsperada: string | undefined, env: NodeJS.ProcessEnv) {
  if (!urlEsperada) return true;
  return env["VERCEL_ENV"] !== "production" && env["NEIA_AMBIENTE"] === "staging"
    && env["SUPABASE_URL"] === urlEsperada && Boolean(chaveEsperada)
    && env["SUPABASE_PUBLISHABLE_KEY"] === chaveEsperada && !env["SUPABASE_SERVICE_ROLE_KEY"];
}
