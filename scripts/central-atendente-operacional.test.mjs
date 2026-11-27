import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

register("./alias-loader.mjs", import.meta.url);

const { limitePrometido, janelaPrometida, categoriaTemAssadoComercial, horaPrometida } =
  await import("@/lib/prazo-pedido");
const { atrasoCentral, avisoDoPedido, lerReconhecidos, gravarReconhecidos } =
  await import("@/lib/central-pedidos");
const { estadoPrazoProducao, entradaJanelaProducao, ordenarFilaProducao } =
  await import("@/lib/motor-producao");

const inicio = "2026-11-27T16:00:00Z";
const limite = "2026-11-27T16:30:00Z";

test("janela comercial persistida é exibida em horário de São Paulo", () => {
  const pedido = { prazo_prometido_inicio_em: inicio, prazo_prometido_em: limite };
  assert.deepEqual(janelaPrometida(pedido), { inicio, limite });
  assert.equal(limitePrometido(pedido), limite);
  assert.equal(horaPrometida(limite), "13:30");
  assert.equal(janelaPrometida({ ...pedido, prazo_prometido_inicio_em: "agenda inválida" }), null);
  assert.equal(limitePrometido({ created_at: inicio }), null);
});

test("agendamento tem precedência e mantém a entrada na cozinha 1h30 antes", () => {
  const agendado = "2026-11-29T19:00:00Z";
  const pedido = { agendado_para: agendado, prazo_prometido_em: limite };
  assert.deepEqual(janelaPrometida(pedido), { inicio: agendado, limite: agendado });
  assert.equal(entradaJanelaProducao(agendado).toISOString(), "2026-11-29T17:30:00.000Z");
});

test("atraso e fila usam o mesmo limite comercial, sem estimar no histórico", () => {
  const base = { id: "a", status: "em_producao", created_at: inicio, prazo_prometido_em: limite };
  const agora = new Date("2026-11-27T16:31:00Z");
  assert.equal(atrasoCentral(base, agora.getTime()), true);
  assert.equal(atrasoCentral({ ...base, prazo_prometido_em: null }, agora.getTime()), null);
  const estado = { status: base.status, recebidoEm: inicio, solicitadoPara: null };
  assert.equal(
    estadoPrazoProducao({ ...estado, limiteComercialEm: limite }, null, agora).nivel,
    "atrasado",
  );
  assert.equal(
    estadoPrazoProducao({ ...estado, limiteComercialEm: null }, 5, agora).nivel,
    "normal",
  );
  const historico = { ...base, id: "b", prazo_prometido_em: null };
  assert.equal(ordenarFilaProducao([historico, base], agora)[0].id, "a");
});

test("só combos com categoria assada cadastrada recebem o adicional no checkout legado", () => {
  assert.equal(categoriaTemAssadoComercial("mini-assados"), true);
  assert.equal(categoriaTemAssadoComercial("mini-pizzas"), true);
  assert.equal(categoriaTemAssadoComercial("mini-empadinhas"), true);
  assert.equal(categoriaTemAssadoComercial("mini-assados-congelados"), false);
  assert.equal(categoriaTemAssadoComercial("mini-assados", "congelado"), false);
  assert.equal(categoriaTemAssadoComercial("mini-pasteis"), false);
  assert.equal(categoriaTemAssadoComercial(undefined), false);
});

test("aviso usa a modalidade certa e o reconhecimento fica separado por operador", () => {
  const id = "ab12";
  const entrega = { id: "n1", tipo: "pedido_pronto_caixa", link: "/central-entregas?pedido=AB12" };
  const retirada = { ...entrega, id: "n2", tipo: "pedido_liberado_retirada" };
  assert.equal(avisoDoPedido([entrega, retirada, retirada], id, "retirada")?.id, "n2");
  assert.equal(avisoDoPedido([retirada, entrega], id, "entrega")?.id, "n1");

  const anterior = globalThis.localStorage;
  const dados = new Map();
  globalThis.localStorage = {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
  };
  try {
    gravarReconhecidos(new Set([retirada.tipo + ":" + id]), "operador-1");
    assert.deepEqual([...lerReconhecidos("operador-1")], [retirada.tipo + ":" + id]);
    assert.equal(lerReconhecidos("operador-2").size, 0);
    assert.equal(lerReconhecidos().size, 0);
  } finally {
    globalThis.localStorage = anterior;
  }
});
