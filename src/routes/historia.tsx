// REMOÇÃO APROVADA (M16/M17): a página "História" sai da navegação pública.
// Rota antiga redireciona para a home do cardápio.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/historia")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
