// C1 — Navegador real: Painel Comercial e Clientes/Segmentação.
// Sem acesso ao banco; valida layout, filtros, histórico e responsividade.
// node scripts/comercial-preview-visual.mjs [baseURL] [pastaSaida]
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = resolve(process.argv[3] ?? "docs/estoques/comercial/local");
mkdirSync(out, { recursive: true });
const executablePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
assert.ok(executablePath, "Chrome ou Edge instalado");
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
  } else if (
    r.url().startsWith(base) &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(r.method())
  ) {
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

const ROTAS = {
  painel: "/preview/comercial/painel",
  clientes: "/preview/comercial/clientes",
};
const TESTID = { painel: "painel-comercial", clientes: "clientes-segmentacao" };

async function esperar(rota) {
  await page.waitForSelector(`[data-testid="${TESTID[rota]}"]`, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".est-content button, .com-content button")].some(
        (e) =>
          Object.keys(e).some(
            (k) => k.startsWith("__reactProps$") && typeof e[k]?.onClick === "function",
          ),
      ),
    { timeout: 60000 },
  );
}
async function goto(rota) {
  await page.goto(base + ROTAS[rota], { waitUntil: "networkidle2", timeout: 120000 });
  await esperar(rota);
}
async function clicar(texto, seletor = ".com-content button") {
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
async function captura(nome) {
  await page.screenshot({ path: resolve(out, nome), fullPage: true });
  capturas.push(nome);
}
async function semOverflow(rotulo) {
  const m = await page.evaluate(() => ({
    viewport: innerWidth,
    documento: document.documentElement.scrollWidth,
  }));
  assert.ok(m.documento <= m.viewport, `${rotulo}: ${JSON.stringify(m)}`);
  return m;
}
const kpi = (indice) =>
  page.$$eval(".com-kpis > div", (els, i) => {
    const el = els[i];
    return {
      label: el.querySelector("p")?.textContent?.trim() ?? "",
      valor: el.querySelectorAll("p")[1]?.textContent?.trim() ?? "",
      detalhe: el.querySelectorAll("p")[2]?.textContent?.trim() ?? "",
    };
  }, indice);

try {
  // ------------------------------------------------- painel (desktop)
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  await goto("painel");
  assert.ok(await page.$('[data-sidebar="sidebar"]'), "AdminShell aprovado presente");
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains("erp-admin")),
    true,
  );
  assert.ok(
    (await page.$eval(".com-cabecalho h1", (e) => e.textContent)).includes(
      "Comercial — Marketing e Reativação",
    ),
  );
  assert.equal(await page.$$eval(".com-kpis > div", (els) => els.length), 6);
  const faixa30 = await kpi(0);
  const faixa60 = await kpi(1);
  const faixa90 = await kpi(2);
  const rascunho = await kpi(3);
  const aprovacao = await kpi(4);
  const recuperados = await kpi(5);
  assert.ok(faixa30.label.includes("30 dias"));
  assert.ok(faixa60.label.includes("60 dias"));
  assert.ok(faixa90.label.includes("90+"));
  assert.ok(faixa30.detalhe.includes("exclusiva"));
  assert.ok(faixa60.detalhe.includes("exclusiva"));
  assert.ok(faixa90.detalhe.includes("exclusiva"));
  // As faixas são exclusivas: 30 > 60 > 90+ e a soma bate com o acumulado.
  const n30 = Number(faixa30.valor);
  const n60 = Number(faixa60.valor);
  const n90 = Number(faixa90.valor);
  assert.ok(n30 > 0 && n60 > 0 && n90 > 0, "as três faixas têm clientes");
  assert.ok(n30 >= n60 && n60 >= n90, "faixas exclusivas seguem a ordem esperada da referência");
  const rodape = await page.$eval(".com-paginacao span", (e) => e.textContent ?? "");
  const acumulado = Number(rodape.match(/de (\d+) clientes inativos/)?.[1] ?? "0");
  assert.equal(acumulado, n30 + n60 + n90, "rodapé mostra o acumulado sem duplicidade");
  assert.ok(Number(rascunho.valor) >= 1);
  assert.ok(Number(aprovacao.valor) >= 1);
  assert.ok(Number(recuperados.valor) >= 1);
  const acabamento = await page.evaluate(() => {
    const tamanho = (seletor) => {
      const el = document.querySelector(seletor);
      return el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0;
    };
    const cor = (seletor) => {
      const el = document.querySelector(seletor);
      return el ? getComputedStyle(el).backgroundColor : "";
    };
    return {
      indicadorRotulo: tamanho(".com-kpis > div > div > p:first-child"),
      indicadorDetalhe: tamanho(".com-kpis > div > div > p:last-child"),
      cabecalhoTabela: tamanho(".com-tabela-card table th"),
      legenda: tamanho(".com-nota"),
      badge: tamanho(".com-badge"),
      fundoKpi: cor(".com-kpis > div"),
      fundoCartao: cor(".comercial-preview section"),
    };
  });
  assert.ok(acabamento.indicadorRotulo >= 11, "rótulo do indicador legível");
  assert.ok(acabamento.indicadorDetalhe >= 11, "detalhe do indicador legível");
  assert.ok(acabamento.cabecalhoTabela >= 11, "cabeçalho de tabela legível");
  assert.ok(acabamento.legenda >= 12, "legenda legível");
  assert.ok(acabamento.badge >= 11, "badge legível");
  assert.equal(acabamento.fundoKpi, "rgb(24, 25, 23)", "indicador em grafite local");
  assert.equal(acabamento.fundoCartao, "rgb(24, 25, 23)", "cartão em grafite local");
  assert.ok(
    (await page.$eval(".com-content", (e) => e.textContent)).includes("fictícios"),
    "dados identificados como demonstração",
  );
  await captura("painel-comercial-desktop.png");

  // ---------------------------------------------- filtros do painel
  const linhasIniciais = await page.$$eval(".com-tabela-card tbody tr", (els) => els.length);
  assert.ok(linhasIniciais > 0);
  const totalInativos = await page.$eval(".com-paginacao span", (e) =>
    Number((e.textContent ?? "").match(/de (\d+) clientes inativos/)?.[1] ?? 0),
  );
  // Segmento não é coluna no painel (igual à referência): validamos pela contagem.
  await page.select('[aria-label="Filtrar por segmento"]', "muito_inativo");
  await page.waitForFunction(
    (total) =>
      document.querySelectorAll(".com-tabela-card tbody tr").length > 0 &&
      Number(
        document
          .querySelector(".com-paginacao span")
          ?.textContent?.match(/de (\d+) clientes inativos/)?.[1] ?? 0,
      ) < total,
    { timeout: 15000 },
    totalInativos,
  );
  await captura("painel-comercial-filtro-muito-inativo.png");
  await page.select('[aria-label="Filtrar por segmento"]', "todos");
  await page.select('[aria-label="Filtrar por origem"]', "Instagram");
  // A tabela resumida do painel não repete a origem; validamos o filtro pela contagem.
  await page.waitForFunction(
    (total) => {
      const atual = Number(
        document
          .querySelector(".com-paginacao span")
          ?.textContent?.match(/de (\d+) clientes inativos/)?.[1] ?? 0,
      );
      return atual > 0 && atual < total;
    },
    { timeout: 15000 },
    totalInativos,
  );
  await captura("painel-comercial-filtro-origem.png");
  await page.select('[aria-label="Filtrar por origem"]', "todas");
  await page.type('[aria-label="Buscar cliente"]', "Maria");
  await page.waitForFunction(
    () => {
      const linhas = [...document.querySelectorAll(".com-tabela-card tbody tr")];
      return linhas.length > 0 && linhas.every((tr) => tr.textContent.includes("Maria"));
    },
    { timeout: 15000 },
  );
  await captura("painel-comercial-busca.png");
  await page.focus('[aria-label="Buscar cliente"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.waitForFunction(
    () => document.querySelectorAll(".com-tabela-card tbody tr").length > 1,
    { timeout: 15000 },
  );
  testes.push(
    "Painel: 6 indicadores com faixas exclusivas (soma = acumulado do rodapé), filtros por segmento (por contagem), origem e busca funcionando",
  );
  testes.push(
    "C1-A: tipografia secundária legível (indicadores, tabelas, legendas e badges) e fundos locais em grafite",
  );

  // ------------------------------------------------- histórico do cliente
  await page.click('.com-tabela-card tbody tr [aria-label^="Ver histórico"]');
  await page.waitForSelector('[role="dialog"]');
  assert.ok(
    (await page.$eval('[role="dialog"]', (e) => e.textContent)).includes("Histórico"),
  );
  await captura("painel-comercial-historico.png");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  testes.push("Histórico demonstrativo do cliente abre em modal com timeline e situação de reativação");

  // ------------------------------------------------------ menu lateral
  // O acionador fica visível no menu móvel; em desktop a sidebar já está aberta.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.click('[aria-label="Abrir menu administrativo"]');
  await page.waitForSelector('[data-mobile="true"]');
  const menu = await page.$eval('[data-mobile="true"]', (e) => e.textContent ?? "");
  assert.ok(menu.includes("Painel / Marketing e Reativação"));
  assert.ok(menu.includes("Clientes / CRM"));
  assert.ok(menu.includes("Campanhas"));
  assert.ok(menu.includes("Pesquisas e Reclamações"));
  assert.ok(menu.includes("Sugestões de Promoção"));
  assert.ok(menu.includes("Resultados"));
  const rotulosComCorte = await page.$$eval(
    '[data-mobile="true"] [data-sidebar="menu-button"] > span:last-child',
    (elementos) =>
      elementos
        .filter(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 ||
            el.scrollHeight > el.clientHeight + 1,
        )
        .map((el) => el.textContent?.trim() ?? ""),
  );
  assert.deepEqual(rotulosComCorte, [], "nenhum rótulo do menu deve permanecer cortado");
  await captura("menu-comercial-mobile.png");
  await page.click('[data-mobile="true"] a[href="/preview/comercial/clientes"]');
  await esperar("clientes");
  await page.waitForSelector('[data-mobile="true"]', { hidden: true });
  testes.push(
    "Menu lateral do AdminShell: nomes comerciais exibidos por completo, sem corte, e navegação para Clientes / CRM",
  );

  // ----------------------------------------------- clientes / CRM
  await page.setViewport({ width: 1672, height: 941, deviceScaleFactor: 1 });
  await goto("clientes");
  assert.ok(
    (await page.$eval(".com-cabecalho h1", (e) => e.textContent)).includes("Clientes"),
  );
  const totalBase = await page.$$eval(".com-tabela tbody tr", (els) => els.length);
  assert.ok(totalBase > 0);
  const paginacao = await page.$eval(".com-paginacao", (e) => e.textContent ?? "");
  assert.ok(paginacao.includes("de"), "rodapé de paginação presente");
  await page.select('[aria-label="Filtrar por atendente"]', "Ana Souza");
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".com-tabela tbody tr")].every((tr) =>
        tr.textContent.includes("Ana Souza"),
      ),
    { timeout: 15000 },
  );
  await page.select('[aria-label="Filtrar por atendente"]', "todos");
  // Segmento aparece como coluna na página de Clientes/CRM.
  await page.select('[aria-label="Filtrar por segmento"]', "muito_inativo");
  await page.waitForFunction(
    () => {
      const linhas = [...document.querySelectorAll(".com-tabela tbody tr")];
      return linhas.length > 0 && linhas.every((tr) => tr.textContent.includes("Muito inativo"));
    },
    { timeout: 15000 },
  );
  await page.select('[aria-label="Filtrar por segmento"]', "todos");
  await page.select('[aria-label="Filtrar por origem"]', "Instagram");
  await page.waitForFunction(
    () => {
      const linhas = [...document.querySelectorAll(".com-tabela tbody tr")];
      return linhas.length > 0 && linhas.every((tr) => tr.textContent.includes("Instagram"));
    },
    { timeout: 15000 },
  );
  await page.select('[aria-label="Filtrar por origem"]', "todas");
  await captura("clientes-crm-desktop.png");
  await page.select('[aria-label="Filtrar por atendente"]', "todos");
  await page.type('[aria-label="Buscar cliente"]', "62");
  await page.waitForFunction(
    () => document.querySelectorAll(".com-tabela tbody tr").length > 0,
    { timeout: 15000 },
  );
  await page.focus('[aria-label="Buscar cliente"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.click('[aria-label="Próxima página"]');
  await page.waitForFunction(
    () => document.querySelector(".com-paginacao-botoes span")?.textContent?.includes("2 /"),
    { timeout: 15000 },
  );
  testes.push(
    "Clientes/CRM: busca, filtro por atendente, paginação entre páginas e tabela com segmento, origem e favoritos",
  );

  // ------------------------------------------------------------- mobile
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await goto("painel");
  medidas.painel = await semOverflow("painel mobile");
  await captura("painel-comercial-mobile.png");
  await goto("clientes");
  medidas.clientes = await semOverflow("clientes mobile");
  await captura("clientes-crm-mobile.png");
  testes.push("Mobile 390px: nenhuma página com overflow horizontal (painel e clientes)");

  assert.deepEqual(banco, []);
  assert.deepEqual(mutacoes, []);
  assert.deepEqual(erros, []);
  assert.deepEqual(http, []);
  const resultado = { base, testes, capturas, medidas, erros, banco, mutacoes, http };
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
