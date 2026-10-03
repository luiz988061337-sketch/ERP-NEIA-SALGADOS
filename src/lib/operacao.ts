import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import type { Json } from "@/integrations/supabase/types";

/** Registra ação administrativa (best-effort: ignora se tabela ainda não migrada). */
export async function logAdmin(acao: string, detalhe = "") {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("admin_logs").insert({ actor: data.user?.id ?? null, acao, detalhe });
  } catch {
    /* tabela 0003 ainda não aplicada — segue sem log */
  }
}

/** Registra evento de comunicação/pedido no CRM (best-effort). */
export async function logCrmEvent(tipo: string, telefoneNorm: string, extra: Record<string, unknown> = {}) {
  try {
    await supabase.from("crm_events").insert({
      telefone_norm: telefoneNorm,
      tipo,
      pedido_id: (extra["pedido_id"] as string | null | undefined) ?? null,
      campaign_id: (extra["campaign_id"] as string | null | undefined) ?? null,
      meta: (extra["meta"] as Json | undefined) ?? {},
    });
  } catch {
    /* ignora */
  }
}

export type PeriodoKey = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_ant" | "tudo";

export function intervaloPeriodo(key: PeriodoKey, ref = new Date()): { ini: Date | null; fim: Date } {
  const fim = new Date(ref);
  fim.setHours(23, 59, 59, 999);
  const dia = new Date(ref);
  dia.setHours(0, 0, 0, 0);
  switch (key) {
    case "hoje":
      return { ini: dia, fim };
    case "ontem": {
      const ini = new Date(dia);
      ini.setDate(ini.getDate() - 1);
      const f = new Date(ini);
      f.setHours(23, 59, 59, 999);
      return { ini, fim: f };
    }
    case "7d": {
      const ini = new Date(dia);
      ini.setDate(ini.getDate() - 6);
      return { ini, fim };
    }
    case "30d": {
      const ini = new Date(dia);
      ini.setDate(ini.getDate() - 29);
      return { ini, fim };
    }
    case "mes": {
      const ini = new Date(ref.getFullYear(), ref.getMonth(), 1);
      return { ini, fim };
    }
    case "mes_ant": {
      const ini = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const f = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
      return { ini, fim: f };
    }
    case "tudo":
      return { ini: null, fim };
  }
}

export function noIntervalo(iso: string, ini: Date | null, fim: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (ini && t < ini.getTime()) return false;
  if (t > fim.getTime()) return false;
  return true;
}

/** Minutos desde um ISO até ref. Null se inválido. */
export function minutosDesde(iso: string | null | undefined, ref = new Date()): number | null {
  if (!iso) return null;
  const t = +new Date(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((ref.getTime() - t) / 60000);
}
