/**
 * Capturas de tela de homologação (FASE 10/11).
 *
 * Usa o Chrome/Edge já instalado via puppeteer-core (sem baixar navegador).
 * Somente leitura: navega em páginas públicas do build local (wrangler dev
 * na porta 4173). Nenhuma escrita em Supabase.
 *
 * Uso: node scripts/prints-homologacao.mjs [urlBase] [diretorio]
 * Padrão: http://localhost:4173 -> docs/homologacao/prints
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!CHROME) {
  console.error("Nenhum Chrome/Edge encontrado para as capturas.");
  process.exit(1);
}

const base = process.argv[2] ?? "http://localhost:4173";
const destino = process.argv[3] ?? join(process.cwd(), "docs", "homologacao", "prints");
mkdirSync(destino, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars"],
});

// Espera a rede estabilizar (hidratação + queries do Supabase) e pequeno atraso.
async function estabilizar(page) {
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
}

async function capturar({ nome, url, largura, altura, mobile }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: largura,
      height: altura,
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: !!mobile,
      hasTouch: !!mobile,
    });
    if (mobile) {
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await estabilizar(page);
    await page.screenshot({ path: join(destino, nome), fullPage: false });
    console.log("ok", nome);
  } catch (e) {
    console.error("falhou", nome, e.message);
  } finally {
    await page.close();
  }
}

const paginas = [
  { rota: "/", prefixo: "loja" },
  { rota: "/auth", prefixo: "auth" },
];

for (const { rota, prefixo } of paginas) {
  await capturar({
    nome: `${prefixo}-desktop.png`,
    url: `${base}${rota}`,
    largura: 1280,
    altura: 800,
  });
  await capturar({
    nome: `${prefixo}-celular.png`,
    url: `${base}${rota}`,
    largura: 390,
    altura: 844,
    mobile: true,
  });
}

await browser.close();
console.log("Capturas concluídas em", destino);
