// R2-B: navegador real, capturas completas e testes sem acesso ao banco/GPS/Maps.
// node scripts/reembolsos-estornos-cliente-visual.mjs [baseURL] [pastaSaida]
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = resolve(process.argv[3] ?? 'docs/reembolsos-estornos/capturas-cliente/local');
const route = '/preview/reembolsos-estornos-cliente';
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);
assert.ok(executablePath, 'Chrome ou Edge instalado');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run', '--hide-scrollbars'] });
const page = await browser.newPage();
const erros = [], bloqueadas = [], testes = [], falhasHTTP = [];
page.on('pageerror', e => erros.push(e.message));
page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) falhasHTTP.push({ url: r.url(), status: r.status() }); });
await page.setRequestInterception(true);
page.on('request', r => {
  if (/supabase\.(co|com)|lovable\.cloud|maps\.googleapis|maps\.gstatic/.test(r.url())) { bloqueadas.push(r.url()); void r.abort(); }
  else void r.continue();
});
await page.evaluateOnNewDocument(() => {
  window.__gpsCalls = 0;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = () => { window.__gpsCalls++; throw new Error('GPS real não permitido no teste'); };
    navigator.geolocation.watchPosition = () => { window.__gpsCalls++; throw new Error('GPS real não permitido no teste'); };
  }
});
if (process.env.R2B_COOKIE_JAR) {
  const cookies = readFileSync(process.env.R2B_COOKIE_JAR, 'utf8').split(/\r?\n/).filter(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))).map(l => {
    const [domain, , path, secure, expires, name, value] = l.replace(/^#HttpOnly_/, '').split('\t');
    return { domain, path, secure: secure === 'TRUE', ...(Number(expires) > 0 ? { expires: Number(expires) } : {}), name, value, httpOnly: l.startsWith('#HttpOnly_') };
  });
  await browser.setCookie(...cookies);
}
const goto = async suffix => {
  await page.goto(base + route + suffix, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForSelector('.r2b-loyalty', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // SSR já exibe os botões antes da hidratação. Só interagir quando os
  // handlers React da rota estiverem instalados (evita clique perdido no dev).
  await page.waitForFunction(() => [...document.querySelectorAll('.r2b-content button, .r2b-refund button')].some(e =>
    Object.keys(e).some(k => k.startsWith('__reactProps$') && typeof e[k]?.onClick === 'function'),
  ), { timeout: 60000 });
};
const clickText = async (selector, text) => {
  assert.ok(await page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim().startsWith(t)); el?.click(); return !!el; }, selector, text), text);
};
const countOrders = () => page.$$eval('[data-testid="r2b-pedido"]', els => els.length);
const capture = name => page.screenshot({ path: resolve(out, name), fullPage: true });
const rects = async () => page.evaluate(() => Object.fromEntries(['r2b-ciclo','r2b-notificacoes','r2b-resumo','r2b-entrega','r2b-rastreamento','r2b-ajuda'].map(id => {
  const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
  return [id, { x: r.x, y: r.y, width: r.width, bottom: r.bottom }];
})));
let medidas;
try {
  await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
  await goto('');
  assert.equal(await countOrders(), 6);
  const cores = await page.evaluate(() => ({
    admin: document.documentElement.classList.contains('erp-admin'),
    header: getComputedStyle(document.querySelector('.r2b-public > header')).backgroundColor,
    fundo: getComputedStyle(document.querySelector('.r2b-public')).backgroundColor,
    cards: [...document.querySelectorAll('[data-testid="r2b-pedido"]')].map(e => getComputedStyle(e).backgroundColor),
    activeNav: document.querySelector('header a[href="/preview/reembolsos-estornos-cliente"]').dataset.status,
  }));
  assert.equal(cores.admin, false);
  assert.equal(cores.header, 'rgb(255, 255, 255)');
  assert.equal(cores.fundo, 'rgb(250, 249, 246)');
  assert.ok(cores.cards.every(c => c === 'rgb(255, 255, 255)'));
  assert.equal(cores.activeNav, 'active');
  await capture('meus-pedidos-desktop-1440.png');
  testes.push('Lista: 6 cards brancos, header branco, fundo #FAF9F6 e navegação pública ativa; sem erp-admin');
  for (const [filtro, n] of [['Em andamento', 1], ['Concluídos', 4], ['Cancelados', 1], ['Todos', 6]]) {
    await clickText('.r2b-filter', filtro); await page.waitForFunction(n => document.querySelectorAll('[data-testid="r2b-pedido"]').length === n, {}, n);
  }
  testes.push('Filtros: 6 / 1 / 4 / 1 pedidos');
  await page.click('[data-pedido="1053"] a');
  await page.waitForSelector('[data-testid="r2b-detalhe"]');
  assert.ok(page.url().includes('/1053'));
  assert.equal(await countOrders(), 0);
  await goto('/1053'); // carregamento direto, não só navegação da lista
  await capture('acompanhe-pedido-desktop-1440.png');
  medidas = await rects();
  const r = medidas;
  assert.ok(Math.abs(r['r2b-resumo'].y - r['r2b-entrega'].y) < 2);
  assert.ok(r['r2b-rastreamento'].y > r['r2b-resumo'].bottom);
  assert.ok(r['r2b-rastreamento'].width > r['r2b-resumo'].width * 1.9);
  assert.ok(r['r2b-ajuda'].y > r['r2b-rastreamento'].bottom);
  assert.equal(await page.$eval('[data-testid="r2b-ciclo"]', e => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await page.$$eval('.r2b-tracking-info > div', els => els.length), 4);
  assert.ok((await page.$eval('[data-testid="r2b-mapa"]', e => e.textContent)).includes('Mapa demonstrativo — localização fictícia'));
  assert.equal(await page.$$eval('script[src*="maps.googleapis"]', els => els.length), 0);
  assert.equal(await page.$eval('.r2b-cancel', e => e.disabled), true);
  testes.push('Detalhe: rota direta, sem lista, ciclo claro, resumo/entrega lado a lado, mapa e ajuda abaixo em largura completa; cancelamento bloqueado em rota');
  await clickText('button', 'Alterar endereço de entrega');
  await page.waitForSelector('[role="dialog"]');
  await page.click('#r2b-endereco', { clickCount: 3 }); await page.type('#r2b-endereco', 'Rua Exemplo, 100 — endereço fictício');
  await clickText('[role="dialog"] button', 'Salvar endereço');
  await page.waitForFunction(() => document.querySelector('[data-testid="r2b-entrega"]').textContent.includes('Rua Exemplo, 100'));
  await clickText('button', 'Permitir minha localização');
  await page.waitForSelector('[role="dialog"]');
  await clickText('[role="dialog"] button', 'Agora não');
  assert.equal(await page.evaluate(() => window.__gpsCalls), 0);
  await clickText('button', 'Permitir minha localização');
  await clickText('[role="dialog"] button', 'Permitir na demonstração');
  assert.equal(await page.evaluate(() => window.__gpsCalls), 0);
  testes.push('Endereço alterado somente localmente; consentimento aceito/recusado sem GPS real');
  await goto('');
  await clickText('[data-pedido="1053"] a', 'Repetir pedido');
  await page.waitForFunction(() => document.body.innerText.includes('Repetir pedido — demonstração'));
  testes.push('Repetir abre revisão demonstrativa, sem criar compra/cobrança');
  await goto('');
  await clickText('.r2b-help a', 'Solicitar reembolso');
  await page.waitForSelector('#r2b-valor');
  await clickText('button', 'Produto faltante');
  await page.type('#r2b-valor', '2000'); await page.type('#r2b-descricao', 'Item faltante no pedido demonstrativo');
  await clickText('button', 'Enviar solicitação');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('maior que'));
  await page.focus('#r2b-valor'); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); await page.type('#r2b-valor', '1745');
  await clickText('button', 'Enviar solicitação');
  await page.waitForFunction(() => document.body.innerText.includes('Solicitação demonstrativa registrada'));
  await clickText('a', 'Voltar aos meus pedidos');
  await page.waitForSelector('[data-testid="r2b-meus-pedidos"]');
  assert.ok((await page.$eval('[data-testid="r2b-solicitacoes"]', e => e.textContent)).includes('Solicitado'));
  await clickText('.r2b-help a', 'Solicitar reembolso');
  await page.waitForSelector('#r2b-valor');
  await clickText('button', 'Produto faltante');
  await page.type('#r2b-valor', '1'); await page.type('#r2b-descricao', 'Tentativa duplicada');
  await clickText('button', 'Enviar solicitação');
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('segundo estorno total bloqueado'));
  testes.push('Formulário: limite R1 e duplicidade bloqueados, solicitação válida aparece no acompanhamento do cliente');
  for (const [suffix, name] of [['', 'meus-pedidos-mobile-390.png'], ['/1053', 'acompanhe-pedido-mobile-390.png']]) {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await goto(suffix);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(name);
  }
  testes.push('Duas páginas em 390px: cards empilhados e sem overflow horizontal');
  await page.click('[aria-label="Abrir menu"]');
  await page.waitForFunction(() => [...document.querySelectorAll('header nav a[href="/preview/reembolsos-estornos-cliente"]')].some(e => e.getBoundingClientRect().height > 0));
  testes.push('Menu público mobile funcional');
  assert.deepEqual(bloqueadas, []);
  assert.deepEqual(erros, []);
  assert.deepEqual(falhasHTTP, []);
  const resultado = { base, out, viewport: { desktop: '1440x1024', mobile: '390x844' }, testes, cores, medidas, erros, bloqueadas, falhasHTTP };
  writeFileSync(resolve(out, 'resultado.json'), JSON.stringify(resultado, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
} catch (e) {
  await capture('falha.png');
  console.error(JSON.stringify({ erro: e.message, erros, bloqueadas, falhasHTTP, testes, texto: await page.evaluate(() => document.body.innerText) }, null, 2));
  throw e;
} finally { await browser.close(); }
