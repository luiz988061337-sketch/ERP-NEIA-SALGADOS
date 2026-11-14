// E1/E2/E3: testes puros; nenhuma consulta, conexão ou escrita no banco.
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
register(pathToFileURL(resolve("scripts/alias-loader.mjs")).href);
const S = await import("../src/components/estoque-preview/salgados.ts");
const U = await import("../src/components/estoque-preview/suprimentos.ts");
const { ehPreviewEstoque, ROTAS_PREVIEW_ESTOQUES } = await import("../src/lib/preview-estoques.ts");
let grupos = 0;
const ok = (nome) => {
  console.log("✓ " + nome);
  grupos++;
};
const sucesso = (r) => {
  assert.equal(r.ok, true, r.erro);
  return r.estado;
};
const falha = (r) => assert.equal(r.ok, false, "Esperava bloqueio da operação");
const p = "produto-coxinha";
let s = S.criarSalgadosDemo();
assert.deepEqual(S.saldoSalgado(s, p), { fisico: 2000, reservado: 350, disponivel: 1650 });
assert.equal(new Set(s.produtos.map((p) => p.id)).size, s.produtos.length);
assert.equal(S.indicadoresSalgados(s).baixos, 2);
ok("E1 — físico, reservado e disponível distintos; dois sabores abaixo do mínimo; cadastro único");
const entrada = {
  id: "entrada-1",
  produtoId: p,
  tipo: "entrada",
  quantidade: 100,
  motivo: "Produção demo",
  codigo: "CF-TESTE",
  validade: "2026-11-16",
};
const inicial = structuredClone(s);
s = sucesso(S.movimentarSalgado(s, entrada));
assert.deepEqual(S.saldoSalgado(s, p), { fisico: 2100, reservado: 350, disponivel: 1750 });
assert.equal(S.lotesFEFO(s, p)[0].codigo, "CF-TESTE");
assert.equal(S.alertaValidade(S.lotesFEFO(s, p)[0]), true);
assert.equal(S.alertaValidade({ ...S.lotesFEFO(s, p)[0], status: "esgotado", restante: 0 }), false);
assert.deepEqual(inicial, S.criarSalgadosDemo());
falha(S.movimentarSalgado(s, entrada));
falha(S.movimentarSalgado(s, { ...entrada, id: "lote-dup" }));
falha(S.movimentarSalgado(s, { ...entrada, id: "vencido", codigo: "X", validade: "2026-11-01" }));
falha(
  S.movimentarSalgado(s, { ...entrada, id: "data-invalida", codigo: "X", validade: "2027-02-30" }),
);
ok("E1 — entrada, FEFO, alerta de vencimento, imutabilidade e duplicidade de movimento/lote");
s = sucesso(S.reservarPedido(s, "reserva-combo", "COMBO-100", S.COMBO_DEMO));
assert.equal(S.saldoSalgado(s, p).reservado, 400);
assert.equal(S.saldoSalgado(s, "produto-queijo").reservado, 280);
assert.equal(S.saldoSalgado(s, "produto-kibe").reservado, 320);
assert.equal(s.produtos.length, 9);
falha(S.reservarPedido(s, "reserva-repetida", "COMBO-100", S.COMBO_DEMO));
const antesErro = structuredClone(s);
falha(
  S.reservarPedido(s, "reserva-insuficiente", "SEM-SALDO", [
    { produtoId: p, quantidade: 1 },
    { produtoId: "produto-kibe", quantidade: 99999 },
  ]),
);
assert.deepEqual(s, antesErro);
falha(
  S.reservarPedido(s, "linhas-duplicadas", "DUP-LINHAS", [
    { produtoId: p, quantidade: 1000 },
    { produtoId: p, quantidade: 1000 },
  ]),
);
ok(
  "E1 — combo reserva 50/30/20 por sabor, sem estoque de combo; validação atômica e pedido duplicado",
);
const r = s.reservas.find((r) => r.pedido === "COMBO-100" && r.produtoId === p);
const retirada = {
  id: "retirada-1",
  produtoId: p,
  tipo: "retirada",
  quantidade: 30,
  reservaId: r.id,
  motivo: "Retirada para fritura",
};
const disponivelAntes = S.saldoSalgado(s, p).disponivel;
s = sucesso(S.movimentarSalgado(s, retirada));
assert.equal(S.saldoSalgado(s, p).fisico, 2070);
assert.equal(S.saldoSalgado(s, p).reservado, 370);
assert.equal(S.saldoSalgado(s, p).disponivel, disponivelAntes);
assert.equal(S.lotesFEFO(s, p)[0].restante, 70);
falha(S.movimentarSalgado(s, retirada));
falha(S.movimentarSalgado(s, { ...retirada, id: "acima-reserva", quantidade: 21 }));
ok("E1 — retirada consome reserva e físico uma vez; FEFO e disponibilidade protegidos");
s = sucesso(S.cancelarReserva(s, "cancelar-combo", "COMBO-100"));
assert.equal(S.saldoSalgado(s, p).fisico, 2070);
assert.equal(S.saldoSalgado(s, p).reservado, 350);
assert.equal(s.reservas.find((r) => r.id === retirada.reservaId).liberada, 20);
falha(S.cancelarReserva(s, "cancelar-outra-vez", "COMBO-100"));
falha(S.movimentarSalgado(s, { ...retirada, id: "reserva-liberada", quantidade: 1 }));
ok("E1 — cancelamento libera só os 20 ainda não consumidos; não repõe os 30 retirados");
const perda = {
  id: "perda-1",
  produtoId: p,
  tipo: "perda",
  quantidade: 100,
  motivo: "Quebra demonstrativa",
};
s = sucesso(S.movimentarSalgado(s, perda));
assert.equal(S.saldoSalgado(s, p).fisico, 1970);
assert.ok(s.historico[0].lotes.includes("CF-TESTE: 70"));
falha(S.movimentarSalgado(s, { ...perda, id: "perda-2", quantidade: 9999 }));
falha(S.movimentarSalgado(s, { ...perda, id: "sem-motivo", motivo: "" }));
const lote = S.lotesFEFO(s, p)[0];
s = sucesso(
  S.movimentarSalgado(s, {
    id: "ajuste-1",
    produtoId: p,
    tipo: "ajuste",
    loteId: lote.id,
    quantidade: 900,
    motivo: "Contagem física",
  }),
);
assert.equal(s.lotes.find((l) => l.id === lote.id).restante, 900);
const protegido = S.criarSalgadosDemo();
protegido.reservas[0].quantidade = 1950;
falha(
  S.movimentarSalgado(protegido, {
    id: "ajuste-invalido",
    produtoId: p,
    tipo: "ajuste",
    loteId: protegido.lotes[0].id,
    quantidade: 0,
    motivo: "Teste",
  }),
);
for (const quantidade of [-1, 0, 1.5, NaN, Infinity])
  falha(S.movimentarSalgado(s, { ...perda, id: `invalido-${quantidade}`, quantidade }));
