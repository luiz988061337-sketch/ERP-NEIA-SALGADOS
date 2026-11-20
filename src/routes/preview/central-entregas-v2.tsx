import { createFileRoute } from "@tanstack/react-router";
import { CentralEntregasPremium } from "@/components/entregas/central-entregas-premium";

export const Route = createFileRoute("/preview/central-entregas-v2")({
  head: () => ({ meta: [{ title: "Prévia — Central de Entregas Rotas" }] }),
  component: PreviewCentralEntregasV2,
});

export function PreviewCentralEntregasV2() {
  return <CentralEntregasPremium modoPreview />;
}
