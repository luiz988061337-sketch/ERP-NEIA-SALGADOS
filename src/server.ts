import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// ===========================================================================
// CACHE DO DOCUMENTO (protocolo de versão do frontend / corte)
// ===========================================================================
// Os assets têm nomes com hash de conteúdo (`/assets/*` => immutable), então o
// cache longo deles é seguro. O DOCUMENTO HTML, porém, é o que aponta para o
// bundle: se o navegador guardar o HTML antigo, ele continua pedindo os
// assets antigos e roda o bundle antigo mesmo depois do corte.
//
// Por isso o documento nunca é cacheado no navegador. Quem controla a
// versão mínima é o endpoint `/api/versao` (sempre `no-store`), que o bundle
// lê no boot e que bloqueia bundles desatualizados.
//
// A barreira de segurança NÃO é o cache: é o lockdown de ACL no banco
// (revoke de DML/RPC legadas) + o guard de versão.
function normalizarCacheDocumento(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  if (response.headers.has("cache-control")) return response;
  const headers = new Headers(response.headers);
  headers.set(
    "cache-control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalizado = await normalizeCatastrophicSsrResponse(response);
      return normalizarCacheDocumento(normalizado);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
