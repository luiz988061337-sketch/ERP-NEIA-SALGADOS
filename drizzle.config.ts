import { defineConfig } from "drizzle-kit";

// P0 de 26/11/2026: o drizzle-kit nunca pode migrar produção a partir desta
// worktree. Referências públicas dos projetos (não são segredos).
const PROJETOS_PRODUCAO = ["ruioyioynwwwiqbjznoa", "iqirsunzgavsuhgyjjsi"];
const urlMigracao = process.env.LOVABLE_DB_MIGRATION_URL ?? "";

function ehProducao(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PROJETOS_PRODUCAO.some((ref) => host === `${ref}.supabase.co` || host.includes(ref));
  } catch {
    return false;
  }
}

if (urlMigracao && ehProducao(urlMigracao)) {
  throw new Error(
    "drizzle-kit bloqueado: LOVABLE_DB_MIGRATION_URL aponta para produção. " +
      "Use exclusivamente o projeto de homologação.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: urlMigracao,
  },
});
