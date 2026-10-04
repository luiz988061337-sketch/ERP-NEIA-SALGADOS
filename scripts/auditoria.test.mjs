// Auditoria de produção — testes reais sobre o código-fonte (sem mocks de regra).
// Uso: node scripts/auditoria.test.mjs   (a partir da raiz do projeto)
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);

// renderMensagem usa window.location.origin
globalThis.window = { location: { origin: "https://teste.local" } };

const totals = await import("@/lib/totals.ts");
const combo = await import("@/lib/combo.ts");
const format = await import("@/lib/format.ts");
const crm = await import("@/lib/crm.ts");
const intel = await import("@/lib/inteligencia.ts");

let pass = 0;
let fail = 0;
function t(nome, cond) {
  if (cond) { pass++; console.log(`ok   - ${nome}`); }
  else { fail++; console.log(`FALHOU - ${nome}`); }
}

// ---------- 4. Valores: TOTAL = subtotal + entrega - descontos ----------
t("40 + 6 = 46", totals.calcTotals({ subtotal: 40, taxaEntrega: 6 }).total === 46);
t("taxa 1x (sem duplicar)", totals.calcTotals({ subtotal: 40, taxaEntrega: 6 }).taxaEntrega === 6);
t("entrega grátis", totals.calcTotals({ subtotal: 40, taxaEntrega: 0 }).total === 40);
t("desconto valor", totals.calcTotals({ subtotal: 100, taxaEntrega: 6, desconto: 10 }).total === 96);
t("desconto limitado ao subtotal", totals.calcTotals({ subtotal: 5, taxaEntrega: 6, desconto: 50 }).total === 6);
t("total nunca negativo", totals.calcTotals({ subtotal: 0, taxaEntrega: 0, desconto: 99 }).total === 0);
t("strings numéricas", totals.calcTotals({ subtotal: "40", taxaEntrega: "6" }).total === 46);

// ---------- 2. Regra dos combos ----------
const casos = [[49, false], [50, true], [51, false], [99, false], [100, true], [101, false], [150, true], [199, false], [200, true], [250, true], [0, false], [60, false], [70, false], [80, false], [90, false]];
for (const [qtd, esperado] of casos) t(`combo ${qtd}un = ${esperado ? "permitido" : "bloqueado"}`, totals.isMultiploCombo(qtd) === esperado);
t("faltam p/ 40 = 10", totals.quantoFaltaCombo(40) === 10);
t("faltam p/ 50 = 0", totals.quantoFaltaCombo(50) === 0);
t("faltam p/ 0 = 50", totals.quantoFaltaCombo(0) === 50);
t("saborCurto tira qtd e Mini", combo.saborCurto("Mini Coxinha 25un") === "Coxinha");
t("isComboItem flag", totals.isComboItem({ id: "x", combo: true }) === true);
t("isComboItem legado combo-", totals.isComboItem({ id: "combo-mini-fritos-123" }) === true);
t("isComboItem pacote comum", totals.isComboItem({ id: "uuid-produto" }) === false);

// ---------- 9. CRM ----------
const S = crm.DEFAULT_CRM_SETTINGS;
t("classificar 5d = ativo", crm.classificar(5, S) === "ativo");
t("classificar 30d = ativo", crm.classificar(30, S) === "ativo");
t("classificar 31d = risco", crm.classificar(31, S) === "risco");
t("classificar 45d = risco", crm.classificar(45, S) === "risco");
t("classificar 46d = inativo", crm.classificar(46, S) === "inativo");
t("classificar 90d = inativo", crm.classificar(90, S) === "inativo");
t("classificar 91d = muito_inativo", crm.classificar(91, S) === "muito_inativo");
t("classificar null = novo", crm.classificar(null, S) === "novo");
t("tel (11) 90000-0000", crm.normalizarTelefone("(11) 90000-0000") === "11900000000");
t("tel com 55", crm.normalizarTelefone("+55 (11) 90000-0000") === "11900000000");

