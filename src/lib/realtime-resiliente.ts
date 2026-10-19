/**
 * E9.2 — Resiliência de Realtime/polling (preparação, sem ativar canais).
 *
 * Helpers puros para backoff, fallback, subscriptions e GPS desatualizado.
 * Nenhuma subscription nova é criada aqui; o uso vive nas rotas (E10+).
 */

export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 30000;
export const FALHAS_PARA_POLLING = 3;
export const GPS_LIMITE_MS = 10 * 60 * 1000;

export type Aleatorio = () => number;

/** Backoff exponencial com jitter, limitado (E9.2 §6). */
export function proximoRetryMs(tentativa: number, rand: Aleatorio = Math.random): number {
  const t = Math.max(0, Math.floor(tentativa));
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** t);
  return Math.floor(exp / 2 + rand() * (exp / 2));
}

/** Após N falhas seguidas, cai para polling até o canal recuperar. */
export function deveUsarPolling(falhasConsecutivas: number): boolean {
  return falhasConsecutivas >= FALHAS_PARA_POLLING;
}

/** Registro de subscriptions ativas (evita duplicar channel). */
export function registrarSubscription(ativas: string[], nome: string): string[] {
  return ativas.includes(nome) ? ativas : [...ativas, nome];
}

export function removerSubscription(ativas: string[], nome: string): string[] {
  return ativas.filter((n) => n !== nome);
}

/** GPS desatualizado além do limite (não apresentar como posição atual). */
export function gpsDesatualizado(ultimoUpdateMs: number | null, agoraMs: number): boolean {
  if (ultimoUpdateMs == null) return true;
  return agoraMs - ultimoUpdateMs > GPS_LIMITE_MS;
}

/** Chave de debounce por consulta (evita invalidate em rajada). */
export function chaveDebounce(consulta: string, janelaMs: number, agoraMs: number): string {
  return `${consulta}:${Math.floor(agoraMs / janelaMs)}`;
}
