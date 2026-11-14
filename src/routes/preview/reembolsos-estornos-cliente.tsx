import { createFileRoute, Outlet } from "@tanstack/react-router";
import publicCss from "@/components/reembolsos-estornos/cliente-publico.css?url";
import { ClientePreviewProvider } from "@/components/reembolsos-estornos/cliente-sessao";

/**
 * Layout pai R2-B — Meus Pedidos cliente
 * Não renderiza conteúdo próprio, apenas expõe <Outlet /> para index/$id/novo
 */
export const Route = createFileRoute("/preview/reembolsos-estornos-cliente")({
  head: () => ({ links: [{ rel: "stylesheet", href: publicCss }] }),
  component: Layout,
});

function Layout() {
  return <ClientePreviewProvider><Outlet /></ClientePreviewProvider>;
}
