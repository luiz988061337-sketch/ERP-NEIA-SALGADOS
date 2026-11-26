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

const {
  gerarRecomendacoesNeia,
  rotuloCategoriaNeia,
  rotuloNaturezaNeia,
  rotuloPrioridadeNeia,
  rotuloSituacaoFonteNeia,
} = await import(carregar("../src/lib/neia-inteligencia.ts"));
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
  const inicioGestao = nav.indexOf('label: "Gestão"');
  const inicioSistema = nav.indexOf('label: "Sistema"');
  const itemNeia = nav.indexOf('value: "neia-inteligencia"');
  assert.ok(inicioGestao > 0 && itemNeia > inicioGestao && itemNeia < inicioSistema);
});

test("menu administrativo único usa Minhas tarefas em todas as páginas reais", () => {
  const shell = readFileSync(
    new URL("../src/components/admin/admin-shell.tsx", import.meta.url),
    "utf8",
  );
  // Operação (sem demonstração) recebe o menu completo mesmo quando a rota não
  // declara `menuTarefas`; a prévia mantém o catálogo demonstrativo.
  assert.match(shell, /menuTarefas \?\? \(menuDemonstrativo \? undefined : "admin"\)/);
  assert.match(shell, /label: "Minhas tarefas"/);
  assert.match(shell, /grupo\.label !== "Principal"/);
  // A prévia continua sem "Minhas tarefas".
  assert.match(shell, /menuDemonstrativo \? undefined : "admin"/);
});

test("histórico A02 ordena pela coluna existente ocorreu_em", () => {
  const fonte = readFileSync(new URL("../src/lib/neia-recomendacoes.ts", import.meta.url), "utf8");
  assert.match(fonte, /\.select\("id,estado_id,ator_id,ator_nome,acao,detalhe,ocorreu_em"\)/);
  assert.match(fonte, /\.order\("ocorreu_em", \{ ascending: false \}\)/);
  assert.doesNotMatch(fonte, /\.order\("ocorrido_em"/);
});

test("o módulo não grava nada: sugestão de tarefa depende de confirmação na interface", () => {
  const fonte = readFileSync(new URL("../src/lib/neia-inteligencia.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /supabase|\.insert\(|\.update\(|\.delete\(/);
  const tela = readFileSync(
    new URL("../src/components/admin/neia-inteligencia.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tela, /setSugestao\(\{/);
  assert.match(tela, /recomendacao_id: item\.id/);
  assert.match(tela, /sugestao=\{sugestao\}/);
  assert.match(tela, /Abrir recomendação/);
  assert.match(tela, /aria-expanded=\{expandida\}/);
  assert.match(tela, /item\.destino\.to/);
});

test("A02.1.2: a tela registra situação, adia, dispensa e consulta o histórico", () => {
  const tela = readFileSync(
    new URL("../src/components/admin/neia-inteligencia.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tela, /useRecomendacoesA02/);
  assert.match(tela, /marcarCienteRecomendacao/);
  assert.match(tela, /adiarRecomendacao/);
  assert.match(tela, /dispensarRecomendacao/);
  assert.match(tela, /resolverRecomendacao/);
  assert.match(tela, /sincronizarOcorrencias/);
  assert.match(tela, /candidatosResolucao/);
  assert.match(tela, /vincularTarefaRecomendacao/);
  // As decisões administrativas ficam no servidor, não no navegador.
  assert.doesNotMatch(tela, /localStorage|sessionStorage/);
});

test("A02.1.2: dashboard e tarefas respeitam as situações e a lixeira", () => {
  const painel = readFileSync(
    new URL("../src/components/admin/dashboard-a01.tsx", import.meta.url),
    "utf8",
  );
  assert.match(painel, /useRecomendacoesA02/);
  assert.match(painel, /situacaoEfetiva/);
  assert.match(painel, /situacao !== "resolvida" && situacao !== "dispensada"/);

  const tarefas = readFileSync(
    new URL("../src/components/admin/tarefas-a01.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tarefas, /excluirTarefaA01/);
  assert.match(tarefas, /restaurarTarefaA01/);
  assert.match(tarefas, /reabrirTarefaA01/);
  assert.match(tarefas, /Lixeira/);
  assert.match(tarefas, /Motivo da exclusão/);
});

test("estoque separa ausência de cadastro, estoque zerado, mínimo e reserva excedida", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    estoque: {
      reposicao: 0,
      vencendo: 0,
      vencidos: 0,
      sabores: [
        { nome: "Coxinha", fisico: null, reservado: 0, disponivel: null, minimo: 50 },
        { nome: "Risoles", fisico: 0, reservado: 0, disponivel: 0, minimo: 50 },
        { nome: "Bolinha", fisico: 10, reservado: 4, disponivel: 6, minimo: null },
        { nome: "Pastel", fisico: 2, reservado: 5, disponivel: -3, minimo: 10 },
      ],
    },
  });
  const porId = new Map(resultado.recomendacoes.map((item) => [item.id, item]));
  assert.ok(porId.has("estoque-sem-cadastro"));
  assert.match(porId.get("estoque-sem-cadastro").motivo, /Coxinha/);
  assert.match(porId.get("estoque-sem-cadastro").motivo, /não significa estoque zerado/);
  assert.ok(porId.has("estoque-zerado"));
  assert.match(porId.get("estoque-zerado").motivo, /Risoles/);
  assert.doesNotMatch(porId.get("estoque-zerado").motivo, /Coxinha/);
  assert.ok(porId.has("estoque-sem-minimo"));
  assert.match(porId.get("estoque-sem-minimo").motivo, /Bolinha/);
  assert.ok(porId.has("estoque-reserva"));
  assert.match(porId.get("estoque-reserva").motivo, /Pastel/);
  assert.equal(porId.get("estoque-reserva").prioridade, "critica");
});

test("crescimento de 0% é estabilidade e não é tratado como queda", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    comercial: {
      crescimento: 0,
      totalAtual: 1000,
      totalAnterior: 1000,
      reativar60a89: null,
      campanhasProntas: null,
    },
  });
  const vendas = resultado.recomendacoes.find((item) => item.id === "comercial-vendas");
  assert.ok(vendas);
  assert.equal(vendas.titulo, "Vendas estáveis");
  assert.equal(vendas.tom, "azul");
  assert.equal(vendas.prioridade, "baixa");
  assert.match(vendas.motivo, /não é queda/);
});

test("reativação respeita as faixas de 30–59, 60–89 e 90+ dias", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    comercial: {
      crescimento: null,
      totalAtual: null,
      totalAnterior: null,
      reativar30a59: 2,
      reativar60a89: 3,
      reativar90mais: 4,
      campanhasProntas: null,
    },
  });
  const reativacao = resultado.recomendacoes.find((item) => item.id === "comercial-reativacao");
  assert.ok(reativacao);
  assert.match(reativacao.motivo, /2 em 30–59 dias/);
  assert.match(reativacao.motivo, /3 em 60–89 dias/);
  assert.match(reativacao.motivo, /4 em 90 dias ou mais/);
  assert.match(reativacao.dados.join(" "), /opt-out/);
});

