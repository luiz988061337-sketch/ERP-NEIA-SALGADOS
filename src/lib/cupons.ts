import { brl } from "@/lib/format";

export type CupomRow = {
  codigo: string;
  tipo: string;
  valor: string | number;
  minimo?: string | number | null;
  ativo?: boolean | null;
  cliente_telefone?: string | null;
  validade_ini?: string | null;
  validade_fim?: string | null;
  max_usos?: number | null;
  produtos_ids?: string[] | null;
};

export type CupomContexto = {
  subtotal: number;
  telefoneDigitado: string;
  usosRegistrados: number;
  produtoIdsNoCarrinho: (string | null | undefined)[];
  agora?: Date;
};

/** Validação única do cupom (mesma regra no checkout; backend via RLS/consulta). */
export function validarCupom(cupom: CupomRow, ctx: CupomContexto): { ok: true; desconto: number } | { ok: false; motivo: string } {
  const agora = ctx.agora ?? new Date();
  if (cupom.ativo === false) return { ok: false, motivo: "Cupom inválido." };
  if (cupom.validade_ini && new Date(cupom.validade_ini) > agora) return { ok: false, motivo: "Este cupom ainda não está válido." };
  if (cupom.validade_fim && new Date(cupom.validade_fim) < agora) return { ok: false, motivo: "Este cupom expirou." };
  const dono = String(cupom.cliente_telefone ?? "").replace(/\D/g, "");
  const tel = String(ctx.telefoneDigitado ?? "").replace(/\D/g, "");
  if (dono && tel !== dono) return { ok: false, motivo: "Este cupom é exclusivo de outro cliente." };
  if (Number(cupom.max_usos ?? 0) > 0 && ctx.usosRegistrados >= Number(cupom.max_usos)) {
    return { ok: false, motivo: "Este cupom atingiu o limite de usos." };
  }
  const parts = Array.isArray(cupom.produtos_ids) ? cupom.produtos_ids : [];
  if (parts.length > 0 && !ctx.produtoIdsNoCarrinho.some((id) => id && parts.includes(id))) {
    return { ok: false, motivo: "Este cupom vale só para produtos específicos." };
  }
  const minimo = Number((cupom as any).valor_minimo ?? cupom.minimo ?? 0);
  if (ctx.subtotal < minimo) return { ok: false, motivo: `Cupom válido em pedidos acima de ${brl(minimo)}.` };
  const valor = cupom.tipo === "percentual" ? (ctx.subtotal * Number(cupom.valor)) / 100 : Number(cupom.valor);
  return { ok: true, desconto: Math.min(valor, ctx.subtotal) };
}
