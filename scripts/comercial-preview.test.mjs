// C1 — Painel Comercial e Clientes/Segmentação: regras puras, sem banco.
// node scripts/comercial-preview.test.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
register(pathToFileURL(resolve("scripts/alias-loader.mjs")).href);

const D = await import("../src/components/comercial-preview/dados.ts");
const { classificar, DEFAULT_CRM_SETTINGS } = await import("../src/lib/crm.ts");

let grupos = 0;
const ok = (nome) => {
  console.log("✓ " + nome);
  grupos++;
};

// --------------------------------------------------------------- faixas
assert.equal(D.faixaInatividade(0), null);
assert.equal(D.faixaInatividade(29), null);
assert.equal(D.faixaInatividade(30), "30-59");
assert.equal(D.faixaInatividade(59), "30-59");
assert.equal(D.faixaInatividade(60), "60-89");
assert.equal(D.faixaInatividade(89), "60-89");
assert.equal(D.faixaInatividade(90), "90+");
assert.equal(D.faixaInatividade(365), "90+");
ok("Faixas exclusivas: 30–59, 60–89 e 90+ — nenhum cliente conta em duas faixas");

// ---------------------------------------------------------- contagens
const c = D.contarInatividade(D.CLIENTES_DEMO);
assert.equal(
  c.faixas["30-59"] + c.faixas["60-89"] + c.faixas["90+"],
  c.acumulado30,
  "soma das faixas exclusivas = acumulado de 30+",
);
assert.equal(c.ativos + c.acumulado30, c.total, "ativos + inativos = total da base");
assert.ok(c.acumulado30 > 0);
assert.deepEqual(c.faixas, { "30-59": 152, "60-89": 97, "90+": 68 });
assert.equal(c.acumulado30, 317);
assert.equal(c.total, 437);
assert.ok(c.faixas["30-59"] > 0 && c.faixas["60-89"] > 0 && c.faixas["90+"] > 0);
// Nenhum cliente é contado duas vezes: soma dos inativos por faixa = inativos reais.
const inativosReais = D.CLIENTES_DEMO.filter((x) => D.faixaInatividade(x.diasSemComprar)).length;
assert.equal(inativosReais, c.acumulado30);
ok("Contagens sem duplicidade: soma das faixas = acumulado 30+ = inativos reais da base");

// ---------------------------------------------- segmentação reaproveitada
for (const cli of D.CLIENTES_DEMO) {
  assert.equal(cli.segmento, classificar(cli.diasSemComprar, DEFAULT_CRM_SETTINGS));
}
ok("Segmento usa exatamente a regra classificar() já aprovada em @/lib/crm");

// ------------------------------------- limites oficiais da classificação
const limites = [
  [null, "novo"],
  [0, "ativo"],
  [30, "ativo"],
  [31, "risco"],
  [45, "risco"],
  [46, "inativo"],
  [90, "inativo"],
  [91, "muito_inativo"],
];
for (const [dias, segmento] of limites) {
  assert.equal(
    classificar(dias, DEFAULT_CRM_SETTINGS),
    segmento,
    `classificar(${dias}) deve preservar o segmento ${segmento}`,
  );
}
ok("Limites de classificar() preservados: 30 = ativo; 31–45 = risco; 46–90 = inativo; 91+ = muito inativo");

// ------------------------------------------------ rótulos oficiais exibidos
for (const [segmento, rotulo] of Object.entries(D.SEGMENTO_PLAIN)) {
  assert.ok(
    D.SEGMENTO_LABEL[segmento].endsWith(rotulo),
    `rótulo de ${segmento} deve acompanhar SEGMENTO_LABEL oficial`,
  );
}
assert.deepEqual(D.SEGMENTO_PLAIN, {
  ativo: "Ativo",
  risco: "Em risco",
  inativo: "Inativo",
  muito_inativo: "Muito inativo",
  novo: "Novo",
});
ok("Rótulos exibidos consistentes com SEGMENTO_LABEL oficial, sem reimplementar regras");

