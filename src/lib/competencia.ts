/**
 * Competência mensal com fronteiras exatas (Etapa P, item 6).
 * America/Sao_Paulo não tem DST desde 2019: offset fixo -03:00.
 * Retorna instantes UTC [ini, fim) — fim é o dia 1 do mês seguinte,
 * então fevereiro, meses de 30 dias e a virada 21h/00h caem no mês certo
 * em todos os painéis. Nunca usar `${mes}-31` como limite.
 */
export const SP_OFFSET = "-03:00";

export function faixaCompetencia(mes: string): { ini: string; fim: string } {
  const m = /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);
  const partes = m.split("-").map(Number);
  const y = partes[0] ?? 2000;
  const mo = partes[1] ?? 1;
  const ini = new Date(Date.UTC(y, (mo as number) - 1, 1, 3, 0, 0));
  const fim = new Date(Date.UTC(y, mo as number, 1, 3, 0, 0));
  return { ini: ini.toISOString(), fim: fim.toISOString() };
}

/** Dia Corrente em SP como YYYY-MM-DD (para "hoje" consistente). */
export function hojeSP(d = new Date()): string {
  const sp = new Date(d.getTime() - 3 * 3600000);
  return sp.toISOString().slice(0, 10);
}
