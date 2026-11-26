import assert from "node:assert/strict";
import test from "node:test";
import { validarMovimentoSalgados as validar } from "../src/lib/operacoes-salgados.ts";

const base = {
  tipo: "entrada",
  quantidade: "40",
  codigo: "LOTE-01",
  fabricacao: "2026-11-25",
  validade: "2026-12-07",
  motivo: "Conferência",
  hoje: "2026-11-26",
  lote: { restante: 40 },
  disponivel: 15,
  reserva: undefined,
  pedido: "",
};

test("entrada exige quantidade inteira, código e datas válidas", () => {
  assert.equal(validar(base), null);
  for (const dados of [
    { quantidade: "2.5" },
    { codigo: "" },
    { fabricacao: "2026-11-27" },
    { validade: "2026-11-25" },
  ])
    assert.notEqual(validar({ ...base, ...dados }), null);
});

test("perda exige saldo do lote, justificativa e preserva o reservado", () => {
  assert.equal(validar({ ...base, tipo: "perda", quantidade: "15" }), null);
  assert.match(validar({ ...base, tipo: "perda", quantidade: "16" }), /reservas/);
  assert.match(validar({ ...base, tipo: "perda", quantidade: "41" }), /saldo do lote/);
  assert.match(validar({ ...base, tipo: "perda", motivo: "" }), /motivo/);
  assert.equal(
    validar({ ...base, tipo: "perda", lote: { restante: 40, inutilizavel: true } }),
    null,
  );
});

test("inventário aceita zero sem reserva e protege o saldo reservado", () => {
  assert.equal(validar({ ...base, tipo: "ajuste", quantidade: "0", disponivel: 40 }), null);
  assert.match(validar({ ...base, tipo: "ajuste", quantidade: "0" }), /preservar/);
  assert.match(validar({ ...base, tipo: "ajuste" }), /diferença/);
});

test("retirada e liberação validam os respectivos vínculos", () => {
  assert.match(validar({ ...base, tipo: "retirada" }), /ultrapassa/);
  assert.equal(validar({ ...base, tipo: "retirada", reserva: { pendente: 45 } }), null);
  assert.match(validar({ ...base, tipo: "liberar" }), /pedido/);
});
