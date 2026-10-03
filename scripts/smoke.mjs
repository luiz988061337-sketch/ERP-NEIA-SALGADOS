/**
 * Smoke test: sobe o dev server, visita as rotas publicas e confere que o HTML
 * contem o conteudo esperado. Falha (exit 1) se alguma rota quebrar ou se um
 * texto obrigatorio sumir do HTML.
 *
 * Uso: npm run smoke
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORTA = Number(process.env.SMOKE_PORT ?? 4199);
const BASE = `http://127.0.0.1:${PORTA}`;

const ROTAS = [
  { rota: "/", termos: ["Monte seu combo", "Orçamento de salgados"] },
  { rota: "/calculadora", termos: ["Orçamento de salgados", "Fornecemos somente os salgados", "Copiar orçamento"] },
  { rota: "/combo", termos: ["Monte seu combo"] },
  { rota: "/carrinho", termos: [] },
  { rota: "/auth", termos: [] },
  { rota: "/orcamentos", termos: [] },
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

const servidor = spawn("npx.cmd", ["vite", "dev", "--port", String(PORTA), "--host", "127.0.0.1"], {
  stdio: "ignore",
  shell: true,
});

let falhas = 0;
try {
  if (!(await esperarServidor())) {
    console.error(`\n✗ dev server não respondeu na porta ${PORTA}`);
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