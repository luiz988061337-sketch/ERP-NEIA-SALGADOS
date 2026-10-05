/**
 * Smoke test: sobe o dev server, visita as rotas publicas e confere que o HTML
 * contem o conteudo esperado. Falha (exit 1) se alguma rota quebrar ou se um
 * texto obrigatorio sumir do HTML.
 *
 * Uso: npm run smoke
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const PORTA = Number(process.env.SMOKE_PORT ?? 4199);
const BASE = `http://127.0.0.1:${PORTA}`;

const ROTAS = [
  { rota: "/", termos: ["Monte seu combo", "Orçamento de salgados"] },
  { rota: "/calculadora", termos: ["Orçamento de salgados", "Fornecemos somente os salgados", "Copiar orçamento"] },
  { rota: "/combo", termos: ["Monte seu combo"] },
  { rota: "/carrinho", termos: [] },
  { rota: "/checkout", termos: ["Finalizar", "Pagamento"] },
  { rota: "/conta", termos: ["Pedido"] },
  { rota: "/auth", termos: [] },
  { rota: "/orcamentos", termos: [] },
  { rota: "/producao", termos: [] },
  { rota: "/motoboy", termos: ["otoboy"] },
  { rota: "/fiscal", termos: ["Fiscal"] },
  { rota: "/admin", termos: [] },
];

const ERROS_SSR = ["Application Error", "Internal Server Error", "Unhandled", "useServerFn"];

async function esperarServidor(tentativas = 40) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const resp = await fetch(BASE, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) return true;
    } catch {
      // ainda subindo
    }
    await sleep(1000);
  }
  return false;
}

// Sobe o vite local sem depender de PATH (npx.cmd nem sempre resolve no
// Windows) e sem shell (kill limpo, sem órfãos).
const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

// Preflight: sem as chaves o SSR inteiro retorna 500 (o client recusa subir
// sem env de propósito). Falha rápido com instrução em vez de esperar 40s.
{
  let envTexto = "";
  try {
    if (existsSync(join(raiz, ".env"))) envTexto = readFileSync(join(raiz, ".env"), "utf8");
  } catch { /* sem .env */ }
  const temUrl = Boolean(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)
    || /VITE_SUPABASE_URL\s*=\s*https?:\/\//.test(envTexto);
  const temKey = Boolean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY)
    || /VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*\S+/.test(envTexto);
  if (!temUrl || !temKey) {
    console.error("✗ smoke abortado: .env sem VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.");
    console.error("  Copie .env.example para .env e preencha (chaves do Dashboard Supabase). Sem isso o SSR retorna 500.");
    process.exit(2);
  }
}
const viteBin = join(raiz, "node_modules", "vite", "bin", "vite.js");
const servidor = spawn(process.execPath, [viteBin, "dev", "--port", String(PORTA), "--host", "127.0.0.1"], {
  cwd: raiz,
  stdio: ["ignore", "ignore", "pipe"],
});
let saidaErro = "";
servidor.stderr?.on("data", (d) => {
  saidaErro += String(d);
});
servidor.on("error", (err) => {
  saidaErro += `\n[spawn] ${err.message}`;
});

let falhas = 0;
try {
  if (!(await esperarServidor())) {
    console.error(`\n✗ dev server não respondeu na porta ${PORTA}`);
    if (saidaErro.trim()) console.error(`--- stderr do vite ---\n${saidaErro.trim().slice(-3000)}`);
    process.exit(1);
  }

  console.log(`\nSmoke test em ${BASE}\n`);
  for (const { rota, termos } of ROTAS) {
    try {
      const resp = await fetch(`${BASE}${rota}`, { signal: AbortSignal.timeout(90000) });
      const html = await resp.text();
      const problemas = [];
      if (resp.status !== 200) problemas.push(`HTTP ${resp.status}`);
      for (const marca of ERROS_SSR) {
        if (html.includes(marca)) problemas.push(`marcador de erro: "${marca}"`);
      }
      for (const termo of termos) {
        if (!html.includes(termo)) problemas.push(`texto ausente: "${termo}"`);
      }
      if (problemas.length) {
        falhas += 1;
        console.log(`✗ ${rota} — ${problemas.join("; ")}`);
      } else {
        console.log(`✓ ${rota} (HTTP ${resp.status}, ${html.length} bytes)`);
      }
    } catch (err) {
      falhas += 1;
      console.log(`✗ ${rota} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
} finally {
  servidor.kill();
}

if (falhas > 0) {
  console.error(`\n${falhas} rota(s) com problema.`);
  process.exit(1);
}
console.log("\nTudo certo.");