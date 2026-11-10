/**
 * Agente local Windows — Tanca TP-550 via USB.
 * Polling Supabase fila_impressao. Sem dependência de driver específico:
 * usa impressora padrão do Windows (Out-Printer). Rode no notebook da loja.
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.SUPABASE_URL ?? "";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? "";
const PRINTER = process.env.PRINTER_NAME ?? "Tanca TP-550";
const POLL = Number(process.env.POLL_MS ?? 5000);
const IMPRIMIR_PS1 = process.env.IMPRIMIR_PS1 ?? join(dirname(fileURLToPath(import.meta.url)), "imprimir.ps1");
// Política de repetição: erro volta à fila após RETRY_MIN, até MAX_TENTATIVAS.
// "enviando" sem atualização há STUCK_MIN volta à fila (agente reiniciado no meio).
const MAX_TENT = Number(process.env.MAX_TENTATIVAS ?? 5);
const RETRY_MIN = Number(process.env.RETRY_MIN ?? 2);
const STUCK_MIN = 5;

const SB_KEY = PUBLISHABLE || ANON;
const faltando: string[] = [];
if (!URL) faltando.push("SUPABASE_URL");
if (!SB_KEY) faltando.push("SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY como fallback)");
if (!STAFF_EMAIL) faltando.push("STAFF_EMAIL");
if (!STAFF_PASSWORD) faltando.push("STAFF_PASSWORD");
if (faltando.length > 0) {
  console.error(
    "Configuração inválida para o agente de impressão: variáveis ausentes — " +
      faltando.join(", ") +
      ". O agente exige SUPABASE_URL + (SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY) + STAFF_EMAIL + STAFF_PASSWORD; o uso de SUPABASE_SERVICE_ROLE_KEY não é permitido neste agente.",
  );
  process.exit(1);
}

const sb = createClient(URL, SB_KEY);

type AuthState = "AUTH_LOGIN" | "AUTH_OK" | "AUTH_REFRESH_FAILED" | "AUTH_RELOGIN" | "AUTH_RELOGIN_FAILED" | "AUTH_RECOVERED";
let authState: AuthState = "AUTH_LOGIN";
let tentRelogin = 0;
const MAX_TENT_RELOGIN = 3;

async function loginAgente(): Promise<boolean> {
  const { error } = await sb.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
  if (error) {
    authState = "AUTH_RELOGIN_FAILED";
    console.log("INFO auth: falha no login staff; estado AUTH_RELOGIN_FAILED.");
    return false;
  }
  authState = "AUTH_OK";
  console.log("INFO auth: autenticacao staff ok; estado AUTH_OK.");
  return true;
}

async function iniciarAgente(): Promise<void> {
  const ok = await loginAgente();
  if (!ok) process.exit(1);
}

async function tickComAuth(): Promise<void> {
  try {
    await tick();
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    const falhaAuth = /auth|session|jwt|refresh|token|login/i.test(msg);
    if (falhaAuth && authState === "AUTH_OK" && tentRelogin < MAX_TENT_RELOGIN) {
      tentRelogin += 1;
      authState = "AUTH_RELOGIN";
      console.log("INFO auth: sessao indisponivel; tentando novo login staff.");
      const ok = await loginAgente();
      if (ok) {
        authState = "AUTH_RECOVERED";
        await tick();
        return;
      }
    }
    throw e;
  }
}

await iniciarAgente();

function imprimirTexto(texto: string): void {
  const arq = join(tmpdir(), `neia-${Date.now()}.txt`);
  writeFileSync(arq, texto, "utf8");
  // 1) fonte auto-ajustada (imprimir.ps1); 2) fallback Out-Printer.
  try {
    execSync(
      `powershell -ExecutionPolicy Bypass -File "${IMPRIMIR_PS1}" "${arq}" "${PRINTER}"`,
      { stdio: "inherit" },
    );
    return;
  } catch { /* cai no fallback */ }
  // Usa impressora nomeada; se falhar, cai para padrão do Windows.
  // Se o fallback aceitar o trabalho, NÃO lançar erro: lançar aqui marcaria
  // "erro" um job que já foi impresso e o retry imprimiria duas vezes.
  try {
    execSync(`powershell -Command "Get-Content '${arq}' | Out-Printer -Name '${PRINTER}'"`, { stdio: "inherit" });
    return;
  } catch {}
  try {
    execSync(`powershell -Command "Get-Content '${arq}' | Out-Printer"`, { stdio: "inherit" });
    return;
  } catch {}
  throw new Error("Falha ao imprimir: texto enviado mas impressora não respondeu");
}

async function tick(): Promise<void> {
  const agora = Date.now();
  // 1) "enviando" travado (agente caiu no meio da impressão) volta à fila — sem duplicar
  try {
    await sb.from("fila_impressao").update({ status: "pendente", updated_at: new Date().toISOString() })
      .eq("status", "enviando").lt("updated_at", new Date(agora - STUCK_MIN * 60000).toISOString());
  } catch { /* segue */ }
  // 2) erro com tentativas restantes volta à fila após o intervalo (backoff simples)
  try {
    await sb.from("fila_impressao").update({ status: "pendente", updated_at: new Date().toISOString() })
      .eq("status", "erro").lt("tentativa", MAX_TENT).lt("updated_at", new Date(agora - RETRY_MIN * 60000).toISOString());
  } catch { /* segue */ }
  const { data } = await sb.from("fila_impressao").select("*").eq("status", "pendente").order("created_at").limit(5);
  for (const job of data ?? []) {
    if (job.imprimir_apos && +new Date(job.imprimir_apos) > Date.now()) continue;
    // Reserva atômica: só quem mudar pendente->enviando imprime (2 agentes nunca duplicam).
    const { data: claimed, error: claimErr } = await sb.from("fila_impressao").update({ status: "enviando", tentativa: (job.tentativa ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "pendente").select("id");
    if (claimErr || !claimed || claimed.length === 0) continue;
    try {
      imprimirTexto(String(job.payload ?? ""));
      const { error: fimErr } = await sb.from("fila_impressao").update({ status: "impresso", updated_at: new Date().toISOString() }).eq("id", job.id);
      if (fimErr) throw fimErr;
      if (job.pedido_id) await sb.from("pedidos").update({ impresso: true }).eq("id", job.pedido_id);
      console.log(`OK ${job.trabalho_uuid}`);
    } catch (e) {
      await sb.from("fila_impressao").update({ status: "erro", ultimo_erro: String(e), updated_at: new Date().toISOString() }).eq("id", job.id);
      console.error(`ERRO ${job.trabalho_uuid}`, e);
    }
  }
}

setInterval(() => { tickComAuth().catch(console.error); }, POLL);
console.log(`Agente Tanca rodando: impressora="${PRINTER}" poll=${POLL}ms`);
void tickComAuth();
