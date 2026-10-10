import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/preview/admin/impressao")({
  head: () => ({ meta: [{ title: "Impressão — Preview" }] }),
  component: PreviewImpressao,
});

export function PreviewImpressao() {
  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="max-w-2xl text-center">
        <Printer className="mx-auto size-12 text-primary" />
        <h1 className="font-display text-3xl mt-4">Impressão (Preview)</h1>
        <p className="text-muted-foreground mt-2">Fila de impressão preservada visualmente. Cadeia de impressão Tanca TP-550 mantida intacta (apenas representação visual).</p>
        <p className="text-xs text-muted-foreground mt-4">Nota: Nenhuma alteração na lógica de impressão foi feita neste preview.</p>
      </div>
    </div>
  );
}