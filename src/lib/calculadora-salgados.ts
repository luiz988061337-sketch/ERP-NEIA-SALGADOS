import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

export type CalculadoraConfig = {
  permitir_personalizado: boolean;
  por_pessoa_padrao: number;
  minimo_por_pessoa: number;
  maximo_por_pessoa: number;
  zap_contato: string;
  orcamento_validade_dias: number;
};

export const DEFAULT_CALCULADORA_CONFIG: CalculadoraConfig = {
  permitir_personalizado: true,
  por_pessoa_padrao: 20,
  minimo_por_pessoa: 15,
  maximo_por_pessoa: 40,
  zap_contato: "",
  orcamento_validade_dias: 3,
};

export function useCalculadoraConfig() {
  return useQuery({
    queryKey: ["calculadora-config"],
    retry: false,
    queryFn: async (): Promise<CalculadoraConfig> => {
      const { data, error } = await supabase
        .from("calculadora_config")
        .select("permitir_personalizado, por_pessoa_padrao, minimo_por_pessoa, maximo_por_pessoa, zap_contato, orcamento_validade_dias")
        .eq("id", true)
        .maybeSingle();
      // Sem a migration 0016/0019 a calculadora segue com os padrões de fábrica.
      if (error) return DEFAULT_CALCULADORA_CONFIG;
      return { ...DEFAULT_CALCULADORA_CONFIG, ...((data as Partial<CalculadoraConfig> | null) ?? {}) };
    },
  });
}

export function arredondarCombo(qtd: number): number {
  if (qtd <= 0) return 0;
  const resto = qtd % 50;
  return resto === 0 ? qtd : qtd + (50 - resto);
}

export type EstimativaOrcamento = {
  pessoas: number;
  porPessoa: number;
  unidades: number;
  unidadesCombo: number;
  faltamParaCombo: number;
  subtotal: number;
};

/** Estimativa do orçamento: pessoas x por pessoa, fechada em múltiplos de 50. */
export function estimarOrcamento(pessoas: number, porPessoa: number, precoUnit: number): EstimativaOrcamento {
  const p = Math.max(0, Math.round(pessoas));
  const pp = Math.max(0, Math.round(porPessoa));
  const unidades = p * pp;
  const unidadesCombo = arredondarCombo(unidades);
  return {
    pessoas: p,
    porPessoa: pp,
    unidades,
    unidadesCombo,
    faltamParaCombo: unidadesCombo - unidades,
    subtotal: unidadesCombo * Math.max(0, precoUnit),
  };
}

export type DadosOrcamento = {
  nome: string;
  telefone: string;
  tipoEvento: string;
  dataEvento: string;
  pessoas: number;
  porPessoa: number;
  unidades: number;
  unidadesCombo: number;
  categoria: string;
  precoUnit: number;
  subtotal: number;
  validadeDias: number;
  observacoes: string;
};

export function mensagemOrcamento(d: DadosOrcamento): string {
  const linhas = [
    `*Orçamento — ${d.categoria}*`,
    `Pessoas: ${d.pessoas}`,
    `Por pessoa: ${d.porPessoa}`,
    `Quantidade: ${d.unidadesCombo} unidades`,
    `Estimativa: ${brl(d.subtotal)} (entrega combinada na confirmação)`,
  ];
  if (d.tipoEvento) linhas.push(`Tipo de evento: ${d.tipoEvento}`);
  if (d.dataEvento) {
    const data = new Date(`${d.dataEvento}T12:00:00`);
    const rotulo = Number.isNaN(+data)
      ? d.dataEvento
      : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    linhas.push(`Data desejada: ${rotulo}`);
  }
  linhas.push(`Validade da estimativa: ${d.validadeDias} dias`);
  if (d.observacoes) linhas.push(`Observações: ${d.observacoes}`);
  return `Olá! Vim pelo site e gostaria de um orçamento.\n\n${linhas.join("\n")}`;
}
