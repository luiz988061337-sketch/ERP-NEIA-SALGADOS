import { createFileRoute } from "@tanstack/react-router";
import { CadastroCombos } from "@/components/estoque-preview/tela-combos";
export const Route = createFileRoute("/preview/_estoques/combos")({
  head: () => ({ meta: [{ title: "Cadastro de Combos — demonstração Néia Salgados" }] }),
  component: CadastroCombos,
});
