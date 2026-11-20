import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { Share2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModuloOrigensReembolsos } from "@/components/reembolsos-estornos/origens";

/**
 * PRÉVIA R2-A — Origens das solicitações de reembolso (módulo demonstrativo).
 *
 * Cinco setores (Cliente, Atendente, Motoboy, Funcionários, Compras/Fornecedores)
 * iniciam solicitações reutilizando as regras da R1 e veem o resultado na
 * Central R1 na MESMA sessão demonstrativa. Sem integração entre dispositivos,
 * sem persistência e sem gravação no Supabase; telas operacionais aprovadas
 * permanecem intactas (nenhum botão novo nelas).
 */
export const Route = createFileRoute("/preview/reembolsos-estornos-origens")({
  head: () => ({
    meta: [{ title: "Prévia R2-A — Origens das solicitações (dados fictícios)" }],
  }),
  component: PageOrigensReembolsos,
});

function PageOrigensReembolsos() {
  return (
    <AdminShell
      aba="reembolsos"
      onAba={() => {}}
      onRefresh={() => {}}
      usuario="neia@neiasalgados.com"
      modoPreview
    >
      <div className="min-h-screen bg-background p-3 sm:p-4">
        {/* Menu mobile (mesmo padrão da R1/Financeiro Premium): gatilho do drawer. */}
        <div className="mb-3 flex items-center gap-2 sm:hidden">
          <SidebarTrigger aria-label="Abrir menu administrativo" />
          <span className="font-display text-sm font-bold text-foreground">
            Origens das solicitações
          </span>
        </div>
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA R2-A — Origens das solicitações. Sessão demonstrativa local: sem integração entre
            dispositivos, sem persistência real e sem gravação no Supabase. Nenhum Pix, estorno ou
            pagamento real é executado; nada altera estoque, caixa ou pedidos.
          </p>
          <ModuloOrigensReembolsos />
        </div>
      </div>
    </AdminShell>
  );
}
