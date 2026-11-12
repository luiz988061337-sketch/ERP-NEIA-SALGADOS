/**
 * Capturas da replicação visual ERP (tema escuro premium).
 * Uso: node scripts/prints-erp-dark.mjs [urlBase] [diretorio]
 * Padrão: http://localhost:8080 -> docs/erp-dark/prints
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

const base = process.argv[2] ?? "http://localhost:8080";
const destino = process.argv[3] ?? join(process.cwd(), "docs", "erp-dark", "prints");
mkdirSync(destino, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars"],
});

async function estabilizar(page) {
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
}

async function capturar({ nome, rota, largura = 1440, altura = 900, mobile = false, fullPage = false }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: !!mobile });
    if (mobile) {
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
    }
    await page.goto(`${base}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await estabilizar(page);
    await page.screenshot({ path: join(destino, nome), fullPage });
    console.log("ok", nome);
  } catch (e) {
    console.error("falhou", nome, e.message);
  } finally {
    await page.close();
  }
}

const ROTAS = [
  { rota: "/admin", nome: "admin-dashboard-desktop" },
  { rota: "/pdv", nome: "pdv-desktop" },
  { rota: "/producao", nome: "producao-desktop" },
  { rota: "/central-entregas", nome: "entregas-desktop" },
  { rota: "/financeiro", nome: "financeiro-desktop" },
  { rota: "/clientes", nome: "clientes-desktop" },
  { rota: "/equipe", nome: "equipe-desktop" },
  { rota: "/motoboy", nome: "motoboy-desktop" },
  { rota: "/pdv", nome: "pdv-celular", largura: 390, altura: 844, mobile: true },
  { rota: "/admin", nome: "admin-celular", largura: 390, altura: 844, mobile: true },
  { rota: "/motoboy", nome: "motoboy-celular", largura: 390, altura: 844, mobile: true },
];

for (const p of ROTAS) {
  await capturar(p);
}

await browser.close();
console.log("Concluído:", destino);
