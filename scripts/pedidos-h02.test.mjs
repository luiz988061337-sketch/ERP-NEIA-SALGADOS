import assert from "node:assert/strict";
import { test } from "node:test";
import {
  atrasoH02,
  correspondeH02,
  FILTROS_H02,
  grupoH02,
  resumoH02,
  trocoSolicitadoH02,
  unidadesSalgadosH02,
} from "../src/lib/pedidos-h02.ts";
import { abaAdministrativa, ehAbaAdministrativa } from "../src/lib/paineis-staff.ts";

const agora = Date.parse("2026-11-26T13:00:00-03:00");
const base = {
  numero: 123,
  cliente_nome: "João Teste",
  telefone: "(11) 98765-4321",
  status: "recebido",
  tipo_entrega: "entrega",
  forma_pagamento: "pix",
  pagamento_status: "pendente",
  origem_cliente: "Loja",
  campanha_origem: "",
  agendado_para: null,
  pedido_itens: [{ nome: "Coxinha de frango" }],
  total: 100,
};

test("Pedidos e Central da Atendente resolvem abas independentes", () => {
  assert.equal(abaAdministrativa("#pedidos"), "pedidos");
  assert.equal(abaAdministrativa("#central-atendente"), "central-atendente");
  assert.equal(abaAdministrativa("#dashboard"), "dashboard");
  assert.ok(ehAbaAdministrativa("central-atendente"));
});

test("mapeia registros atuais, aceite legado, pronto e histórico sem novos estados", () => {
  assert.equal(grupoH02(base), "novos");
  assert.equal(grupoH02({ ...base, status: "aceito" }), "aceitos");
  const aceito = {
    ...base,
    status: "em_producao",
    producao_status: "aguardando",
    aceito_em_atendente: "2026-11-26",
  };
  assert.equal(grupoH02(aceito), "aceitos");
  assert.equal(grupoH02({ ...aceito, preparo_em: "2026-11-26" }), "producao");
  for (const [status, grupo] of [
    ["pronto", "prontos"],
    ["aguardando_motoboy", "prontos"],
    ["em_rota", "entrega"],
    ["entregue", "finalizados"],
    ["retirado", "finalizados"],
    ["cancelado", "cancelados"],
  ])
    assert.equal(grupoH02({ ...base, status }), grupo);
});

test("usa atraso registrado ou agendamento e distingue prazo ausente", () => {
  assert.equal(atrasoH02(base, agora), null);
  assert.equal(atrasoH02({ ...base, agendado_para: "2026-11-26T12:00:00-03:00" }, agora), true);
  assert.equal(atrasoH02({ ...base, status: "cancelado", atrasado: true }, agora), false);
  assert.equal(resumoH02([base], agora).atrasados, null);
  assert.equal(resumoH02([], agora).atrasados, 0);
});

test("busca sem acentos por nome, número, telefone e sabor e combina filtros", () => {
  for (const busca of ["joao", "#123", "98765-4321", "coxinha"])
    assert.equal(correspondeH02(base, { ...FILTROS_H02, busca }, agora), true);
  assert.equal(
    correspondeH02(base, { ...FILTROS_H02, busca: "cliente 123", grupo: "novos" }, agora),
    false,
  );
  const filtros = {
    ...FILTROS_H02,
    grupo: "novos",
    modalidade: "entrega",
    agenda: "imediato",
    forma: "pix",
    pagamento: "pendente",
    origem: "Loja",
  };
  assert.equal(correspondeH02(base, filtros, agora), true);
  assert.equal(correspondeH02(base, { ...filtros, atrasados: true }, agora), false);
  assert.equal(
    correspondeH02({ ...base, atrasado: true }, { ...filtros, atrasados: true }, agora),
    true,
  );
});

test("total exclui cancelados e respeita valor ou pagamento desconhecido", () => {
  assert.equal(resumoH02([base, { ...base, status: "cancelado", total: 700 }], agora).total, 100);
  assert.equal(resumoH02([{ ...base, total: null, pagamento_status: "" }], agora).total, null);
  assert.equal(resumoH02([{ ...base, pagamento_status: "" }], agora).pendentes, null);
});

test("conta composição de combo uma vez e evita estimar caixas sem conversão", () => {
  const produtos = new Map([
    [
      "unitario",
      { tipo_venda: "combo_50", unidade_medida: "un", categorias: { slug: "mini-fritos" } },
    ],
  ]);
  assert.equal(
    unidadesSalgadosH02([{ nome: "Coxinha", quantidade: 50, produto_id: "unitario" }], produtos),
    50,
  );
  assert.equal(
    unidadesSalgadosH02(
      [{ nome: "Coxinha 25un", quantidade: 2, produto_id: "unitario" }],
      produtos,
    ),
    null,
  );
  assert.equal(
    unidadesSalgadosH02(
      [{ quantidade: 100, pedido_item_componentes: [{ quantidade: 75 }, { quantidade: 25 }] }],
      produtos,
    ),
    100,
  );
  assert.equal(trocoSolicitadoH02("Separar caixas [Troco para R$ 150,00]"), "R$ 150,00");
});
