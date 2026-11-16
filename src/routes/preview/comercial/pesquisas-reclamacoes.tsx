import { createFileRoute } from "@tanstack/react-router";
import c4Css from "@/components/comercial-preview/pesquisas-reclamacoes.css?url";
import { TelaPesquisasReclamacoes } from "@/components/comercial-preview/tela-pesquisas-reclamacoes";

export const Route = createFileRoute("/preview/comercial/pesquisas-reclamacoes")({
  head: () => ({
    links: [{ rel: "stylesheet", href: c4Css }],
    meta: [{ title: "Pesquisas e Reclamações — Comercial demonstrativo — Néia Salgados" }],
  }),
  component: TelaPesquisasReclamacoes,
});
