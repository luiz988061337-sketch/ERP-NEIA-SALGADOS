// Captura real da rota local. Nenhuma dependência nova, login ou acesso ao banco.
// Uso: node scripts/financeiro-premium-visual.mjs antes|depois [--test] [--sidebar]
// FINANCEIRO_CAPTURAS_DIR permite preservar as evidências de etapas anteriores.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const etapa = process.argv[2] === 'antes' ? 'antes' : 'depois';
const out = resolve(process.env.FINANCEIRO_CAPTURAS_DIR || 'docs/financeiro-premium/validacao');
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
  await page.goto('http://127.0.0.1:5173/preview/financeiro-premium', { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('.recharts-surface', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  if (process.argv.includes('--sidebar')) {
    assert.equal(await page.$$eval('.fp-sidebar', e => e.length), 0, 'Não pode existir uma sidebar independente');
    const sidebar = await page.$eval('[data-sidebar="sidebar"]', el => ({
      width: el.parentElement.getBoundingClientRect().width,
      text: el.textContent,
      scoped: Boolean(el.closest('.fp-app')),
    }));
    assert.equal(sidebar.width, 224, 'A largura do AdminShell deve continuar 14rem');
    assert.equal(sidebar.scoped, false, 'O CSS do Financeiro não pode alterar a sidebar compartilhada');
    assert.ok(sidebar.text.includes('Painel de Gestão') && sidebar.text.includes('Administradora'));
    assert.ok(sidebar.text.includes('Principal') && sidebar.text.includes('Catálogo') && sidebar.text.includes('Atualizar dados'));
    assert.ok(await page.$eval('[aria-current="page"][data-sidebar="menu-button"]', e => e.innerText.includes('Financeiro')));
    const frame = await page.$eval('.fp-panel.fp-frame', el => ({
      border: getComputedStyle(el).borderTopWidth,
      shadow: getComputedStyle(el).boxShadow,
      flare: getComputedStyle(el, '::before').content,
    }));
    assert.equal(frame.border, '1px');
    assert.ok(frame.shadow.includes('0, 0, 0'), 'Sombras devem ser neutras, não halos amarelos');
    assert.ok(frame.flare === 'none' || frame.flare === 'normal', 'Sem faixa luminosa nos painéis');
    assert.equal(await page.$$eval('[data-kpi]', e => e.length), 6);
    assert.equal(await page.$$eval('.fp-action', e => e.length), 9);
    const rows = await page.$$eval('.fp-top-row > section', e => e.map(el => Math.round(el.getBoundingClientRect().top)));
    assert.equal(new Set(rows).size, 1, 'Os três painéis superiores devem continuar na mesma linha desktop');
    testes.push('AdminShell real: 224px, perfil/menus padrão, Financeiro ativo e CSS local isolado; bordas de 1px sem halo; composição 6 indicadores/9 atalhos/3 painéis preservada');
  }
  await page.screenshot({ path: resolve(out, `${etapa}-desktop-1440.png`), fullPage: true });
  await page.screenshot({ path: resolve(out, `${etapa}-topo-1440.png`) });
  if (etapa === 'depois') {
    await page.$eval('#gestao-financeira', el => el.scrollIntoView());
    await page.screenshot({ path: resolve(out, 'depois-gestao-1440.png') });
  }
  if (process.argv.includes('--test')) {
    const click = async text => {
      const found = await page.evaluate(text => {
        const el = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text || e.querySelector('strong')?.textContent === text);
        el?.click(); return Boolean(el);
      }, text);
      assert.ok(found, `Botão não encontrado: ${text}`);
    };
    const fill = async (selector, value) => {
      await page.locator(selector).fill(value);
    };
    const kpi = async label => page.evaluate(label => [...document.querySelectorAll('[data-kpi]')].find(e => e.dataset.kpi === label)?.querySelector('strong')?.textContent, label);
    const initialReceita = await kpi('Faturamento');
    await click('+ Nova Receita');
    await fill('#lancamento-descricao', 'Teste visual local');
    await fill('#lancamento-valor', '100');
    await click('Salvar Lançamento');
    await page.waitForFunction(() => document.querySelector('.fp-ledger')?.textContent.includes('Teste visual local'));
    assert.notEqual(await kpi('Faturamento'), initialReceita);
    testes.push('Receita adicionada; tabela e indicador atualizados');
    await click('− Nova Despesa');
    assert.equal(await page.$eval('#lancamento-tipo', e => e.value), 'despesa');
    await fill('#lancamento-descricao', 'Despesa teste local');
    await fill('#lancamento-valor', '200');
    const initialDespesa = await kpi('Despesas');
    await click('Salvar Lançamento');
    await page.waitForFunction(() => document.querySelector('.fp-ledger')?.textContent.includes('Despesa teste local'));
    assert.notEqual(await kpi('Despesas'), initialDespesa);
    await page.select('select[aria-label="Filtrar tipo"]', 'despesa');
    assert.ok(!(await page.$eval('.fp-ledger tbody', e => e.innerText)).includes('Teste visual local'));
    await page.select('select[aria-label="Filtrar tipo"]', 'todos');
    page.once('dialog', dialog => dialog.accept());
    await page.click('button[aria-label="Excluir Despesa teste local"]');
    await page.waitForFunction(() => !document.querySelector('.fp-ledger tbody')?.textContent.includes('Despesa teste local'));
    await click('Cancelar');
    testes.push('Despesa seleciona tipo correto; atualiza totais; filtro, exclusão confirmada e cancelar funcionais');
    await click('Custos (Fixos e Variáveis)');
    await page.waitForSelector('[data-testid="custos-painel"]');
    await fill('[data-testid="custos-painel"] input[placeholder="Descrição"]', 'Custo teste local');
    await fill('[data-testid="custos-painel"] input[placeholder="Valor"]', '500');
    await click('Adicionar custo');
    await page.waitForFunction(() => document.querySelector('[data-testid="custos-painel"] table')?.textContent.includes('Custo teste local'));
    await page.evaluate(() => [...document.querySelectorAll('[data-testid="custos-painel"] tbody tr')].find(e => e.textContent.includes('Custo teste local'))?.querySelector('button').click());
    await page.waitForFunction(() => !document.querySelector('[data-testid="custos-painel"] table')?.textContent.includes('Custo teste local'));
    testes.push('Custos: cadastro e exclusão funcionais');
    await click('Caixa');
    await click('Abrir caixa');
    await page.waitForSelector('input[placeholder="Sangria"]');
    await fill('input[placeholder="Sangria"]', '50');
    await click('Registrar sangria');
    await fill('input[placeholder="Suprimento"]', '100');
    await click('Registrar suprimento');
    await page.waitForFunction(() => document.querySelector('.fp-management').innerText.replace(/\u00a0/g, ' ').includes('R$ 16.010,00'));
    await click('Pagar');
    await click('Receber');
    await fill('input[placeholder="Valor contado"]', '14990');
    page.once('dialog', dialog => dialog.accept());
    await click('Fechar caixa');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Abrir caixa'));
    testes.push('Caixa: abertura, sangria, suprimento, pagar, receber e fechamento executados');
    await click('Fiscal / Obrigações');
    await page.waitForFunction(() => document.body.textContent.includes('SEGURANÇA FISCAL E OBRIGAÇÕES'));
    await fill('.fp-management input[placeholder="Descrição"]', 'Obrigação teste local');
    await click('Adicionar obrigação');
    await page.waitForFunction(() => document.querySelector('.fp-management table')?.textContent.includes('Obrigação teste local'));
    await page.evaluate(() => [...document.querySelectorAll('.fp-management tbody tr')].find(e => e.textContent.includes('Obrigação teste local'))?.querySelector('button').click());
    testes.push('Obrigações fiscais: cadastro e remoção executados');
    await click('Simulações');
    await page.waitForSelector('input[type="range"]');
    await page.$eval('input[type="range"]', el => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, '50000'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Restaurar');
    assert.equal(await page.$eval('input[type="range"]', e => e.value), '30000');
    testes.push('Simulador e restauração funcionais');
    await click('Lançamentos');
    await click('− Nova Despesa');
    await fill('#lancamento-descricao', 'Cenário sem margem');
    await fill('#lancamento-valor', '90000');
    await click('Salvar Lançamento');
    await page.waitForFunction(() => document.querySelector('.fp-health')?.textContent.includes('Prejuízo'));
    assert.equal(await kpi('Ponto de equilíbrio'), 'Não calculável');
    assert.equal(await kpi('Margem de segurança'), '—');
    assert.equal(await page.$$eval('.fp-chart .recharts-line-dots circle', e => e.length), 5, 'Abril sem margem não pode ter ponto válido no gráfico');
    testes.push('Cenário sem margem: Prejuízo, PE não calculável e margem de segurança sem valor fictício');
    const body = await page.$eval('body', e => e.innerText);
    assert.ok(!/NaN|Infinity/.test(body));
    assert.ok(!body.includes('Montar Combo') && !body.includes('Todos os direitos reservados'));
    assert.equal(bancoBloqueado.length, 0, 'A prévia tentou acessar o banco');
    assert.equal(erros.length, 0, 'Erros no navegador');
    testes.push('Sem NaN/Infinity, sem chrome público, sem requisições ao banco, sem erros JS');
  }
  {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:5173/preview/financeiro-premium', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: resolve(out, `${etapa}-mobile-390.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow horizontal mobile');
    if (process.argv.includes('--sidebar')) {
      await page.click('[data-sidebar="trigger"]');
      await page.waitForSelector('[data-sidebar="sidebar"][data-mobile="true"]', { visible: true });
      await page.screenshot({ path: resolve(out, 'depois-menu-mobile-390.png') });
      await page.mouse.click(375, 420);
      await page.waitForSelector('[data-sidebar="sidebar"][data-mobile="true"]', { hidden: true });
      testes.push('Drawer mobile real abriu e fechou ao tocar fora; sem overflow horizontal');
    }
  }
  writeFileSync(resolve(out, `${etapa}-resultado.json`), JSON.stringify({ etapa, largura: 1440, erros, bancoBloqueado, testes }, null, 2));
  console.log(JSON.stringify({ out, erros, bancoBloqueado, testes }, null, 2));
} finally { await browser.close(); }
