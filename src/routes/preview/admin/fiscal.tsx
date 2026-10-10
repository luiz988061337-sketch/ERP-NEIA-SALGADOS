import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/preview/admin/fiscal")({
  head: () => ({ meta: [{ title: "Fiscal — Preview" }] }),
  component: PreviewFiscal,
});

export function PreviewFiscal() {
  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="max-w-2xl text-center">
        <FileText className="mx-auto size-12 text-primary" />
        <h1 className="font-display text-3xl mt-4">Fiscal (Preview)</h1>
        <p className="text-muted-foreground mt-2">Área fiscal representada visualmente. Nenhuma lógica fiscal foi alterada.</p>
      </div>
    </div>
  );
}