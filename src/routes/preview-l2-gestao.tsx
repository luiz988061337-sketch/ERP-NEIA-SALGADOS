import { createFileRoute } from "@tanstack/react-router";
import { DashboardAdmin } from "@/components/admin/dashboard-admin";
import { PEDIDOS, PRODUTOS, CLIENTES_STATS } from "@/routes/preview-l2-gestao-data";

/**
 * PRÉVIA VISUAL DO PAINEL DE GESTÃO (L2 — referência preto/dourado).
 *
 * Renderiza o componente REAL do Dashboard com dados fictícios LOCAIS,
 * apenas para conferir a composição visual contra a referência aprovada.
 * Não consulta nem grava no Supabase; nenhuma fila real é usada.
 */

export const Route = createFileRoute("/preview-l2-gestao")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Painel de Gestão (dados fictícios)" }],
  }),
  component: PreviewL2Gestao,
});

function PreviewL2Gestao() {
  return (
    <div className="min-h-screen bg-background p-3 sm:p-4">
      <div className="mx-auto max-w-[1400px]">
        <p className="mb-3 rounded-lg border border-[#D4A94A] bg-[#17150F] px-3 py-2 text-xs text-[#F2CE6B]">
          PRÉVIA L2 — Painel de Gestão. Dados fictícios locais, nada é gravado.
        </p>
        <DashboardAdmin
          pedidos={PEDIDOS}
          produtos={PRODUTOS}
          profiles={[]}
          clientesStats={CLIENTES_STATS}
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
      </div>
    </div>
  );
}
