import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const carregar = (arquivo, trocar = (codigo) => codigo) => {
  const source = readFileSync(new URL(arquivo, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  });
  return "data:text/javascript;base64," + Buffer.from(trocar(outputText)).toString("base64");
};

const competencia = carregar("../src/lib/competencia.ts");
const motor = carregar("../src/lib/motor-producao.ts");
const {
  cargaCozinha,
  contem,
  faixaAnterior,
  faixaDashboard,
  margemDashboard,
  mediaMinutos,
  pertenceAoGrupo,
  resumirClientes,
  resumirVendas,
  serieVendas,
  STATUS_DASHBOARD,
  variacao,
} = await import(
  carregar("../src/lib/dashboard-a01.ts", (src) =>
    src
      .replace('"./competencia"', JSON.stringify(competencia))
      .replace('"./motor-producao"', JSON.stringify(motor)),
  )
);
const { montarFluxoCaixaMensal } = await import(carregar("../src/lib/financeiro.ts"));

function pedido(patch = {}) {
  return {
    id: "pedido",
    status: "recebido",
    total: 100,
    subtotal: 100,
    desconto: 0,
    created_at: "2026-11-25T03:00:00.000Z",
    aceito_em_atendente: null,
    aceito_em: null,
    atrasado: false,
    agendado_para: null,
    pedido_itens: [{ produto_id: "coxinha", nome: "Coxinha de frango", quantidade: 50 }],
    ...patch,
  };
}

test("intervalos usam meia-noite em São Paulo e incluem só o começo", () => {
  const faixa = faixaDashboard("2026-11-25", "2026-12-01");
  assert.deepEqual(
    [faixa.ini, faixa.fim, faixa.dias],
    ["2026-11-25T03:00:00.000Z", "2026-12-02T03:00:00.000Z", 7],
  );
  assert.equal(contem(faixa, "2026-11-24T23:59:59.999-03:00"), false);
  assert.equal(contem(faixa, "2026-11-25T00:00:00-03:00"), true);
  assert.equal(contem(faixa, faixa.fim), false);
  assert.deepEqual(
    [faixaAnterior(faixa).inicio, faixaAnterior(faixa).fim],
    ["2026-11-18", faixa.ini],
  );
  assert.equal(faixaDashboard("2026-02-30", "2026-03-01"), null);
  assert.equal(faixaDashboard("2026-11-30", "2026-11-25"), null);
});

test("faturamento, volume, ticket e gráfico excluem cancelamento e alinham o período anterior", () => {
  const atual = resumirVendas([
    pedido({ id: "a", total: 60, created_at: "2026-11-25T12:15:00Z" }),
    pedido({ id: "b", total: 40, created_at: "2026-11-25T12:45:00Z" }),
    pedido({ id: "c", status: "cancelado", total: 500 }),
  ]);
  const anterior = resumirVendas([pedido({ total: 80, created_at: "2026-11-24T12:30:00Z" })]);
  const faixa = faixaDashboard("2026-11-25", "2026-11-25");
  const horas = serieVendas(faixa, atual.validos, anterior.validos);
  assert.deepEqual(
    [atual.total, atual.quantidade, atual.ticket, variacao(atual.total, anterior.total)],
    [100, 2, 50, 25],
  );
  assert.equal(horas.length, 24);
  assert.deepEqual([horas[9].atual, horas[9].anterior, horas[9].pedidos.length], [100, 80, 2]);
  assert.equal(
    serieVendas(faixaDashboard("2026-11-24", "2026-11-25"), atual.validos, anterior.validos)[1]
      .atual,
    100,
  );
  assert.equal(resumirVendas([]).ticket, null);
  assert.equal(variacao(42, 0), null);
});

test("grupos principais são exclusivos e alertas adicionais não classificam encerrados como atrasados", () => {
  const rows = [
    pedido(),
    pedido({ aceito_em_atendente: "sim", atrasado: true }),
    pedido({ status: "em_producao" }),
    pedido({ status: "pronto" }),
    pedido({ status: "aguardando_motoboy" }),
    pedido({ status: "em_rota" }),
    pedido({ status: "entregue", atrasado: true }),
    pedido({ status: "cancelado", agendado_para: "sim" }),
  ];
  rows.forEach((row) =>
    assert.equal(
      STATUS_DASHBOARD.slice(0, 7).filter(([key]) => pertenceAoGrupo(row, key)).length,
      1,
    ),
  );
  assert.equal(rows.filter((row) => pertenceAoGrupo(row, "atrasados")).length, 1);
  assert.equal(rows.filter((row) => pertenceAoGrupo(row, "agendados")).length, 0);
});

