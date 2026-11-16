import { createFileRoute } from "@tanstack/react-router";
import { PainelComercial } from "@/components/comercial-preview/tela-painel";

/**
 * C1 — Painel Comercial (Marketing e Reativação), demonstrativo.
 */
export const Route = createFileRoute("/preview/comercial/painel")({
  head: () => ({
    meta: [{ title: "Comercial — Marketing e Reativação (demonstração)" }],
  }),
  component: PainelComercial,
});
