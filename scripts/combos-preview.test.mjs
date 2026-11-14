// Cadastro de Combos e reservas unificadas por sabor (E1). Sem banco.
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
register(pathToFileURL(resolve("scripts/alias-loader.mjs")).href);
const S = await import("../src/components/estoque-preview/salgados.ts");
const C = await import("../src/components/estoque-preview/combos.ts");
const P = await import("../src/components/estoque-preview/produtos.ts");

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

const pCoxinha = "produto-coxinha";
const pQueijo = "produto-queijo";
const pKibe = "produto-kibe";

// ------------------------------------------------------------------ cadastro
let combos = C.criarCombosDemo();
assert.equal(combos.itens.length, 1);
assert.equal(combos.itens[0].total, 100);
assert.equal(C.precoCombo(combos.itens[0]), 160);
assert.equal(C.precoCombo({ categoria: "Assados", total: 50 }), 115);
assert.equal(C.precoCombo({ categoria: "Bebidas", total: 50 }), null);
ok("Cadastro inicial: Combo Festa 100un (50/30/20) com preço por categoria (Fritos R$ 1,60/un)");

let salgados = S.criarSalgadosDemo();
const novoCombo = {
  id: "combo-festa-100",
  nome: "Combo Festa 100",
  descricao: "Cadastro demonstrativo",
  categoria: "Fritos",
  total: 100,
  itens: [
    { produtoId: pCoxinha, quantidade: 50 },
    { produtoId: pQueijo, quantidade: 30 },
    { produtoId: pKibe, quantidade: 20 },
  ],
  ativo: true,
};
combos = sucesso(C.salvarCombo(combos, salgados.produtos, "op-1", novoCombo, "novo"));
assert.equal(combos.itens.length, 2);
assert.equal(combos.itens[1].nome, "Combo Festa 100");
assert.deepEqual(combos.itens[1].itens, novoCombo.itens);
ok(
  "Cadastrar combo com composição a partir dos produtos existentes, sem duplicar cadastro de sabores",
);

// Validação da soma das quantidades.
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-soma",
    {
      ...novoCombo,
      id: "c-soma",
      itens: [
        { produtoId: pCoxinha, quantidade: 40 },
        { produtoId: pQueijo, quantidade: 30 },
        { produtoId: pKibe, quantidade: 20 },
      ],
    },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-soma2",
    {
      ...novoCombo,
      id: "c-soma2",
      itens: [
        { produtoId: pCoxinha, quantidade: 80 },
        { produtoId: pQueijo, quantidade: 30 },
        { produtoId: pKibe, quantidade: 20 },
      ],
    },
    "novo",
  ),
);
// Sabor inexistente / inativo / de outra categoria / duplicado.
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-inexistente",
    {
      ...novoCombo,
      id: "c-inexistente",
      itens: [{ produtoId: "produto-inexistente", quantidade: 100 }],
    },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-categoria",
    { ...novoCombo, id: "c-categoria", categoria: "Assados" },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-dup-sabor",
    {
      ...novoCombo,
      id: "c-dup-sabor",
      itens: [
        { produtoId: pCoxinha, quantidade: 50 },
        { produtoId: pCoxinha, quantidade: 50 },
      ],
    },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-total",
    { ...novoCombo, id: "c-total", total: 75 },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-vazio",
    { ...novoCombo, id: "c-vazio", itens: [] },
    "novo",
  ),
);
falha(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-nome-dup",
    { ...novoCombo, id: "c-nome-dup", nome: "  COMBO FESTA 100  " },
    "novo",
  ),
);
falha(C.salvarCombo(combos, salgados.produtos, "op-1", novoCombo, "novo"));
ok(
  "Soma das quantidades, sabor inexistente, categoria divergente, sabor repetido, total inválido, nome duplicado e repetição de operação bloqueados",
);

// Editar composição preservando o identificador (combo de teste separado).
const comboEditavel = { ...novoCombo, id: "combo-editavel", nome: "Combo Editável" };
combos = sucesso(
  C.salvarCombo(combos, salgados.produtos, "op-criar-editavel", comboEditavel, "novo"),
);
combos = sucesso(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-edit",
    {
      ...comboEditavel,
      nome: "Combo Editável revisado",
      itens: [
        { produtoId: pCoxinha, quantidade: 60 },
        { produtoId: pQueijo, quantidade: 40 },
      ],
    },
    "editar",
  ),
);
const editado = combos.itens.find((x) => x.id === "combo-editavel");
assert.equal(editado.nome, "Combo Editável revisado");
assert.equal(editado.itens.length, 2);
assert.equal(editado.itens[0].quantidade, 60);
assert.equal(editado.total, 100);
ok("Editar composição mantém identificador e cadastro de produtos intacto");

