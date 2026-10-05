import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new publish, open tabs may request old JS chunks that no longer exist.
// Reload once (guarded by sessionStorage) to fetch the fresh version.
const CHUNK_ERR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
function recarregarUmaVez() {
  const k = "neia-chunk-reload";
  const last = Number(sessionStorage.getItem(k) ?? 0);
  if (Date.now() - last < 10000) return;
  sessionStorage.setItem(k, String(Date.now()));
  window.location.reload();
}
if (typeof window !== "undefined") {
  // Do NOT preventDefault: that makes the failed import resolve to undefined,
  // which crashes the router ("reading 'component'"). Just reload.
  window.addEventListener("vite:preloadError", () => {
    recarregarUmaVez();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (CHUNK_ERR.test(String(e.reason?.message ?? e.reason))) recarregarUmaVez();
  });
  window.addEventListener("error", (e) => {
    if (CHUNK_ERR.test(String(e.message))) recarregarUmaVez();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
