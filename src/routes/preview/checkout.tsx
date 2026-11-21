import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * Rota legada do preview (5 etapas, MOCK_ITENS) foi descomissionada.
 * O checkout HOMO-09A é a única implementação ativa; mantemos a URL para
 * não quebrar links antigos, redirecionando para o fluxo real.
 */
export const Route = createFileRoute("/preview/checkout")({
  component: () => <Navigate to="/checkout" replace />,
});
