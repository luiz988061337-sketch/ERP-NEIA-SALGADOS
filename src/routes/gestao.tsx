// REMOÇÃO APROVADA (M16/M17): "Gestão" não aparece duplicada.
// Rota antiga redireciona para o painel Admin.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gestao")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
});
