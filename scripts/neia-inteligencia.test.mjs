import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const carregar = (arquivo) => {
  const source = readFileSync(new URL(arquivo, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
};

const { gerarRecomendacoesNeia, rotuloCategoriaNeia, rotuloNaturezaNeia, rotuloPrioridadeNeia } =
  await import(carregar("../src/lib/neia-inteligencia.ts"));
const { ehAbaAdministrativa } = await import(carregar("../src/lib/paineis-staff.ts"));

const atualizadoEm = "2026-11-25T12:00:00.000Z";

const cenarioCompleto = {
  atualizadoEm,
  estoque: { reposicao: 3, vencendo: 1, vencidos: 1 },
  producao: { emProducao: 4, atrasados: 2, minutosFila: 45, prazosEmRisco: 1 },
  entregas: { aguardandoColeta: 2, motoboysDisponiveis: 0, tempoMedioMinutos: 75 },
  financeiro: {
    vencido: 350.5,
    lucro: -120.25,
    margemParcial: true,
    custosCobertos: 3,
    custosTotal: 10,
  },
  comercial: {
    crescimento: -12.5,
    totalAtual: 1000,
    totalAnterior: 1142.86,
    reativar60a89: 7,
    campanhasProntas: 2,
  },
};

test("sem leitura das fontes não conclui nem inventa recomendação", () => {
  const resultado = gerarRecomendacoesNeia({ atualizadoEm });
  assert.equal(resultado.semDados, true);
  assert.equal(resultado.recomendacoes.length, 0);
  assert.ok(resultado.fontes.every((fonte) => fonte.disponivel === false));
});

test("cada recomendação traz categoria, prioridade, natureza, dados, atualização, ação e destino", () => {
  const resultado = gerarRecomendacoesNeia(cenarioCompleto);
  assert.ok(resultado.recomendacoes.length >= 8);
  for (const item of resultado.recomendacoes) {
    assert.ok(rotuloCategoriaNeia(item.categoria));
    assert.ok(rotuloPrioridadeNeia(item.prioridade));
    assert.ok(rotuloNaturezaNeia(item.natureza));
    assert.ok(item.titulo.trim().length > 0);
    assert.ok(item.motivo.trim().length > 0);
    assert.ok(item.dados.length > 0);
    assert.equal(item.atualizadoEm, atualizadoEm);
    assert.ok(item.acao.trim().length > 0);
    assert.ok(item.destino.to.startsWith("/"));
    assert.ok(item.destino.rotulo.trim().length > 0);
    assert.ok(item.tarefa.titulo.trim().length > 0);
    assert.ok(item.tarefa.descricao.trim().length > 0);
  }
});

test("fatos, estimativas e previsões são identificados separadamente", () => {
  const resultado = gerarRecomendacoesNeia(cenarioCompleto);
  const porId = new Map(resultado.recomendacoes.map((item) => [item.id, item]));
  assert.equal(porId.get("estoque-revisar").natureza, "fato");
  assert.equal(porId.get("producao-risco").natureza, "previsao");
  assert.equal(porId.get("financeiro-custos").natureza, "estimativa");
  assert.equal(porId.get("producao-risco").prioridade, "alta");
  assert.equal(porId.get("producao-atrasos").prioridade, "critica");
  assert.equal(porId.get("financeiro-vencido").prioridade, "critica");
});

test("ordena por prioridade, consolida categorias e não repete identificadores", () => {
  const resultado = gerarRecomendacoesNeia(cenarioCompleto);
  const ids = resultado.recomendacoes.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  const ordem = { critica: 0, alta: 1, normal: 2, baixa: 3 };
  const pesos = resultado.recomendacoes.map((item) => ordem[item.prioridade]);
  assert.deepEqual(
    pesos,
    [...pesos].sort((a, b) => a - b),
  );
  const categorias = new Set(resultado.recomendacoes.map((item) => item.categoria));
  for (const categoria of ["estoque", "producao", "entregas", "financeiro", "comercial"]) {
    assert.ok(categorias.has(categoria));
  }
  assert.equal(
    resultado.resumo.critica +
      resultado.resumo.alta +
      resultado.resumo.normal +
      resultado.resumo.baixa,
    resultado.recomendacoes.length,
  );
});

test("dados zerados não geram alerta preventivo", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    estoque: { reposicao: 0, vencendo: 0, vencidos: 0 },
    producao: { emProducao: 0, atrasados: 0, minutosFila: null, prazosEmRisco: null },
    entregas: { aguardandoColeta: 0, motoboysDisponiveis: 0, tempoMedioMinutos: null },
    financeiro: {
      vencido: 0,
      lucro: null,
      margemParcial: false,
      custosCobertos: null,
      custosTotal: null,
    },
    comercial: {
      crescimento: null,
      totalAtual: null,
      totalAnterior: null,
      reativar60a89: 0,
      campanhasProntas: 0,
    },
  });
  assert.equal(resultado.semDados, false);
  assert.equal(resultado.recomendacoes.length, 0);
  assert.ok(resultado.fontes.every((fonte) => fonte.disponivel));
});

test("escopo a01 preserva o conjunto aprovado do Dashboard", () => {
  const completo = gerarRecomendacoesNeia(cenarioCompleto);
  const a01 = gerarRecomendacoesNeia(cenarioCompleto, { escopo: "a01" });
  assert.ok(a01.recomendacoes.length < completo.recomendacoes.length);
  assert.ok(
    a01.recomendacoes.every(
      (item) =>
        !["financeiro-resultado", "entregas-tempo", "comercial-campanhas"].includes(item.id),
    ),
  );
  assert.ok(a01.recomendacoes.some((item) => item.id === "estoque-revisar"));
  assert.ok(a01.recomendacoes.some((item) => item.id === "comercial-reativacao"));
});

test("queda de vendas tem prioridade alta e alta de vendas não gera alerta crítico", () => {
  const queda = gerarRecomendacoesNeia({
    atualizadoEm,
    comercial: {
      crescimento: -5,
      totalAtual: 950,
      totalAnterior: 1000,
      reativar60a89: null,
      campanhasProntas: null,
    },
  });
  assert.equal(queda.recomendacoes[0].prioridade, "alta");
  const alta = gerarRecomendacoesNeia({
    atualizadoEm,
    comercial: {
      crescimento: 8,
      totalAtual: 1080,
      totalAnterior: 1000,
      reativar60a89: null,
      campanhasProntas: null,
    },
  });
  assert.equal(alta.recomendacoes[0].prioridade, "baixa");
  assert.equal(alta.resumo.critica, 0);
});

test("navegação administrativa inclui a aba da Néia Inteligência", () => {
  assert.equal(ehAbaAdministrativa("neia-inteligencia"), true);
  const admin = readFileSync(new URL("../src/routes/admin.tsx", import.meta.url), "utf8");
  const nav = readFileSync(
    new URL("../src/components/admin/admin-nav.ts", import.meta.url),
    "utf8",
  );
  assert.match(admin, /TabsContent value="neia-inteligencia"/);
  assert.match(admin, /<NeiaInteligencia/);
  assert.match(nav, /value: "neia-inteligencia"/);
});

test("o módulo não grava nada: sugestão de tarefa depende de confirmação na interface", () => {
  const fonte = readFileSync(new URL("../src/lib/neia-inteligencia.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /supabase|\.insert\(|\.update\(|\.delete\(/);
  const tela = readFileSync(
    new URL("../src/components/admin/neia-inteligencia.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tela, /setSugestao\(item\.tarefa\)/);
  assert.match(tela, /sugestao=\{sugestao\}/);
});
