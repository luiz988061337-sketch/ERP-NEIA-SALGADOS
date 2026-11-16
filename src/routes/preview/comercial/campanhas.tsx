import { createFileRoute } from "@tanstack/react-router";
import c2Css from "@/components/comercial-preview/campanhas.css?url";
import { TelaCampanhas } from "@/components/comercial-preview/tela-campanhas";

export const Route = createFileRoute("/preview/comercial/campanhas")({
  head: () => ({
    links: [{ rel: "stylesheet", href: c2Css }],
    meta: [{ title: "Campanhas e aprovação — Comercial demonstrativo — Néia Salgados" }],
  }),
  component: TelaCampanhas,
});
