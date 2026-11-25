/**
 * E01 — verificação DOM do Estoque de Salgados operacional (build local demo,
 * sem rede ao Supabase). Confirma os 17 elementos obrigatórios e a presença
 * das ações reais, sem executar nenhuma movimentação.
 *
 * Uso: node scripts/e01-verificacao-visual.mjs [caminhoBuild]
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import http from "node:http";
import puppeteer from "puppeteer-core";

const dir = resolve(
  process.argv[2] ?? "C:\\Users\\User\\AppData\\Local\\Temp\\opencode\\resgate-capturas\\build-depois",
);
const saida = resolve("docs/homologacao/resgate-h01-h07/validacao-e01");
const porta = 4190;
const base = `http://127.0.0.1:${porta}`;
const chrome = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);
assert.ok(chrome, "Chrome/Edge não encontrado");
assert.ok(existsSync(join(dir, "server", "index.mjs")), "build não encontrado");
mkdirSync(saida, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function aguardarServidor() {
  for (let i = 0; i < 80; i += 1) {
    const ok = await new Promise((r) => {
      const req = http.get({ host: "127.0.0.1", port: porta, path: "/admin", timeout: 2000 }, (res) => {
        res.resume();
        r(res.statusCode === 200);
      });
      req.on("error", () => r(false));
      req.on("timeout", () => {
        req.destroy();
        r(false);
      });
    });
    if (ok) return;
    await esperar(250);
  }
  throw new Error("servidor não iniciou");
}

const servidor = spawn(process.execPath, [join(dir, "server", "index.mjs")], {
  cwd: dir,
  env: { ...process.env, PORT: String(porta) },
  stdio: "ignore",
});
const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--disable-gpu", "--no-first-run", "--hide-scrollbars", "--no-sandbox"],
});
const relatorio = { elementos: [], erros: [], externos: [], dialogos: [], medidas: {} };
function ok(item) {
  relatorio.elementos.push(item);
  console.log("ok", item);
}
async function verificar(nome, fn) {
  await fn();
  ok(nome);
}

try {
  await aguardarServidor();
  const pagina = await navegador.newPage();
  await pagina.setRequestInterception(true);
  pagina.on("request", (req) => {
    if (/supabase\.(co|com)| lovable\.cloud/.test(req.url())) {
      relatorio.externos.push(req.url());
      void req.abort();
    } else void req.continue();
  });
  pagina.on("pageerror", (e) => relatorio.erros.push(e.message));
  await pagina.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await pagina.goto(`${base}/admin#estoque-salgados`, { waitUntil: "networkidle2", timeout: 90000 });
  await pagina.waitForSelector('[data-testid="estoque-salgados"]', { timeout: 60000 });
  await pagina.waitForFunction(
    () =>
      document.documentElement.classList.contains("erp-admin") &&
      Boolean(document.querySelector(".est-filters")),
    { timeout: 60000 },
  );
  await pagina.evaluate(() => document.fonts.ready);
  await esperar(500);

  const texto = await pagina.$eval('[data-testid="estoque-salgados"]', (e) => e.innerText);
  const tem = (s) => texto.includes(s);

  await verificar("01 cabeçalho/KPIs exatos e ações de alerta/ajuda", async () => {
    const Titulo = await pagina.$eval("h1", (e) => e.textContent.trim());
    assert.equal(Titulo, "Estoque de Salgados");
    assert.ok(tem("Controle de congelados por sabor, reservas, lotes e validade (FEFO)."));
    assert.equal(await pagina.$$eval(".est-kpis.est-kpis-five > *", (els) => els.length), 5);
    for (const rotulo of [
      "Total físico", "Total reservado", "Total disponível", "Abaixo do mínimo", "Lotes ativos",
      "Físico − reservado", "Primeiro que vence, primeiro que sai", "sabores",
    ]) assert.ok(tem(rotulo), rotulo);
    assert.ok(await pagina.$('input[aria-label="Buscar sabor"]'));
    assert.ok(await pagina.$('button[aria-label="Alertas de salgados"]'));
    assert.ok(await pagina.$('button[aria-label="Ajuda de salgados"]'));
  });

  await verificar("02/03/04 físico, reservado, disponível e abaixo do mínimo", async () => {
    const colunas = await pagina.$$eval(".est-table-panel thead th", (els) => els.map((e) => e.textContent.trim()));
    for (const c of [
      "Físico (un.)", "Reservado", "Disponível", "Est. mínimo",
      "Reservas (total único do sabor)", "Lotes", "Próxima validade", "Ações",
    ]) assert.ok(colunas.includes(c), c);
    const primeiro = await pagina.$eval(".est-table-panel tbody tr", (tr) =>
      [...tr.querySelectorAll("td")].slice(1, 4).map((td) => td.textContent.trim()),
    );
    assert.equal(primeiro.length, 3);
    assert.ok(primeiro.every((v) => /^\d/.test(v)), `saldos: ${primeiro}`);
  });

  await verificar("05 fotos dos sabores", async () => {
    const fotos = await pagina.$$eval(".est-product img", (els) =>
      els.filter((e) => e.getBoundingClientRect().width > 0).length,
    );
    assert.ok(fotos > 0, "nenhuma foto visível");
  });

  await verificar("06 sabor físico único sem dupla contagem de modalidades", async () => {
    assert.ok(tem("Reservas (total único do sabor)"));
    assert.ok(/pedido\(s\).*un\. reservadas/.test(texto));
    assert.equal(await pagina.$$eval(".est-mini-metrics > div", (els) => els.length), 4);
  });

  await verificar("07 filtros de categoria, status e fornecedor", async () => {
    const rotulos = await pagina.$$eval(".est-filters > label", (els) => els.map((e) => e.textContent.trim()));
    for (const r of ["Categoria", "Status", "Fornecedor"]) assert.ok(rotulos.some((x) => x.includes(r)), r);
    assert.ok(tem("Produção Néia"));
  });

  await verificar("08 filtro apenas abaixo do mínimo", async () => {
    assert.ok(await pagina.$(".est-toggle input[type=checkbox]"));
    assert.ok(tem("Apenas abaixo do mínimo"));
  });

  await verificar("09 botões Movimentação e Registrar entrada de estoque", async () => {
    const botoes = await pagina.$$eval(".est-filter-actions button", (els) => els.map((e) => e.innerText.trim()));
    assert.ok(botoes.some((b) => b.includes("Movimentação")), botoes.join("|"));
    assert.ok(botoes.some((b) => b.includes("Registrar entrada de estoque")), botoes.join("|"));
  });

  await verificar("10 todas as colunas da referência + alerta de validade", async () => {
    assert.ok(tem("Vence em até 7 dias") || tem("—"), "próxima validade ausente");
    assert.ok(tem("Abaixo do mínimo"));
  });

  await verificar("11 visualizar/editar destacados", async () => {
    const acoes = await pagina.$$eval(".est-row-actions button", (els) => els.map((e) => e.getAttribute("aria-label")));
    assert.ok(acoes.some((a) => a?.startsWith("Ver lotes de ")));
    assert.ok(acoes.some((a) => a?.startsWith("Ajustar ")));
    assert.ok(await pagina.$('.est-product[data-testid^="produto-"]'));
  });

  await verificar("12 painel inferior do sabor", async () => {
    assert.ok(await pagina.$("#est-detalhe-salgado .est-bottom-three, #est-detalhe-salgado.est-bottom-three"));
    assert.ok(tem("Produto do cadastro único"));
    assert.ok(tem("Lotes (FEFO)"));
  });

  await verificar("13 Reservar, Liberar reserva e Registrar perda", async () => {
    const acoes = await pagina.$$eval(".est-detail-actions button", (els) => els.map((e) => e.innerText.trim()));
    for (const a of ["Reservar", "Liberar reserva", "Registrar perda"]) assert.ok(acoes.includes(a), acoes.join("|"));
  });

  await verificar("14 lotes FEFO com quantidade, validade e prioridade", async () => {
    const paneles = await pagina.$$("#est-detalhe-salgado section");
    assert.ok(paneles.length >= 3);
    const colunas = await pagina.$$eval("#est-detalhe-salgado table thead th", (els) => els.map((e) => e.textContent.trim()));
    for (const c of ["Lote", "Quantidade", "Validade", "Prioridade"]) assert.ok(colunas.includes(c), c);
    assert.ok(texto.toLocaleLowerCase("pt-BR").includes("usar 1º"), "prioridade FEFO ausente");
  });

  await verificar("15 últimas movimentações", async () => {
    assert.ok(tem("Últimas movimentações"));
    assert.ok(tem("Retirada com reserva resolve a pendência e reduz o físico uma única vez."));
    assert.ok(tem("Nenhuma movimentação registrada.") || (await pagina.$$(".est-recent li")).length > 0);
  });

  await verificar("16 acesso ao histórico (sem executar movimentação)", async () => {
    assert.ok(tem("Ver histórico →"));
    const btn = await pagina.evaluateHandle(() =>
      [...document.querySelectorAll(".est-text-action")].find((e) => e.textContent.includes("Ver histórico")),
    );
    const el = btn.asElement();
    assert.ok(el, "botão Ver histórico");
    await el.click();
    await pagina.waitForSelector('[role="dialog"]', { timeout: 20000 });
    const titulo = await pagina.$eval('[role="dialog"] [role="heading"], [role="dialog"] h2', (e) => e.textContent.trim()).catch(() => "");
    relatorio.dialogos.push(titulo || "Histórico");
    assert.ok(titulo.includes("Histórico"), titulo);
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector('[role="dialog"]', { hidden: true });
  });

  await verificar("17 menu/navegação preservados", async () => {
    assert.ok(await pagina.$('[data-sidebar="sidebar"]'));
    assert.ok(tem("Cadastro de Produtos"));
    assert.ok(tem("Estoque de Salgados"));
    assert.equal(await pagina.$$eval(".est-product-tabs .est-active-tab", (els) => els.length), 1);
  });

  await verificar("fontes legíveis e destaques críticos", async () => {
    relatorio.medidas = await pagina.evaluate(() => {
      const estilo = (s) => {
        const el = document.querySelector(s);
        return el ? { fonte: getComputedStyle(el).fontSize, cor: getComputedStyle(el).color } : null;
      };
      return {
        kpi: estilo(".est-kpis > div p:nth-child(2)"),
        produto: estilo(".est-product b"),
        verde: estilo(".est-green"),
        vermelho: estilo(".est-red"),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    assert.ok(Number.parseFloat(relatorio.medidas.kpi.fonte) >= 20, JSON.stringify(relatorio.medidas.kpi));
    assert.ok(Number.parseFloat(relatorio.medidas.produto.fonte) >= 11, JSON.stringify(relatorio.medidas.produto));
    assert.ok(relatorio.medidas.scrollWidth <= relatorio.medidas.innerWidth + 2, "overflow horizontal");
  });

  await verificar("sem marcadores de demonstração no módulo operacional", async () => {
    for (const marcador of ["MODO DEMONSTRAÇÃO", "dados fictícios", "nenhuma operação real", "Dados fictícios"]) {
      assert.ok(!tem(marcador), marcador);
    }
  });

  await verificar("formulários reais abertos sem registrar movimentação", async () => {
    const abrir = async (texto, esperado) => {
      const h = await pagina.evaluateHandle(
        (t) => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === t),
        texto,
      );
      const el = h.asElement();
      assert.ok(el, texto);
      await el.click();
      await pagina.waitForSelector('[role="dialog"]', { timeout: 20000 });
      const d = await pagina.$eval('[role="dialog"]', (e) => e.innerText);
      assert.ok(d.includes(esperado), `${texto} -> ${esperado}`);
      relatorio.dialogos.push(`${texto}: ${esperado}`);
      await pagina.keyboard.press("Escape");
      await pagina.waitForSelector('[role="dialog"]', { hidden: true });
    };
    await abrir("Registrar entrada de estoque", "Código do novo lote");
    await abrir("Movimentação", "Vínculo da retirada");
    await abrir("Reservar", "Pedido em produção");
    await abrir("Registrar perda", "Justificativa / referência");
    await pagina.click('button[aria-label="Alertas de salgados"]');
    await pagina.waitForSelector('[role="dialog"]');
    assert.ok((await pagina.$eval('[role="dialog"]', (e) => e.innerText)).includes("Alertas do estoque"));
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector('[role="dialog"]', { hidden: true });
    await pagina.click('button[aria-label="Ajuda de salgados"]');
    await pagina.waitForSelector('[role="dialog"]');
    assert.ok((await pagina.$eval('[role="dialog"]', (e) => e.innerText)).includes("Disponível = físico − reservado"));
    await pagina.keyboard.press("Escape");
    await pagina.waitForSelector('[role="dialog"]', { hidden: true });
  });

  assert.deepEqual(relatorio.erros, [], "erros de página");
  assert.deepEqual(relatorio.externos, [], "requisições externas");
  writeFileSync(
    join(saida, "resultado.json"),
    `${JSON.stringify({ ...relatorio, resultado: "17/17 elementos verificados, sem movimentações reais" }, null, 2)}\n`,
  );
  console.log("Concluído: 17/17 elementos verificados, sem movimentações reais.");
} finally {
  await navegador.close();
  servidor.kill("SIGTERM");
}
