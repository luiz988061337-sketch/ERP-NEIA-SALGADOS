// Cadastro de Combos e reservas unificadas: navegador real, sem acesso ao banco.
// node scripts/combos-preview-visual.mjs [baseURL] [pastaSaida]
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = resolve(process.argv[3] ?? "docs/estoques/combos/local");
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
async function esperar(rota) {
  await page.waitForSelector(`[data-testid="${rota}"]`, { timeout: 60000 });
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
  await esperar(rota === "combos" ? "cadastro-combos" : rota);
}
async function navegar(rota) {
  await page.click(`[data-sidebar="sidebar"] a[href="/preview/${rota}"]`);
  await esperar(rota === "combos" ? "cadastro-combos" : rota);
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
async function salvar(texto = "Salvar combo demonstrativo") {
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
const linhaReservas = (id) =>
  page.$eval(
    `[data-testid="produto-${id}"]`,
    (e) => e.closest("tr").querySelectorAll("td")[5].textContent,
  );
const nomeCombo = "Combo Demo Reserva";
const ids = {};
try {
  // Capturas das telas aprovadas e da nova.
  for (const rota of ["combos", "estoque-salgados"]) {
    await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
    await goto(rota);
    assert.equal(
      await page.evaluate(() => document.documentElement.classList.contains("erp-admin")),
      true,
    );
    assert.ok(await page.$('[data-sidebar="sidebar"]'));
    await captura(`${rota === "combos" ? "cadastro-combos" : "estoque-salgados"}-desktop.png`);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await goto(rota);
    medidas[rota] = await semOverflow();
    await captura(`${rota === "combos" ? "cadastro-combos" : "estoque-salgados"}-mobile.png`);
  }
  testes.push(
    "Cadastro de Combos e Estoque de Salgados: AdminShell real, quatro capturas e nenhuma página com overflow horizontal em 390px",
  );

  // Menu lateral leva à nova página (e não a um modal).
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await goto("combos");
  await page.click('[aria-label="Abrir menu administrativo"]');
  await page.waitForSelector('[data-mobile="true"]');
  await page.click('[data-mobile="true"] a[href="/preview/combos"]');
  await esperar("cadastro-combos");
  await page.waitForSelector('[data-mobile="true"]', { hidden: true });
  assert.equal(await page.$('[role="dialog"]'), null);
  testes.push(
    "Menu Produtos → Combos abre a página de cadastro de combos, sem janela de referência",
  );

  // Cadastro de combo.
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  await goto("combos");
  await abrir("Cadastrar Combo");
  await campo("nome", nomeCombo);
  await campo("descricao", "Combo demonstrativo criado no teste real de navegador");
  await campo("total", "100");
  await campo("qtd_produto-coxinha", "50");
  await campo("qtd_produto-queijo", "30");
  await campo("qtd_produto-kibe", "20");
  await captura("formulario-combo-desktop.png");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await semOverflow();
  await page.$eval('[role="dialog"]', (e) => {
    e.scrollTop = 0;
  });
  await captura("formulario-combo-mobile.png");
  await page.$eval('[role="dialog"]', (e) => {
    e.scrollTop = e.scrollHeight;
  });
  await captura("formulario-combo-mobile-final.png");
  await salvar();
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  ids.combo = await page.$$eval(
    '[data-testid^="combo-combo-"]',
    (es, nome) =>
      es.find((e) => e.textContent.includes(nome))?.dataset.testid.replace(/^combo-/, ""),
    nomeCombo,
  );
  assert.ok(ids.combo, "combo cadastrado");
  assert.ok(
    (await page.$eval(".est-table-panel", (e) => e.textContent)).includes("50× Coxinha de Frango"),
    "composição exibida na tabela",
  );
  testes.push(
    "Cadastro de combo: nome, total 100 e composição 50/30/20 somando exatamente o total, formulário capturado em desktop e mobile",
  );

  // Soma divergente é bloqueada.
  await abrir("Cadastrar Combo");
  await campo("nome", "Combo Demo Divergente");
  await campo("total", "100");
  await campo("qtd_produto-coxinha", "40");
  await campo("qtd_produto-queijo", "30");
  await campo("qtd_produto-kibe", "20");
  await clicar("Salvar combo", '[role="dialog"] button');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("deve somar"),
  );
  await fechar();
  testes.push("Composição cuja soma não fecha o total é rejeitada com mensagem clara");

  // Nome duplicado é bloqueado.
  await abrir("Cadastrar Combo");
  await campo("nome", ` ${nomeCombo.toUpperCase()} `);
  await campo("total", "100");
  await campo("qtd_produto-coxinha", "50");
  await campo("qtd_produto-queijo", "30");
  await campo("qtd_produto-kibe", "20");
  await clicar("Salvar combo", '[role="dialog"] button');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("Já existe um combo"),
  );
  await fechar();
  testes.push("Nome de combo duplicado é bloqueado");

  // Editar, duplicar, desativar e consultar.
  await page.click(`[aria-label="Editar combo ${nomeCombo}"]`);
  await page.waitForSelector('[role="dialog"]');
  await campo("nome", `${nomeCombo} Revisado`);
  await campo("qtd_produto-coxinha", "60");
  await campo("qtd_produto-kibe", "10");
  await salvar();
  assert.ok(
    (await page.$eval(".est-table-panel", (e) => e.textContent)).includes(`${nomeCombo} Revisado`),
  );
  await page.click(`[aria-label="Duplicar combo ${nomeCombo} Revisado"]`);
  await page.waitForFunction(
    (nome) =>
      document.querySelector(".est-table-panel").textContent.includes(`${nome} Revisado (cópia)`),
    {},
    nomeCombo,
  );
  await page.click(`[aria-label="Desativar combo ${nomeCombo} Revisado"]`);
  await page.waitForFunction(
    (nome) => {
      const linha = [...document.querySelectorAll(".est-table-panel tbody tr")].find((e) =>
        e.textContent.includes(nome),
      );
      return linha?.textContent.includes("Inativo");
    },
    {},
    `${nomeCombo} Revisado`,
  );
  await page.select('[aria-label="Situação dos combos"]', "inativo");
  await page.click(`[aria-label="Ativar combo ${nomeCombo} Revisado"]`);
  await page.select('[aria-label="Situação dos combos"]', "todos");
  await page.click(`[aria-label="Consultar ${nomeCombo} Revisado"]`);
  await page.waitForSelector('[role="dialog"]');
  assert.ok(
    (await page.$eval('[role="dialog"]', (e) => e.textContent)).includes("Disponível no estoque"),
  );
  await captura("consulta-combo-desktop.png");
  await fechar();
  await page.type('[aria-label="Pesquisar combos"]', "demo");
  assert.ok(await page.$$eval(".est-table-panel tbody tr", (es) => es.length >= 2));
  await page.focus('[aria-label="Pesquisar combos"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  testes.push("Editar, duplicar, ativar/desativar, consultar composição e pesquisar por nome");

  // ------------------------------------------------- reserva unificada no estoque
  await navegar("estoque-salgados");
  const antes = {
    coxinha: await saldo("produto-coxinha"),
    queijo: await saldo("produto-queijo"),
    kibe: await saldo("produto-kibe"),
  };
  assert.deepEqual(antes.coxinha, ["2.000", "350", "1.650"]);
  // Reserva avulsa de 50 coxinhas pelo próprio Estoque de Salgados.
  await clicar("Reservar");
  await page.waitForSelector('[role="dialog"]');
  await campo("quantidade", "50");
  await campo("pedido", "PED-AVULSO-UNICO");
  await clicar("Confirmar movimentação", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.deepEqual(await saldo("produto-coxinha"), ["2.000", "400", "1.600"]);
  await captura("estoque-reserva-avulsa.png");

  // Combo: a reserva soma no MESMO total do sabor.
  await navegar("combos");
  await page.click(`[aria-label="Consultar ${nomeCombo} Revisado"]`);
  await page.waitForSelector('[role="dialog"]');
  await clicar("Confirmar pedido com este combo", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]');
  await campo("pedido", "PED-COMBO-UNICO");
  await campo("quantidade", "2");
  await clicar("Confirmar pedido e reservar sabores", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await navegar("estoque-salgados");
  // 2 combos revisados (60/30/10) = 120 coxinha + 60 queijo + 20 kibe.
  assert.deepEqual(await saldo("produto-coxinha"), ["2.000", "520", "1.480"]);
  assert.deepEqual(await saldo("produto-queijo"), ["1.500", "310", "1.190"]);
  assert.deepEqual(await saldo("produto-kibe"), ["1.800", "320", "1.480"]);
  const reservasCoxinha = await linhaReservas("produto-coxinha");
  assert.ok(reservasCoxinha.includes("3 pedido(s)"), "várias origens somadas em uma única linha");
  assert.ok(reservasCoxinha.includes("520"), "total reservado único do sabor");
  assert.ok(
    !/reservado em combo|reservado avulso/i.test(reservasCoxinha),
    "sem coluna separada de combo/avulso",
  );
  await captura("estoque-reserva-unificada.png");
  testes.push(
    "Reserva avulsa (50) e reserva de combo (120) somam no mesmo total reservado por sabor: 520 = 350 + 50 + 120, físico intocado",
  );

  // Pedido duplicado é bloqueado.
  await navegar("combos");
  await page.click(`[aria-label="Consultar ${nomeCombo} Revisado"]`);
  await page.waitForSelector('[role="dialog"]');
  await clicar("Confirmar pedido com este combo", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]');
  await campo("pedido", "PED-COMBO-UNICO");
  await clicar("Confirmar pedido e reservar sabores", '[role="dialog"] button');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes("duplicada"),
  );
  await fechar();
  testes.push("Confirmação duplicada do mesmo pedido é bloqueada");

  // Retirada do freezer sem baixa dupla.
  await navegar("estoque-salgados");
  await page.click('[data-testid="produto-produto-coxinha"]');
  await clicar("Movimentação");
  await page.waitForSelector('[role="dialog"]');
  await page.select(
    '[name="reserva"]',
    await page.$$eval(
      "[name='reserva'] option",
      (es) => es.find((e) => e.textContent.includes("PED-AVULSO-UNICO")).value,
    ),
  );
  await campo("quantidade", "50");
  await campo("motivo", "Retirada da reserva avulsa");
  await clicar("Confirmar movimentação", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.deepEqual(await saldo("produto-coxinha"), ["1.950", "470", "1.480"]);
  await captura("estoque-retirada-sem-baixa-dupla.png");
  testes.push(
    "Retirada de 50 já reservadas: físico 2.000 → 1.950 e reservado 520 → 470, disponível permanece 1.480 (sem baixa dupla)",
  );

  // Cancelamento do pedido de combo libera só a pendência.
  await navegar("combos");
  await page.click(`[aria-label="Consultar ${nomeCombo} Revisado"]`);
  await page.waitForSelector('[role="dialog"]');
  await fechar();
  await navegar("estoque-salgados");
  await clicar("Liberar reserva");
  await page.waitForSelector('[role="dialog"]');
  await page.select('[name="pedido"]', "PED-COMBO-UNICO");
  await clicar("Confirmar movimentação", '[role="dialog"] button');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.deepEqual(await saldo("produto-coxinha"), ["1.950", "350", "1.600"]);
  assert.deepEqual(await saldo("produto-queijo"), ["1.500", "250", "1.250"]);
  assert.deepEqual(await saldo("produto-kibe"), ["1.800", "300", "1.500"]);
  assert.equal((await linhaReservas("produto-coxinha")).includes("350"), true);
  await captura("estoque-cancelamento-liberacao.png");
  testes.push(
    "Cancelamento do pedido de combo libera apenas a reserva pendente: volta ao total original por sabor, sem tocar no físico",
  );

  // Cadastrar combo não movimenta estoque.
  await navegar("combos");
  const antesCadastro = await navegar("estoque-salgados").then(() => saldo("produto-coxinha"));
  await navegar("combos");
  await abrir("Cadastrar Combo");
  await campo("nome", "Combo Sem Movimentar");
  await campo("total", "50");
  await campo("qtd_produto-croquete", "50");
  await salvar();
  await navegar("estoque-salgados");
  assert.deepEqual(await saldo("produto-coxinha"), antesCadastro);
  assert.deepEqual(await saldo("produto-croquete"), ["1.000", "100", "900"]);
  testes.push("Cadastrar combo não movimenta nenhum saldo do Estoque de Salgados");

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
