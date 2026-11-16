import { createFileRoute, Outlet } from "@tanstack/react-router";
import comercialCss from "@/components/comercial-preview/comercial.css?url";
import { ComercialProviderLayout } from "@/components/comercial-preview/shell";

/**
 * Layout pai C1 — Preview Comercial.
 * Mesmo AdminShell aprovado; estado local compartilhado entre as rotas.
 */
export const Route = createFileRoute("/preview/comercial")({
  head: () => ({ links: [{ rel: "stylesheet", href: comercialCss }] }),
  component: Layout,
});

function Layout() {
  return (
    <ComercialProviderLayout>
      <Outlet />
    </ComercialProviderLayout>
  );
}
