/** Depuração do login: mostra resposta de /auth/v1/token. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const base = "http://localhost:8080";
const email = process.argv[2] ?? "";
const senha = process.argv[3] ?? "";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu", "--no-first-run"] });
const page = await browser.newPage();
page.on("response", async (res) => {
  if (res.url().includes("/auth/v1/token") || res.url().includes("/auth/v1/signup")) {
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch {}
    const req = res.request();
    const h = req.headers();
    console.log("RESP", res.status(), res.url());
    console.log("  method:", req.method(), "| apikey:", JSON.stringify(h["apikey"]), "| auth:", JSON.stringify(h["authorization"] ?? "(none)"));
    console.log("  body:", body);
  }
});
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${base}/auth`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));

const clicaveis = await page.$$("span, label, div[role=radio], button");
for (const b of clicaveis) {
  const t = (await b.evaluate((el) => (el.textContent ?? "").trim())) ?? "";
  if (t === "Administrador") { await b.click(); break; }
}
await new Promise((r) => setTimeout(r, 600));
await page.waitForSelector("#email", { timeout: 15000 });
await page.type("#email", email, { delay: 5 });
await page.type("#senha", senha, { delay: 5 });
await page.evaluate(() => document.querySelector("form")?.requestSubmit());
await new Promise((r) => setTimeout(r, 6000));
console.log("URL final:", page.url());
console.log("Inputs:", await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.id}=${i.value.length}ch`).join(" | ")));
await browser.close();
