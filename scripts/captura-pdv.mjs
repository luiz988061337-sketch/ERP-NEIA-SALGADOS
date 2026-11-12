/**
 * Captura do PDV (rota de conferência com catálogo fictício).
 * Uso: node scripts/captura-pdv.mjs [url] [saida]
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!CHROME) {
  console.error("Chrome/Edge não encontrado.");
  process.exit(1);
}

const url = process.argv[2] ?? "http://localhost:8081/preview-l2-pdv";
const saida = process.argv[3] ?? join(process.cwd(), "docs", "erp-dark", "prints");
mkdirSync(saida, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);

// Desktop
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
// Adiciona 2 itens na comanda para mostrar o painel preenchido
const cards = await page.$$("main button[aria-label^='Adicionar']");
if (cards[0]) await cards[0].click();
if (cards[1]) await cards[1].click();
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: join(saida, "pdv-DEPOIS.png") });
console.log("ok desktop");

// Mobile
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: join(saida, "pdv-DEPOIS-celular.png") });
console.log("ok celular");

await browser.close();
