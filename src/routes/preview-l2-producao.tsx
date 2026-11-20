import { createFileRoute } from "@tanstack/react-router";
import { PEDIDOS_DEMO_PRODUCAO } from "@/lib/producao-demo-fixtures";
import { Producao } from "@/routes/producao";

/**
 * PRÉVIA VISUAL DA PRODUÇÃO / COZINHA (L2 — referência preto/dourado).
 *
 * Renderiza o painel REAL com pedidos fictícios LOCAIS. Modo conferência:
 * nenhuma escrita no Supabase (status, impressão e reservas bloqueados),
 * nenhum pedido criado ou alterado.
 */

export const Route = createFileRoute("/preview-l2-producao")({
  head: () => ({
    meta: [{ title: "Prévia L2 — Produção/Cozinha (dados fictícios)" }],
  }),
  component: PreviewL2Producao,
});

function PreviewL2Producao() {
  return (
    <div className="l1-producao-preview min-h-screen bg-background">
      <div className="sticky top-0 z-40 border-b border-[#D4A94A]/45 bg-[#141310] px-4 py-2 text-xs text-[#F2CE6B]">
        PRÉVIA L2 — Produção/Cozinha. Pedidos fictícios locais; nenhum status é gravado, nada é
        impresso.
      </div>
      <Producao preview pedidosInjetados={[...PEDIDOS_DEMO_PRODUCAO]} />
    </div>
  );
}
