import { createFileRoute } from "@tanstack/react-router";
import { MinhaContaDemoR2B } from "@/components/reembolsos-estornos/conta-demo-integrada";

export const Route = createFileRoute("/preview/pedidos")({
  head: () => ({ meta: [{ title: "Meus Pedidos — Néia Salgados" }] }),
  // Reutiliza a mesma tela R2-B de "Meus Pedidos" já usada em /conta e em
  // /preview/reembolsos-estornos-cliente: dados fictícios, cartões de pedido,
  // filtros e ações. Nada de placeholder com texto solto.
  component: MinhaContaDemoR2B,
});