const agora = Date.now();
const iso = (diasAtras) => new Date(agora - diasAtras * 86400000).toISOString();
const pedidosMock = [
  { telefone: "(11) 90000-0001", cliente_nome: "Joao", bairro: "Centro", endereco: "Rua A", created_at: iso(40), total: 100, status: "entregue", user_id: null },
  { telefone: "(11) 90000-0001", cliente_nome: "Joao", bairro: "Centro", endereco: "Rua A", created_at: iso(10), total: 150, status: "entregue", user_id: null },
  { telefone: "(11) 90000-0001", cliente_nome: "Joao", bairro: "Centro", endereco: "Rua A", created_at: iso(5), total: 999, status: "cancelado", user_id: null },
  { telefone: "(11) 90000-0002", cliente_nome: "Maria", bairro: "Vila", endereco: "Rua B", created_at: iso(70), total: 80, status: "entregue", user_id: null },
];
const clientes = crm.agregarClientes(pedidosMock, S, new Map());
t("agrega 2 clientes", clientes.length === 2);
const joao = clientes.find((c) => c.nome === "Joao");
t("cancelado excluído do total", joao.total_gasto === 250 && joao.total_pedidos === 2);
t("dias sem comprar = 10", joao.dias_sem_comprar === 10);
t("10d = ativo", joao.segmento === "ativo");
const maria = clientes.find((c) => c.nome === "Maria");
t("70d = inativo", maria.segmento === "inativo");
t("datas preservadas p/ recompra", joao.datas.length === 2 && joao.datas[0] < joao.datas[1]);
t("intervalo do João ~30d", intel.intervaloHabitual(joao.datas) === 30);

// ---------- inteligência ----------
t("intervalo habitual 28d", intel.intervaloHabitual(["2026-08-01", "2026-08-28", "2026-09-25"]) === 28);
t("intervalo <2 = null", intel.intervaloHabitual(["2026-08-01"]) === null);
const prox = intel.proximaRecompra(joao.ultimo_pedido, 28);
t("próxima recompra = último + intervalo", prox instanceof Date && Math.abs(prox.getTime() - (Date.now() - 10 * 86400000 + 28 * 86400000)) < 86400000);
const msg = crm.renderMensagem("Olá {{cliente}}! {{dias_sem_comprar}}d {{ultimo_pedido}} {{ultimo_valor}} {{total_pedidos}} {{total_gasto}} {{link_cardapio}}", joao);
t("variáveis WhatsApp substituídas", !msg.includes("{{") && msg.includes("Joao") && msg.includes("https://teste.local/"));
const hab = intel.pedidoHabitual([
  { status: "entregue", pedido_itens: [{ produto_id: "a", nome: "Coxinha", preco_unitario: 1, quantidade: 50 }] },
  { status: "cancelado", pedido_itens: [{ produto_id: "b", nome: "Kibe", preco_unitario: 1, quantidade: 999 }] },
]);
t("habitual ignora cancelado", hab.length === 1 && hab[0].nome === "Coxinha");
const rotas = intel.agruparPorBairro([{ bairro: "A", id: "1" }, { bairro: "A", id: "2" }, { bairro: "", id: "3" }]);
t("agrupa por bairro", rotas[0].bairro === "A" && rotas[0].qtd === 2);
t("queda -20%", intel.variacaoQueda(1200, 1500) === -20);

// ---------- WhatsApp base ----------
t("mensagemStatus recebido", format.mensagemStatus("recebido", "Ana", 1025).includes("1025") && format.mensagemStatus("recebido", "Ana", 1025).includes("Ana"));
t("whatsappLink 55", format.whatsappLink("11900000000", "oi").startsWith("https://wa.me/5511900000000"));

// ---------- sugestões por co-ocorrência (dados reais) ----------
const itensTodos = [
  { pedido_id: "p1", produto_id: "coxinha", nome: "Coxinha", preco_unitario: 1, quantidade: 50 },
  { pedido_id: "p1", produto_id: "kibe", nome: "Kibe", preco_unitario: 1, quantidade: 50 },
  { pedido_id: "p2", produto_id: "coxinha", nome: "Coxinha", preco_unitario: 1, quantidade: 50 },
  { pedido_id: "p2", produto_id: "risole", nome: "Risole", preco_unitario: 1, quantidade: 50 },
  { pedido_id: "p3", produto_id: "s unrelated", nome: "X", preco_unitario: 1, quantidade: 1 },
];
const sugs = intel.sugestoesPorCoocorrencia([{ produtoId: "coxinha", id: "coxinha" }], itensTodos, new Set(), 4);
t("sugestão encontra kibe+risole", sugs.length === 2 && sugs.some((s) => s.produto_id === "kibe") && sugs.some((s) => s.produto_id === "risole"));
t("sugestão exclui já selecionados", intel.sugestoesPorCoocorrencia([{ produtoId: "coxinha", id: "coxinha" }], itensTodos, new Set(["kibe", "risole"]), 4).length === 0);
t("sugestão sem carrinho = []", intel.sugestoesPorCoocorrencia([], itensTodos, new Set(), 4).length === 0);

