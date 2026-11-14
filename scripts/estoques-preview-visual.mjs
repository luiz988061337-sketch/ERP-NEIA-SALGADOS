// Navegador real E1/E2/E3. Não permite acesso ao banco durante a validação.
// node scripts/estoques-preview-visual.mjs [baseURL] [pastaSaida]
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = resolve(process.argv[3] ?? "docs/estoques/validacao/local");
const executablePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
assert.ok(executablePath, "Chrome ou Edge instalado");
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-first-run", "--hide-scrollbars"],
});
const page = await browser.newPage();
const erros = [],
  bloqueadas = [],
  falhasHTTP = [],
  testes = [],
  medidas = {};
page.on("pageerror", (e) => erros.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400 && r.url().startsWith(base))
    falhasHTTP.push({ url: r.url(), status: r.status() });
});
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (/supabase\.(co|com)|lovable\.cloud/.test(r.url())) {
    bloqueadas.push(r.url());
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
        secure: secure === "TRUE",
        ...(Number(expires) > 0 ? { expires: Number(expires) } : {}),
        name,
        value,
        httpOnly: l.startsWith("#HttpOnly_"),
      };
    });
  await browser.setCookie(...cookies);
}
const route = (tipo) => `/preview/estoque-${tipo}`;
async function hidratado(tipo) {
  await page.waitForSelector(`[data-testid="estoque-${tipo}"]`, { timeout: 60000 });
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
async function goto(tipo) {
  await page.goto(base + route(tipo), { waitUntil: "networkidle2", timeout: 120000 });
  await hidratado(tipo);
}
async function clickText(selector, text) {
  const handle = await page.evaluateHandle(
    (s, t) =>
      [...document.querySelectorAll(s)].find((e) =>
        e.textContent.trim().toLocaleLowerCase().startsWith(t.toLocaleLowerCase()),
      ),
    selector,
    text,
  );
  const el = handle.asElement();
  assert.ok(el, text);
  await el.click();
  await handle.dispose();
}
async function campo(nome, valor) {
  const selector = `[role="dialog"] [name="${nome}"]`;
  await page.waitForSelector(selector);
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (String(valor)) await page.type(selector, String(valor));
}
const dialogo = () => page.waitForSelector('[role="dialog"]');
const fechar = async () => {
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
};
const confirmar = async () => {
  await clickText('[role="dialog"] button', "Confirmar movimentação");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
};
const saldoProduto = () =>
  page.$eval('[data-testid="produto-produto-coxinha"]', (e) =>
    [...e.closest("tr").querySelectorAll("td")].slice(1, 4).map((c) => c.textContent.trim()),
  );
const saldoSuprimento = (id) =>
  page.$eval(
    `[data-testid="suprimento-${id}"]`,
    (e) => e.closest("tr").querySelectorAll("td")[2].textContent,
  );
const capture = (nome) => page.screenshot({ path: resolve(out, nome), fullPage: true });
try {
  for (const tipo of ["salgados", "insumos", "embalagens"]) {
    await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
    await goto(tipo);
    assert.ok(await page.$('[data-sidebar="sidebar"]'), "AdminShell original");
    assert.equal(
      await page.evaluate(() => document.documentElement.classList.contains("erp-admin")),
      true,
    );
    assert.equal(await page.$$eval(".est-kpis > *", (els) => els.length), 5);
    assert.ok(
      (await page.$eval(".est-preview-ribbon", (e) => e.textContent)).includes(
        "DADOS DEMONSTRATIVOS",
      ),
    );
    medidas[`${tipo}-desktop`] = await page.evaluate(() => ({
      largura: innerWidth,
      documento: document.documentElement.scrollWidth,
      fundo: getComputedStyle(document.querySelector(".estoques-preview")).backgroundColor,
      sidebar: document.querySelector('[data-sidebar="sidebar"]').getBoundingClientRect().width,
    }));
    await capture(`${tipo}-desktop-1672.png`);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await goto(tipo);
    const largura = await page.evaluate(() => ({
      viewport: innerWidth,
      documento: document.documentElement.scrollWidth,
    }));
    assert.ok(
      largura.documento <= largura.viewport,
      `Overflow em ${tipo}: ${JSON.stringify(largura)}`,
    );
    medidas[`${tipo}-mobile`] = largura;
    // A tabela mantém as colunas e rola dentro do card, não na página.
    assert.ok(await page.$eval(".est-table-panel table", (e) => e.scrollWidth > 390));
    await capture(`${tipo}-mobile-390.png`);
  }
  testes.push(
    "Seis capturas: AdminShell real, tema administrativo, cinco indicadores e nenhum overflow horizontal de página em 390px",
  );
  await page.click('[aria-label="Abrir menu administrativo"]');
  await page.waitForSelector('[data-mobile="true"]');
  assert.ok(
    (await page.$eval('[data-mobile="true"]', (e) => e.textContent)).includes(
      "Cadastro de Produtos",
    ),
  );
  await page.click('[data-mobile="true"] a[href="/preview/estoque-insumos"]');
  await hidratado("insumos");
  await page.waitForSelector('[data-mobile="true"]', { hidden: true });
  testes.push("Menu mobile abre, navega entre estoques e fecha após a navegação");

  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  await goto("salgados");
  assert.deepEqual(await saldoProduto(), ["2.000", "350", "1.650"]);
  await page.type('[aria-label="Buscar sabor"]', "Kibe");
  assert.equal(await page.$$eval(".est-table-panel tbody tr", (e) => e.length), 1);
  await page.focus('[aria-label="Buscar sabor"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.waitForFunction(
    () => document.querySelectorAll(".est-table-panel tbody tr").length === 9,
  );
  await clickText(".est-content button", "Cadastro de Produtos");
  await page.waitForSelector('[data-testid="cadastro-produtos"]');
  assert.ok(
    (await page.$eval('[data-testid="cadastro-produtos"]', (e) => e.textContent)).includes(
      "produto-coxinha",
    ),
  );
  await clickText(".est-content button", "Estoque de Salgados");
  await hidratado("salgados");
  await clickText(".est-content button", "Registrar entrada");
  await dialogo();
  await campo("quantidade", 100);
  await campo("codigo", "CF-BROWSER");
  await campo("motivo", "Produção fictícia via teste");
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.100", "350", "1.750"]);
  await clickText(".est-content button", "Reservar");
  await dialogo();
  await campo("quantidade", 50);
  await campo("pedido", "PED-BROWSER");
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.100", "400", "1.700"]);
  await clickText(".est-content button", "Movimentação");
  await dialogo();
  const reserva = await page.$$eval(
    '[name="reserva"] option',
    (es) => es.find((e) => e.textContent.includes("PED-BROWSER")).value,
  );
  await page.select('[name="reserva"]', reserva);
  await campo("quantidade", 30);
  await campo("motivo", "Retirada com reserva");
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.070", "370", "1.700"]);
  await clickText(".est-content button", "Liberar reserva");
  await dialogo();
  await page.select('[name="pedido"]', "PED-BROWSER");
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.070", "350", "1.720"]);
  await clickText(".est-content button", "Registrar perda");
  await dialogo();
  await campo("quantidade", 999999);
  await campo("motivo", "Teste bloqueio");
  await clickText('[role="dialog"] button', "Confirmar movimentação");
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("acima do disponível"),
  );
  await campo("quantidade", 20);
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.050", "350", "1.700"]);
  await page.click('[aria-label="Ajustar Coxinha de Frango"]');
  await dialogo();
  await campo("quantidade", 800);
  await campo("motivo", "Conferência justificada");
  await confirmar();
  assert.deepEqual(await saldoProduto(), ["2.100", "350", "1.750"]);
  await clickText(".est-content button", "Ver histórico");
  await dialogo();
  assert.ok((await page.$eval('[role="dialog"]', (e) => e.textContent)).includes("CF-76: 30"));
  await fechar();
  // Combos agora têm página própria: a reserva do combo usa a mesma rota.
  await page.click('a[href="/preview/combos"]');
  await page.waitForSelector('[data-testid="cadastro-combos"]');
  await page.click('[aria-label="Consultar Combo Festa"]');
  await dialogo();
  await clickText('[role="dialog"] button', "Confirmar pedido com este combo");
  await dialogo();
  await campo("pedido", "PED-COMBO-REGRESSAO");
  await campo("quantidade", 1);
  await clickText('[role="dialog"] button', "Confirmar pedido e reservar sabores");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.click('a[href="/preview/estoque-salgados"]');
  await hidratado("salgados");
  assert.deepEqual(await saldoProduto(), ["2.100", "400", "1.700"]);
  testes.push(
    "Salgados: busca, cadastro único, entrada, reserva, retirada FEFO sem baixa dupla, liberação só do saldo, perda, inventário, erro de saldo e combo 50/30/20",
  );

  await page.click('a[href="/preview/estoque-insumos"]');
  await hidratado("insumos");
  await page.click('[data-testid="suprimento-ins-farinha"]');
  await clickText(".est-content button", "Registrar compra");
  await dialogo();
  await campo("quantidade", 2);
  await campo("motivo", "Compra fictícia");
  await confirmar();
  assert.ok((await saldoSuprimento("ins-farinha")).includes("30 kg"));
  await clickText(".est-content button", "Registrar retirada");
  await dialogo();
  await confirmar();
  assert.ok((await saldoSuprimento("ins-farinha")).includes("25 kg"));
  await clickText(".est-content button", "Retirada parcial");
  await dialogo();
  await campo("quantidade", 500);
  await page.select('[name="unidade"]', "g");
  await campo("motivo", "Meio quilo aproximado");
  await confirmar();
  assert.ok((await saldoSuprimento("ins-farinha")).includes("24,5 kg"));
  await clickText(".est-quick-actions button", "Conferência");
  await dialogo();
  await campo("quantidade", 20);
  await campo("motivo", "Conferência visual");
  await confirmar();
  await clickText(".est-content button", "Ajustar saldo");
  await dialogo();
  await campo("quantidade", 8);
  await campo("motivo", "Ajuste estimado justificado");
  await confirmar();
  assert.ok((await saldoSuprimento("ins-farinha")).includes("8 kg"));
  await page.click('[aria-label="Editar Farinha de trigo"]');
  await dialogo();
  await page.select('[name="unidadeBase"]', "g");
  await campo("equivalente", 5000);
  await clickText('[role="dialog"] button', "Salvar configuração");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.ok((await saldoSuprimento("ins-farinha")).includes("8.000 g"));
  await clickText(".est-content button", "Incluir na lista");
  await clickText(".est-content button", "Gerar compra");
  await dialogo();
  await clickText('[role="dialog"] button', "Gerar rascunho");
  await page.waitForSelector('[role="dialog"] [role="status"]');
  await fechar();
  await clickText(".est-tabs button", "Histórico de Movimentações");
  assert.ok(
    (await page.$eval(".est-main-column", (e) => e.textContent)).includes("Meio quilo aproximado"),
  );
  testes.push(
    "Insumos: compra, retirada fechada, parcial 500g, conferência, ajuste justificado, edição kg→g sem alterar físico, histórico e rascunho de compra",
  );

  await page.click('a[href="/preview/estoque-embalagens"]');
  await hidratado("embalagens");
  await page.click('[aria-label="Editar Caixa para 50 salgados"]');
  await dialogo();
  await campo("equivalente", 40);
  await clickText('[role="dialog"] button', "Salvar configuração");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await clickText(".est-package-actions button", "Registrar compra");
  await dialogo();
  await campo("quantidade", 2);
  await campo("motivo", "Dois fardos configurados");
  await confirmar();
  assert.ok((await saldoSuprimento("emb-caixa50")).includes("330 un"));
  await clickText(".est-package-actions button", "Retirar 1");
  await dialogo();
  await confirmar();
  assert.ok((await saldoSuprimento("emb-caixa50")).includes("290 un"));
  await clickText(".est-package-actions button", "Retirada parcial");
  await dialogo();
  await campo("quantidade", 10);
  await campo("motivo", "Dez unidades");
  await confirmar();
  assert.ok((await saldoSuprimento("emb-caixa50")).includes("280 un"));
  assert.ok((await saldoSuprimento("emb-caixa100")).includes("100 un"));
  await clickText(".est-content button", "Nova conferência");
  await dialogo();
  await campo("quantidade", 80);
  await campo("motivo", "Contagem de embalagens");
  await confirmar();
  await clickText(".est-content button", "Gerar lista de compra");
  await dialogo();
  await clickText('[role="dialog"] button', "Gerar rascunho");
  await fechar();
  await clickText(".est-content button", "Cadastrar embalagem");
  await dialogo();
  await campo("nome", "Embalagem sem fardo definido");
  await campo("fornecedor", "Fornecedor fictício");
  await clickText('[role="dialog"] button', "Salvar configuração");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.ok((await page.$eval(".est-table-panel", (e) => e.textContent)).includes("A definir"));
  await clickText(".est-tabs button", "Fornecedores");
  assert.ok(
    (await page.$eval(".est-main-column", (e) => e.textContent)).includes("Fornecedor fictício"),
  );
  testes.push(
    "Embalagens: fardo de 40 configurável, compra, retirada inteira em dois cliques, parcial, tipos separados, conferência, reposição e cadastro com tamanho a definir",
  );

  await page.click('a[href="/preview/estoque-salgados"]');
  await hidratado("salgados");
  assert.deepEqual(await saldoProduto(), ["2.100", "400", "1.700"]);
  await page.click('a[href="/preview/estoque-insumos"]');
  await hidratado("insumos");
  assert.ok((await saldoSuprimento("ins-farinha")).includes("8.000 g"));
  testes.push("Estados independentes preservados entre navegações no mesmo Preview");
  assert.deepEqual(bloqueadas, []);
  assert.deepEqual(erros, []);
  assert.deepEqual(falhasHTTP, []);
  const resultado = { base, out, testes, medidas, erros, bloqueadas, falhasHTTP };
  writeFileSync(resolve(out, "resultado.json"), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
} catch (e) {
  await capture("falha.png");
  console.error(
    JSON.stringify(
      {
        erro: e.message,
        erros,
        bloqueadas,
        falhasHTTP,
        testes,
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
