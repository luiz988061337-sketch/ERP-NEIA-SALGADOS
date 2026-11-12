/**
 * Capturas da replicação visual ERP (tema escuro premium) — com login.
 * Uso: node scripts/prints-erp-dark-login.mjs [urlBase] [diretorio] [email] [senha]
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
const email = process.argv[4] ?? "";
const senha = process.argv[5] ?? "";
mkdirSync(destino, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars"],
});

async function estabilizar(page, ms = 1500) {
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, ms));
}

async function capturar({ nome, rota, largura = 1440, altura = 900, mobile = false }) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: !!mobile });
    if (mobile) {
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
    }
    await page.goto(`${base}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await estabilizar(page, 1800);
    await page.screenshot({ path: join(destino, `${nome}.png`) });
    console.log("ok", nome);
  } catch (e) {
    console.error("falhou", nome, e.message);
  } finally {
    await page.close();
  }
}

// ---- Login (uma vez, cookies ficam no contexto do browser) ----
{
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${base}/auth`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await estabilizar(page, 1000);

    // Escolhe "Administrador" (label/span clicável)
    const clicaveis = await page.$$("span, label, div[role=radio], button");
    for (const b of clicaveis) {
      const t = (await b.evaluate((el) => (el.textContent ?? "").trim())) ?? "";
      if (t === "Administrador") {
        await b.click();
        break;
      }
    }
    await estabilizar(page, 600);

    // Preenche e-mail/senha por id (form principal)
    await page.waitForSelector("#email", { timeout: 15000 });
    await page.type("#email", email, { delay: 5 });
    await page.type("#senha", senha, { delay: 5 });
    // Entra (submit do formulário principal)
    await page.evaluate(() => {
      const form = document.querySelector("form");
      form?.requestSubmit();
    });
    await page.waitForFunction(() => !location.pathname.startsWith("/auth"), { timeout: 30000 }).catch(() => {});
    await estabilizar(page, 3500);
    console.log("login:", page.url());
  } catch (e) {
    console.error("login falhou:", e.message);
  } finally {
    await page.close();
  }
}

const ROTAS = [
  { rota: "/admin", nome: "01-admin-dashboard-desktop" },
  { rota: "/pdv", nome: "02-pdv-desktop" },
  { rota: "/producao", nome: "03-producao-desktop" },
  { rota: "/central-entregas", nome: "04-entregas-desktop" },
  { rota: "/financeiro", nome: "05-financeiro-desktop" },
  { rota: "/clientes", nome: "06-clientes-desktop" },
  { rota: "/equipe", nome: "07-equipe-desktop" },
  { rota: "/motoboy", nome: "08-motoboy-desktop" },
  { rota: "/pdv", nome: "09-pdv-celular", largura: 390, altura: 844, mobile: true },
  { rota: "/admin", nome: "10-admin-celular", largura: 390, altura: 844, mobile: true },
  { rota: "/motoboy", nome: "11-motoboy-celular", largura: 390, altura: 844, mobile: true },
];

for (const p of ROTAS) {
  await capturar(p);
}

await browser.close();
console.log("Concluído:", destino);
