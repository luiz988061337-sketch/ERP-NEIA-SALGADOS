import { createFileRoute } from "@tanstack/react-router";
import { EstoqueSuprimentos } from "@/components/estoque-preview/tela-suprimentos";
export const Route = createFileRoute("/preview/_estoques/estoque-insumos")({
  head: () => ({ meta: [{ title: "Estoque de Insumos — demonstração Néia Salgados" }] }),
  component: () => <EstoqueSuprimentos tipo="insumos" />,
});
