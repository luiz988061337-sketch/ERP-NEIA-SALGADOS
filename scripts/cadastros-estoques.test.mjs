// Complemento E1/E2/E3: cadastro único e transições de estoque, sem banco.
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
register(pathToFileURL(resolve("scripts/alias-loader.mjs")).href);
const S = await import("../src/components/estoque-preview/salgados.ts");
const P = await import("../src/components/estoque-preview/produtos.ts");
const U = await import("../src/components/estoque-preview/suprimentos.ts");
let grupos = 0;
const ok = (texto) => {
  grupos++;
  console.log(`✓ ${texto}`);
};
const sucesso = (r) => {
  assert.equal(r.ok, true, r.erro);
  return r.estado;
};
const falha = (r) => assert.equal(r.ok, false);
let s = S.criarSalgadosDemo();
const base = structuredClone(s);
const produto = {
  ...s.produtos[0],
  id: "produto-cadastro-teste",
  nome: "Mini Coxinha de Palmito",
  sabor: "Palmito",
  descricao: "Dado fictício de teste",
  preco: 1.9,
  minimo: 50,
};
s = sucesso(P.salvarProdutoDemo(s, "cad-1", produto, "novo"));
assert.equal(s.produtos.length, 10);
assert.deepEqual(S.saldoSalgado(s, produto.id), { fisico: 0, reservado: 0, disponivel: 0 });
assert.deepEqual(S.lotesFEFO(s, produto.id), []);
assert.deepEqual(s.lotes, base.lotes);
assert.deepEqual(base, S.criarSalgadosDemo());
assert.equal(s.produtos.filter((p) => p.id === produto.id).length, 1);
ok(
  "Novo sabor no cadastro único: físico/reservado/disponível zero e sem lotes; fixture original imutável",
);
falha(P.salvarProdutoDemo(s, "cad-id-dup", { ...produto, nome: "Outro nome" }, "novo"));
falha(P.salvarProdutoDemo(s, "cad-1", produto, "novo"));
falha(P.salvarProdutoDemo(s, "cad-sem-id", { ...produto, id: " " }, "novo"));
falha(P.salvarProdutoDemo(s, "editar-inexistente", { ...produto, id: "id-inexistente" }, "editar"));
falha(
  P.salvarProdutoDemo(
    s,
    "cad-nome-dup",
    { ...produto, id: "novo-id", nome: "  MÍNI  COXINHA DE PALMITO  " },
    "novo",
  ),
);
ok(
  "Identificador duplicado, repetição de operação, ID ausente e nome duplicado normalizado bloqueados",
);
for (const preco of [-1, 0, NaN, Infinity, 1.234])
  falha(P.salvarProdutoDemo(s, `preco-${preco}`, { ...produto, preco }, "editar"));
