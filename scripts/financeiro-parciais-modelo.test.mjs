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
const { competenciaSaoPaulo, montarDRE, montarFluxoCaixaMensal, totalContas } = await import("@/lib/financeiro.ts");

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

test("indicadores mostram saldo restante e DRE inclui somente o valor efetivamente pago", () => {
  assert.equal(
    totalContas([{ tipo: "pagar", valor: 500, valor_pago: 200, status: "pendente" }], "pagar"),
    300,
  );
  const parcial = montarDRE([], [
    { tipo: "pagar", categoria: "insumos", valor: 500, valor_pago: 200, status: "pendente" },
    { tipo: "pagar", categoria: "despesas", valor: 300, valor_pago: 0, status: "paga" },
  ]);
  assert.equal(parcial.cmv, 200);
  assert.equal(parcial.despesas, 300, "conta histórica paga sem ledger detalhado permanece compatível");
});

test("sangria não vira despesa; despesas reais e pagamentos parciais continuam na DRE", () => {
  const dre = montarDRE([], [
    { tipo: "pagar", categoria: "sangria", valor: 120, valor_pago: 120, status: "paga" },
    { tipo: "pagar", categoria: "despesas", valor: 500, valor_pago: 200, status: "pendente" },
    { tipo: "pagar", categoria: "insumos", valor: 300, valor_pago: 100, status: "pendente" },
  ]);
  assert.equal(dre.despesas, 200, "somente a parcela paga da despesa operacional entra como despesa");
  assert.equal(dre.cmv, 100, "pagamento parcial de insumos permanece como CMV");
});

test("suprimento é transferência, não recebimento operacional, mantendo o movimento físico", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [
      { id: "suprimento", tipo: "receber", categoria: "suprimento", meio: "dinheiro" },
      { id: "receita", tipo: "receber", categoria: "vendas", meio: "pix" },
      { id: "sangria", tipo: "pagar", categoria: "sangria", meio: "dinheiro" },
      { id: "despesa", tipo: "pagar", categoria: "despesas", meio: "dinheiro" },
    ],
    eventos: [
      { conta_id: "suprimento", tipo: "pagamento", valor_centavos: 10_000, created_at: "2026-10-12T15:00:00Z" },
      { conta_id: "receita", tipo: "pagamento", valor_centavos: 20_000, created_at: "2026-10-12T15:00:00Z" },
      { conta_id: "sangria", tipo: "pagamento", valor_centavos: 3_000, created_at: "2026-10-12T15:00:00Z" },
      { conta_id: "despesa", tipo: "pagamento", valor_centavos: 4_000, created_at: "2026-10-12T15:00:00Z" },
    ],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].entradasCentavos, 30_000, "caixa registra receita e suprimento físico");
  assert.equal(resultado[0].saidasCentavos, 7_000, "caixa registra despesa e sangria física");
  assert.equal(resultado[0].entradasOperacionaisCentavos, 20_000, "suprimento não é receita operacional");
  assert.equal(resultado[0].pagamentos, 1, "suprimento não infla a contagem de recebimentos");

  const sessaoDinheiro = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [
      { id: "suprimento", tipo: "receber", categoria: "suprimento", meio: "dinheiro" },
      { id: "sangria", tipo: "pagar", categoria: "sangria", meio: "dinheiro" },
    ],
    eventos: [
      { conta_id: "suprimento", tipo: "pagamento", valor_centavos: 10_000, created_at: "2026-10-12T15:00:00Z" },
      { conta_id: "sangria", tipo: "pagamento", valor_centavos: 3_000, created_at: "2026-10-12T15:00:00Z" },
    ],
    pedidosPagos: [],
    meiosIncluidos: ["dinheiro"],
  });
  assert.equal(sessaoDinheiro[0].entradasContasCentavos, 10_000, "suprimento soma ao caixa físico");
  assert.equal(sessaoDinheiro[0].saidasContasCentavos, 3_000, "sangria reduz o caixa físico");
  assert.equal(sessaoDinheiro[0].eventosContaMeioDesconhecido, 0, "tipo dinheiro é conhecido pela RPC interna");
});

