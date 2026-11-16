import { createFileRoute } from "@tanstack/react-router";
import { ClientesSegmentacao } from "@/components/comercial-preview/tela-clientes";

/**
 * C1 — Clientes / CRM (segmentação e reativação), demonstrativo.
 */
export const Route = createFileRoute("/preview/comercial/clientes")({
  head: () => ({
    meta: [{ title: "Clientes — Segmentação (demonstração) — Néia Salgados" }],
  }),
  component: ClientesSegmentacao,
});
