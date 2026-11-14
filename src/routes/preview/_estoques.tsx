import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EstoquesProvider } from "@/components/estoque-preview/contexto";
import { EstoquesShell } from "@/components/estoque-preview/shell";
import estoqueCss from "@/components/estoque-preview/estoques.css?url";

export const Route = createFileRoute("/preview/_estoques")({
  head: () => ({ links: [{ rel: "stylesheet", href: estoqueCss }] }),
  component: () => (
    <EstoquesProvider>
      <EstoquesShell>
        <Outlet />
      </EstoquesShell>
    </EstoquesProvider>
  ),
});
