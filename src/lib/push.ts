/**
 * Web Push da Néia Salgados (sem Firebase/vendor): registra o SW, pede permissão,
 * grava a inscrição e dispara avisos de status via Edge Function push-enviar.
 * Tudo aqui é opt-in e falha silenciosamente sem suporte (iOS exige PWA instalado).
 */

export function suportePush(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function estadoPush(): "nao-suportado" | "negado" | "ativo" | "pedir" {
  if (!suportePush()) return "nao-suportado";
  const p = Notification.permission;
  if (p === "denied") return "negado";
  if (p === "granted") return "ativo";
  return "pedir";
}

/** base64url → bytes (chave VAPID e chaves da inscrição). Pura e testável. */
export function base64UrlParaBytes(s: string): Uint8Array {
  const b64 = String(s ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Extrai endpoint + chaves de um PushSubscription (puro e testável). */
export function extrairInscricao(sub: {
  endpoint: string;
  getKey?: (nome: string) => ArrayBuffer | null;
}): { endpoint: string; p256dh: string; auth: string } | null {
  if (!sub?.endpoint || typeof sub.getKey !== "function") return null;
  const p256 = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!p256 || !auth) return null;
  const b64 = (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { endpoint: sub.endpoint, p256dh: b64(p256), auth: b64(auth) };
}

function chaveVapid(): string {
  return String((import.meta as any)?.env?.["VITE_VAPID_PUBLIC_KEY"] ?? "");
}

/**
 * Registra SW + pede permissão + grava inscrição. Retorna "ok" | motivo.
 * Idempotente: reinscrever o mesmo endpoint faz upsert.
 */
export async function ativarPush(
  client: any,
  userId: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!suportePush()) return { ok: false, motivo: "nao-suportado" };
  const vapid = chaveVapid();
  if (!vapid) return { ok: false, motivo: "sem-chave" };
  if (!userId) return { ok: false, motivo: "sem-login" };
  try {
    const reg = await navigator.serviceWorker.register("/sw-neia.js", { scope: "/" });
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return { ok: false, motivo: permissao };
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlParaBytes(vapid).buffer as ArrayBuffer,
    });
    const insc = extrairInscricao(sub as any);
    if (!insc) return { ok: false, motivo: "sem-chaves" };
    const { error } = await client.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: insc.endpoint,
        p256dh: insc.p256dh,
        auth: insc.auth,
        user_agent: String(navigator.userAgent ?? "").slice(0, 200),
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, motivo: "banco" };
    return { ok: true };
  } catch {
    return { ok: false, motivo: "falha" };
  }
}

/**
 * Avisa a Edge Function (fire-and-forget): ela monta o texto e envia a quem
 * assinou. Retorna true se ao menos 1 push foi entregue. Nunca quebra o
 * fluxo de status — erro aqui é só log.
 */
export async function notificarPush(client: any, pedidoId: string, status: string): Promise<boolean> {
  if (!pedidoId || !status) return false;
  try {
    const { data } = await client.functions.invoke("push-enviar", { body: { pedido_id: pedidoId, status } });
    return Number((data as any)?.enviados ?? 0) > 0;
  } catch {
    /* push é melhor esforço */
    return false;
  }
}
