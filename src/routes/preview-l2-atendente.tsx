import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { CentralAtendenteL2 } from "@/components/admin/central-atendente-l2";

/**
 * PRÉVIA ISOLADA DA CENTRAL DE PEDIDOS DA ATENDENTE.
 *
 * Renderiza o mesmo conteúdo aprovado agora usado por /admin → Pedidos,
 * dentro do shell real do admin, com dados fictícios locais. Não lê nem
 * grava no Supabase; o aceite é apenas uma simulação em memória.
 */
export const Route = createFileRoute("/preview-l2-atendente")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Central da Atendente (dados fictícios)" }],
  }),
  component: PreviewL2Atendente,
});

function PreviewL2Atendente() {
  return (
    <AdminShell
      aba="pedidos"
      onAba={() => {}}
      onRefresh={() => {}}
      usuario="neia@neiasalgados.com"
      modoPreview
    >
      <div className="border-b border-[#D4A94A]/45 bg-[#141310] px-4 py-2 text-xs text-[#F2CE6B]">
        PRÉVIA L2 — Central de Pedidos da Atendente. Dados fictícios locais; nenhuma
        escrita, nenhum pedido real, nenhum pagamento real.
      </div>
      <CentralAtendenteL2 usuario="neia@neiasalgados.com" />
    </AdminShell>
  );
}
