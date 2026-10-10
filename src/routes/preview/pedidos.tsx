import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/preview/pedidos")({
  head: () => ({ meta: [{ title: "Meus Pedidos — Preview" }] }),
  component: PreviewMeusPedidos,
});

export function PreviewMeusPedidos() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl text-center">
        <h1 className="font-display text-3xl">Meus Pedidos (Preview)</h1>
        <p className="text-muted-foreground mt-2">Lista moderna de pedidos do cliente com acompanhamento.</p>
      </div>
    </div>
  );
}