/**
 * Leitor de PIX (Etapa J.1): decisão pura de conciliação.
 * Sem banco/React: testável em scripts/pix-reader.test.mjs.
 *
 * Regra J.1:
 * - Aparelho desconhecido ou token inválido → recusar (feito na API, não aqui).
 * - Valor sem pedido correspondente → CONFERIR (sem_pedido_valor).
 * - 2+ pedidos pendentes com o mesmo valor → nunca confirmar sozinho → CONFERIR.
 * - Exatamente 1 pedido PIX pendente com o mesmo valor → confirmar.
 * - Divergência de valor (fora da tolerância) nunca confirma.
 */

export type CandidatoPix = {
  id: string;
  total?: number | null;
  forma_pagamento?: string | null;
  pagamento_status?: string | null;
  status?: string | null;
};

export type DestinoPix =
  | { acao: "confirmar"; pedidoId: string; motivo: "pedido_unico_mesmo_valor" }
  | {
      acao: "conferir";
      motivo: "sem_pedido_valor" | "multiplos_pedidos_mesmo_valor";
      candidatos: string[];
    };

const TOLERANCIA = 0.005;

/** Arredonda para centavos (evita 45.999999). */
export function normalizarValor(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * Filtra candidatos válidos e decide. Ex.: valor 46 com 1 pedido pix
 * pendente de 46 → confirmar; com 2 pedidos de 46 → conferir.
 */
export function decidirDestinoPix(candidatos: CandidatoPix[], valorEvento: number): DestinoPix {
  const alvo = normalizarValor(valorEvento);
  const validos = (candidatos ?? []).filter((c) => {
    if (!c || typeof c.id !== "string" || !c.id) return false;
    if (c.status === "cancelado") return false;
    if ((c.pagamento_status ?? "pendente") !== "pendente") return false;
    if (String(c.forma_pagamento ?? "").toLowerCase() !== "pix") return false;
    return Math.abs(normalizarValor(Number(c.total ?? NaN)) - alvo) < TOLERANCIA + 1e-9;
  });
  if (validos.length === 1) {
    const unico = validos[0] as CandidatoPix;
    return { acao: "confirmar", pedidoId: unico.id, motivo: "pedido_unico_mesmo_valor" };
  }
  if (validos.length === 0) {
    return { acao: "conferir", motivo: "sem_pedido_valor", candidatos: [] };
  }
  return {
    acao: "conferir",
    motivo: "multiplos_pedidos_mesmo_valor",
    candidatos: validos.map((c) => c.id),
  };
}