test("contas próximas do vencimento, recebimentos atrasados e entregas atrasadas geram alertas", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    entregas: {
      aguardandoColeta: 0,
      motoboysDisponiveis: 1,
      tempoMedioMinutos: null,
      atrasadas: 2,
    },
    financeiro: {
      vencido: 0,
      vencendo: 250,
      recebimentosAtrasados: 120,
      lucro: null,
      margemParcial: false,
      custosCobertos: null,
      custosTotal: null,
    },
  });
  const porId = new Map(resultado.recomendacoes.map((item) => [item.id, item]));
  assert.ok(porId.has("financeiro-vencendo"));
  assert.equal(porId.get("financeiro-vencendo").natureza, "previsao");
  assert.ok(porId.has("financeiro-recebimentos"));
  assert.equal(porId.get("financeiro-recebimentos").prioridade, "alta");
  assert.ok(porId.has("entregas-atrasadas"));
  assert.equal(porId.get("entregas-atrasadas").prioridade, "critica");
});

test("fontes distinguem dados suficientes, parciais, sem registros e falha", () => {
  const resultado = gerarRecomendacoesNeia({
    atualizadoEm,
    fontes: {
      estoque: "suficiente",
      producao: "parcial",
      entregas: "sem-registros",
      financeiro: "falha",
      comercial: "falha",
    },
  });
  const porCategoria = new Map(resultado.fontes.map((fonte) => [fonte.categoria, fonte]));
  assert.equal(porCategoria.get("estoque").situacao, "suficiente");
  assert.equal(porCategoria.get("producao").situacao, "parcial");
  assert.equal(porCategoria.get("entregas").situacao, "sem-registros");
  assert.equal(porCategoria.get("financeiro").situacao, "falha");
  assert.equal(porCategoria.get("estoque").disponivel, true);
  assert.equal(porCategoria.get("entregas").disponivel, true);
  assert.equal(porCategoria.get("financeiro").disponivel, false);
  assert.equal(resultado.semDados, false);
  assert.equal(rotuloSituacaoFonteNeia("sem-registros"), "Sem registros");
  assert.equal(rotuloSituacaoFonteNeia("falha"), "Falha na consulta");

  const semLeitura = gerarRecomendacoesNeia({
    atualizadoEm,
    fontes: {
      estoque: "falha",
      producao: "falha",
      entregas: "falha",
      financeiro: "falha",
      comercial: "falha",
    },
  });
  assert.equal(semLeitura.semDados, true);
  const semRegistros = gerarRecomendacoesNeia({
    atualizadoEm,
    fontes: {
      estoque: "sem-registros",
      producao: "sem-registros",
      entregas: "sem-registros",
      financeiro: "sem-registros",
      comercial: "sem-registros",
    },
  });
  assert.equal(semRegistros.semDados, true);
});

test("a tela envia os dados por sabor, as faixas de reativação e os novos alertas", () => {
  const tela = readFileSync(
    new URL("../src/components/admin/neia-inteligencia.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tela, /sabores: saldos\.linhas\.map/);
  assert.match(tela, /reativar30a59/);
  assert.match(tela, /reativar90mais/);
  assert.match(tela, /atrasadas: entregasDados/);
  assert.match(tela, /recebimentosAtrasados: fin\.receberAtrasado/);
  assert.match(tela, /rotuloSituacaoFonteNeia/);
});
