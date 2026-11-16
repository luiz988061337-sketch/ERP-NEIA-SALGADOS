import { createFileRoute } from "@tanstack/react-router";
import resultadosCss from "@/components/comercial-preview/resultados.css?url";
import { TelaResultados } from "@/components/comercial-preview/tela-resultados";

export const Route = createFileRoute("/preview/comercial/resultados")({
  head: () => ({
    links: [{ rel: "stylesheet", href: resultadosCss }],
    meta: [{ title: "Resultados e Rentabilidade — Comercial demonstrativo — Néia Salgados" }],
  }),
  component: TelaResultados,
});