test("filtro Pix não inclui sangria nem suprimento em dinheiro; fluxo geral continua físico", () => {
  const contas = [
    { id: "suprimento", tipo: "receber", categoria: "suprimento", meio: "dinheiro" },
    { id: "sangria", tipo: "pagar", categoria: "sangria", meio: "dinheiro" },
  ];
  const eventos = [
    { conta_id: "suprimento", tipo: "pagamento", valor_centavos: 8_000, created_at: "2026-10-12T15:00:00Z" },
    { conta_id: "sangria", tipo: "pagamento", valor_centavos: 2_000, created_at: "2026-10-12T15:00:00Z" },
  ];
  const base = { competencias: ["2026-10"], contas, eventos, pedidosPagos: [] };
  const geral = montarFluxoCaixaMensal(base)[0];
  assert.equal(geral.entradasCentavos, 8_000);
  assert.equal(geral.saidasCentavos, 2_000);

  const pix = montarFluxoCaixaMensal({ ...base, meiosIncluidos: ["pix"] })[0];
  assert.equal(pix.entradasCentavos, 0);
  assert.equal(pix.saidasCentavos, 0);
  assert.equal(pix.entradasContasCentavos, 0);
  assert.equal(pix.saidasContasCentavos, 0);
  assert.equal(pix.eventosContaMeioDesconhecido, 0, "o meio dinheiro é conhecido, apenas não pertence ao filtro Pix");
});

test("recebimentos parciais são distribuídos pelo instante do ledger, não pela conta agregada", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"],
    contas: [{ id: "c1", tipo: "receber", meio: "pix", status: "paga", valor: 100, valor_pago: 100, pago_em: "2026-11-15T12:00:00-03:00" }],
    eventos: [
      { conta_id: "c1", tipo: "pagamento", valor_centavos: 4000, created_at: "2026-10-15T15:00:00Z" },
      { conta_id: "c1", tipo: "pagamento", valor_centavos: 6000, created_at: "2026-11-15T15:00:00Z" },
    ],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].entradasCentavos, 4000);
  assert.equal(resultado[1].entradasCentavos, 6000);
});

test("pedido de 100 pago em 40/60 só entra nas competências dos eventos e não duplica total/pagamento_em", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"],
    contas: [],
    eventos: [],
    eventosPedidos: [
      { pedido_id: "p1", tipo: "pagamento", valor_centavos: 4000, forma_pagamento: "pix", created_at: "2026-10-15T15:00:00Z" },
      { pedido_id: "p1", tipo: "pagamento", valor_centavos: 6000, forma_pagamento: "pix", created_at: "2026-11-15T15:00:00Z" },
    ],
    pedidosPagos: [{ id: "p1", total: 100, status: "recebido", pagamento_status: "pago", pagamento_em: "2026-11-15T15:00:00Z" }],
  });
  assert.equal(resultado[0].entradasCentavos, 4000);
  assert.equal(resultado[1].entradasCentavos, 6000);
});

test("pedido ligado a conta a receber não duplica os dois ledgers", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [{ id: "c1", pedido_id: "p1", tipo: "receber", meio: "pix", status: "paga", valor: 100, valor_pago: 100 }],
    eventos: [{ conta_id: "c1", tipo: "pagamento", valor_centavos: 10_000, created_at: "2026-10-15T15:00:00Z" }],
    eventosPedidos: [{ pedido_id: "p1", tipo: "pagamento", valor_centavos: 10_000, forma_pagamento: "pix", created_at: "2026-10-15T15:00:00Z" }],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].entradasCentavos, 10_000);

  const pedidoComLedgerDataConfiavel = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [{ id: "c2", pedido_id: "p2", tipo: "receber", status: "paga", valor: 100, valor_pago: 100 }],
    eventos: [],
    eventosPedidos: [{ pedido_id: "p2", tipo: "pagamento", valor_centavos: 10_000, forma_pagamento: "pix", created_at: "2026-10-15T15:00:00Z" }],
    pedidosPagos: [],
  });
  assert.equal(pedidoComLedgerDataConfiavel[0].entradasCentavos, 10_000,
    "ledger de pedido com data confiável não some por causa de agregado legado sem eventos");
});

test("estorno reduz o caixa na competência em que foi registrado", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"],
    contas: [{ id: "c1", tipo: "receber", meio: "pix" }],
    eventos: [
      { conta_id: "c1", tipo: "pagamento", valor_centavos: 5000, created_at: "2026-10-31T20:00:00-03:00" },
      { conta_id: "c1", tipo: "estorno", valor_centavos: 1500, created_at: "2026-11-02T12:00:00-03:00" },
    ],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].entradasCentavos, 5000);
  assert.equal(resultado[1].entradasCentavos, -1500);
  assert.equal(resultado[1].estornos, 1);
});

test("pagamento de conta a pagar não é contado como recebimento", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [{ id: "saida", tipo: "pagar", meio: "dinheiro" }],
    eventos: [{ conta_id: "saida", tipo: "pagamento", valor_centavos: 2500, created_at: "2026-10-15T15:00:00Z" }],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].saidasCentavos, 2500);
  assert.equal(resultado[0].pagamentos, 0);
  assert.equal(resultado[0].entradasCentavos, 0);
});

