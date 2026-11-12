/**
 * Captura REAL do Preview hospedado na Vercel.
 *
 * O preview é protegido por Vercel Authentication; o CLI consegue acessar
 * (bypass). Este script:
 *  1. baixa o HTML de cada rota via `vercel curl --deployment`
 *  2. baixa todos os /assets referenciados (js/css/img) para um espelho local
 *  3. serve o espelho numa porta local
 *  4. renderiza com Puppeteer e salva screenshots
 *
 * Uso: node scripts/capturar-preview.mjs <deploymentId> [porta]
 */
import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import http from "node:http";
import puppeteer from "puppeteer-core";

const DEPLOY = process.argv[2] ?? "dpl_Sc69nqvcD7a6ojeCxY3PK5ugjCaC";
const PORT = Number(process.argv[3] ?? 8899);
const ROOT = join(process.cwd(), "docs", "preview-captures", "mirror");
const OUT = join(process.cwd(), "docs", "preview-captures", "prints");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

if (!CHROME) {
  console.error("Chrome/Edge não encontrado.");
  process.exit(1);
}

const ROTAS = process.env.ROTAS
  ? process.env.ROTAS.split(",")
  : ["/admin", "/pdv", "/producao", "/central-entregas"];

// ---- Sessão Supabase (login real, só leitura) ----
const SB_URL = process.env.SB_URL ?? "https://ruioyioynwwwiqbjznoa.supabase.co";
const SB_KEY = process.env.SB_KEY ?? "sb_publishable_2eC51IhcWbLMrMiAw1rS-w_DaFsempc";
const EMAIL = process.env.EMAIL ?? "";
const SENHA = process.env.SENHA ?? "";

let SESSION = null;
if (EMAIL && SENHA) {
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: SENHA }),
    });
    const j = await r.json();
    if (j.access_token) {
      SESSION = j;
      console.log("login ok:", j.user?.email);
    } else {
      console.error("login falhou:", JSON.stringify(j).slice(0, 200));
    }
  } catch (e) {
    console.error("login erro:", e.message);
  }
} else {
  console.log("sem credenciais — capturando sem login");
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(OUT, { recursive: true });

function vercelCurl(path, outFile) {
  return new Promise((resolve, reject) => {
    const cmd = `"C:\\Program Files\\nodejs\\npx.cmd" vercel curl "${path}" --deployment "${DEPLOY}" -- --output "${outFile}" --silent`;
    exec(
      cmd,
      { timeout: 180000, maxBuffer: 64 * 1024 * 1024 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

function extrairAssets(html) {
  const set = new Set();
  const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) set.add(m[1]);
  // também dentro de JSON inline do router (preloads)
  const re2 = /"(\/assets\/[^"]+)"/g;
  while ((m = re2.exec(html))) set.add(m[1]);
  return [...set];
}

async function baixarEmParalelo(itens, fn, conc = 4) {
  let i = 0;
  const workers = Array.from({ length: Math.min(conc, itens.length) }, async () => {
    while (i < itens.length) {
      const idx = i++;
      await fn(itens[idx], idx);
    }
  });
  await Promise.all(workers);
}

const todosAssets = new Set();

// 1) HTML de cada rota
const htmls = {};
for (const rota of ROTAS) {
  const file = join(ROOT, `__html__${rota.replace(/\//g, "_")}.html`);
  await vercelCurl(rota, file);
  const html = readFileSync(file, "utf8");
  htmls[rota] = html;
  extrairAssets(html).forEach((a) => todosAssets.add(a));
  console.log("html ok:", rota, html.length, "chars,", extrairAssets(html).length, "assets");
}

// 2) baixa assets
const assets = [...todosAssets];
console.log("total de assets únicos:", assets.length);
await baixarEmParalelo(assets, async (a) => {
  const dest = join(ROOT, a);
  mkdirSync(dirname(dest), { recursive: true });
  await vercelCurl(a, dest).catch(() => {});
});

// 3) reescreve HTML para apontar para o espelho local
for (const rota of ROTAS) {
  let html = htmls[rota];
  for (const a of assets) html = html.split(a).join(`/mirror${a}`);
  writeFileSync(join(ROOT, `__html__${rota.replace(/\//g, "_")}.html`), html);
}

// 4) servidor estático local
const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const path = url.startsWith("/mirror/") ? join(ROOT, url.slice("/mirror".length)) : join(ROOT, "__html___admin.html");
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[/\.[a-z0-9]+$/i.exec(path)?.[0] ?? ""] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
console.log("espelho servido em http://127.0.0.1:" + PORT);

// 5) Puppeteer
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});

async function capturar(nome, rota, largura, altura, mobile = false) {
  const page = await browser.newPage();
  try {
    if (SESSION) {
      await page.evaluateOnNewDocument((sess, url) => {
        try {
          localStorage.setItem("sb-ruioyioynwwwiqbjznoa-auth-token", JSON.stringify(sess));
          localStorage.setItem("sb-" + new URL(url).hostname.split(".")[0] + "-auth-token", JSON.stringify(sess));
        } catch {}
      }, SESSION, SB_URL);
    }
    await page.setViewport({ width: largura, height: altura, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) {
      await page.setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
    }
    const html = readFileSync(join(ROOT, `__html__${rota.replace(/\//g, "_")}.html`), "utf8");
    await page.goto(`http://127.0.0.1:${PORT}/mirror/__html__${rota.replace(/\//g, "_")}.html`, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });
    await new Promise((r) => setTimeout(r, 4000));
    await page.screenshot({ path: join(OUT, `${nome}.png`) });
    console.log("ok", nome);
  } catch (e) {
    console.error("falhou", nome, e.message);
  } finally {
    await page.close();
  }
}

await capturar("preview-admin-desktop", "/admin", 1440, 900);
await capturar("preview-pdv-desktop", "/pdv", 1440, 900);
await capturar("preview-producao-desktop", "/producao", 1440, 900);
await capturar("preview-entregas-desktop", "/central-entregas", 1440, 900);
await capturar("preview-admin-celular", "/admin", 390, 844, true);

await browser.close();
server.close();
console.log("Concluído:", OUT);
