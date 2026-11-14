import { createFileRoute } from "@tanstack/react-router";
import { EstoqueSuprimentos } from "@/components/estoque-preview/tela-suprimentos";
export const Route = createFileRoute("/preview/_estoques/estoque-embalagens")({
  head: () => ({ meta: [{ title: "Estoque de Embalagens — demonstração Néia Salgados" }] }),
  component: () => <EstoqueSuprimentos tipo="embalagens" />,
});
