import { MINIMO_COMBO, PASSO_COMBO } from "./totals";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

export { MINIMO_COMBO, PASSO_COMBO };

export type ComboCategoria = {
  slug: string;
  nome: string;
  descricao: string;
  precoUnit: number;
};

/** Fallback estático (usado enquanto não há dados no banco ou em build). */
export const COMBO_CATEGORIAS_FALLBACK: ComboCategoria[] = [
  { slug: "mini-fritos", nome: "Mini Fritos", descricao: "Coxinha, bolinha de queijo, risole, kibe e croquete", precoUnit: 1.6 },
  { slug: "mini-assados", nome: "Mini Assados", descricao: "Esfiha, enroladinho, quibe assado e trouxinha", precoUnit: 2.3 },
  { slug: "mini-pasteis", nome: "Mini Pastéis", descricao: "Carne, queijo, frango e pizza", precoUnit: 2.3 },
  { slug: "mini-pizzas", nome: "Mini Pizzas", descricao: "Calabresa, mussarela, frango e portuguesa", precoUnit: 3.7 },
  { slug: "mini-empadinhas", nome: "Mini Empadinhas", descricao: "Frango, queijo, palmito e carne", precoUnit: 2.4 },
];

/** Busca categorias elegíveis para combo (tipo_venda = combo_50) do banco. */
export async function getComboCategorias(): Promise<ComboCategoria[]> {
  try {
    const { data, error } = await supabase
      .from("categorias")
      .select("slug, nome, descricao")
      .eq("ativo", true)
      .order("ordem");

    if (error || !data) {
      console.warn("Erro ao buscar categorias do combo, usando fallback:", error?.message);
      return COMBO_CATEGORIAS_FALLBACK;
    }

    // Busca preço unitário médio por categoria (produtos combo_50)
    const { data: produtos } = await supabase
      .from("produtos")
      .select("categoria_id, preco, tipo_venda")
      .eq("tipo_venda", "combo_50")
      .eq("disponivel", true);

    const precoPorCat = new Map<string, number>();
    const countPorCat = new Map<string, number>();

    for (const p of (produtos ?? [])) {
      const cat = p.categoria_id;
      if (!cat) continue;
      const atual = precoPorCat.get(cat) ?? 0;
      const count = countPorCat.get(cat) ?? 0;
      precoPorCat.set(cat, atual + (p.preco ?? 0));
      countPorCat.set(cat, count + 1);
    }

    const result: ComboCategoria[] = [];
    for (const cat of data) {
      const count = countPorCat.get(cat.id) ?? 0;
      if (count === 0) continue; -- só categorias com produtos combo_50
      const media = (precoPorCat.get(cat.id) ?? 0) / count;
      result.push({
        slug: cat.slug,
        nome: cat.nome,
        descricao: cat.descricao ?? "",
        precoUnit: Number(media.toFixed(2)),
      });
    }

    return result.length > 0 ? result : COMBO_CATEGORIAS_FALLBACK;
  } catch (e) {
    console.warn("Erro em getComboCategorias:", e);
    return COMBO_CATEGORIAS_FALLBACK;
  }
}

/** Compatibilidade: exporta fallback para código síncrono. */
export const COMBO_CATEGORIAS = COMBO_CATEGORIAS_FALLBACK;

/** Nome curto do sabor para o resumo do combo (tira o "25un" do fim). */
export function saborCurto(nome: string): string {
  return nome.replace(/\s+\d+un$/, "").replace(/^Mini\s+/i, "");
}