/**
 * Estoque congelado: lotes FEFO + reservas. Lógica pura (testável sem banco).
 * O banco espelha isso em `lotes` + `reservas_estoque` + `estoque_mov` (0023).
 */

export type Lote = {
  id: string;
  produto_id: string;
  codigo: string;
  quantidade: number;
  restante: number;
  validade: string | null; // ISO
  status: "ativo" | "esgotado" | "vencido";
};

export type ReservaAlocacao = { loteId: string; qtd: number };

/** FEFO: validade mais próxima primeiro; sem validade vai por último. */
export function ordenarFEFO(lotes: Lote[]): Lote[] {
  return [...lotes]
    .filter((l) => l.status === "ativo" && l.restante > 0)
    .sort((a, b) => {
      if (!a.validade && !b.validade) return 0;
      if (!a.validade) return 1;
      if (!b.validade) return -1;
      return +new Date(a.validade) - +new Date(b.validade);
    });
}

/** Aloca qtd pelos lotes FEFO. Retorna null se insuficiente. */
export function alocarFEFO(lotes: Lote[], qtd: number): ReservaAlocacao[] | null {
  let falta = Math.floor(Number(qtd) || 0);
  if (falta <= 0) return [];
  const out: ReservaAlocacao[] = [];
  for (const l of ordenarFEFO(lotes)) {
    if (falta <= 0) break;
    const pega = Math.min(l.restante, falta);
    if (pega > 0) {
      out.push({ loteId: l.id, qtd: pega });
      falta -= pega;
    }
  }
  return falta > 0 ? null : out;
}

export function disponivelLotes(lotes: Lote[]): number {
  return lotes.filter((l) => l.status === "ativo").reduce((s, l) => s + Math.max(0, l.restante), 0);
}

export function alertaEstoque(disponivel: number, minimo: number): "ok" | "baixo" | "critico" | "zerado" {
  if (disponivel <= 0) return "zerado";
  if (disponivel <= minimo * 0.5) return "critico";
  if (disponivel <= minimo) return "baixo";
  return "ok";
}

export function validadeProxima(validade: string | null, dias = 7, ref = new Date()): boolean {
  if (!validade) return false;
  const t = +new Date(validade) - ref.getTime();
  return t >= 0 && t <= dias * 86400000;
}
