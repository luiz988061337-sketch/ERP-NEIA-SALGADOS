import { createFileRoute } from "@tanstack/react-router";
import { EstoqueSalgados } from "@/components/estoque-preview/tela-salgados";
export const Route = createFileRoute("/preview/_estoques/estoque-salgados")({
  head: () => ({ meta: [{ title: "Estoque de Salgados — demonstração Néia Salgados" }] }),
  component: EstoqueSalgados,
});