// ---------- média por dia da semana ----------
const medias = intel.mediaPorDiaSemana([
  { nome: "Coxinha", quantidade: 100, created_at: "2026-09-05T10:00:00Z" },
  { nome: "Coxinha", quantidade: 200, created_at: "2026-09-12T10:00:00Z" },
]);
t("média de sábado = 150", medias.get(6)?.get("Coxinha") === 150);

// ---------- VIP/frequente configurável ----------
t("vip por valor", crm.isVipCfg(600, 1, crm.DEFAULT_CRM_SETTINGS) === true);
t("vip por pedidos (0=off padrão)", crm.isVipCfg(100, 10, crm.DEFAULT_CRM_SETTINGS) === false);
t("frequente 4+", crm.isFrequenteCfg(4, crm.DEFAULT_CRM_SETTINGS) === true);

// ---------- cupons personalizados ----------
const cupons = await import("@/lib/cupons.ts");
const base = { codigo: "X", tipo: "valor", valor: 10, minimo: 0, ativo: true };
const ctx = (over = {}) => ({ subtotal: 100, telefoneDigitado: "", usosRegistrados: 0, produtoIdsNoCarrinho: [], agora: new Date("2026-10-03T12:00:00Z"), ...over });
t("cupom válido aplica 10", cupons.validarCupom(base, ctx()).ok === true && cupons.validarCupom(base, ctx()).desconto === 10);
t("cupom expirado", cupons.validarCupom({ ...base, validade_fim: "2026-09-01T00:00:00Z" }, ctx()).ok === false);
t("cupom futuro", cupons.validarCupom({ ...base, validade_ini: "2026-11-01T00:00:00Z" }, ctx()).ok === false);
t("cupom de outro cliente", cupons.validarCupom({ ...base, cliente_telefone: "11900000001" }, ctx({ telefoneDigitado: "11900000002" })).ok === false);
t("cupom do próprio cliente", cupons.validarCupom({ ...base, cliente_telefone: "11900000001" }, ctx({ telefoneDigitado: "(11) 90000-0001" })).ok === true);
t("limite de usos", cupons.validarCupom({ ...base, max_usos: 2 }, ctx({ usosRegistrados: 2 })).ok === false);
t("produto participante ausente", cupons.validarCupom({ ...base, produtos_ids: ["p1"] }, ctx()).ok === false);
t("produto participante presente", cupons.validarCupom({ ...base, produtos_ids: ["p1"] }, ctx({ produtoIdsNoCarrinho: ["p1"] })).ok === true);
t("mínimo não atingido", cupons.validarCupom({ ...base, minimo: 200 }, ctx()).ok === false);
t("desconto limitado ao subtotal", cupons.validarCupom({ ...base, valor: 500 }, ctx()).desconto === 100);

// ---------- aniversário ----------
t("aniversário hoje = 0", crm.diasParaAniversario("1990-10-03", new Date("2026-10-03T12:00:00Z")) === 0);
t("aniversário em 7d", crm.diasParaAniversario("1990-10-10", new Date("2026-10-03T12:00:00Z")) === 7);
t("aniversário passado vira próximo ano", crm.diasParaAniversario("1990-09-03", new Date("2026-10-03T12:00:00Z")) === 335);
t("aniversário vazio = null", crm.diasParaAniversario(null) === null);

// ---------- B2B ----------
t("CNPJ 14 dígitos válido", crm.validarCNPJ("12.345.678/0001-95") === true);
t("CNPJ curto inválido", crm.validarCNPJ("123") === false);
t("CNPJ todos iguais inválido", crm.validarCNPJ("00000000000000") === false);
t("CNPJ vazio inválido", crm.validarCNPJ(null) === false);

// ---------- recorrência ----------
const rec = await import("@/lib/recorrencia.ts");
t("semanal +7d", rec.proximaData("2026-10-03", "semanal") === "2026-10-10");
t("quinzenal +15d", rec.proximaData("2026-10-03", "quinzenal") === "2026-10-18");
t("mensal +1mês", rec.proximaData("2026-10-03", "mensal") === "2026-11-03");
t("diasAte hoje = 0", rec.diasAte("2026-10-03", new Date("2026-10-03T12:00:00Z")) === 0);
t("diasAte passado negativo", (rec.diasAte("2026-10-01", new Date("2026-10-03T12:00:00Z")) ?? 0) < 0);
t("diasAte inválido = null", rec.diasAte("xx") === null);

