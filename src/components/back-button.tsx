import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

/**
 * Botão padrão de voltar para o ERP Néia Salgados.
 * Usa navegação do TanStack Router com fallback seguro.
 *
 * @param label - Texto do botão (padrão: "Voltar")
 * @param fallback - Rota de fallback quando não há histórico (padrão: "/")
 * @param className - Classes adicionais de estilo
 */
export function BackButton({
  label = "Voltar",
  fallback = "/",
  className,
}: {
  label?: string;
  fallback?: string;
  className?: string;
}) {
  const navigate = useNavigate();

  function handleVoltar() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: fallback });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleVoltar}
      className={[
        "min-h-[44px] shrink-0 border-neutral-700 bg-transparent text-neutral-100 hover:bg-neutral-800 hover:text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Voltar"
    >
      <ArrowLeft className="size-4 mr-1.5" />
      {label}
    </Button>
  );
}
