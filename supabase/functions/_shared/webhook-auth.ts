const codificador = new TextEncoder();

async function sha256Hex(valor: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", codificador.encode(valor));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function igualdadeConstante(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diferenca = 0;
  for (let indice = 0; indice < a.length; indice += 1) {
    diferenca |= a.charCodeAt(indice) ^ b.charCodeAt(indice);
  }
  return diferenca === 0;
}

export async function autorizarPorSegredo(req: Request, nomesEnv: string[]): Promise<boolean> {
  const cabecalho =
    req.headers.get("x-webhook-secret") ?? req.headers.get("authorization") ?? "";
  const valor = cabecalho.replace(/^Bearer\s+/i, "").trim();
  if (!valor) return false;

  const recebido = await sha256Hex(valor);
  for (const nome of nomesEnv) {
    const esperado = Deno.env.get(nome);
    if (!esperado) continue;
    if (igualdadeConstante(recebido, await sha256Hex(esperado))) return true;
  }
  return false;
}

export function respostaJson(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
