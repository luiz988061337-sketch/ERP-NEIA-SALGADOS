import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Package, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/preview/admin/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Preview" }] }),
  component: PreviewWhatsApp,
});

export function PreviewWhatsApp() {
  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="max-w-2xl text-center">
        <h1 className="font-display text-3xl">WhatsApp (Preview)</h1>
        <p className="text-muted-foreground mt-2">Área visual para integração com WhatsApp - pedidos, mensagens e atendimento.</p>
      </div>
    </div>
  );
}