ok("E1 — perda, inventário justificado, negativos e contagem inferior às reservas bloqueados");

let u = U.criarSuprimentosDemo("insumos");
let farinha = u.itens[0];
assert.equal(U.pacotes(farinha), 4);
assert.equal(U.quantidadeBase(farinha, 500, "g"), 0.5);
assert.equal(U.quantidadeBase(farinha, 1, "l"), null);
assert.equal(U.indicadoresSuprimentos(u).baixos, 1);
assert.equal(U.indicadoresSuprimentos(u).custo, 347.8);
ok("E2 — 4 pacotes de 5kg, conversão g/kg, unidades incompatíveis e indicadores consistentes");
const compra = {
  id: "compra-1",
  itemId: farinha.id,
  tipo: "compra",
  quantidade: 2,
  unidade: "compra",
  motivo: "NF fictícia",
  custo: 18,
  fornecedor: "Fornecedor C",
};
u = sucesso(U.movimentarSuprimento(u, compra));
assert.equal(u.itens[0].saldo, 30);
assert.equal(u.itens[0].custo, 18);
assert.equal(u.itens[0].fornecedor, "Fornecedor C");
falha(U.movimentarSuprimento(u, compra));
u = sucesso(
  U.movimentarSuprimento(u, { ...compra, id: "fechada-1", tipo: "fechada", quantidade: 1 }),
);
assert.equal(u.itens[0].saldo, 25);
falha(
  U.movimentarSuprimento(u, { ...compra, id: "fechada-meia", tipo: "fechada", quantidade: 0.5 }),
);
u = sucesso(
  U.movimentarSuprimento(u, {
    ...compra,
    id: "parcial-1",
    tipo: "parcial",
    quantidade: 500,
    unidade: "g",
  }),
);
assert.equal(u.itens[0].saldo, 24.5);
assert.equal(U.pacotes(u.itens[0]), 4.9);
assert.equal(u.itens[0].estimado, true);
ok(
  "E2 — compra guarda preço/fornecedor; retirada fechada e parcial aproximada sem pesagem obrigatória",
);
u = sucesso(
  U.movimentarSuprimento(u, { ...compra, id: "conferir-1", tipo: "conferencia", quantidade: 4.5 }),
);
assert.equal(u.itens[0].saldo, 22.5);
assert.ok(u.itens[0].conferencia.startsWith(S.DATA_DEMO));
u = sucesso(
  U.movimentarSuprimento(u, {
    ...compra,
    id: "ajustar-1",
    tipo: "ajuste",
    quantidade: 8,
    unidade: "kg",
    motivo: "Contagem aproximada justificada",
  }),
);
assert.equal(u.itens[0].saldo, 8);
assert.notEqual(U.situacao(u.itens[0]), "ok");
assert.equal(U.reposicao(u.itens[0]), 1);
falha(U.movimentarSuprimento(u, { ...compra, id: "negativo", tipo: "parcial", quantidade: 99 }));
falha(U.movimentarSuprimento(u, { ...compra, id: "sem-just", tipo: "ajuste", motivo: "" }));
u = sucesso(
  U.salvarSuprimento(u, "converter-cadastro", {
    ...u.itens[0],
    unidadeBase: "g",
    equivalente: 5000,
  }),
);
assert.equal(u.itens[0].saldo, 8000);
assert.equal(U.pacotes(u.itens[0]), 1.6);
falha(U.salvarSuprimento(u, "incompativel", { ...u.itens[0], unidadeBase: "l" }));
ok("E2 — conferência, ajuste, mínimo e conversão de cadastro preservam a quantidade física");
const oleo = u.itens.find((i) => i.id === "ins-oleo"),
  ovos = u.itens.find((i) => i.id === "ins-ovos");