// --------------------------------------------------- reserva unificada por sabor
const saldoCoxinhaAntes = S.saldoSalgado(salgados, pCoxinha);
const comboFesta = combos.itens.find((x) => x.id === "combo-festa-100");
salgados = sucesso(C.confirmarCombo(salgados, comboFesta, "op-pedido-1", "PED-COMBO-100", 1));
assert.equal(S.saldoSalgado(salgados, pCoxinha).fisico, saldoCoxinhaAntes.fisico);
assert.equal(S.saldoSalgado(salgados, pCoxinha).reservado, saldoCoxinhaAntes.reservado + 50);
assert.equal(S.saldoSalgado(salgados, pQueijo).reservado, 280);
assert.equal(S.saldoSalgado(salgados, pKibe).reservado, 320);
assert.equal(salgados.reservas.filter((r) => r.pedido === "PED-COMBO-100").length, 3);
ok("Confirmar 1 combo reserva 50/30/20 por sabor no mesmo total reservado, sem baixar o físico");

// Reserva normal somada no mesmo total do sabor.
const antesCombinado = S.saldoSalgado(salgados, pCoxinha).reservado;
salgados = sucesso(
  S.reservarPedido(salgados, "op-pedido-avulso", "PED-AVULSO-1", [
    { produtoId: pCoxinha, quantidade: 100 },
  ]),
);
assert.equal(S.saldoSalgado(salgados, pCoxinha).reservado, antesCombinado + 100);
assert.equal(
  S.saldoSalgado(salgados, pCoxinha).disponivel,
  S.saldoSalgado(salgados, pCoxinha).fisico - (antesCombinado + 100),
);
ok(
  "Reserva avulsa e reserva de combo somam no mesmo total reservado por sabor (disponível = físico − reservado)",
);

// Estoque insuficiente rejeita tudo, sem reserva parcial.
const antes = structuredClone(salgados);
falha(C.confirmarCombo(salgados, comboFesta, "op-sem-saldo", "PED-SEM-SALDO", 100));
assert.deepEqual(salgados, antes);
// Pedido duplicado.
falha(C.confirmarCombo(salgados, comboFesta, "op-dup-pedido", "PED-COMBO-100", 1));
// Combo inativo.
const inativo = { ...comboFesta, ativo: false };
falha(C.confirmarCombo(salgados, inativo, "op-inativo", "PED-INATIVO", 1));
// Quantidade inválida.
falha(C.confirmarCombo(salgados, comboFesta, "op-qtd", "PED-QTD", 0));
ok(
  "Estoque insuficiente, pedido duplicado, combo inativo e quantidade inválida bloqueados sem reserva parcial",
);

// --------------------------------------------- retirada do freezer sem baixa dupla
const antesRetirada = S.saldoSalgado(salgados, pCoxinha);
const reservaCoxinha = salgados.reservas.find(
  (r) => r.pedido === "PED-COMBO-100" && r.produtoId === pCoxinha,
);
salgados = sucesso(
  S.movimentarSalgado(salgados, {
    id: "op-retirada",
    produtoId: pCoxinha,
    tipo: "retirada",
    quantidade: 50,
    reservaId: reservaCoxinha.id,
    motivo: "Retirada para fritura",
  }),
);
const depois = S.saldoSalgado(salgados, pCoxinha);
assert.equal(depois.fisico, antesRetirada.fisico - 50);
assert.equal(depois.reservado, antesRetirada.reservado - 50);
assert.equal(depois.disponivel, antesRetirada.disponivel);
const reservaConsumida = salgados.reservas.find((r) => r.id === reservaCoxinha.id);
assert.equal(reservaConsumida.consumida, 50);
assert.equal(
  salgados.lotes.filter((l) => l.produto_id === pCoxinha).reduce((n, l) => n + l.restante, 0),
  depois.fisico,
);
ok(
  "Retirada de 50 reservadas baixa físico e reserva uma única vez; disponível permanece o mesmo (sem baixa dupla)",
);

// Cancelamento depois da retirada: devolve só o que sobrou de pendente.
salgados = sucesso(S.cancelarReserva(salgados, "op-cancelar", "PED-COMBO-100"));
const reservaAfter = salgados.reservas.find((r) => r.id === reservaCoxinha.id);
assert.equal(reservaAfter.liberada, 0);
assert.equal(reservaAfter.consumida, 50);
const pendente = salgados.reservas.filter(
  (r) => r.pedido === "PED-COMBO-100" && r.quantidade - r.consumida - r.liberada > 0,
);
assert.equal(pendente.length, 0, "nenhuma reserva pendente resta após o cancelamento");
const libQueijo = salgados.reservas.find(
  (r) => r.pedido === "PED-COMBO-100" && r.produtoId === pQueijo,
);
const libKibe = salgados.reservas.find(
  (r) => r.pedido === "PED-COMBO-100" && r.produtoId === pKibe,
);
assert.equal(libQueijo.liberada, 30, "a parte ainda não retirada é liberada");
assert.equal(libKibe.liberada, 20);
assert.equal(reservaAfter.liberada, 0, "o que já foi retirado do freezer não é liberado");
assert.equal(S.saldoSalgado(salgados, pQueijo).reservado, 280 - 30);
assert.equal(S.saldoSalgado(salgados, pKibe).reservado, 320 - 20);
assert.equal(S.saldoSalgado(salgados, pCoxinha).fisico, depois.fisico);
falha(S.cancelarReserva(salgados, "op-cancelar-2", "PED-COMBO-100"));
ok(
  "Cancelamento após retirada libera só a reserva pendente, não devolve ao físico e impede liberação duplicada",
);

