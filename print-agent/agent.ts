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
import { join } from "node:path";

const URL = process.env.SUPABASE_URL ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PRINTER = process.env.PRINTER_NAME ?? "Tanca TP-550";
const POLL = Number(process.env.POLL_MS ?? 5000);

if (!URL || !SERVICE) {
  console.error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do print-agent.");
  process.exit(1);
}

const sb = createClient(URL, SERVICE);

function imprimirTexto(texto: string): void {
  const arq = join(tmpdir(), `neia-${Date.now()}.txt`);
  writeFileSync(arq, texto, "utf8");
  // Usa impressora nomeada; se falhar, cai para padrão do Windows.
  try {
    execSync(`powershell -Command "Get-Content '${arq}' | Out-Printer -Name '${PRINTER}'"`, { stdio: "inherit" });
  } catch {
    execSync(`powershell -Command "Get-Content '${arq}' | Out-Printer"`, { stdio: "inherit" });
  }
}

async function tick(): Promise<void> {
  const { data } = await sb.from("fila_impressao").select("*").eq("status", "pendente").order("created_at").limit(5);
  for (const job of data ?? []) {
    if (job.imprimir_apos && +new Date(job.imprimir_apos) > Date.now()) continue;
    await sb.from("fila_impressao").update({ status: "enviando", tentativa: (job.tentativa ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      imprimirTexto(String(job.payload ?? ""));
      await sb.from("fila_impressao").update({ status: "impresso", updated_at: new Date().toISOString() }).eq("id", job.id);
      if (job.pedido_id) await sb.from("pedidos").update({ impresso: true }).eq("id", job.pedido_id);
      console.log(`OK ${job.trabalho_uuid}`);
    } catch (e) {
      await sb.from("fila_impressao").update({ status: "erro", ultimo_erro: String(e), updated_at: new Date().toISOString() }).eq("id", job.id);
      console.error(`ERRO ${job.trabalho_uuid}`, e);
    }
  }
}

setInterval(() => { tick().catch(console.error); }, POLL);
console.log(`Agente Tanca rodando: impressora="${PRINTER}" poll=${POLL}ms`);
void tick();