// ---------- estoque ----------
const est = await import("@/lib/estoque.ts");
t("entrada soma", est.novoEstoque(80, "entrada", 20).valor === 100);
t("saída subtrai", est.novoEstoque(80, "saida", 30).valor === 50);
t("saída maior que estoque bloqueia", est.novoEstoque(10, "saida", 30).ok === false);
t("qtd zero bloqueia", est.novoEstoque(10, "entrada", 0).ok === false);
t("nunca negativo", est.novoEstoque(5, "perda", 5).valor === 0);

// ---------- orçamentos ----------
const orc = await import("@/lib/orcamentos.ts");
const mixOrc = [
  { produto_id: "a", nome: "Coxinha", quantidade: 100, preco_unitario: 1.6 },
  { produto_id: "b", nome: "Kibe", quantidade: 50, preco_unitario: 2.0 },
];
const totOrc = orc.totaisOrcamento(mixOrc, 6, 10);
t("orçamento 160+100+6-10=256", totOrc.subtotal === 260 && totOrc.total === 256);
const docOrc = { cliente_nome: "João", telefone: "119", tipo_evento: "festa", pessoas: 50, data_evento: "2026-10-10", horario: "15h", validade: "2026-10-05", mix: mixOrc, observacoes: "", subtotal: 260, desconto: 10, taxa_entrega: 6, total: 256, status: "rascunho" };
const txtOrc = orc.textoOrcamento(docOrc);
t("texto orçamento sem {{}} e com total", !txtOrc.includes("{{") && txtOrc.includes("R$ 256,00") && txtOrc.includes("não é pedido confirmado"));
t("html orçamento tem tabela e print", orc.htmlOrcamento(docOrc).includes("<table>") && orc.htmlOrcamento(docOrc).includes("window.print"));

// ---------- resgate fidelidade (200 pts → R$20, uso único, próprio telefone) ----------
const fid = { codigo: "FID-AB12", tipo: "valor", valor: 20, minimo: 0, ativo: true, cliente_telefone: "11900000001", validade_fim: "2026-11-02T00:00:00Z", max_usos: 1, produtos_ids: [] };
t("resgate válido desconta 20", cupons.validarCupom(fid, ctx({ telefoneDigitado: "11900000001" })).desconto === 20);
t("resgate já usado bloqueia", cupons.validarCupom(fid, ctx({ telefoneDigitado: "11900000001", usosRegistrados: 1 })).ok === false);
t("resgate de outro telefone bloqueia", cupons.validarCupom(fid, ctx({ telefoneDigitado: "11900000002" })).ok === false);

// ---------- export CSV ----------
const exp = await import("@/lib/export.ts");
const csv = exp.toCSV([{ a: "x;y", b: 'q"q', c: null }, { a: "z", d: 1 }]);
t("csv header une colunas", csv.includes("a;b;c;d"));
t("csv escapa ; e aspas", csv.includes('"x;y"') && csv.includes('"q""q"'));
t("csv vazio dá só BOM+header", exp.toCSV([]) === "﻿");

// ---------- fidelidade configurável ----------
const fidl = await import("@/lib/fidelidade.ts");
t("46 reais = 9 pts (padrão 5)", fidl.pontosGanhos(46) === 9);
t("40 reais = 8 pts", fidl.pontosGanhos(40) === 8);
t("desativado = 0", fidl.pontosGanhos(100, { ...fidl.DEFAULT_FIDELIDADE, ativo: false }) === 0);
t("10 R$/pto: 46 = 4", fidl.pontosGanhos(46, { ...fidl.DEFAULT_FIDELIDADE, reaisPorPonto: 10 }) === 4);
t("pode resgatar 200+", fidl.podeResgatar(200).ok === true);
t("não resgata 199", fidl.podeResgatar(199).ok === false);
t("recompensa >100 bloqueia", fidl.podeResgatar(500, { ...fidl.DEFAULT_FIDELIDADE, recompensaValor: 150 }).ok === false);

// ---------- operações ----------
const op = await import("@/lib/operacao.ts");
t("minutosDesde 90min", op.minutosDesde("2026-10-03T10:30:00Z", new Date("2026-10-03T12:00:00Z")) === 90);
t("minutosDesde vazio = null", op.minutosDesde(null) === null);
t("minutosDesde inválido = null", op.minutosDesde("xx") === null);

