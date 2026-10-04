import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LojaConfig = {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  cidade: string;
  complemento: string;
  referencia: string;
  instrucoes_retirada: string;
  mapa_lat: number | null;
  mapa_lng: number | null;
  pix_chave?: string;
};

export const DEFAULT_LOJA_CONFIG: LojaConfig = {
  nome: "Néia Salgados",
  telefone: "",
  endereco: "",
  bairro: "",
  cidade: "",
  complemento: "",
  referencia: "",
  instrucoes_retirada: "",
  mapa_lat: null,
  mapa_lng: null,
  pix_chave: "",
};

export const COLUNAS_LOJA =
  "nome, telefone, endereco, bairro, cidade, complemento, referencia, instrucoes_retirada, mapa_lat, mapa_lng, pix_chave";

export function useLojaConfig() {
  return useQuery({
    queryKey: ["loja-config"],
    retry: false,
    queryFn: async (): Promise<LojaConfig> => {
      const { data, error } = await supabase
        .from("loja_config")
        .select(COLUNAS_LOJA)
        .eq("id", true)
        .maybeSingle();
      // Sem a migration 0021 a loja usa os padrões.
      if (error) return DEFAULT_LOJA_CONFIG;
      return { ...DEFAULT_LOJA_CONFIG, ...((data as Partial<LojaConfig> | null) ?? {}) };
    },
  });
}

/** "Rua, 123 - Bairro - Cidade" (ignora partes vazias). */
export function enderecoLoja(cfg: LojaConfig): string {
  const partes = [
    [cfg.endereco, cfg.complemento].filter(Boolean).join(", "),
    cfg.bairro,
    cfg.cidade,
  ].filter(Boolean);
  return partes.join(" — ");
}

export function lojaTemEndereco(cfg: LojaConfig): boolean {
  return Boolean(cfg.endereco || cfg.bairro || cfg.cidade);
}

export function pontoDaLoja(cfg: LojaConfig): { lat: number; lng: number; label: string } | null {
  if (cfg.mapa_lat == null || cfg.mapa_lng == null) return null;
  return { lat: Number(cfg.mapa_lat), lng: Number(cfg.mapa_lng), label: cfg.nome || "Loja" };
}

/** Telefone da loja: usa loja_config e cai para o contato da calculadora. */
export function telefoneLoja(loja: LojaConfig, fallback?: string): string {
  return loja.telefone || fallback || "";
}