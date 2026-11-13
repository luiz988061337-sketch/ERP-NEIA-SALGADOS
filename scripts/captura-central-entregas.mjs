/**
 * Captura da Central de Entregas/Rotas (preview v2 com dados ficticios).
 * Uso: node scripts/captura-central-entregas.mjs [url] [saida]
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

const url = process.argv[2] ?? "http://localhost:8081/preview/central-entregas-v2";
const saida = process.argv[3] ?? join(process.cwd(), "docs", "erp-dark", "prints");
mkdirSync(saida, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: join(saida, "central-entregas-DEPOIS.png") });
console.log("ok desktop");

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: join(saida, "central-entregas-DEPOIS-celular.png") });
console.log("ok celular");

await browser.close();