// ---------- REGRA DOS 50 NA ENTRADA DO CARRINHO (regressão) ----------
// O catálogo, o Montar Combo, o Repetir pedido e o Pedido rápido passam por
// ajustarParaCombo(). Antes, o catálogo vendia 1 unidade e furava a regra.
const ajusta = totals.ajustarParaCombo;
const entradas = [[1, 50], [10, 50], [49, 50], [50, 50], [51, 100], [60, 100], [70, 100], [77, 100], [80, 100], [90, 100], [99, 100], [100, 100], [110, 150], [149, 150], [150, 150], [200, 200], [201, 250]];
for (const [entrada, esperado] of entradas) {
  t(`carrinho: entra ${entrada}un de combo -> ${esperado}un`, ajusta(entrada) === esperado);
}
t("carrinho: sempre múltiplo de 50", entradas.every(([e]) => ajusta(e) % 50 === 0));
t("carrinho: nunca abaixo do mínimo", entradas.every(([e]) => ajusta(e) >= 50));
t("carrinho: 0 e negativo zeram", ajusta(0) === 0 && ajusta(-10) === 0);

// ---------- CATÁLOGO: congelados vendem por unidade ----------
const catalogo = await import("@/lib/catalog.ts");
const congelado = { slug: "mini-congelados", tipo_venda: "unidade" };
const comboCat = { slug: "mini-fritos", tipo_venda: "combo_50" };
t("congelado = unidade (sem regra dos 50)", catalogo.tipoVendaProduto(congelado) === "unidade");
t("minis fritos = combo_50", catalogo.tipoVendaProduto(comboCat) === "combo_50");
t("congelado 1un NÃO é arredondado para 50", isUnidadeLivre(congelado) === true);
function isUnidadeLivre(p) {
  // congelados/kits/bebidas ficam fora do combo: quantidade livre
  return catalogo.tipoVendaProduto(p) !== "combo_50";
}

// ---------- ESTIMATIVA DO ORÇAMENTO: nunca mexe no pedido sem avisar ----------
const calc = await import("@/lib/calculadora-salgados.ts");
const e30x15 = calc.estimarOrcamento(30, 15, 1.6);
t("30 pessoas x 15 = 450", e30x15.unidades === 450);
t("450 é múltiplo de 50", e30x15.unidadesCombo === 450);
const e30x17 = calc.estimarOrcamento(30, 17, 1.6);
t("30 x 17 = 510", e30x17.unidades === 510);
t("510 sugere 550 e informa o quanto falta", e30x17.unidadesCombo === 550 && e30x17.faltamParaCombo === 40);
t("estimativa preserva o cálculo do cliente", e30x17.unidades === 510);

// ---------- PIX: BR Code real (QR e Copia e Cola) ----------
const pixlib = await import("@/lib/pix.ts");
const pix = pixlib.gerarPix({ chave: "neiasalgados@pix.com.br", valor: 46 });
t("pix gerado com chave e valor", !!pix);
t("começa com payload format 01", pix.copiaECola.startsWith("000201"));
t("BR Code do BCB presente", pix.copiaECola.includes("BR.GOV.BCB.PIX"));
t("código de moeda BRL (986)", pix.copiaECola.includes("5303986"));
t("país BR", pix.copiaECola.includes("5802BR"));
t("valor 46.00 presente", pix.copiaECola.includes("540546.00"));
t("chave e-mail preservada com @", pix.copiaECola.includes("0123neiasalgados@pix.com.br"));
t("tem campo CRC 6304", pix.copiaECola.includes("6304"));
t("CRC tem 4 hex", /6304[0-9A-F]{4}$/.test(pix.copiaECola));
t("não manda texto solto no QR (formato antigo)", !pix.copiaECola.includes("|CHAVE:"));
t("valor 46 confere", pix.valor === 46);

