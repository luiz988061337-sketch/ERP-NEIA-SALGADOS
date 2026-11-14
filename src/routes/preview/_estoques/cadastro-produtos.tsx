import { createFileRoute } from "@tanstack/react-router";
import { CadastroProdutosDemo } from "@/components/estoque-preview/tela-produtos";

export const Route = createFileRoute("/preview/_estoques/cadastro-produtos")({
  head: () => ({ meta: [{ title: "Cadastro de Produtos — demonstração Néia Salgados" }] }),
  component: CadastroProdutosDemo,
});