test("margem parcial usa apenas pedidos com todos os custos e deduz desconto uma vez", () => {
  const custos = new Map([["coxinha", 1]]);
  const dados = margemDashboard(
    [
      pedido({ subtotal: 120, desconto: 20, total: 120 }),
      pedido({ pedido_itens: [{ produto_id: null, nome: "Outro", quantidade: 50 }] }),
    ],
    custos,
  );
  assert.deepEqual(dados, { cobertos: 1, total: 2, parcial: true, valor: 50, contribuicao: 50 });
  assert.equal(margemDashboard([pedido()], new Map()).valor, null);
});

test("dois pedidos de 25 fritos mantêm dois ciclos e uma remessa por pedido", () => {
  const lote = pedido({ pedido_itens: [{ produto_id: null, nome: "Coxinha", quantidade: 25 }] });
  assert.deepEqual(cargaCozinha([lote, lote]), {
    fritadeiras: 1,
    minutos: 9,
    incompleta: false,
    fritos: 50,
    pasteis: 0,
    assados: 0,
    remessas: 2,
  });
  assert.equal(cargaCozinha([pedido({ pedido_itens: [] })]).incompleta, true);
  assert.equal(
    mediaMinutos([
      [null, null],
      ["2026-11-25T03:05:00Z", "2026-11-25T03:00:00Z"],
    ]),
    null,
  );
  assert.equal(mediaMinutos([["2026-11-25T03:00:00Z", "2026-11-25T03:08:00Z"]]), 8);
});

test("CRM usa clientes compradores no período, exclui opt-out e delimita faixas sem sobreposição", () => {
  const faixa = faixaDashboard("2026-11-25", "2026-11-25");
  const dt = "2026-11-25T03:00:00Z";
  const row = (patch = {}) => ({
    primeiro_pedido: dt,
    datas: [dt],
    dias_sem_comprar: 0,
    segmento: "ativo",
    opt_out: false,
    ...patch,
  });
  const data = resumirClientes(
    [
      row(),
      row({ primeiro_pedido: "2026-11-10T03:00:00Z" }),
      row({ primeiro_pedido: null, datas: [], dias_sem_comprar: 60, segmento: "inativo" }),
      row({ primeiro_pedido: null, datas: [], dias_sem_comprar: 140, segmento: "muito_inativo" }),
      row({ primeiro_pedido: null, datas: [], dias_sem_comprar: 30, opt_out: true }),
    ],
    faixa,
  );
  assert.deepEqual(
    [data.novos, data.recompra, data.inativos, data.reativar],
    [1, 50, 2, [0, 1, 1]],
  );
});

test("limite financeiro exclusivo não conta data posterior e mantém prioridade do ledger", () => {
  const aPartirDe = "2026-11-25T03:00:00.000Z";
  const antesDe = "2026-11-26T03:00:00.000Z";
  const [resultado] = montarFluxoCaixaMensal({
    competencias: ["2026-11"],
    aPartirDe,
    antesDe,
    contas: [{ id: "conta", tipo: "receber", pedido_id: "p1" }],
    eventos: [
      { conta_id: "conta", tipo: "pagamento", valor_centavos: 3000, created_at: aPartirDe },
      { conta_id: "conta", tipo: "pagamento", valor_centavos: 3000, created_at: antesDe },
    ],
    eventosPedidos: [
      { pedido_id: "p1", tipo: "pagamento", valor_centavos: 3000, created_at: aPartirDe },
    ],
    pedidosPagos: [
      {
        id: "p1",
        total: 30,
        status: "entregue",
        pagamento_status: "pago",
        pagamento_em: aPartirDe,
      },
    ],
  });
  assert.equal(resultado.entradasOperacionaisCentavos, 3000);
});
