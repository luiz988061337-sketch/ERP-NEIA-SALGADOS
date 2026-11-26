import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  categoriasSaboresEstoque,
  normalizarNomeSabor,
  organizarSaboresEstoque,
  saboresEstoque,
} from "../src/lib/catalogo-sabores-estoque.ts";
import { lerSituacaoSalgado } from "../src/lib/situacao-salgados.ts";

test("26 sabores e apelidos únicos, na ordem aprovada e presentes no cadastro SQL", () => {
  assert.deepEqual(
    categoriasSaboresEstoque.map(({ id }) => id),
    ["fritos", "mini-pasteis", "assados", "empadas", "mini-pizzas"],
  );
  assert.deepEqual(
    categoriasSaboresEstoque.map(({ id }) => saboresEstoque.filter((s) => s[1] === id).length),
    [9, 4, 8, 2, 3],
  );
  assert.equal(new Set(saboresEstoque.map(([id]) => id)).size, 26);
  assert.deepEqual(saboresEstoque.slice(-2).map(([id]) => id), [
    "trouxinha-calabresa",
    "enroladinho-salsicha",
  ]);
  const nomes = saboresEstoque.flatMap(([, , ...apelidos]) => apelidos.map(normalizarNomeSabor));
  assert.equal(new Set(nomes).size, nomes.length);
  assert.equal(
    nomes.some((nome) => nome.includes("mini enroladinho de salsicha 20un")),
    false,
  );
  const sql = readFileSync(new URL("./cadastrar-sabores-estoque.sql", import.meta.url), "utf8");
  assert.match(sql, /NULL::uuid/);
  assert.match(sql, /ON CONFLICT \(chave\) DO NOTHING/);
  assert.match(sql, /Vínculo preexistente preservado/);
  assert.doesNotMatch(sql, /ON CONFLICT \(chave\) DO UPDATE SET produto_id/);
  const linhas = [
    ...sql.matchAll(/^\s*\('([^']+)', '([^']+)', '([^']+)', (\d+), ARRAY\[(.*)\]\)/gm),
  ];
  assert.deepEqual(
    linhas.map(([, id, categoria, nome, ordem, apelidos]) => [
      id,
      categoria,
      nome,
      Number(ordem),
      [...apelidos.matchAll(/'([^']+)'/g)].map(([, apelido]) => apelido),
    ]),
    saboresEstoque.map(([id, categoria, nome, ...apelidos], indice) => [
      id,
      categoria,
      nome,
      indice + 1,
      [nome, ...apelidos],
    ]),
  );
});

const produto = (id, nome, campos = {}) => ({
  id,
  nome,
  imagem_url: null,
  tipo_venda: "combo_50",
  unidade_medida: "un",
  categorias: { slug: "mini-fritos" },
  ...campos,
});

test("reaproveita o ID unitário e a foto do catálogo sem tratar caixas como sabores", () => {
  const unitario = produto("u", "Esfiha de brócolis");
  const caixa = produto("c", "Mini esfiha de brócolis 50un", { imagem_url: "/foto-real.jpg" });
  const { sabores, legados } = organizarSaboresEstoque([unitario, caixa], null);
  const sabor = sabores.find((s) => s.chave === "esfirra-brocolis");
  assert.equal(sabor.categoria, "assados");
  assert.equal(sabor.produto.id, "u");
  assert.equal(sabor.imagem, "/foto-real.jpg");
  assert.deepEqual(
    legados.map((p) => p.id),
    ["c"],
  );
});

test("preserva vínculo confirmado e deixa nomes ambíguos ou embalagens para revisão", () => {
  const unitario = produto("u", "Mini coxinha");
  const outro = produto("a", "Coxinha de frango");
  const embalagem = produto("p", "Bolinha de queijo", { unidade_medida: "pacote" });
  const congelado = produto("f", "Croquete", {
    categorias: { slug: "mini-congelados" },
    tipo_venda: "unidade",
  });
  const salsicha20un = produto("s", "Mini Enroladinho de Salsicha 20un");
  const produtos = [unitario, outro, embalagem, congelado, salsicha20un];
  const semVinculos = organizarSaboresEstoque(produtos, null);
  assert.equal(semVinculos.sabores.filter((s) => s.produto).length, 0);
  assert.equal(semVinculos.legados.length, 5);
  assert.equal(
    semVinculos.sabores.find((s) => s.chave === "enroladinho-salsicha").produto,
    undefined,
  );
  const comVinculos = organizarSaboresEstoque(produtos, [
    { chave: "coxinha-frango", produto_id: "u" },
  ]);
  assert.equal(comVinculos.sabores[0].produto.id, "u");
  const pendente = organizarSaboresEstoque(
    [unitario],
    [{ chave: "coxinha-frango", produto_id: null }],
  );
  assert.equal(pendente.sabores[0].produto, undefined);
});

const hoje = "2026-11-26";
const estoque = (campos = {}) => ({
  fisico: 0,
  reservado: 0,
  minimo: 0,
  temMovimento: false,
  lotesTodos: [],
  ...campos,
});

test("cadastro sem estoque usa valores ausentes e cadastro movimentado a zero usa zero", () => {
  assert.equal(lerSituacaoSalgado(undefined, hoje).fisico, null);
  const semEstoque = lerSituacaoSalgado(estoque(), hoje);
  assert.deepEqual(semEstoque.alertas, ["semEstoque"]);
  assert.equal(semEstoque.reservado, null);
  assert.equal(semEstoque.minimo, null);
  const zerado = lerSituacaoSalgado(estoque({ temMovimento: true }), hoje);
  assert.equal(zerado.fisico, 0);
  assert.deepEqual(zerado.alertas, ["zerado", "semMinimo"]);
});

test("mantém alertas simultâneos e encontra o próximo vencimento de lotes ativos", () => {
  const lote = (validade, status = "ativo", restante = 20) => ({ validade, status, restante });
  const situacao = lerSituacaoSalgado(
    estoque({
      fisico: 20,
      reservado: 30,
      minimo: 50,
      lotesTodos: [
        lote("2026-12-04"),
        lote("2026-11-25", "vencido"),
        lote("2026-12-03"),
        lote(hoje, "esgotado", 0),
      ],
    }),
    hoje,
  );
  assert.equal(situacao.disponivel, -10);
  assert.equal(situacao.proximaValidade, "2026-12-03");
  assert.equal(situacao.vencendo, 1);
  assert.deepEqual(situacao.alertas, ["vencido", "excedente", "abaixo", "vencendo"]);
  assert.deepEqual(
    lerSituacaoSalgado(
      estoque({
        fisico: 20,
        minimo: 10,
        lotesTodos: [lote("2026-12-04")],
      }),
      hoje,
    ).alertas,
    ["normal"],
  );
});
