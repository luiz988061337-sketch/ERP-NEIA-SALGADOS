import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const {
  cancelarContaParcial,
  estornarPagamentoParcial,
  reaisParaCentavos,
  registrarPagamentoParcial,
  resumirContaParcial,
} = await import("@/lib/financeiro-pagamentos.ts");

const conta = (original, extras = {}) => ({
  valorOriginalCentavos: original,
  saldoPagoLegadoCentavos: 0,
  estado: "pendente",
  eventos: [],
  ...extras,
});

function pagamento(c, centavos, chave, id = chave) {
  const result = registrarPagamentoParcial(c, centavos, chave, id);
  if (!result.ok) throw new Error(result.motivo);
  return result;
}

// Modelo sequencial de um lock de servidor. Ele testa a regra de saldo sob
// serialização, mas não comprova que o banco/RPC real implemente esse lock.
function filaSerializada() {
  let fila = Promise.resolve();
  return (operacao) => {
    const proxima = fila.then(operacao);
    fila = proxima.catch(() => {});
    return proxima;
  };
}

test("baixas de 500,00 resultam em saldos 300,00, 150,00 e zero", () => {
  let c = conta(50_000);
  c = pagamento(c, 20_000, "p1").conta;
  assert.equal(resumirContaParcial(c).saldoCentavos, 30_000);
  c = pagamento(c, 15_000, "p2").conta;
  assert.equal(resumirContaParcial(c).saldoCentavos, 15_000);
  c = pagamento(c, 15_000, "p3").conta;
  assert.deepEqual(resumirContaParcial(c), {
    totalPagoCentavos: 50_000,
    saldoCentavos: 0,
    estado: "paga",
  });
});

test("rejeita pagamento superior ao saldo sem alterar o estado original", () => {
  const c = conta(50_000);
  const result = registrarPagamentoParcial(c, 50_001, "p1", "p1");
  assert.deepEqual(result, { ok: false, motivo: "pagamento_superior_ao_saldo" });
  assert.equal(c.eventos.length, 0);
});

test("idempotência repete a operação sem duplicar e detecta chave com payload diferente", () => {
  const c = conta(50_000);
  const first = pagamento(c, 20_000, "p1");
  const replay = registrarPagamentoParcial(first.conta, 20_000, "p1", "outro-id");
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.equal(replay.repetida, true);
  assert.equal(replay.conta.eventos.length, 1);
  assert.equal(registrarPagamentoParcial(first.conta, 15_000, "p1", "p2").ok, false);
});

test("duas baixas concorrentes precisam ser serializadas para não gastar o saldo duas vezes", async () => {
  let c = conta(30_000);
  const executar = filaSerializada();
  const results = await Promise.all([
    executar(() => {
      const result = registrarPagamentoParcial(c, 20_000, "c1", "c1");
      if (result.ok) c = result.conta;
      return result;
    }),
    executar(() => {
      const result = registrarPagamentoParcial(c, 20_000, "c2", "c2");
      if (result.ok) c = result.conta;
      return result;
    }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(
    results.filter((r) => !r.ok && r.motivo === "pagamento_superior_ao_saldo").length,
    1,
  );
  assert.equal(resumirContaParcial(c).saldoCentavos, 10_000);
});

test("estorno é compensatório e cancelamento conserva os eventos", () => {
  const c = pagamento(conta(50_000), 20_000, "p1").conta;
  const estorno = estornarPagamentoParcial(c, "p1", 20_000, "lançamento incorreto", "e1", "e1");
  assert.equal(estorno.ok, true);
  if (!estorno.ok) return;
  assert.equal(estorno.conta.eventos.length, 2);
  assert.equal(resumirContaParcial(estorno.conta).saldoCentavos, 50_000);
  const cancelamento = cancelarContaParcial(estorno.conta);
  assert.equal(cancelamento.ok, true);
  if (cancelamento.ok) {
    assert.equal(cancelamento.conta.estado, "cancelada");
    assert.equal(cancelamento.conta.eventos.length, 2);
  }
});

test("impede estorno acima do pagamento e cancelamento com saldo pago ativo", () => {
  const c = pagamento(conta(50_000), 20_000, "p1").conta;
  assert.equal(estornarPagamentoParcial(c, "p1", 20_001, "erro", "e1", "e1").ok, false);
  assert.deepEqual(cancelarContaParcial(c), { ok: false, motivo: "historico_pago_exige_estorno" });
});

test("conta originalmente quitada não aceita nova baixa", () => {
  const c = conta(50_000, { saldoPagoLegadoCentavos: 50_000, estado: "paga" });
  assert.equal(resumirContaParcial(c).saldoCentavos, 0);
  assert.deepEqual(registrarPagamentoParcial(c, 100, "p1", "p1"), {
    ok: false,
    motivo: "conta_sem_saldo_pagavel",
  });
});

test("pedido vinculado já pago exige revisão para evitar dupla contagem", () => {
  const c = conta(50_000, { pedidoJaPago: true });
  assert.deepEqual(registrarPagamentoParcial(c, 10_000, "p1", "p1"), {
    ok: false,
    motivo: "pedido_ja_pago_requer_revisao",
  });
});

test("valor pago histórico é saldo de abertura, sem parcelas antigas inventadas", () => {
  const c = conta(50_000, { saldoPagoLegadoCentavos: 20_000 });
  assert.equal(resumirContaParcial(c).saldoCentavos, 30_000);
  assert.equal(c.eventos.length, 0);
  const novo = pagamento(c, 10_000, "novo").conta;
  assert.equal(resumirContaParcial(novo).saldoCentavos, 20_000);
  assert.equal(novo.eventos.length, 1);
});

test("estado histórico inconsistente fica em revisão; não se corrige silenciosamente", () => {
  const c = conta(50_000, { saldoPagoLegadoCentavos: 10_000, estado: "paga" });
  assert.equal(resumirContaParcial(c).estado, "revisao_necessaria");
  const cComEventoInvalido = {
    ...c,
    estado: "pendente",
    eventos: [
      {
        id: "e1",
        tipo: "estorno",
        valorCentavos: 15_000,
        pagamentoId: "ausente",
        chaveIdempotencia: "e1",
        motivo: "teste",
      },
    ],
  };
  assert.equal(resumirContaParcial(cComEventoInvalido).estado, "revisao_necessaria");
});

test("zero original requer regra explícita; rejeita zero, negativos e centavos inválidos", () => {
  const zero = conta(0);
  assert.equal(resumirContaParcial(zero).estado, "revisao_necessaria");
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(registrarPagamentoParcial(conta(1_000), value, "bad", "bad").ok, false);
  }
  assert.equal(reaisParaCentavos("0,01"), 1);
  assert.equal(reaisParaCentavos("1.005"), null);
  assert.equal(reaisParaCentavos(1.005), null);
  assert.equal(reaisParaCentavos("-1,00"), null);
  assert.equal(reaisParaCentavos("texto"), null);
});