falha(P.salvarProdutoDemo(s, "sem-sabor", { ...produto, sabor: " " }, "editar"));
falha(P.salvarProdutoDemo(s, "min-negativo", { ...produto, minimo: -1 }, "editar"));
assert.equal(P.quantidadeVendaDemo(produto), 50);
assert.equal(P.precoComercialDemo(produto), 1.6);
assert.equal(P.precoComercialDemo({ ...produto, tipoVenda: "unidade" }), 1.9);
assert.equal(P.precoComercialDemo({ ...produto, categoria: "Assados" }), 2.3);
ok(
  "Preço em reais/centavos, sabor e mínimo validados; unidade versus combo de categoria em múltiplos de 50",
);
s = sucesso(
  S.movimentarSalgado(s, {
    id: "entrada-novo",
    tipo: "entrada",
    produtoId: produto.id,
    quantidade: 120,
    codigo: "PAL-DEMO",
    validade: "2026-12-15",
    motivo: "Produção fictícia",
  }),
);
assert.deepEqual(S.saldoSalgado(s, produto.id), { fisico: 120, reservado: 0, disponivel: 120 });
assert.equal(S.lotesFEFO(s, produto.id).length, 1);
s = sucesso(
  P.salvarProdutoDemo(
    s,
    "editar-sabor",
    { ...produto, nome: "Mini Coxinha de Palmito Premium", preco: 2.1, ativo: false },
    "editar",
  ),
);
assert.equal(s.produtos.find((p) => p.id === produto.id).ativo, false);
assert.equal(s.produtos.find((p) => p.id === produto.id).preco, 2.1);
assert.equal(S.saldoSalgado(s, produto.id).fisico, 120);
falha(
  S.reservarPedido(s, "reservar-inativo", "PED-INATIVO", [
    { produtoId: produto.id, quantidade: 50 },
  ]),
);
s = sucesso(
  P.salvarProdutoDemo(
    s,
    "reativar",
    { ...s.produtos.find((p) => p.id === produto.id), ativo: true },
    "editar",
  ),
);
s = sucesso(
  S.reservarPedido(s, "reservar-ativo", "PED-ATIVO", [{ produtoId: produto.id, quantidade: 50 }]),
);
assert.equal(S.saldoSalgado(s, produto.id).reservado, 50);
ok(
  "Entrada separada, edição e ativar/desativar preservam ID/lotes/saldo; inativo não aceita nova reserva",
);
const bebida = {
  ...produto,
  id: "produto-bebida-demo",
  nome: "Suco demonstrativo",
  natureza: "bebida",
  sabor: "Laranja",
  preparo: "outro",
  categoria: "Bebidas",
  tipoVenda: "unidade",
  preco: 6,
};
const indicadoresAntes = S.indicadoresSalgados(s);
s = sucesso(P.salvarProdutoDemo(s, "bebida", bebida, "novo"));
assert.equal(
  s.produtos.filter(S.ehSalgadoCongelado).some((p) => p.id === bebida.id),
  false,
);
assert.deepEqual(S.indicadoresSalgados(s), indicadoresAntes);
falha(
  S.movimentarSalgado(s, {
    id: "bebida-entrada",
    produtoId: bebida.id,
    tipo: "entrada",
    quantidade: 5,
    codigo: "B",
    validade: "2026-12-15",
    motivo: "Teste",
  }),
);
falha(
  S.reservarPedido(s, "bebida-reserva", "PED-BEBIDA", [{ produtoId: bebida.id, quantidade: 1 }]),
);
falha(P.salvarProdutoDemo(s, "bebida-combo", { ...bebida, tipoVenda: "combo_50" }, "editar"));
falha(
  P.salvarProdutoDemo(
    s,
    "ocultar-saldo",
    { ...s.produtos.find((p) => p.id === produto.id), natureza: "outro", tipoVenda: "unidade" },
    "editar",
  ),
);
ok(
  "Bebida e outros itens não contaminam estoque/indicadores; reclassificação não oculta saldo com lotes/reservas",
);
for (const tipo of ["insumos", "embalagens"]) {
  let u = U.criarSuprimentosDemo(tipo);
  const novo = {
    ...u.itens[0],
    id: `${tipo}-novo`,
    nome: `${tipo} de Teste`,
    equivalente: tipo === "embalagens" ? 36 : 5,
    custo: 12.5,
    ...(tipo === "embalagens" ? { tipoEmbalagem: "Caixa", unidadeCompra: "fardo" } : {}),
  };
  u = sucesso(U.salvarSuprimento(u, `${tipo}-cad`, novo));
  assert.equal(u.itens.find((i) => i.id === novo.id).saldo, 0);
  falha(
    U.salvarSuprimento(u, `${tipo}-dup`, {
      ...novo,
      id: `${tipo}-duplicado`,
      nome: ` ${tipo.toUpperCase()} DE TÉSTE  `,
    }),
  );
  u = sucesso(
    U.movimentarSuprimento(u, {
      id: `${tipo}-compra`,
      itemId: novo.id,
      tipo: "compra",
      quantidade: 3,
      unidade: "compra",
      motivo: "Compra demo",
      custo: 12.5,
      fornecedor: "Fornecedor teste",
    }),
  );
  u = sucesso(
    U.movimentarSuprimento(u, {
      id: `${tipo}-retirar`,
      itemId: novo.id,
      tipo: "fechada",
      quantidade: 1,
      unidade: "compra",
      motivo: "Retirada demo",
    }),
  );
  const fisico = (tipo === "embalagens" ? 36 : 5) * 2;
  assert.equal(u.itens.find((i) => i.id === novo.id).saldo, fisico);
  u = sucesso(
    U.salvarSuprimento(u, `${tipo}-edit`, {
      ...novo,
      nome: `${novo.nome} revisado`,
      custo: 14,
      ...(tipo === "embalagens" ? { tipoEmbalagem: "Outra" } : {}),
    }),
  );
  assert.equal(u.itens.find((i) => i.id === novo.id).saldo, fisico);
  assert.equal(u.itens.find((i) => i.id === novo.id).custo, 14);
  if (tipo === "embalagens") {
    falha(U.salvarSuprimento(u, "unidade-nao-embalagem", { ...novo, unidadeCompra: "galão" }));
    assert.equal(u.itens.find((i) => i.id === novo.id).tipoEmbalagem, "Outra");
    assert.equal(u.itens.find((i) => i.id === "emb-caixa100").saldo, 100);
  }
  ok(`${tipo}: cadastro, bloqueio de duplicidade, compra, retirada e edição sem alterar o físico`);
}
console.log(`\nComplemento de cadastros: ${grupos} grupos passaram, sem banco.`);
