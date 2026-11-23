import type { Database } from "@/integrations/supabase/types";

export type RemessaProducao = Database["public"]["Tables"]["producao_remessas"]["Row"];

export function progressoProducao(remessas: readonly RemessaProducao[]) {
  const ordenadas = [...remessas].sort((a, b) => a.indice - b.indice);
  return {
    total: ordenadas.length,
    concluidas: ordenadas.filter((r) => r.concluida_em !== null).length,
    proxima: ordenadas.find((r) => r.concluida_em === null),
  };
}

export function itensDaRemessa(remessa: RemessaProducao) {
  if (!Array.isArray(remessa.itens)) return [];
  return remessa.itens.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { nome, quantidade } = item;
    return typeof nome === "string" && typeof quantidade === "number" ? [{ nome, quantidade }] : [];
  });
}