assert.equal(U.quantidadeBase(oleo, 2000, "ml"), 2);
assert.equal(U.pacotes(ovos), 5);
assert.ok(u.historico.some((m) => m.tipo === "Retirada parcial"));
ok("E2 — litros/ml, bandejas de 30 unidades e histórico auditável");

let e = U.criarSuprimentosDemo("embalagens"),
  caixa = e.itens[0];
assert.equal(U.indicadoresSuprimentos(e).pacotes, 27);
assert.equal(U.indicadoresSuprimentos(e).baixos, 2);
assert.equal(U.indicadoresSuprimentos(e).fornecedores, 1);
e = sucesso(U.salvarSuprimento(e, "config-caixa", { ...caixa, equivalente: 40, custo: 43 }));
assert.equal(e.itens[0].saldo, 250);
assert.equal(U.pacotes(e.itens[0]), 6.25);
const embalagemCompra = {
  id: "fardo-1",
  itemId: caixa.id,
  tipo: "compra",
  quantidade: 2,
  unidade: "compra",
  motivo: "Compra fictícia",
  custo: 43,
  fornecedor: "Embalagens ABC",
};
e = sucesso(U.movimentarSuprimento(e, embalagemCompra));
assert.equal(e.itens[0].saldo, 330);
assert.equal(e.itens[1].saldo, 100);
assert.equal(e.itens[1].custo, 58);
ok(
  "E3 — fardo configurado com 40 (não fixo), compra convertida e saldos/custos separados por caixa",
);
e = sucesso(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "retirar-fardo",
    tipo: "fechada",
    quantidade: 1,
  }),
);
assert.equal(e.itens[0].saldo, 290);
e = sucesso(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "retirar-parcial",
    tipo: "parcial",
    quantidade: 10,
    unidade: "un",
  }),
);
assert.equal(e.itens[0].saldo, 280);
falha(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "meia-caixa",
    tipo: "parcial",
    quantidade: 0.5,
    unidade: "un",
  }),
);
falha(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "sem-saldo",
    tipo: "fechada",
    quantidade: 999,
  }),
);
falha(U.salvarSuprimento(e, "config-negativa", { ...caixa, equivalente: -1 }));
ok("E3 — retirada inteira/parcial, unidades inteiras e negativos/quantidade inválida bloqueados");
e = sucesso(
  U.salvarSuprimento(e, "novo-tipo", {
    ...caixa,
    id: "emb-nova",
    nome: "Embalagem especial",
    equivalente: null,
  }),
);
const nova = e.itens.find((i) => i.id === "emb-nova");
assert.equal(nova.equivalente, null);
assert.equal(nova.saldo, 0);
falha(U.movimentarSuprimento(e, { ...embalagemCompra, id: "sem-config", itemId: nova.id }));
e = sucesso(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "unidades-avulsas",
    itemId: nova.id,
    quantidade: 12,
    unidade: "un",
  }),
);
assert.equal(e.itens.find((i) => i.id === nova.id).saldo, 12);
assert.equal(U.situacao(e.itens.find((i) => i.id === nova.id)), "configurar");
e = sucesso(
  U.movimentarSuprimento(e, {
    ...embalagemCompra,
    id: "conferencia-caixa",
    tipo: "conferencia",
    quantidade: 2,
  }),
);
assert.equal(e.itens[0].saldo, 80);
assert.ok(U.reposicao(e.itens[0]) > 0);
assert.equal(
  e.itens.some((i) => /em uso|montada/i.test(i.nome)),
  false,
);
ok(
  "E3 — novo tipo sem presumir tamanho do fardo; configuração pendente explícita, conferência e reposição",
);
for (const rota of ROTAS_PREVIEW_ESTOQUES) {
  assert.equal(ehPreviewEstoque(rota), true);
  assert.equal(ehPreviewEstoque(`${rota}/`), true);
  assert.equal(ehPreviewEstoque(`${rota}-extra`), false);
}
for (const rota of [
  "/admin",
  "/pdv",
  "/financeiro",
  "/preview/reembolsos-estornos",
  "/preview/reembolsos-estornos-cliente",
  "/",
]) {
  assert.equal(ehPreviewEstoque(rota), false);
}
ok("Isolamento — allowlist exata sem alterar autenticação/tema de outros módulos");
console.log(`\nE1 + E2 + E3: ${grupos} grupos de regras passaram, sem banco.`);
