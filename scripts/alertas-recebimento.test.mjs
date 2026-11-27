import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";
register("./alias-loader.mjs", import.meta.url);

const { alertasOperacionais, gruposSonoros, MENSAGENS_ALERTA } = await import("@/lib/alertas-operacionais");
const { centavosInformados, confirmarValorRecebido } = await import("@/lib/recebimento-retirada");
const { atrasoH02, rotuloQuantidadePedido } = await import("@/lib/pedidos-h02");
const { aguardandoAtribuicaoCentral, podeOperarEntregas } = await import("@/lib/central-atribuicao");
const agora = Date.parse("2026-11-27T20:00:00Z");
const pedido = (id, extra = {}) => ({
  id, numero: 1, status: "recebido", tipo_entrega: "entrega", created_at: "2026-11-27T19:30:00Z", ...extra,
});
const aviso = (id, tipo) => ({ id, tipo, link: "/central-entregas?pedido=" + id });

test("aguardando aceite, reconhecimento individual e agrupamento de lembretes", () => {
  const pedidos = [pedido("aa11"), pedido("aa22"), pedido("aa33", { aceito_em_atendente: "2026-11-27" })];
  const alertas = alertasOperacionais(pedidos, [], ["atendente"], agora);
  assert.deepEqual(alertas.map(a => a.chave), ["aa11", "aa22"]);
  assert.deepEqual(gruposSonoros(alertas, new Set(), false), ["novo"]);
  assert.deepEqual(gruposSonoros(alertas.filter(a => a.chave !== "aa11"), new Set(["aa11","aa22"]), true), ["lembrete"]);
  assert.deepEqual(gruposSonoros(alertas, new Set(["aa11"]), true), ["novo"]);
});

test("avisos duplicados compõem uma fila única e cada perfil vê suas modalidades", () => {
  const pedidos = [
    pedido("aa11", { status: "pronto", tipo_entrega: "retirada" }),
    pedido("aa22", { status: "pronto" }),
    pedido("aa33", { status: "aguardando_motoboy", motoboy_id: "atribuído" }),
  ];
  const avisos = [aviso("aa11","pedido_liberado_retirada"), aviso("aa22","pedido_pronto_caixa"),
    aviso("aa22","pedido_pronto_caixa"), aviso("aa33","pedido_pronto_caixa")];
  assert.deepEqual(alertasOperacionais(pedidos, avisos, ["admin"], agora).map(a => a.tipo), ["retirada", "entrega"]);
  assert.deepEqual(alertasOperacionais(pedidos, avisos, ["producao"], agora).map(a => a.tipo), ["entrega"]);
  assert.deepEqual(alertasOperacionais(pedidos, avisos, ["cliente"], agora), []);
  assert.equal(Object.keys(MENSAGENS_ALERTA).length, 5);
});

test("atraso desaparece após a resolução do pedido e H02 usa prazo imediato", () => {
  const prazo = "2026-11-27T19:58:00Z";
  const p = pedido("aa11", { status: "em_rota", prazo_prometido_em: prazo });
  assert.equal(atrasoH02(p, agora), true);
  assert.equal(atrasoH02({ ...p, agendado_para: "2026-11-28T19:58:00Z" }, agora), false);
  assert.deepEqual(alertasOperacionais([p], [], ["producao"], agora).map(a => a.tipo), ["atraso"]);
  assert.deepEqual(alertasOperacionais([{ ...p, status: "entregue" }], [], ["producao"], agora), []);
});

test("quantidade ambígua continua visível sem converter o pacote em unidades", () => {
  assert.equal(rotuloQuantidadePedido([{ quantidade: 50 }], null), "50 na quantidade registrada · unidade a conferir");
  assert.equal(rotuloQuantidadePedido([], null), "Quantidade não informada");
});

test("dinheiro exige valor entregue, calcula troco e preserva recebimento parcial", () => {
  assert.equal(centavosInformados("12,34"), 1234);
  assert.equal(centavosInformados("12,345"), null);
  assert.equal(confirmarValorRecebido(1500, null, 2000, true), null);
  assert.equal(confirmarValorRecebido(2100, 2200, 2000, true), null);
  assert.deepEqual(confirmarValorRecebido(1500, 2000, 2000, true), { valor: 1500, troco: 500 });
  assert.deepEqual(confirmarValorRecebido(2000, null, 2000, false), { valor: 2000, troco: 0 });
});

test("atalhos preservam a permissão de Entregas e a elegibilidade de despacho", () => {
  const entrega = pedido("aa11", { status: "pronto" });
  assert.equal(aguardandoAtribuicaoCentral(entrega), true);
  assert.equal(aguardandoAtribuicaoCentral({ ...entrega, rota_id: "rota" }), false);
  assert.equal(aguardandoAtribuicaoCentral({ ...entrega, tipo_entrega: "retirada" }), false);
  assert.equal(aguardandoAtribuicaoCentral({ ...entrega, status: "em_rota" }), false);
  assert.equal(podeOperarEntregas(["admin"]), true);
  assert.equal(podeOperarEntregas(["producao"]), true);
  assert.equal(podeOperarEntregas(["atendente"]), false);
});
