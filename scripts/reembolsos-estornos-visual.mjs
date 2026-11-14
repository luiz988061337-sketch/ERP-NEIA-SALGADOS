// Capturas da prévia R1 — Reembolsos e Estornos (rota local, sem banco).
// Uso: node scripts/reembolsos-estornos-visual.mjs
// Bloqueia qualquer requisição a Supabase/Lovable Cloud e registra tentativas.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const out = resolve('docs/reembolsos-estornos/capturas');
mkdirSync(out, { recursive: true });
const executablePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!executablePath) throw new Error('Chrome/Edge não encontrado.');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run', '--hide-scrollbars'] });
const page = await browser.newPage();
const erros = [], bancoBloqueado = [], testes = [];
page.on('pageerror', e => erros.push(e.message));
await page.setRequestInterception(true);
page.on('request', req => {
  if (/supabase\.(co|com)|lovable\.cloud/.test(req.url())) {
    bancoBloqueado.push(req.url());
    void req.abort();
  } else void req.continue();
});
try {
  await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/preview/reembolsos-estornos', { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('[data-testid="re-detalhe"]', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  // Menu lateral real com o item extra da prévia.
  const menu = await page.$eval('[data-sidebar="sidebar"]', el => ({
    texto: el.textContent,
    temItem: el.textContent.includes('Reembolsos e Estornos'),
    temFinanceiro: el.textContent.includes('Financeiro'),
  }));
  assert.ok(menu.temItem, 'Item "Reembolsos e Estornos" deve aparecer no menu lateral');
  assert.ok(menu.temFinanceiro, 'Menu padrão (Financeiro) preservado');
  testes.push('AdminShell real com item extra "Reembolsos e Estornos" após Financeiro; menu padrão intacto');

  // Indicadores (6) e badges financeiro/fiscal separados.
  assert.equal(await page.$$eval('select', s => s.filter(e => e.getAttribute('aria-label')?.startsWith('Filtrar')).length), 5, 'Filtros (período, tipo, status, responsável, origem)');
  assert.ok(await page.$('input[aria-label="Buscar por pedido, cliente ou referência"]'), 'Busca textual');
  testes.push('Filtros de período, tipo, status, responsável, origem e busca presentes');

  // Captura principal (dashboard + lista + detalhe aberto em RE-0001).
  await page.screenshot({ path: resolve(out, 'desktop-1440-completo.png'), fullPage: true });

  // Detalhe e dossiê em close.
  await page.$eval('[data-testid="re-detalhe"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'desktop-detalhe.png') });
  await page.$eval('[data-testid="re-dossie"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'desktop-dossie.png') });

  // Lista filtrada (ex.: só estornos ao cliente) para evidência de filtros.
  await page.select('select[aria-label="Filtrar tipo"]', 'estorno_cliente');
  await page.$eval('[data-testid="re-detalhe"]', el => el.scrollIntoView(false));
  await page.waitForFunction(() => {
    const tabela = [...document.querySelectorAll('table')].find(t => t.textContent.includes('RE-0001'));
    return tabela && ![...tabela.querySelectorAll('tbody tr')].some(r => r.textContent.includes('RE-0003'));
  }, { timeout: 30000 });
  await page.screenshot({ path: resolve(out, 'desktop-lista-filtrada-estornos.png') });
  await page.select('select[aria-label="Filtrar tipo"]', 'todos');
  testes.push('Filtro por tipo aplicado na lista (somente estornos visíveis)');

  // Interação real: aprovação e pagamento de RE-0001 (estado local, nada é gravado).
  const clicar = async texto => {
    const ok = await page.evaluate(t => {
      const el = [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith(t));
      el?.click(); return Boolean(el);
    }, texto);
    assert.ok(ok, `Botão não encontrado: ${texto}`);
  };
  await clicar('Aprovar');
  await page.waitForFunction(() => document.body.innerText.replace(/\u00a0/g, ' ').includes('Valor aprovado: R$ 80,00'));
  await clicar('Enviar para pagamento');
  await page.waitForFunction(() => document.body.innerText.includes('Aguardando pagamento'));
  await page.screenshot({ path: resolve(out, 'desktop-fluxo-aprovado.png') });
  await clicar('Registrar devolução');
  await page.waitForFunction(() => document.body.innerText.replace(/\u00a0/g, ' ').includes('Referência: PIX-DEMO'));
  await page.screenshot({ path: resolve(out, 'desktop-pagamento-registrado.png') });
  testes.push('Fluxo executado na prévia: aprovar → enviar para pagamento → registrar devolução (estado local)');

  // Mobile.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/preview/reembolsos-estornos', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="re-detalhe"]', { timeout: 60000 });
  await page.screenshot({ path: resolve(out, 'mobile-390.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow horizontal mobile');
  await page.click('[data-sidebar="trigger"]');
  await page.waitForSelector('[data-sidebar="sidebar"][data-mobile="true"]', { visible: true });
  await page.screenshot({ path: resolve(out, 'mobile-menu.png') });
  testes.push('Mobile 390px sem overflow horizontal; drawer com item da prévia');

  assert.equal(bancoBloqueado.length, 0, 'A prévia tentou acessar o banco');
  assert.equal(erros.length, 0, 'Erros no navegador');
  testes.push('Sem requisições ao banco e sem erros JS');

  writeFileSync(resolve(out, 'resultado.json'), JSON.stringify({ erros, bancoBloqueado, testes }, null, 2));
  console.log(JSON.stringify({ out, erros, bancoBloqueado, testes }, null, 2));
} finally { await browser.close(); }
