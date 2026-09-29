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

export type Categoria = {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  ativo: boolean;
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
};

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
