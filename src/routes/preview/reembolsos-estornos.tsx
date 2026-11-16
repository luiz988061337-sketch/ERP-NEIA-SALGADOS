import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { Undo2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModuloReembolsos } from "@/components/reembolsos-estornos/modulo";

/**
 * PRÉVIA R1 — Reembolsos e Estornos (módulo demonstrativo independente).
 *
 * Mesmo AdminShell real dos módulos aprovados, com o item "Reembolsos e
 * Estornos" adicionado ao menu SOMENTE nesta rota (prop opcional itemExtra).
 * Dados fictícios locais; nenhuma gravação no Supabase e nenhuma alteração
 * no Financeiro Premium aprovado.
 */
export const Route = createFileRoute("/preview/reembolsos-estornos")({
  head: () => ({
    meta: [{ title: "Prévia R1 — Reembolsos e Estornos (dados fictícios)" }],
  }),
  component: PageReembolsos,
});

function PageReembolsos() {
  return (
    <AdminShell
      aba="reembolsos"
      onAba={() => {}}
      onRefresh={() => {}}
      usuario="neia@neiasalgados.com"
      modoPreview
      itemExtra={{ value: "reembolsos", label: "Reembolsos e Estornos", icon: Undo2 }}
    >
      <div className="l1b-refunds min-h-screen bg-background p-3 sm:p-4">
        {/* Menu mobile (mesmo padrão do Financeiro Premium): gatilho do drawer. */}
        <div className="mb-3 flex items-center gap-2 sm:hidden">
          <SidebarTrigger aria-label="Abrir menu administrativo" />
          <span className="font-display text-sm font-bold text-foreground">Reembolsos e Estornos</span>
        </div>
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
            PRÉVIA R1 — Reembolsos e Estornos. Dados fictícios locais, nada é gravado. Sem integração
            com Financeiro, Caixa, Pedidos, Entregas, Fiscal ou Supabase nesta etapa.
          </p>
          <ModuloReembolsos />
        </div>
      </div>
    </AdminShell>
  );
}
