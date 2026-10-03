export type Frequencia = "semanal" | "quinzenal" | "mensal";

export const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
};

/** Próxima execução a partir de uma data (YYYY-MM-DD). Pura e testável. */
export function proximaData(dataISO: string, frequencia: Frequencia): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const base = new Date(y || 2000, (m || 1) - 1, d || 1);
  if (frequencia === "semanal") base.setDate(base.getDate() + 7);
  else if (frequencia === "quinzenal") base.setDate(base.getDate() + 15);
  else base.setMonth(base.getMonth() + 1);
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${mm}-${dd}`;
}

/** Dias até a data (negativo = atrasado). */
export function diasAte(dataISO: string | null | undefined, ref = new Date()): number | null {
  if (!dataISO) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return null;
  const alvo = new Date(`${dataISO}T12:00:00`);
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dia = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
  return Math.round((dia.getTime() - hoje.getTime()) / 86400000);
}
