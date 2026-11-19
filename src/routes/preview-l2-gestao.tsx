import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { PainelDashboardL2 } from "@/components/admin/dashboard-l2";

/**
 * PRÉVIA VISUAL DO PAINEL DE GESTÃO (L2 — referência preto/dourado).
 *
 * Renderiza o mesmo conteúdo aprovado agora usado por /admin no Preview,
 * dentro do shell REAL do admin (sidebar da referência), com dados fictícios
 * LOCAIS. Não consulta nem grava no Supabase.
 */
export const Route = createFileRoute("/preview-l2-gestao")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Painel de Gestão (dados fictícios)" }],
  }),
  component: PreviewL2Gestao,
});

function PreviewL2Gestao() {
  return (
    <AdminShell
      aba="dashboard"
      onAba={() => {}}
      onRefresh={() => {}}
      usuario="neia@neiasalgados.com"
      modoPreview
    >
      <PainelDashboardL2
        mostrarSelo
        periodo="hoje"
        setPeriodo={() => {}}
        setAba={() => {}}
        notLidas={[]}
        marcarLida={() => {}}
        busca=""
        setBusca={() => {}}
        setPedidoFoco={() => {}}
        setProdutoFoco={() => {}}
        setClienteFoco={() => {}}
      />
    </AdminShell>
  );
}
