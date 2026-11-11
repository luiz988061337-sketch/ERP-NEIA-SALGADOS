import { useQuery } from "@tanstack/react-query";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";

/**
 * Configuração comercial de entrega (0103) — fonte única em config_entrega.
 * Leitura pública; escrita somente admin (RLS no banco).
 */
export type ConfigEntrega = {
  id: boolean;
  aceitar_entregas: boolean;
  valor_por_km: number;
  taxa_minima_ativa: boolean;
  taxa_minima: number;
  distancia_max_ativa: boolean;
  distancia_max_km: number;
  gratis_ativa: boolean;
  gratis_acima: number;
  ajuste_manual: boolean;
  origem_nome: string;
  origem_logradouro: string;
  origem_numero: string;
  origem_complemento: string;
  origem_bairro: string;
  origem_cidade: string;
  origem_uf: string;
  origem_cep: string;
  origem_lat: number | null;
  origem_lng: number | null;
  origem_place_id: string;
  atualizado_em: string;
};

export function useConfigEntrega() {
  return useQuery({
    queryKey: ["config-entrega"],
    queryFn: async (): Promise<ConfigEntrega | null> => {
      try {
        const { data, error } = await supabase
          .from("config_entrega")
          .select("*")
          .eq("id", true)
          .maybeSingle();
        if (error) return null;
        return (data as unknown as ConfigEntrega) ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

/** Regime por km ativo? (origem georreferenciada obrigatória). */
export function modoPorKm(cfg: ConfigEntrega | null | undefined): boolean {
  return !!(cfg && cfg.origem_lat != null && cfg.origem_lng != null);
}

export type PrevisaoTaxa = {
  modo: "config" | "legado";
  taxa: number;
  distanciaKm: number | null;
  valorPorKm: number | null;
  fonte: "rota" | "linha_reta" | null;
  entregaGratis: boolean;
  foraDaArea: boolean;
  aceitarEntregas: boolean;
};

export type EntradaPrevisao = {
  lat: number;
  lng: number;
  /** Distância por rota calculada no cliente (Google Directions); opcional. */
  distanciaKm?: number | null;
  subtotal?: number | null;
};

/**
 * Pré-cálculo da taxa NO SERVIDOR (a cobrança real é recalculada de novo na
 * criação do pedido). Falha da rota no cliente não desconta nada: o servidor
 * revalida; se a distância enviada for incoerente, usa a linha reta.
 */
export async function calcularTaxaPreview(
  entrada: EntradaPrevisao,
): Promise<PrevisaoTaxa> {
  const fallback: PrevisaoTaxa = {
    modo: "legado",
    taxa: -1,
    distanciaKm: null,
    valorPorKm: null,
    fonte: null,
    entregaGratis: false,
    foraDaArea: false,
    aceitarEntregas: true,
  };
  try {
    const { data, error } = await supabase.rpc("calcular_taxa_entrega", {
      p_destino_lat: entrada.lat,
      p_destino_lng: entrada.lng,
      p_distancia_km: entrada.distanciaKm ?? null,
      p_subtotal: entrada.subtotal ?? null,
    });
    if (error || !data) return fallback;
    const d = data as Record<string, any>;
    if (d["modo"] === "legado") return { ...fallback, modo: "legado" };
    if (d["modo"] === "config" && d["erro"]) return fallback;
    return {
      modo: "config",
      taxa: Number(d["taxa"] ?? 0),
      distanciaKm: d["distancia_km"] != null ? Number(d["distancia_km"]) : null,
      valorPorKm: d["valor_por_km"] != null ? Number(d["valor_por_km"]) : null,
      fonte: d["fonte"] ?? null,
      entregaGratis: !!d["entrega_gratis"],
      foraDaArea: !!d["fora_da_area"],
      aceitarEntregas: d["aceitar_entregas"] !== false,
    };
  } catch {
    return fallback;
  }
}

export function formatarKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`;
}

export function formatarMoeda(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