function crc16Br(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const semCrc = pix.copiaECola.slice(0, -4);
t("CRC confere com o cálculo", pix.copiaECola.endsWith(crc16Br(semCrc)));
t("payload sem chave não gera BR Code", pixlib.gerarPix({ chave: "", valor: 46 }) === null);
t("payload com chave inválida não gera BR Code", pixlib.gerarPix({ chave: "   ", valor: 10 }) === null);
t("valor 0 omite o campo 54 (cliente preenche)", !pixlib.gerarPix({ chave: "neiasalgados@pix.com.br", valor: 0 }).copiaECola.includes("5406"));
t("QR usa o BR Code como payload", pixlib.urlQrPix(pix.copiaECola).includes(encodeURIComponent(pix.copiaECola)));
t("descrição sem acento não quebra tamanho", (() => {
  const p = pixlib.gerarPix({ chave: "neiasalgados@pix.com.br", valor: 10, descricao: "Pedido Ação de Graças" });
  return p.copiaECola.includes("Acao de Gracas");
})());
t("txid *** preservado (banco rejeita txid vazio)", pix.copiaECola.includes("62070503***"));
t("CNPJ gera subcampo 01 com 14 dígitos", (() => {
  const p = pixlib.gerarPix({ chave: "24913937000116", valor: 46 });
  return p.copiaECola.includes("011424913937000116");
})());

// ---------- FRITURA: tempo por produto, pedido = lote mais longo ----------
const coz = await import("@/lib/cozinha.ts");
t("50un padrão = 210s", coz.tempoFritura(50) === 210);
t("100un = 420s", coz.tempoFritura(100) === 420);
t("pedido misto usa o lote mais longo", coz.tempoFrituraPedido([{ quantidade: 50, seg50: 210 }, { quantidade: 50, seg50: 300 }]) === 300);
t("seg50 nulo cai no padrão", coz.tempoFrituraPedido([{ quantidade: 50, seg50: null }]) === 210);
t("janela lotada por unidades", (await import("@/lib/horario.ts")).janelaLotada(2000, 2000) === true);

// ---------- MENSAGENS DE ERRO PARA O CLIENTE (§19) ----------
const erros = await import("@/lib/erros.ts");
const M = erros.mensagemDeErro;
t("erro técnico (constraint) vira frase simples", M(new Error("violates foreign key constraint 'pedidos_user_id_fkey'")) === "Não foi possível concluir agora. Tente novamente.");
t("erro de coluna não vaza nome técnico", !M(new Error('column "tipo_entrega" does not exist')).includes("column"));
t("duplicate key não vaza", !M(new Error("duplicate key value violates unique constraint")).includes("duplicate"));
t("undefined não vaza", M(new Error("undefined is not an object")) === "Não foi possível concluir agora. Tente novamente.");
t("NaN não vaza", M(new Error("NaN")) === "Não foi possível concluir agora. Tente novamente.");
t("uuid não vaza", M(new Error("invalid input syntax for type uuid: 123")) === "Não foi possível concluir agora. Tente novamente.");
t("PGRST (PostgREST) não vaza", M(new Error("PGRST116: 0 rows")).includes("Tente novamente"));
t("falha de rede não vaza", M(new Error("Failed to fetch")).includes("Tente novamente"));
t("erro de negócio passa intacto", M(new Error('"Coxinha": combos são vendidos em múltiplos de 50 unidades. Ajuste no carrinho.')).includes("múltiplos de 50"));
t("produto indisponível passa intacto", M(new Error("Produto Coxinha indisponível no momento.")).includes("indisponível"));
t("erro humano curto passa intacto", M(new Error("Sua sessão expirou. Entre novamente.")) === "Sua sessão expirou. Entre novamente.");
t("não-Error cai no padrão", M("qualquer coisa") === "Não foi possível concluir agora. Tente novamente.");
t("nenhuma mensagem tecnicaknown", ["constraint", "undefined", "NaN", "uuid", "PGRST"].every((t2) => !M(new Error(`${t2} falha`)).includes(t2)));

// ---------- COMANDA 80mm: visível, curta, só ASCII ----------
const imp = await import("@/lib/impressao.ts");
const cupom = imp.textoCupom({
  numero: 1048, dataHora: "04/10/2026 18:00", cliente: "José da Silva", telefone: "(11) 90000-0000",
  itens: [{ qtd: 50, nome: "Coxinha" }, { qtd: 30, nome: "Kibe" }], totalUnidades: 80,
  entregaRetirada: "ENTREGA", horario: "18:00-18:30", endereco: "Rua das Flores, 123",
  pagamento: "PIX", observacoes: "Sem pimenta", status: "CONFIRMADO",
});
t("comanda tem pedido em destaque", cupom.includes("PEDIDO #1048"));
t("comanda tem total em destaque", cupom.includes("TOTAL: 80 UN"));
t("comanda sem acentos (driver térmico)", /^[\x20-\x7E\n]*$/.test(cupom));
t("comanda linhas curtas p/ 80mm", cupom.split("\n").every((l) => l.length <= 42));
t("comanda maiúscula", cupom === cupom.toUpperCase());

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
