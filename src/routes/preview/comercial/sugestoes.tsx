import { createFileRoute } from "@tanstack/react-router";
import campanhasCss from "@/components/comercial-preview/campanhas.css?url";
import sugestoesCss from "@/components/comercial-preview/sugestoes.css?url";
import { TelaSugestoes } from "@/components/comercial-preview/tela-sugestoes";

export const Route = createFileRoute("/preview/comercial/sugestoes")({
  head: () => ({
    links: [{ rel: "stylesheet", href: campanhasCss }, { rel: "stylesheet", href: sugestoesCss }],
    meta: [{ title: "Sugestões de promoções e cupons — Comercial demonstrativo" }],
  }),
  component: TelaSugestoes,
});
