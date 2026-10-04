/**
 * Horário comercial Néia Salgados — America/Sao_Paulo
 * Seg-Sáb 08:00-12:00 e 13:00-22:00, Dom fechado, nunca 12:00-13:00.
 */

export const TZ = "America/Sao_Paulo";

export type Janela = { inicio: string; fim: string };

export const JANELAS_PREFERENCIAIS: Janela[] = [
  { inicio: "18:00", fim: "18:30" },
  { inicio: "18:30", fim: "19:00" },
];

function partesSP(d: Date): { dia: number; minutos: number } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday").toLowerCase();
  // dom, seg, ter, qua, qui, sex, sáb
  const mapa: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, s: 6 };
  let dia = 1;
  if (wd.startsWith("dom")) dia = 0;
  else if (wd.startsWith("seg")) dia = 1;
  else if (wd.startsWith("ter")) dia = 2;
  else if (wd.startsWith("qua")) dia = 3;
  else if (wd.startsWith("qui")) dia = 4;
  else if (wd.startsWith("sex")) dia = 5;
  else dia = 6;
  void mapa;
  const [h, m] = (get("hour") + ":" + get("minute")).split(":").map(Number);
  return { dia, minutos: (h || 0) * 60 + (m || 0) };
}

export function validarAgendamento(
  iso: string,
  agora = new Date(),
  antecedenciaMin = 30,
): { ok: true } | { ok: false; motivo: string } {
  const dt = new Date(iso);
  if (Number.isNaN(+dt)) return { ok: false, motivo: "Escolha data e horário válidos." };
  if (+dt <= agora.getTime() + antecedenciaMin * 60000) {
    return { ok: false, motivo: `Agende com pelo menos ${antecedenciaMin} minutos de antecedência.` };
  }
  const { dia, minutos } = partesSP(dt);
  if (dia === 0) return { ok: false, motivo: "Domingo estamos fechados. Escolha outro dia." };
  const manha = minutos >= 8 * 60 && minutos < 12 * 60;
  const tarde = minutos >= 13 * 60 && minutos < 22 * 60;
  if (minutos >= 12 * 60 && minutos < 13 * 60) {
    return { ok: false, motivo: "Não agendamos entre 12:00 e 13:00 (almoço). Escolha outro horário." };
  }
  if (!manha && !tarde) {
    return { ok: false, motivo: "Horário comercial: Seg-Sáb 08:00–12:00 e 13:00–22:00." };
  }
  return { ok: true };
}

export function estaAberto(agora = new Date()): boolean {
  const { dia, minutos } = partesSP(agora);
  if (dia === 0) return false;
  return (minutos >= 8 * 60 && minutos < 12 * 60) || (minutos >= 13 * 60 && minutos < 22 * 60);
}

/** Capacidade simples: soma unidades agendadas na janela vs teto configurável. */
export function janelaLotada(unidadesNaJanela: number, tetoUnidades = 2000): boolean {
  return unidadesNaJanela >= tetoUnidades;
}

export function mensagemLotado(): string {
  return "Este horário está lotado. Escolha outro horário.";
}
