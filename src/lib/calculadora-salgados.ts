import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CalculadoraConfig = {
  permitir_personalizado: boolean;
  por_pessoa_padrao: number;
  minimo_por_pessoa: number;
  maximo_por_pessoa: number;
};

export const DEFAULT_CALCULADORA_CONFIG: CalculadoraConfig = {
  permitir_personalizado: true,
  por_pessoa_padrao: 20,
  minimo_por_pessoa: 15,
  maximo_por_pessoa: 40,
};

export function useCalculadoraConfig() {
  return useQuery({
    queryKey: ["calculadora-config"],
    retry: false,
    queryFn: async (): Promise<CalculadoraConfig> => {
      const { data, error } = await supabase
        .from("calculadora_config")
        .select("permitir_personalizado, por_pessoa_padrao, minimo_por_pessoa, maximo_por_pessoa")
        .eq("id", true)
        .maybeSingle();
      // Sem a migration 0016 a calculadora segue com os padrões de fábrica.
      if (error) return DEFAULT_CALCULADORA_CONFIG;
      return (data as CalculadoraConfig | null) ?? DEFAULT_CALCULADORA_CONFIG;
    },
  });
}

export function arredondarCombo(qtd: number): number {
  if (qtd <= 0) return 0;
  const resto = qtd % 50;
  return resto === 0 ? qtd : qtd + (50 - resto);
}
