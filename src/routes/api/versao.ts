import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/versao — PROTOCOLO DE VERSÃO DO FRONTEND (corte).
 *
 * Publica a versão mínima exigida pelo servidor. O bundle (inclusive um
 * bundle ANTIGO em cache) lê este endpoint no boot e se auto-bloqueia se a
 * própria versão for menor que a mínima.
 *
 * Regras:
 *   - `Cache-Control: no-store` — um bundle velho NUNCA pode ler uma
 *     resposta cacheada que finga que o mínimo é o de antes do corte.
 *   - A mínima vem do runtime (`VERSAO_MINIMA`) quando existir, para poder
 *     subir o piso sem rebuild do cliente; senão do valor assado no build
 *     (`VITE_VERSAO_MINIMA`).
 *   - Não exige autenticação: é uma informação pública de versão, e o
 *     cliente precisa dela ANTES de autenticar.
 */

function envRuntime(nome: string): string {
  try {
    const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const v = p?.env?.[nome];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

// Acesso DIRETO ao env de build: o `define` do Vite grava o literal no
// bundle do servidor. Ver `src/lib/corte.ts` para a mesma regra.
const VERSAO_BUILD_SERVIDOR: string = import.meta.env.VITE_BUILD_VERSION || "0";
const VERSAO_MINIMA_BUILD_SERVIDOR: string = import.meta.env.VITE_VERSAO_MINIMA || "0";
const ROTULO_BUILD_SERVIDOR: string = import.meta.env.VITE_BUILD_LABEL || "sem-rotulo";

export const Route = createFileRoute("/api/versao")({
  server: {
    handlers: {
      GET: async () => {
        const atual = VERSAO_BUILD_SERVIDOR;
        const minima = envRuntime("VERSAO_MINIMA") || VERSAO_MINIMA_BUILD_SERVIDOR;
        const rotulo = ROTULO_BUILD_SERVIDOR;
        const emCorte = minima !== "0" && Number(minima) > 0;

        return Response.json(
          {
            ok: true,
            atual,
            minimo: minima,
            rotulo,
            corte: emCorte,
            observacao: emCorte
              ? "Bundle desatualizado sera bloqueado. Recarregue a pagina."
              : "Sem politica de versao minima ativa.",
          },
          {
            headers: {
              // Imprescindivel: sem no-store o proprio navegador cacheia a
              // resposta e o bundle velho nunca ve a minima nova.
              "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
              pragma: "no-cache",
              expires: "0",
            },
          },
        );
      },
    },
  },
});
