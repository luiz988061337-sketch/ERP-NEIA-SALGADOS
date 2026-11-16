import { createFileRoute } from "@tanstack/react-router";
import { PDV } from "@/routes/pdv";

/**
 * PRÉVIA VISUAL DO PDV (L2 — referência preto/dourado).
 *
 * Renderiza o PDV REAL com catálogo fictício LOCAL, dentro do mesmo shell do
 * Dashboard. Modo conferência: nenhuma escrita no Supabase (finalizar venda
 * desativado), nenhum pedido criado, nenhum estoque tocado.
 */

const CATEGORIAS = [
  { id: "cat-fritos", slug: "fritos", nome: "Fritos" },
  { id: "cat-assados", slug: "assados", nome: "Assados" },
  { id: "cat-pasteis", slug: "pasteis", nome: "Pastéis" },
  { id: "cat-congelados", slug: "congelados", nome: "Congelados" },
  { id: "cat-combos", slug: "combos", nome: "Combos" },
];

const PRODUTOS = [
  { id: "p1", nome: "Coxinha de Frango", categoria_id: "cat-fritos", preco: 6.5, disponivel: true, destaque: true, tipo_venda: "unidade" },
  { id: "p2", nome: "Kibe de Carne", categoria_id: "cat-fritos", preco: 7.75, disponivel: true, destaque: true, tipo_venda: "unidade" },
  { id: "p3", nome: "Risole de Queijo", categoria_id: "cat-assados", preco: 8.6, disponivel: true, destaque: true, tipo_venda: "unidade" },
  { id: "p4", nome: "Bolinha de Queijo", categoria_id: "cat-assados", preco: 8, disponivel: true, destaque: true, tipo_venda: "unidade" },
  { id: "p5", nome: "Empada de Frango", categoria_id: "cat-assados", preco: 8.56, disponivel: true, destaque: false, tipo_venda: "unidade" },
  { id: "p6", nome: "Pastel de Queijo", categoria_id: "cat-pasteis", preco: 7.2, disponivel: true, destaque: false, tipo_venda: "unidade" },
  { id: "p7", nome: "Coxinha Congelada 50un", categoria_id: "cat-congelados", preco: 80, disponivel: true, destaque: false, tipo_venda: "unidade" },
  { id: "p8", nome: "Combo Festa 100un", categoria_id: "cat-combos", preco: 145, disponivel: true, destaque: true, tipo_venda: "combo_50" },
];

export const Route = createFileRoute("/preview-l2-pdv")({
  head: () => ({
    meta: [{ title: "Prévia L2 — PDV/Balcão (dados fictícios)" }],
  }),
  component: PreviewL2Pdv,
});

function PreviewL2Pdv() {
  return (
    <div className="l1-pdv-preview min-h-screen bg-background">
      <div className="sticky top-0 z-40 border-b border-[#D4A94A]/45 bg-[#141310] px-4 py-2 text-xs text-[#F2CE6B]">
        PRÉVIA L2 — PDV/Balcão. Catálogo fictício local; nenhum pedido é criado, nenhum estoque é tocado.
      </div>
      <PDV preview produtosInjetados={PRODUTOS} categoriasInjetadas={CATEGORIAS} />
    </div>
  );
}