test("baixa de conta sem meio por evento não é atribuída artificialmente ao caixa físico", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10"],
    contas: [{ id: "c1", tipo: "receber", meio: "dinheiro" }],
    eventos: [{ conta_id: "c1", tipo: "pagamento", valor_centavos: 2500, created_at: "2026-10-15T15:00:00Z" }],
    pedidosPagos: [], aPartirDe: "2026-10-01T03:00:00Z", meiosIncluidos: ["dinheiro"],
  });
  assert.equal(resultado[0].entradasContasCentavos, 0);
  assert.equal(resultado[0].eventosContaMeioDesconhecido, 1);
});

test("estorno de pedido é negativo na data do evento sem alterar a competência original", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"], contas: [], eventos: [], pedidosPagos: [],
    eventosPedidos: [
      { pedido_id: "p1", tipo: "pagamento", valor_centavos: 10_000, forma_pagamento: "pix", created_at: "2026-10-15T15:00:00Z" },
      { pedido_id: "p1", tipo: "estorno", valor_centavos: 2_500, forma_pagamento: "pix", created_at: "2026-11-02T15:00:00Z" },
    ],
  });
  assert.deepEqual(resultado.map((periodo) => periodo.entradasCentavos), [10_000, -2_500]);
  assert.equal(resultado[1].estornos, 1);
});

test("pedido pago entra pela data do pagamento, mantendo a DRE fora desse cálculo", () => {
  const pedido = { id: "p1", total: 100, status: "recebido", pagamento_status: "pago", pagamento_em: "2026-11-01T01:00:00Z" };
  const resultado = montarFluxoCaixaMensal({ competencias: ["2026-10", "2026-11"], eventos: [], contas: [], pedidosPagos: [pedido] });
  assert.equal(resultado[0].entradasCentavos, 10000, "01:00Z ainda pertence a outubro no fuso de São Paulo");
  assert.equal(resultado[1].entradasCentavos, 0);
  assert.equal(montarDRE([{ total: 100, status: "recebido" }], []).bruta, 100,
    "reconhecimento da receita segue o pedido e não foi deslocado para o fluxo de caixa");
});

test("agregado da conta não duplica eventos e histórico sem data não é inventado", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"],
    contas: [
      { id: "c1", tipo: "receber", status: "paga", valor: 100, valor_pago: 100, pago_em: "2026-11-15T12:00:00-03:00" },
      { id: "c2", tipo: "receber", status: "paga", valor: 40, valor_pago: 40, pago_em: null },
    ],
    eventos: [{ conta_id: "c1", tipo: "pagamento", valor_centavos: 10000, created_at: "2026-11-15T15:00:00Z" }],
    pedidosPagos: [],
  });
  assert.equal(resultado[1].entradasCentavos, 10000);
  assert.equal(resultado[0].entradasCentavos, 0);
  assert.equal(resultado[1].eventosSemData, 1, "agregado sem eventos detalhados não recebe data artificial de pago_em");
  assert.ok(resultado.some((periodo) => periodo.eventosSemData > 0));
});

test("pagamentos de pedidos sem data confiável são omitidos e contabilizados como não atribuíveis", () => {
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-10", "2026-11"],
    contas: [], eventos: [], pedidosPagos: [], pedidosPagosSemData: 2,
  });
  assert.deepEqual(resultado.map((periodo) => periodo.entradasCentavos), [0, 0]);
  assert.deepEqual(resultado.map((periodo) => periodo.eventosSemData), [2, 2]);
});

test("fronteiras UTC usam America/Sao_Paulo e preservam a virada de ano", () => {
  assert.equal(competenciaSaoPaulo("2026-11-01T02:59:59Z"), "2026-10");
  assert.equal(competenciaSaoPaulo("2026-11-01T03:00:00Z"), "2026-11");
  const resultado = montarFluxoCaixaMensal({
    competencias: ["2026-12", "2027-01"],
    contas: [{ id: "c1", tipo: "pagar", meio: "dinheiro" }],
    eventos: [
      { conta_id: "c1", tipo: "pagamento", valor_centavos: 100, created_at: "2027-01-01T02:59:59Z" },
      { conta_id: "c1", tipo: "pagamento", valor_centavos: 200, created_at: "2027-01-01T03:00:00Z" },
    ],
    pedidosPagos: [],
  });
  assert.equal(resultado[0].saidasCentavos, 100);
  assert.equal(resultado[1].saidasCentavos, 200);
});
