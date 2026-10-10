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
  instagram?: string;
  facebook?: string;
  site?: string;
  google_avaliacao?: string;
  /** Prazos comerciais em minutos (migration 0059; promessa ao cliente, não tempo técnico). */
  retirada_prazo_min?: number | null;
  retirada_prazo_max?: number | null;
  entrega_prazo_min?: number | null;
  entrega_prazo_max?: number | null;
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
  instagram: "",
  facebook: "",
  site: "",
  google_avaliacao: "",
  retirada_prazo_min: 40,
  retirada_prazo_max: 60,
  entrega_prazo_min: 60,
  entrega_prazo_max: 90,
};

export const COLUNAS_LOJA =
  "nome, telefone, endereco, bairro, cidade, complemento, referencia, instrucoes_retirada, mapa_lat, mapa_lng, pix_chave, instagram, facebook, site, google_avaliacao";

const COLUNAS_PRAZOS =
  "retirada_prazo_min, retirada_prazo_max, entrega_prazo_min, entrega_prazo_max";

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
      const base = { ...DEFAULT_LOJA_CONFIG, ...((data as Partial<LojaConfig> | null) ?? {}) };
      // Prazos (migration 0059): banco ainda sem as colunas cai aqui sem quebrar a loja.
      try {
        const { data: prazos, error: erroPrazos } = await supabase
          .from("loja_config")
          .select(COLUNAS_PRAZOS)
          .eq("id", true)
          .maybeSingle();
        if (!erroPrazos && prazos) return { ...base, ...((prazos as Partial<LojaConfig>) ?? {}) };
      } catch {
        /* mantém os padrões 40-60 / 60-90 */
      }
      return base;
    },
  });
}

/** Prazos comerciais com fallback seguro (min>0, min<=max; nunca quebra a tela). */
export function prazosAtendimento(cfg: Partial<LojaConfig> | null | undefined): {
  retiradaMin: number;
  retiradaMax: number;
  entregaMin: number;
  entregaMax: number;
} {
  const num = (v: unknown, padrao: number): number => {
    const n = Number(v);
    return v === "" || v == null || !Number.isFinite(n) || n <= 0 ? padrao : Math.floor(n);
  };
  const retiradaMin = num(cfg?.retirada_prazo_min, 40);
  const retiradaMax = Math.max(retiradaMin, num(cfg?.retirada_prazo_max, 60));
  const entregaMin = num(cfg?.entrega_prazo_min, 60);
  const entregaMax = Math.max(entregaMin, num(cfg?.entrega_prazo_max, 90));
  return { retiradaMin, retiradaMax, entregaMin, entregaMax };
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