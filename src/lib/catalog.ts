import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import hero from "@/assets/hero.jpg";
import fritos from "@/assets/cat-fritos.jpg";
import assados from "@/assets/cat-assados.jpg";

export const CATEGORIA_IMG: Record<string, string> = {
  "mini-fritos": fritos,
  "mini-assados": assados,
  "mini-pasteis": fritos,
  "mini-pizzas": assados,
  "mini-empadinhas": assados,
  "mini-congelados": hero,
  "kits-para-festa": hero,
  bebidas: assados,
  // slugs legados (bancos ainda não migrados para o catálogo mini)
  "salgados-fritos": fritos,
  "salgados-assados": assados,
  "salgados-congelados": hero,
  "mini-salgados": fritos,
};

export function imagemProduto(imagemUrl: string | null | undefined, slug: string | undefined): string {
  return imagemUrl || CATEGORIA_IMG[slug ?? ""] || hero;
}

export type TipoVenda = "combo_50" | "unidade";

export type Categoria = {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  ativo: boolean;
  /** Preco unitario autoritativo do combo (migration 0097). */
  combo_preco_unit?: string | number | null | undefined;
};

export type Produto = {
  id: string;
  categoria_id: string;
  nome: string;
  descricao: string;
  preco: string | number;
  preco_promocional: string | number | null;
  imagem_url: string | null;
  disponivel: boolean;
  estoque: number;
  /** Novo (migração 0001): combo_50 = múltiplos de 50, unidade = qtd livre. Opcional até migrar o banco. */
  tipo_venda?: TipoVenda | null | undefined;
  destaque?: boolean | null | undefined;
  promo_inicio?: string | null | undefined;
  promo_fim?: string | null | undefined;
  promo_ativo?: boolean | null | undefined;
};

/** Regra de venda: congelados/kits/bebidas = unidade; demais minis = combo_50. */
export function tipoVendaProduto(p: Produto, slug?: string): TipoVenda {
  if (p.tipo_venda === "combo_50" || p.tipo_venda === "unidade") return p.tipo_venda;
  const s = (slug ?? "").toLowerCase();
  if (s.includes("congelado") || s.includes("kit") || s.includes("bebida")) return "unidade";
  return "combo_50";
}

/** Disponibilidade central: catalogo, carrinho e checkout usam a mesma regra. */
export function getDisponibilidadeProduto(p: Produto, slug?: string) {
  const tipo = tipoVendaProduto(p, slug);
  const estoque = Math.max(0, Number(p.estoque ?? 0) || 0);
  const disponivel = p.disponivel !== false && estoque > 0;
  const limiteCompra =
    tipo === "combo_50" ? Math.max(0, Math.floor(estoque / 50) * 50) : estoque;
  return {
    disponivel,
    estoqueDisponivel: estoque,
    limiteCompra,
    tipo,
    motivo: p.disponivel === false ? "Produto indisponível" : estoque <= 0 ? "Esgotado" : undefined,
  };
}

export function isPromoAtiva(p: Produto, hoje = new Date()): boolean {
  if (p.preco_promocional == null) return false;
  if (p.promo_ativo === false) return false;
  const ini = p.promo_inicio ? new Date(p.promo_inicio) : null;
  const fim = p.promo_fim ? new Date(p.promo_fim) : null;
  if (ini && Number.isNaN(ini.getTime()) === false && hoje < ini) return false;
  if (fim && Number.isNaN(fim.getTime()) === false && hoje > fim) return false;
  return true;
}

export function precoFinal(p: Produto): number {
  return Number(p.preco_promocional ?? p.preco);
}

export function useCategorias() {
  return useQuery({
    queryKey: ["categorias"],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("categorias")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Categoria[];
    },
  });
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase.from("produtos").select("*").order("nome");
      if (error) throw error;
      return data as unknown as Produto[];
    },
  });
}

export function useAvaliacoes() {
  return useQuery({
    queryKey: ["avaliacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("produto_id, nota");
      if (error) throw error;
      return data ?? [];
    },
  });
}
