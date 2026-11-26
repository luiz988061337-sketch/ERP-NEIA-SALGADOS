import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { saboresEstoque } from "../src/lib/catalogo-sabores-estoque.ts";

const base = new URL("http://127.0.0.1:54871");
const api = new URL("https://estoque-isolado-codex.supabase.co");
assert.ok(process.argv[2], "Informe a pasta para as capturas");
const saida = resolve(process.argv[2]);
const build = resolve(process.argv[3] ?? ".output");
const { default: ssr } = await import(pathToFileURL(resolve(build, "server/_ssr/ssr.mjs")).href);
mkdirSync(saida, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((arquivo) => arquivo && existsSync(arquivo));
assert.ok(executablePath, "Chrome ou Edge instalado");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--no-first-run"],
});
const testes = [];
const erros = [];
const id = "00000000-0000-4000-8000-000000000301";
const usuario = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "teste@example.invalid",
  app_metadata: { provider: "email" },
  user_metadata: { nome: "Equipe de teste" },
};
const produto = {
  id: "00000000-0000-4000-8000-000000000302",
  nome: "Coxinha de frango",
  imagem_url: null,
  disponivel: true,
  estoque: 0,
  estoque_minimo: 0,
  tipo_venda: "combo_50",
  unidade_medida: "un",
  categorias: { slug: "mini-fritos", nome: "Mini Fritos" },
  lotes: [],
  movimentos: [],
  reservas_estoque: [],
};
const respostas = {
  "/auth/v1/user": usuario,
  "/rest/v1/user_roles": [{ user_id: id, role: "admin" }],
  "/rest/v1/produtos": [produto],
  "/rest/v1/sabores_estoque": saboresEstoque.map(([chave]) => ({
    chave,
    produto_id: chave === "coxinha-frango" ? produto.id : null,
  })),
};
const tipos = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const chamadas = [];
try {
  const pag = await browser.newPage();
  await pag.setBypassServiceWorker(true);
  await pag.evaluateOnNewDocument((user) => {
    const sessao = {
      user,
      access_token: "token-fixture-local",
      refresh_token: "refresh-fixture-local",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
    };
    localStorage.setItem("sb-estoque-isolado-codex-auth-token", JSON.stringify(sessao));
  }, usuario);
  await pag.setRequestInterception(true);
  pag.on("pageerror", (erro) => erros.push(erro.message));
  pag.on("request", async (req) => {
    try {
      const url = new URL(req.url());
      if (url.origin === base.origin) {
        if (url.pathname === "/admin") {
          const res = await ssr.fetch(new Request(url));
          await req.respond({
            status: res.status,
            contentType: "text/html",
            body: await res.text(),
          });
          return;
        }
        const arquivo = resolve(build, "public", "." + url.pathname);
        if (existsSync(arquivo) && extname(arquivo)) {
          await req.respond({
            status: 200,
            contentType: tipos[extname(arquivo)] ?? "application/octet-stream",
            body: readFileSync(arquivo),
          });
          return;
        }
      }
      if (url.origin === api.origin) {
        assert.match(req.method(), /^(GET|OPTIONS|HEAD)$/);
        chamadas.push(url.pathname);
        const body =
          respostas[url.pathname] ?? (/vnd\.pgrst\.object/.test(req.headers().accept) ? null : []);
        await req.respond({
          status: 200,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": req.headers()["access-control-request-headers"] ?? "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Content-Range": "*/0",
          },
          body: JSON.stringify(body),
        });
        return;
      }
      if (url.protocol === "data:") await req.continue();
      else await req.abort();
    } catch (erro) {
      erros.push(String(erro));
      if (!req.isInterceptResolutionHandled()) await req.abort();
    }
  });
  const painel = '[data-testid="estoque-salgados"]';
  const grupo = (id) => `[data-categoria="${id}"]`;
  const capturar = async (nome, fullPage = false) => {
    await pag.evaluate(() => window.scrollTo(0, 0));
    await pag.screenshot({ path: resolve(saida, nome + ".png"), fullPage });
  };
  async function clickTexto(seletor, texto) {
    const botoes = await pag.$$(seletor);
    for (const botao of botoes) {
      if ((await botao.evaluate((el) => el.textContent.trim())) === texto) {
        await botao.click();
        return;
      }
    }
    throw new Error(`Botão ausente: ${texto}`);
  }

  await pag.setViewport({ width: 1600, height: 1230, deviceScaleFactor: 1 });
  await pag.goto(new URL("/admin#estoque-salgados", base).href, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await pag.waitForSelector(`${painel} .est-sabores-filtros`, { timeout: 120_000 });
  await pag.evaluate(() => document.fonts.ready);
  assert.ok(chamadas.includes("/rest/v1/sabores_estoque"), "Consulta feita pela rota operacional");
  const filtros = `${painel} .est-sabores-filtros button`;
  const grupos = [
    ["fritos", "Fritos", 9],
    ["mini-pasteis", "Mini Pastéis", 4],
    ["assados", "Assados", 8],
    ["empadas", "Empadas", 2],
    ["mini-pizzas", "Mini Pizzas", 3],
  ];
  assert.deepEqual(await pag.$$eval(filtros, (els) => els.map((el) => el.textContent.trim())), [
    "Todos (26)",
    ...grupos.map(([, nome, count]) => `${nome} (${count})`),
  ]);
  assert.equal(await pag.$$eval(`${painel} [data-categoria]`, (els) => els.length), 5);
  assert.equal(await pag.$$eval(`${grupo("fritos")} tbody tr`, (els) => els.length), 9);
  assert.equal(
    await pag.$$eval(`${grupo("fritos")} tbody td:nth-child(7)`, (els) =>
      els.every((el) => el.textContent.includes("Não cadastrado")),
    ),
    true,
  );
  await capturar("00-painel-estoque");
  testes.push(
    "Todos (26), cinco grupos na ordem da especificação e estoque inicial sem quantidades",
  );

  await pag.click(`${grupo("fritos")} h2 button`);
  await pag.waitForSelector(`${grupo("fritos")} h2 button[aria-expanded="false"]`);
  assert.equal(await pag.$$eval(`${grupo("fritos")} tbody tr`, (els) => els.length), 0);
  await capturar("06-grupos-recolhidos");
  await pag.click(`${grupo("fritos")} h2 button`);
  await pag.waitForSelector(`${grupo("fritos")} h2 button[aria-expanded="true"]`);
  testes.push("Expansão e recolhimento por categoria");

  for (const [indice, [id, nome, count]] of grupos.entries()) {
    await clickTexto(filtros, `${nome} (${count})`);
    await pag.waitForFunction(
      (cat) => {
        const gruposVisiveis = document.querySelectorAll(
          ".est-sabores-grupos > section[data-categoria]",
        );
        return gruposVisiveis.length === 1 && gruposVisiveis[0].dataset.categoria === cat;
      },
      {},
      id,
    );
    assert.equal(await pag.$$eval(`${grupo(id)} tbody tr`, (els) => els.length), count);
    await capturar(`0${indice + 1}-${id}`);
    testes.push(`Filtro de ${nome} com ${count} sabores`);
  }

  await clickTexto(filtros, "Todos (26)");
  await pag.type('[aria-label="Buscar sabor"]', "brocolis");
  await pag.waitForSelector(`${grupo("assados")} tbody tr`);
  assert.equal(await pag.$$eval(`${painel} [data-categoria] tbody tr`, (els) => els.length), 1);
  assert.ok(
    await pag.$eval(`${grupo("assados")} tbody`, (el) =>
      el.textContent.includes("Esfirra de brócolis"),
    ),
  );
  await capturar("07-pesquisa-sem-acento");
  testes.push("Pesquisa por nome ignora acentuação");

  await pag.select('[aria-label="Filtrar por situação"]', "zerado");
  await pag.waitForFunction(() => document.body.textContent.includes("Nenhum sabor encontrado."));
  await pag.select('[aria-label="Filtrar por situação"]', "todos");
  await pag.waitForSelector(`${grupo("assados")} tbody tr`);
  testes.push("Filtro por situação distingue zerado de não cadastrado");

  await pag.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  assert.equal(
    await pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  assert.equal(
    await pag.$eval(".est-sabores-tabela", (el) => el.scrollWidth > el.clientWidth),
    true,
  );
  await capturar("08-painel-celular", true);
  testes.push("Celular sem transbordamento da página e com rolagem horizontal da tabela");

  await clickTexto(`${painel} header button`, "Entrada de estoque");
  await pag.waitForSelector('[role="dialog"]');
  await pag.select('[role="dialog"] select[required]', "coxinha-frango");
  assert.equal(
    await pag.$eval('[role="dialog"] button.neia-a01-dourado', (el) => el.disabled),
    false,
  );
  assert.ok(await pag.$('[role="dialog"] input[name="fabricacao"]'));
  await pag.keyboard.press("Escape");
  await pag.waitForSelector('[role="dialog"]', { hidden: true });
  testes.push("Entrada de estoque oferece o sabor vinculado e informa a fabricação");
  assert.deepEqual(erros, []);
} finally {
  await browser.close();
  writeFileSync(
    resolve(saida, "resultado-visual.json"),
    JSON.stringify({ testes, erros }, null, 2),
  );
}
console.log(`${testes.length} verificações no navegador concluídas.`);
