import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--no-sandbox"] });
const page = await browser.newPage();
const erros = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") erros.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on("pageerror", (e) => erros.push(`[pageerror] ${e.message.slice(0, 300)}`));
await page.setViewport({ width: 1440, height: 1000 });
await page.goto(process.argv[2] ?? "http://localhost:8081/preview-l2-gestao", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 5000));
const info = await page.evaluate(() => ({
  url: location.pathname,
  mainLen: document.querySelector("main")?.innerHTML.length ?? -1,
  bodyText: (document.body.innerText || "").slice(0, 300),
  temPainel: document.body.innerText.includes("PAINEL DE GESTÃO"),
  temMetrica: document.body.innerText.includes("VENDAS DO DIA"),
  sidebarItems: [...document.querySelectorAll("[data-sidebar=menu-item]")].length,
}));
console.log(JSON.stringify(info, null, 2));
console.log("--- console ---");
console.log(erros.slice(0, 12).join("\n"));
await browser.close();
