// Capturas da prévia R2-A — Origens das solicitações (rota local, sem banco).
// Uso: node scripts/reembolsos-estornos-origens-visual.mjs
// Bloqueia qualquer requisição a Supabase/Lovable Cloud e registra tentativas.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const out = resolve('docs/reembolsos-estornos/capturas-origens');
mkdirSync(out, { recursive: true });
const executablePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
if (!executablePath) throw new Error('Chrome/Edge não encontrado.');
const URL = 'http://127.0.0.1:5173/preview/reembolsos-estornos-origens';
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
  const clicar = async texto => {
    const ok = await page.evaluate(t => {
      const el = [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith(t));
      el?.click(); return Boolean(el);
    }, texto);
    assert.ok(ok, `Botão não encontrado: ${texto}`);
  };
  const preencher = async (seletor, texto) => {
    const ok = await page.evaluate(s => Boolean(document.querySelector(s)), seletor);
    assert.ok(ok, `Campo não encontrado: ${seletor}`);
    await page.click(seletor, { clickCount: 3 });
    await page.type(seletor, texto);
  };
  const textoBody = () => page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));

  await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('[data-testid="re2-origens"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="re-detalhe"]', { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  // Menu lateral real com o item do módulo; menu padrão preservado.
  const menu = await page.$eval('[data-sidebar="sidebar"]', el => ({
    temItem: el.textContent.includes('Reembolsos e Estornos'),
    temFinanceiro: el.textContent.includes('Financeiro'),
  }));
  assert.ok(menu.temItem, 'Item "Reembolsos e Estornos" deve aparecer no menu lateral');
  assert.ok(menu.temFinanceiro, 'Menu padrão (Financeiro) preservado');
  testes.push('AdminShell real com item "Reembolsos e Estornos"; menu dos módulos aprovados intacto');

  // Cinco abas de origem presentes.
  for (const aba of ['cliente', 'atendente', 'motoboy', 'funcionario', 'compras']) {
    assert.ok(await page.$(`[data-testid="re2-aba-${aba}"]`), `aba de origem ${aba}`);
  }
  testes.push('Cinco origens presentes: Cliente, Atendente, Motoboy, Funcionários, Compras/Fornecedores');

  // Captura completa inicial (abas + Central R1 com fixtures).
  await page.screenshot({ path: resolve(out, 'desktop-origens-completo.png'), fullPage: true });

  // --- Origem Cliente: solicitação em pedido autorizado ---------------------
  await page.select('select[aria-label="Pedido do cliente"]', '#4605');
  await page.select('select[aria-label="Tipo de problema"]', 'entrega');
  await preencher('input[aria-label="Valor solicitado pelo cliente"]', '30');
  await preencher('input[aria-label="Motivo do cliente"]', 'Entrega chegou com um item a menos');
  await page.$eval('[data-testid="re2-origem-cliente"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'origem-cliente.png') });
  await clicar('Enviar solicitação do cliente');
  await page.waitForFunction(() => document.body.innerText.includes('RE-0011 criada a partir de Meus Pedidos (Cliente)'), { timeout: 30000 });
  // Solicitação visível na Central R1 da mesma sessão (lista + detalhe com origem).
  const central11 = await page.evaluate(() => {
    const tabela = [...document.querySelectorAll('table')].find(t => t.textContent.includes('RE-0011'));
    return Boolean(tabela);
  });
  assert.ok(central11, 'RE-0011 deve aparecer na lista da Central R1');
  const detalhe11 = await page.$eval('[data-testid="re-detalhe"]', el => ({
    id: el.textContent.includes('RE-0011'),
    origem: el.textContent.includes('Meus Pedidos (Cliente)'),
  }));
  assert.ok(detalhe11.id && detalhe11.origem, 'Detalhe da Central foca RE-0011 e mostra a origem do cliente');
  testes.push('Cliente solicita em pedido autorizado (#4605) e a solicitação aparece na Central R1 na mesma sessão');

  // Andamento do cliente com a solicitação criada.
  const andamento = await page.$eval('[data-testid="re2-andamento"]', el => ({
    tem: el.textContent.includes('RE-0011'),
    status: el.textContent.includes('Solicitado'),
  }));
  assert.ok(andamento.tem && andamento.status, 'Consulta de andamento mostra RE-0011 como "Solicitado"');
  await page.$eval('[data-testid="re2-andamento"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'andamento-cliente.png') });
  testes.push('Consulta do andamento do cliente mostra a solicitação e o status atual');

  // --- Origem Atendente: registrar e encaminhar ------------------------------
  await page.click('[data-testid="re2-aba-atendente"]');
  await page.select('select[aria-label="Pedido relacionado (atendente)"]', '#4608');
  await preencher('input[aria-label="Valor do estorno informado pela atendente"]', '210');
  await preencher('input[aria-label="Motivo informado pelo cliente"]', 'Cobrança em duplicidade no cartão');
  await page.$eval('[data-testid="re2-origem-atendente"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'origem-atendente.png') });
  await clicar('Registrar e encaminhar');
  await page.waitForFunction(() => document.body.innerText.includes('RE-0012 criada a partir de Central da Atendente e encaminhada'), { timeout: 30000 });
  const detalheA = await page.$eval('[data-testid="re-detalhe"]', el => ({
    id: el.textContent.includes('RE-0012'),
    aguardando: el.textContent.includes('Aguardando aprovação'),
    responsavel: el.textContent.includes('Neia (dono)'),
  }));
  assert.ok(detalheA.id && detalheA.aguardando && detalheA.responsavel, 'Encaminhamento deixa RE-0012 aguardando aprovação do responsável');
  testes.push('Atendente registra motivo do cliente e encaminha ao responsável autorizado (status Aguardando aprovação)');

  // Duplicidade: mesma solicitação total encaminhada de novo → bloqueada.
  await clicar('Registrar e encaminhar');
  await page.waitForFunction(() => document.body.innerText.includes('segundo estorno total bloqueado'), { timeout: 30000 });
  await page.$eval('[data-testid="re2-mensagem"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'duplicidade-bloqueada.png') });
  testes.push('Duplicidade bloqueada na interface: segundo estorno total do mesmo pedido (regra da R1)');

  // --- Origem Motoboy --------------------------------------------------------
  await page.click('[data-testid="re2-aba-motoboy"]');
  await page.select('select[aria-label="Motoboy solicitante"]', 'Jonas Prado');
  await page.select('select[aria-label="Turno do motoboy"]', 'Turno Noite (12/04)');
  await page.select('select[aria-label="Tipo de gasto do motoboy"]', 'Troco pago com dinheiro próprio');
  await preencher('input[aria-label="Valor gasto pelo motoboy"]', '25.5');
  await preencher('input[aria-label="Motivo do motoboy"]', 'Troco pago na entrega da Rua das Flores');
  await page.$eval('[data-testid="re2-origem-motoboy"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'origem-motoboy.png') });
  await clicar('Enviar solicitação do motoboy');
  await page.waitForFunction(() => document.body.innerText.includes('RE-0013 criada a partir de App Motoboy'), { timeout: 30000 });
  testes.push('Motoboy registra troco do turno (dinheiro próprio) e vê a solicitação na Central');

  // --- Origem Funcionários ---------------------------------------------------
  await page.click('[data-testid="re2-aba-funcionario"]');
  await page.select('select[aria-label="Funcionário solicitante"]', 'Marina Duarte');
  await preencher('input[aria-label="Referência da compra/despesa do funcionário"]', 'Compra emergencial #1052');
  await preencher('input[aria-label="Valor adiantado pelo funcionário"]', '42.9');
  await preencher('input[aria-label="Justificativa do funcionário"]', 'Fermento comprado fora do horário do fornecedor');
  await page.$eval('[data-testid="re2-origem-funcionario"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'origem-funcionario.png') });
  await clicar('Enviar solicitação do funcionário');
  await page.waitForFunction(() => document.body.innerText.includes('RE-0014 criada a partir de Funcionários'), { timeout: 30000 });
  testes.push('Funcionário registra compra adiantada com justificativa e vê a solicitação na Central');

  // --- Origem Compras / Fornecedores ----------------------------------------
  await page.click('[data-testid="re2-aba-compras"]');
  await page.select('select[aria-label="Fornecedor da devolução"]', 'Embalagens Já');
  await preencher('input[aria-label="Compra relacionada ao fornecedor"]', 'Compra #1050');
  await page.select('select[aria-label="Resolução com o fornecedor"]', 'credito_futuro');
  await preencher('input[aria-label="Valor da devolução/crédito do fornecedor"]', '60');
  await preencher('input[aria-label="Motivo da devolução/crédito"]', 'Embalagens entregues em formato errado');
  await page.$eval('[data-testid="re2-origem-compras"]', el => el.scrollIntoView());
  await page.screenshot({ path: resolve(out, 'origem-compras.png') });
  await clicar('Enviar solicitação de devolução');
  await page.waitForFunction(() => document.body.innerText.includes('RE-0015 criada a partir de Compras / Fornecedores'), { timeout: 30000 });
  testes.push('Compras/Fornecedores registra devolução/crédito vinculado à compra e vê a solicitação na Central');

  // Central com as cinco solicitações criadas nesta sessão (período: todos).
  await page.select('select[aria-label="Filtrar período"]', 'todos');
  await page.waitForFunction(() => {
    const tabela = [...document.querySelectorAll('table')].find(t => t.textContent.includes('RE-0008'));
    return Boolean(tabela);
  }, { timeout: 30000 });
  const contagem = await page.evaluate(() => {
    const tabela = [...document.querySelectorAll('table')].find(t => t.textContent.includes('RE-0015'));
    return tabela ? [...tabela.querySelectorAll('tbody tr')].length : 0;
  });
  assert.equal(contagem, 15, 'Central deve listar 10 fixtures + 5 solicitações criadas');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: resolve(out, 'central-com-novas-solicitacoes.png'), fullPage: true });
  testes.push('Central R1 na mesma sessão lista as 15 solicitações (10 fixtures + 5 das origens)');

  // Sem botões de aprovação nos formulários das origens (só a Central aprova).
  const botoesOrigem = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="re2-origem-"] button')]
      .filter(b => /aprovar/i.test(b.textContent))
      .map(b => b.textContent.trim()),
  );
  assert.deepEqual(botoesOrigem, [], 'Formulários das origens não podem ter botão de aprovação');
  testes.push('Origens sem botão de aprovação — aprovação exclusiva do responsável autorizado na Central');

  // Mobile.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="re2-origens"]', { timeout: 60000 });
  await page.screenshot({ path: resolve(out, 'mobile-origens-390.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow horizontal mobile');
  await page.click('[data-sidebar="trigger"]');
  await page.waitForSelector('[data-sidebar="sidebar"][data-mobile="true"]', { visible: true });
  await page.screenshot({ path: resolve(out, 'mobile-menu-origens.png') });
  testes.push('Mobile 390px sem overflow horizontal; drawer com o item do módulo');

  assert.equal(bancoBloqueado.length, 0, 'A prévia tentou acessar o banco');
  assert.equal(erros.length, 0, 'Erros no navegador');
  testes.push('Sem requisições ao banco e sem erros JS');

  writeFileSync(resolve(out, 'resultado.json'), JSON.stringify({ erros, bancoBloqueado, testes }, null, 2));
  console.log(JSON.stringify({ out, erros, bancoBloqueado, testes }, null, 2));
} finally { await browser.close(); }
