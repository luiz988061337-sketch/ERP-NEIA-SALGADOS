/** Regras de fidelidade (configuráveis em Configurações → CRM; defaults = regra histórica). */
export type FidelidadeCfg = {
  ativo: boolean;
  reaisPorPonto: number;
  metaPontos: number;
  recompensaValor: number;
};

export const DEFAULT_FIDELIDADE: FidelidadeCfg = {
  ativo: true,
  reaisPorPonto: 5,
  metaPontos: 200,
  recompensaValor: 20,
};

/** Pontos ganhos por um total: 1 ponto a cada X reais. */
export function pontosGanhos(total: number, cfg: FidelidadeCfg = DEFAULT_FIDELIDADE): number {
  if (!cfg.ativo || cfg.reaisPorPonto <= 0) return 0;
  return Math.floor(Math.max(0, Number(total) || 0) / cfg.reaisPorPonto);
}

/** Pode resgatar? Saldo >= meta e recompensa dentro do teto da policy (R$100). */
export function podeResgatar(
  saldo: number,
  cfg: FidelidadeCfg = DEFAULT_FIDELIDADE,
): { ok: true } | { ok: false; motivo: string } {
  if (!cfg.ativo) return { ok: false, motivo: "Programa de fidelidade desativado." };
  if (saldo < cfg.metaPontos) return { ok: false, motivo: `Faltam ${cfg.metaPontos - saldo} pontos.` };
  if (cfg.recompensaValor <= 0 || cfg.recompensaValor > 100) {
    return { ok: false, motivo: "Recompensa fora do limite permitido (máx. R$ 100)." };
  }
  return { ok: true };
}
