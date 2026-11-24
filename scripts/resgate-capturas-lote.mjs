/**
 * Capturas locais ANTES / APROVADO / DEPOIS do lote Estoque e Catálogo.
 *
 * Usa builds estáticos locais em modo demonstração (sem Supabase, sem rede).
 * Uso: node scripts/resgate-capturas-lote.mjs
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import puppeteer from "puppeteer-core";

const RAIZ = resolve("C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\resgate-capturas");
const SAIDA = resolve("docs/homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo");
const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
assert.ok(CHROME, "Chrome/Edge não encontrado");
mkdirSync(SAIDA, { recursive: true });

const VARIANTES = [
  { nome: "aprovado", porta: 4181, rotas: [
    { id: "produtos", url: "/admin#produtos", texto: "Produtos (" },
    { id: "cadastro-produtos", url: "/preview/cadastro-produtos", texto: "Cadastro de Produtos" },
    { id: "estoque-salgados", url: "/preview/estoque-salgados", texto: "Estoque de Salgados" },
  ] },
  { nome: "antes", porta: 4182, rotas: [
    { id: "produtos", url: "/admin#produtos", texto: "Produtos (" },
    { id: "estoque-salgados", url: "/admin#estoque-salgados", texto: "Estoque de Salgados" },
    { id: "preview-estoque-salgados", url: "/preview/estoque-salgados", texto: "Estoque de Salgados" },
  ] },
  { nome: "depois", porta: 4183, rotas: [
    { id: "produtos", url: "/admin#produtos", texto: "Produtos (" },
    { id: "estoque-salgados", url: "/admin#estoque-salgados", texto: "Estoque de Salgados" },
    { id: "preview-estoque-salgados", url: "/preview/estoque-salgados", texto: "Estoque de Salgados" },
  ] },
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function aguardarServidor(porta) {
  for (let i = 0; i < 80; i += 1) {
    const ok = await new Promise((r) => {
      const req = http.get({ host: "127.0.0.1", port: porta, path: "/admin", timeout: 2000 }, (res) => {
        res.resume();
        r(res.statusCode === 200);
      });
      req.on("error", () => r(false));
      req.on("timeout", () => { req.destroy(); r(false); });
    });
    if (ok) return;
    await esperar(250);
  }
  throw new Error(`servidor ${porta} não iniciou`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});
const resultado = { modo: "demo-local-sem-rede", capturas: [], erros: [], externos: [] };

try {
  for (const variante of VARIANTES) {
    const dir = join(RAIZ, `build-${variante.nome}`);
    assert.ok(existsSync(join(dir, "server", "index.mjs")), `build ${variante.nome}`);
    const servidor = spawn(process.execPath, [join(dir, "server", "index.mjs")], {
      cwd: dir,
      env: { ...process.env, PORT: String(variante.porta) },
      stdio: "ignore",
    });
    try {
      await aguardarServidor(variante.porta);
      for (const rota of variante.rotas) {
        for (const tamanho of [
          { id: "desktop", width: 1440, height: 1000, mobile: false },
          { id: "celular", width: 390, height: 844, mobile: true },
        ]) {
          const pagina = await browser.newPage();
          try {
            await pagina.setRequestInterception(true);
            pagina.on("request", (req) => {
              const url = req.url();
              if (/supabase\.(co|com)|lovable\.cloud/.test(url)) {
                resultado.externos.push({ variante: variante.nome, url });
                void req.abort();
              } else void req.continue();
            });
            pagina.on("pageerror", (e) => resultado.erros.push({ variante: variante.nome, rota: rota.id, erro: e.message }));
            await pagina.setViewport({
              width: tamanho.width,
              height: tamanho.height,
              deviceScaleFactor: tamanho.mobile ? 2 : 1,
              isMobile: tamanho.mobile,
              hasTouch: tamanho.mobile,
            });
            await pagina.goto(`http://127.0.0.1:${variante.porta}${rota.url}`, {
              waitUntil: "networkidle2",
              timeout: 90000,
            });
            await pagina.waitForFunction(
              (texto) =>
                Boolean(document.body?.innerText?.toLocaleLowerCase("pt-BR").includes(texto.toLocaleLowerCase("pt-BR"))) &&
                document.documentElement.classList.contains("erp-admin"),
              { timeout: 60000 },
              rota.texto,
            );
            await pagina.evaluate(() => document.fonts.ready);
            await esperar(700);
            const nome = `${variante.nome}-${rota.id}-${tamanho.id}.png`;
            await pagina.screenshot({ path: join(SAIDA, nome), fullPage: true });
            resultado.capturas.push({ nome, url: rota.url, viewport: `${tamanho.width}x${tamanho.height}` });
            console.log("ok", nome);
          } catch (e) {
            resultado.erros.push({ variante: variante.nome, rota: rota.id, erro: e.message });
            console.error("falhou", variante.nome, rota.id, tamanho.id, e.message);
          } finally {
            await pagina.close();
          }
        }
      }
    } finally {
      servidor.kill("SIGTERM");
    }
  }
  // Comparativos lado a lado: APROVADO / ANTES / DEPOIS.
  const telas = [
    { id: "produtos", titulo: "Cadastro de Produtos (admin)", aprovado: "aprovado-produtos" },
    { id: "estoque-salgados", titulo: "Estoque de Salgados (admin)", aprovado: "aprovado-estoque-salgados" },
    { id: "preview-estoque-salgados", titulo: "Estoque de Salgados (preview demonstrativo)", aprovado: "aprovado-estoque-salgados" },
  ];
  for (const tela of telas) {
    for (const tamanho of ["desktop", "celular"]) {
      const largura = tamanho === "desktop" ? 500 : 250;
      const colunas = ["aprovado", "antes", "depois"].map((variante) => {
        const arquivo = variante === "aprovado" ? tela.aprovado : `${variante}-${tela.id}`;
        return `<section><h2>${variante.toUpperCase()}</h2><img src="${arquivo}-${tamanho}.png" style="width:${largura}px"></section>`;
      }).join("");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
        body{margin:0;padding:24px;background:#0b0a08;color:#f2ce6b;font-family:Arial,sans-serif}
        h1{font-size:20px;margin:0 0 20px}h2{font-size:16px;text-transform:uppercase;margin:0 0 10px}
        main{display:grid;grid-template-columns:repeat(3,${largura}px);gap:20px;align-items:start}
        section{min-width:0}img{display:block;height:auto;border:1px solid #3a3429}
      </style></head><body><h1>${tela.titulo} — ${tamanho}</h1><main>${colunas}</main></body></html>`;
      const htmlPath = join(SAIDA, `comparativo-${tela.id}-${tamanho}.html`);
      writeFileSync(htmlPath, html);
      const pagina = await browser.newPage();
      try {
        await pagina.setViewport({ width: largura * 3 + 88, height: 900, deviceScaleFactor: 1 });
        await pagina.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
        await pagina.waitForFunction(
          () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
          { timeout: 30000 },
        );
        await pagina.screenshot({ path: join(SAIDA, `comparativo-${tela.id}-${tamanho}.png`), fullPage: true });
        console.log("ok", `comparativo-${tela.id}-${tamanho}.png`);
      } finally {
        await pagina.close();
      }
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(SAIDA, "resultado.json"), JSON.stringify(resultado, null, 2));
assert.equal(resultado.externos.length, 0, "nenhuma chamada externa permitida");
console.log(`Concluído: ${resultado.capturas.length} capturas em ${SAIDA}`);