// ------------------------------------------------------------- filtros
const todos = D.filtrarClientes(D.CLIENTES_DEMO, D.FILTROS_VAZIOS);
assert.equal(todos.length, D.CLIENTES_DEMO.length);
const soInativos = D.filtrarClientes(D.CLIENTES_DEMO, D.FILTROS_VAZIOS, true);
assert.equal(soInativos.length, c.acumulado30);
assert.ok(soInativos.every((x) => D.faixaInatividade(x.diasSemComprar) !== null));

const porSegmento = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  segmento: "muito_inativo",
});
assert.ok(porSegmento.length > 0);
assert.ok(porSegmento.every((x) => x.segmento === "muito_inativo"));

const porOrigem = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  origem: "Instagram",
});
assert.ok(porOrigem.length > 0);
assert.ok(porOrigem.every((x) => x.origem === "Instagram"));

const porAtendente = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  atendente: "Ana Souza",
});
assert.ok(porAtendente.length > 0);
assert.ok(porAtendente.every((x) => x.atendente === "Ana Souza"));

const porPeriodo = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  periodo: 30,
});
assert.ok(porPeriodo.every((x) => x.diasSemComprar <= 30));

const alvo = D.CLIENTES_DEMO[0];
const porBusca = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  busca: alvo.nome.slice(0, 6),
});
assert.ok(porBusca.some((x) => x.id === alvo.id));
const porTelefone = D.filtrarClientes(D.CLIENTES_DEMO, {
  ...D.FILTROS_VAZIOS,
  busca: alvo.telefone.replace(/\D/g, "").slice(-6),
});
assert.ok(porTelefone.some((x) => x.id === alvo.id));
ok("Filtros por período, segmento, origem, atendente e busca (nome/telefone) funcionam");

// ------------------------------------------------------------ paginação
const pag = D.paginar(todos, 1, 10);
assert.equal(pag.itens.length, 10);
assert.equal(pag.primeiro, 1);
assert.equal(pag.ultimo, 10);
assert.equal(pag.paginas, Math.ceil(todos.length / 10));
assert.equal(pag.total, todos.length);
const ultima = D.paginar(todos, pag.paginas, 10);
assert.equal(ultima.ultimo, todos.length);
assert.ok(ultima.itens.length <= 10);
const fora = D.paginar(todos, 999, 10);
assert.equal(fora.pagina, fora.paginas, "página fora do limite é limitada");
const vazia = D.paginar([], 1, 10);
assert.equal(vazia.total, 0);
assert.equal(vazia.primeiro, 0);
assert.equal(vazia.paginas, 1);
ok("Paginação com limite de páginas, primeiro/último e lista vazia");

// --------------------------------------------------------- consistência
assert.equal(new Set(D.CLIENTES_DEMO.map((x) => x.id)).size, D.CLIENTES_DEMO.length);
assert.equal(new Set(D.CLIENTES_DEMO.map((x) => x.nome)).size, D.CLIENTES_DEMO.length);
assert.equal(new Set(D.CLIENTES_DEMO.map((x) => x.telefone)).size, D.CLIENTES_DEMO.length);
assert.ok(D.CLIENTES_DEMO.every((x) => x.favoritos.length >= 2));
assert.ok(D.CLIENTES_DEMO.every((x) => x.historico.length >= 1));
assert.ok(D.CLIENTES_DEMO.every((x) => D.STATUS_REATIVACAO.includes(x.status)));
assert.ok(D.CAMPANHAS_DEMO.some((x) => x.status === "Rascunho"));
assert.ok(D.CAMPANHAS_DEMO.some((x) => x.status === "Aguardando aprovação"));
assert.equal(
  D.CAMPANHAS_DEMO.filter((x) => x.status === "Rascunho").length,
  D.CAMPANHAS_DEMO.filter((x) => x.status === "Rascunho").length,
);
ok("Base demonstrativa consistente: IDs e nomes únicos, favoritos, histórico e status de campanha");

// ------------------------------------------------------- data de referência
assert.equal(D.formatarData("2024-10-15"), "15/10/2024");
assert.equal(D.dataUltimoPedido(0), D.DATA_COMERCIAL);
assert.equal(D.dataUltimoPedido(30), "2026-10-15");
ok("Datas de referência coerentes com a demonstração");

console.log(`\nC1 — Painel Comercial e Clientes/Segmentação: ${grupos} grupos passaram, sem banco.`);
