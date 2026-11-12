/**
 * Captura de tela do Painel de Gestão (rota de preview com dados fictícios).
 * Uso: node scripts/captura-gestao.mjs [url] [saida]
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

const url = process.argv[2] ?? "http://localhost:4173/preview/l2-gestao";
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
await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
// Recharts anima a serie: espera generousa para o desenho ficar completo.
await new Promise((r) => setTimeout(r, 6000));
// Captura do viewport (sem fullPage): o resize do fullPage quebra o
// ResponsiveContainer do recharts e desalinha o flex do rodapé.
await page.screenshot({ path: join(saida, "gestao-preview-l2.png") });
console.log("ok:", join(saida, "gestao-preview-l2.png"));

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: join(saida, "gestao-preview-l2-celular.png") });
console.log("ok: celular");

await browser.close();
