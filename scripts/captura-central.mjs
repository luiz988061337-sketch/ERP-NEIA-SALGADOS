/**
 * Captura da Central de Pedidos da Atendente (rota de conferência).
 * Uso: node scripts/captura-central.mjs [url] [saida]
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

const url = process.argv[2] ?? "http://localhost:8081/preview-l2-atendente";
const saida = process.argv[3] ?? join(process.cwd(), "docs", "erp-dark", "prints");
mkdirSync(saida, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);

// Desktop
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
await page.screenshot({ path: join(saida, "central-atendente-desktop.png") });
console.log("ok desktop");

// Demonstração do alerta sonoro: dispara o bip e registra no console
const som = await page.evaluate(() => {
  const antes = window.__bips ?? 0;
  const botao = [...document.querySelectorAll("button")].find((b) =>
    /testar som/i.test(b.textContent ?? ""),
  );
  botao?.click();
  return { clicou: Boolean(botao), antes };
});
console.log("alerta sonoro: botao 'Testar som' clicado =", som.clicou);

// Mobile
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: join(saida, "central-atendente-celular.png") });
console.log("ok celular");

await browser.close();
