// Complemento: navegação real nas quatro telas, formulários e prova de estoque.
// node scripts/cadastros-estoques-visual.mjs [baseURL] [pastaSaida]
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = resolve(process.argv[3] ?? "docs/estoques/complemento/local");
mkdirSync(out, { recursive: true });
const executablePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
assert.ok(executablePath);
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-first-run", "--hide-scrollbars"],
});
const page = await browser.newPage();
const erros = [],
  banco = [],
  mutacoes = [],
  http = [],
  testes = [],
  capturas = [],
  medidas = {};
page.on("pageerror", (e) => erros.push(e.message));
page.on("response", (r) => {
  if (r.url().startsWith(base) && r.status() >= 400)
    http.push({ url: r.url(), status: r.status() });
});
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (/supabase\.(co|com)|lovable\.cloud/.test(r.url())) {
    banco.push(r.url());
    void r.abort();
  } else if (r.url().startsWith(base) && ["POST", "PUT", "PATCH", "DELETE"].includes(r.method())) {
    mutacoes.push({ url: r.url(), metodo: r.method() });
    void r.abort();
  } else void r.continue();
});
if (process.env.ESTOQUES_COOKIE_JAR) {
  const cookies = readFileSync(process.env.ESTOQUES_COOKIE_JAR, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && (!l.startsWith("#") || l.startsWith("#HttpOnly_")))
    .map((l) => {
      const [domain, , path, secure, expires, name, value] = l
        .replace(/^#HttpOnly_/, "")
        .split("\t");
      return {
        domain,
        path,
        name,
        value,
        secure: secure === "TRUE",
        httpOnly: l.startsWith("#HttpOnly_"),
        ...(Number(expires) > 0 ? { expires: Number(expires) } : {}),
      };
    });
  await browser.setCookie(...cookies);
}
const rotas = ["cadastro-produtos", "estoque-salgados", "estoque-insumos", "estoque-embalagens"];
const marker = (rota) => rota;
async function esperar(rota) {
  await page.waitForSelector(`[data-testid="${marker(rota)}"]`, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".est-content button")].some((e) =>
        Object.keys(e).some(
          (k) => k.startsWith("__reactProps$") && typeof e[k]?.onClick === "function",
        ),
      ),
    { timeout: 60000 },
  );
}
async function goto(rota) {
  await page.goto(`${base}/preview/${rota}`, { waitUntil: "networkidle2", timeout: 120000 });
  await esperar(rota);
}
async function navegar(rota) {
  await page.click(`[data-sidebar="sidebar"] a[href="/preview/${rota}"]`);
  await esperar(rota);
}
async function clicar(texto, seletor = ".est-content button") {
  const h = await page.evaluateHandle(
    (s, t) =>
      [...document.querySelectorAll(s)].find((e) =>
        e.textContent.trim().toLocaleLowerCase().startsWith(t.toLocaleLowerCase()),
      ),
    seletor,
    texto,
  );
  assert.ok(h.asElement(), texto);
  await h.asElement().click();
  await h.dispose();
}
async function campo(nome, valor) {
  const seletor = `[role="dialog"] [name="${nome}"]`;
  await page.waitForSelector(seletor);
  await page.focus(seletor);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (String(valor)) await page.type(seletor, String(valor));
}
async function abrir(texto) {
  await clicar(texto);
  await page.waitForSelector('[role="dialog"]');
}
async function salvar(texto = "Salvar produto demonstrativo") {
  await clicar(texto, '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
}
async function fechar() {
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
}
async function captura(nome) {
  await page.screenshot({ path: resolve(out, nome), fullPage: true });
  capturas.push(nome);
}
async function semOverflow() {
  const m = await page.evaluate(() => ({
    viewport: innerWidth,
    documento: document.documentElement.scrollWidth,
  }));
  assert.ok(m.documento <= m.viewport, JSON.stringify(m));
  return m;
}
const saldo = (id) =>
  page.$eval(`[data-testid="produto-${id}"]`, (e) =>
    [...e.closest("tr").querySelectorAll("td")].slice(1, 4).map((c) => c.textContent.trim()),
  );
const suprimento = (id) =>
  page.$eval(`[data-testid="suprimento-${id}"]`, (e) => e.closest("tr").innerText);
const nomeProduto = "Mini Coxinha de Palmito DEMO";
const nomeEditado = `${nomeProduto} Premium`;
const ids = {};
try {
  for (const rota of rotas) {
    await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
    await goto(rota);
    assert.equal(
      await page.evaluate(() => document.documentElement.classList.contains("erp-admin")),
      true,
    );
    assert.ok(await page.$('[data-sidebar="sidebar"]'));
    await captura(`${rota}-desktop.png`);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await goto(rota);
    medidas[rota] = await semOverflow();
    await captura(`${rota}-mobile.png`);
  }
  testes.push(
    "Quatro rotas diretas com AdminShell, oito capturas e nenhuma página com overflow horizontal em 390px",
  );
  // Menu mobile também deve abrir a NOVA rota, em vez de um modal.
  await page.click('[aria-label="Abrir menu administrativo"]');
  await page.waitForSelector('[data-mobile="true"]');
  await page.click('[data-mobile="true"] a[href="/preview/cadastro-produtos"]');
  await esperar("cadastro-produtos");
  await page.waitForSelector('[data-mobile="true"]', { hidden: true });
  assert.equal(await page.$('[role="dialog"]'), null);
  testes.push(
    "Menu mobile abre Cadastro de Produtos como página independente, sem janela de referência",
  );
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  await goto("cadastro-produtos");
  await abrir("Cadastrar Produto");
  await campo("nome", nomeProduto);
  await campo("sabor", "Palmito");
  await campo("descricao", "Produto fictício cadastrado durante teste real do navegador");
  await campo("preco", "1.90");
  await campo("minimo", 50);
  assert.equal(await page.$('[role="dialog"] [name="id"]'), null, "ID não é editável");
  await captura("formulario-produto-desktop.png");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await semOverflow();
  assert.ok(
    await page.$eval('[role="dialog"]', (e) => e.scrollWidth <= e.clientWidth + 1),
    "Formulário mobile sem overflow",
  );
  await captura("formulario-produto-mobile.png");
  await page.$eval('[role="dialog"]', (e) => {
    e.scrollTop = e.scrollHeight;
  });
  await captura("formulario-produto-mobile-final.png");
  await salvar(); // confirmação real também no viewport mobile
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  ids.produto = await page.$$eval(
    '[data-testid^="cadastro-produto-"]',
    (es, nome) =>
      es.find((e) => e.textContent.includes(nome)).dataset.testid.replace(/^cadastro-/, ""),
    nomeProduto,
  );
  assert.ok(ids.produto);
  assert.equal(await page.$$eval(`[data-testid="cadastro-${ids.produto}"]`, (es) => es.length), 1);
  await abrir("Cadastrar Produto");
  await campo("nome", ` ${nomeProduto.toUpperCase()}  `);
  await campo("sabor", "Palmito");
  await campo("preco", "1.90");
  await clicar("Salvar produto", '[role="dialog"] button');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("Já existe um produto"),
  );
  await fechar();
  testes.push(
    "Cadastro de novo sabor com ID automático, nome duplicado bloqueado e formulário validado/capturado desktop e mobile; ID duplicado coberto no teste puro",
  );
  await page.click(`[aria-label="Editar produto ${nomeProduto}"]`);
  await page.waitForSelector('[role="dialog"]');
  await campo("nome", nomeEditado);
  await campo("preco", "2.10");
  await salvar();
  await page.click(`[aria-label="Desativar produto ${nomeEditado}"]`);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-testid="cadastro-${id}"]`)
        .closest("tr")
        .textContent.includes("Inativo"),
    {},
    ids.produto,
  );
  await page.select('[aria-label="Situação dos produtos"]', "inativo");
  assert.equal(await page.$$eval(".est-table-panel tbody tr", (es) => es.length), 1);
  await page.click(`[aria-label="Ativar produto ${nomeEditado}"]`);
  await page.select('[aria-label="Situação dos produtos"]', "todos");
  await page.type('[aria-label="Pesquisar produtos"]', "palmito");
  assert.equal(await page.$$eval(".est-table-panel tbody tr", (es) => es.length), 1);
  await page.click(`[aria-label="Consultar ${nomeEditado}"]`);
  await page.waitForSelector('[role="dialog"]');
  assert.ok((await page.$eval('[role="dialog"]', (e) => e.textContent)).includes(ids.produto));
  await captura("consulta-produto-cadastrado.png");
  await fechar();
  testes.push(
    "Edição, busca por sabor, consulta e ativar/desativar com o mesmo identificador e modalidade em múltiplos de 50",
  );
  await abrir("Cadastrar Produto");
  await campo("nome", "Suco de teste DEMO");
  await campo("preco", 6);
  await page.select('[name="natureza"]', "bebida");
  await page.select('[name="categoria"]', "Bebidas");
  await page.select('[name="preparo"]', "outro");
  await page.select('[name="tipoVenda"]', "unidade");
  await salvar();
  await navegar("estoque-salgados");
  assert.deepEqual(await saldo(ids.produto), ["0", "0", "0"]);
  assert.equal(
    await page.$$eval(
      ".est-table-panel tbody tr",
      (es) => es.filter((e) => e.textContent.includes("Suco de teste DEMO")).length,
    ),
    0,
  );
  await page.click(`[data-testid="produto-${ids.produto}"]`);
  assert.equal(
    await page.$$eval("#est-detalhe-salgado section:nth-child(2) tbody tr", (es) => es.length),
    0,
  );
  await captura("novo-salgado-estoque-zero.png");
  await abrir("Registrar entrada de estoque");
  await page.select('[name="produtoId"]', ids.produto);
  assert.equal(await page.$('[role="dialog"] [name="nome"]'), null, "Movimentação não cria sabor");
  assert.equal(
    await page.$$eval(
      '[name="produtoId"] option',
      (es) => es.filter((e) => e.textContent.includes("Suco de teste DEMO")).length,
    ),
    0,
  );
  await campo("quantidade", 150);
  await campo("codigo", "PAL-CAD-DEMO");
  await campo("motivo", "Produção fictícia recebida no freezer");
  await salvar("Confirmar movimentação");
  assert.deepEqual(await saldo(ids.produto), ["150", "0", "150"]);
  await captura("novo-salgado-entrada-150.png");
  testes.push(
    "Mesmo novo ID aparece no estoque com 0/0/0 e lotes vazios; entrada separada gera lote e saldo 150/0/150; bebida excluída da tabela e seletor",
  );
  for (const [tipo, nome] of [
    ["insumos", "Polvilho de teste DEMO"],
    ["embalagens", "Caixa especial DEMO"],
  ]) {
    await navegar(`estoque-${tipo}`);
    await abrir(tipo === "insumos" ? "Cadastrar Insumo" : "Cadastrar Embalagem");
    await campo("nome", nome);
    await campo("equivalente", tipo === "insumos" ? 5 : 36);
    await campo("fornecedor", "Fornecedor demonstrativo");
    await campo("custo", 12.5);
    await campo("minimo", 2);
    if (tipo === "embalagens") {
      await page.select('[name="tipoEmbalagem"]', "Caixa");
      assert.deepEqual(
        await page.$$eval('[name="unidadeCompra"] option', (es) => es.map((e) => e.value)),
        ["fardo", "pacote", "unidade"],
      );
    }
    await salvar("Salvar configuração");
    ids[tipo] = await page.$$eval(
      '[data-testid^="suprimento-"]',
      (es, n) =>
        es.find((e) => e.textContent.includes(n)).dataset.testid.replace(/^suprimento-/, ""),
      nome,
    );
    assert.ok((await suprimento(ids[tipo])).includes(tipo === "insumos" ? "(0 kg)" : "(0 un)"));
    await abrir("Registrar compra");
    await campo("quantidade", 3);
    await campo("motivo", "Compra fictícia do novo item");
    await salvar("Confirmar movimentação");
    await abrir(tipo === "insumos" ? "Registrar retirada" : "Retirar 1");
    await salvar("Confirmar movimentação");
    assert.ok((await suprimento(ids[tipo])).includes(tipo === "insumos" ? "10 kg" : "72 un"));
    await page.click(`[aria-label="Editar ${nome}"]`);
    await page.waitForSelector('[role="dialog"]');
    await campo("nome", `${nome} Premium`);
    await campo("custo", 14);
    await salvar("Salvar configuração");
    assert.ok((await suprimento(ids[tipo])).includes(tipo === "insumos" ? "10 kg" : "72 un"));
    await abrir(tipo === "insumos" ? "Cadastrar Insumo" : "Cadastrar Embalagem");
    await campo("nome", `${nome.toUpperCase()} PREMIUM`);
    await campo("equivalente", 5);
    await campo("fornecedor", "Fornecedor demonstrativo");
    await clicar("Salvar configuração", '[role="dialog"] button');
    await page.waitForFunction(() =>
      document.querySelector('[role="alert"]')?.textContent.includes("Já existe um item"),
    );
    await fechar();
    await captura(`cadastro-${tipo}-compra-retirada.png`);
    if (tipo === "embalagens") {
      assert.ok((await suprimento("emb-caixa100")).includes("100 un"));
      assert.ok((await suprimento("emb-caixa100")).includes("58,00"));
    }
    testes.push(
      `${tipo}: novo cadastro, compra de 3 volumes, retirada de 1, edição, duplicidade bloqueada e saldo preservado`,
    );
  }
  await navegar("cadastro-produtos");
  assert.ok(await page.$(`[data-testid="cadastro-${ids.produto}"]`));
  await navegar("estoque-salgados");
  assert.deepEqual(await saldo(ids.produto), ["150", "0", "150"]);
  testes.push(
    "Estado local compartilhado entre as quatro rotas sem cadastros nem saldos duplicados",
  );
  assert.deepEqual(banco, []);
  assert.deepEqual(mutacoes, []);
  assert.deepEqual(erros, []);
  assert.deepEqual(http, []);
  const resultado = { base, ids, testes, capturas, medidas, erros, banco, mutacoes, http };
  writeFileSync(resolve(out, "resultado.json"), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
} catch (e) {
  await captura("falha.png");
  console.error(
    JSON.stringify(
      {
        erro: e.message,
        testes,
        erros,
        banco,
        mutacoes,
        http,
        texto: await page.evaluate(() => document.body.innerText),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