// Cancelamento antes da retirada libera tudo.
const s2 = sucesso(C.confirmarCombo(salgados, comboFesta, "op-pedido-2", "PED-COMBO-200", 1));
const s3 = sucesso(S.cancelarReserva(s2, "op-cancelar-2", "PED-COMBO-200"));
assert.equal(S.saldoSalgado(s3, pQueijo).reservado, S.saldoSalgado(s2, pQueijo).reservado - 30);
assert.equal(S.saldoSalgado(s3, pQueijo).fisico, S.saldoSalgado(s2, pQueijo).fisico);
ok("Cancelamento antes da retirada libera a reserva pendente e não altera o físico");

// ------------------------------------------------------------------- FEFO
const lotes = S.lotesFEFO(salgados, pCoxinha);
assert.ok(lotes.length >= 2);
assert.ok(+new Date(lotes[0].validade) <= +new Date(lotes[1].validade));
const retiradaFEFO = sucesso(
  S.movimentarSalgado(salgados, {
    id: "op-fefo",
    produtoId: pCoxinha,
    tipo: "retirada",
    quantidade: 10,
    motivo: "Retirada avulsa",
  }),
);
const alocacao = retiradaFEFO.historico[0].lotes;
assert.ok(alocacao.includes(lotes[0].codigo), "FEFO consome o lote que vence primeiro");
ok("Retirada avulsa consome o lote com validade mais próxima (FEFO)");

// ---------------------------------------------- cadastro não movimenta estoque
const saldosAntes = salgados.produtos.map((p) => S.saldoSalgado(salgados, p.id));
combos = sucesso(
  C.salvarCombo(
    combos,
    salgados.produtos,
    "op-novo-2",
    {
      ...novoCombo,
      id: "combo-novo-2",
      nome: "Combo Sem Estoque",
      itens: [{ produtoId: pKibe, quantidade: 100 }],
      categoria: "Fritos",
    },
    "novo",
  ),
);
const saldosDepois = salgados.produtos.map((p) => S.saldoSalgado(salgados, p.id));
assert.deepEqual(saldosDepois, saldosAntes);
assert.equal(C.precoCombo(combos.itens.find((x) => x.id === "combo-novo-2")), 160);
ok(
  "Cadastrar ou editar combo não movimenta estoque, não cria lote e não altera preço de categoria",
);

// ------------------------------------------- atividade de produto sem duplicidade
let comProduto = S.criarSalgadosDemo();
const novoSabor = {
  ...comProduto.produtos[0],
  id: "produto-novo-sabor",
  nome: "Mini Coxinha de Palmito",
  sabor: "Palmito",
  minimo: 50,
};
comProduto = sucesso(P.salvarProdutoDemo(comProduto, "op-prod-1", novoSabor, "novo"));
const comboComNovoSabor = {
  id: "combo-palmito",
  nome: "Combo Palmito 50",
  descricao: "",
  categoria: "Fritos",
  total: 50,
  itens: [{ produtoId: "produto-novo-sabor", quantidade: 50 }],
  ativo: true,
};
combos = sucesso(
  C.salvarCombo(combos, comProduto.produtos, "op-combo-palmito", comboComNovoSabor, "novo"),
);
assert.equal(
  combos.itens.find((x) => x.id === "combo-palmito").itens[0].produtoId,
  "produto-novo-sabor",
);
assert.equal(comProduto.produtos.filter((p) => p.id === "produto-novo-sabor").length, 1);
ok(
  "Combo usa o produto recém-cadastrado, com o mesmo identificador e sem cadastro duplicado de sabor",
);

// --------------------------------------------- novo sabor precisa de entrada
falha(C.confirmarCombo(comProduto, comboComNovoSabor, "op-pedido-palmito-2", "PED-PALMITO-2", 1));
assert.equal(S.saldoSalgado(comProduto, "produto-novo-sabor").reservado, 0);
comProduto = sucesso(
  S.movimentarSalgado(comProduto, {
    id: "op-entrada-palmito",
    produtoId: "produto-novo-sabor",
    tipo: "entrada",
    quantidade: 100,
    codigo: "PAL-CAD",
    validade: "2026-12-20",
    motivo: "Produção fictícia",
  }),
);
comProduto = sucesso(
  C.confirmarCombo(comProduto, comboComNovoSabor, "op-pedido-palmito-3", "PED-PALMITO-3", 1),
);
assert.deepEqual(S.saldoSalgado(comProduto, "produto-novo-sabor"), {
  fisico: 100,
  reservado: 50,
  disponivel: 50,
});
falha(C.confirmarCombo(comProduto, comboComNovoSabor, "op-pedido-palmito-4", "PED-PALMITO-3", 1));
ok(
  "Combo de sabor novo só reserva após entrada de estoque; sem físico a reserva é rejeitada e o pedido duplicado é bloqueado",
);

console.log(`\nCadastro de Combos e reservas unificadas: ${grupos} grupos passaram, sem banco.`);
