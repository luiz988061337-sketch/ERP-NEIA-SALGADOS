/**
 * Captura REAL do Preview hospedado via proxy autenticado.
 *
 * O Preview tem Vercel Authentication; o proxy usa `vercel curl --deployment`
 * (que tem bypass) para TODAS as requisicoes, garantindo que a pagina
 * hidrate de verdade (graficos, dados) exatamente como no Preview.
 *
 * Uso: node scripts/capturar-preview-proxy.mjs <deploymentId> <porta> <saida>
 */
import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import http from "node:http";
import puppeteer from "puppeteer-core";

const DEPLOY = process.argv[2] ?? "dpl_6YrASfvQPBSxqafHKPknmL4SrF24";
const PORT = Number(process.argv[3] ?? 8910);
const OUT = process.argv[4] ?? join(process.cwd(), "docs", "preview-captures", "prints");
const ROTAS = (process.env.ROTAS ?? "/preview-l2-gestao").split(",");
const TMP = join(process.cwd(), "docs", "preview-captures", "tmp-proxy");

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
if (!CHROME) {
  console.error("Chrome/Edge não encontrado.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

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
  ".txt": "text/plain",
};

let seq = 0;
const cache = new Map();
const fila = [];
let emVoo = 0;
const MAX_PARALELO = 6;

function vercelCurl(path) {
  return new Promise((resolve) => {
    const out = join(TMP, `r${seq++}`);
    const cmd = `"C:\\Program Files\\nodejs\\npx.cmd" vercel curl "${path}" --deployment "${DEPLOY}" -- --output "${out}" --silent`;
    exec(cmd, { timeout: 180000, maxBuffer: 64 * 1024 * 1024 }, (err) => {
      if (err || !existsSync(out)) return resolve(null);
      const buf = readFileSync(out);
      resolve(buf);
    });
  });
}

/** Fila com concorrência limitada (evita afogar a maquina com npx). */
function buscar(path) {
  if (cache.has(path)) return Promise.resolve(cache.get(path));
  return new Promise((resolve) => {
    fila.push({ path, resolve });
    drenar();
  });
}

function drenar() {
  while (emVoo < MAX_PARALELO && fila.length > 0) {
    const item = fila.shift();
    emVoo += 1;
    vercelCurl(item.path)
      .then((buf) => {
        if (buf) cache.set(item.path, buf);
        item.resolve(buf);
      })
      .finally(() => {
        emVoo -= 1;
        drenar();
      });
  }
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const body = await buscar(url);
  if (!body) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(url).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
console.log("proxy em http://127.0.0.1:" + PORT);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});

for (const rota of ROTAS) {
  const nome = "proxy" + rota.replace(/\//g, "-");
  const page = await browser.newPage();
  try {
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${PORT}${rota}`, { waitUntil: "domcontentloaded", timeout: 900000 });
    await new Promise((r) => setTimeout(r, 20000));
    await page.screenshot({ path: join(OUT, `${nome}-desktop.png`) });
    console.log("ok", nome, "desktop");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "networkidle2", timeout: 300000 });
    await new Promise((r) => setTimeout(r, 5000));
    await page.screenshot({ path: join(OUT, `${nome}-celular.png`) });
    console.log("ok", nome, "celular");
  } catch (e) {
    console.error("falhou", nome, e.message);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();
console.log("Concluído:", OUT);
