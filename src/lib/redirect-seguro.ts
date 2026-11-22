const ORIGEM_INTERNA = "https://destino-interno.invalid";

export function destinoInternoSeguro(valor: string | undefined | null): string {
  if (!valor || !valor.startsWith("/")) return "/";
  if (valor.startsWith("//") || valor.includes("\\")) return "/";
  if (/[\u0000-\u001F\u007F]/.test(valor)) return "/";

  try {
    const url = new URL(valor, ORIGEM_INTERNA);
    if (url.origin !== ORIGEM_INTERNA || url.protocol !== "https:") return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}
