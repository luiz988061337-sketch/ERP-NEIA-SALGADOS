import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agregarResultados, alertasResultados, calcularResultadoCampanha,
  CAMPANHAS_RESULTADO_DEMO, classificarMargemDemo, contarRecuperacaoPorSegmentos,
  contarRecuperacaoUnica, filtrarResultados, resumirRecuperacao,
} from "../src/components/comercial-preview/resultados-regras.ts";

const reativacao = CAMPANHAS_RESULTADO_DEMO[0];
const metricas = calcularResultadoCampanha(reativacao);
assert.equal(metricas.receitaBrutaCentavos, 100_000);
assert.equal(metricas.descontosCentavos, 10_000);
assert.equal(metricas.reembolsosCentavos, 0);
assert.equal(metricas.receitaLiquidaCentavos, 90_000);
assert.equal(metricas.custosVariaveisCentavos, 54_000);
assert.equal(metricas.margemContribuicaoCentavos, 36_000);
assert.equal(metricas.margemPercentual, 40);
assert.equal(metricas.conversaoPercentual, 16);
assert.equal(metricas.ticketMedioCentavos, 5_625);
assert.equal(metricas.incrementalCentavos, 15_000);
assert.equal(metricas.taxasEntregaTerceirosCentavos, 8_000);
assert.equal(classificarMargemDemo(CAMPANHAS_RESULTADO_DEMO[0], CAMPANHAS_RESULTADO_DEMO), "Boa margem");
assert.equal(classificarMargemDemo(CAMPANHAS_RESULTADO_DEMO[1], CAMPANHAS_RESULTADO_DEMO), "Boa margem");
assert.equal(classificarMargemDemo(CAMPANHAS_RESULTADO_DEMO[2], CAMPANHAS_RESULTADO_DEMO), "Atenção à margem");
assert.equal(classificarMargemDemo(CAMPANHAS_RESULTADO_DEMO[3], CAMPANHAS_RESULTADO_DEMO), "Dados insuficientes");
const unicaSemComparador = { ...reativacao, dados: { ...reativacao.dados, comparacaoAnterior: undefined, grupoControle: undefined } };
assert.equal(classificarMargemDemo(unicaSemComparador, [unicaSemComparador]), "Sem comparação");

const resumo = agregarResultados(CAMPANHAS_RESULTADO_DEMO);
assert.equal(resumo.receitaBrutaCentavos, 370_000);
assert.equal(resumo.descontosCentavos, 51_000);
assert.equal(resumo.reembolsosCentavos, 5_000);
assert.equal(resumo.receitaLiquidaCentavos, 314_000);
assert.equal(resumo.custosVariaveisCentavos, 240_000);
assert.equal(resumo.margemContribuicaoCentavos, 74_000);
assert.equal(resumo.pedidos, 43);
assert.equal(resumo.alcancados, 330);
assert.equal(resumo.incrementalCentavos, 15_000);
assert.equal(resumo.gruposControle, 1);
assert.equal(resumo.dadosInsuficientes, 1);
assert.equal("clientesRetornaram" in resumo, false, "não somar clientes de campanhas que podem se sobrepor");
assert.equal("taxasEntregaTerceirosCentavos" in resumo, false, "taxas de terceiros não entram em receita ou margem");

const semCustos = {
  ...reativacao,
  dados: { ...reativacao.dados, custosVariaveisProdutosCentavos: null },
};
assert.equal(calcularResultadoCampanha(semCustos).receitaLiquidaCentavos, 90_000);
assert.equal(calcularResultadoCampanha(semCustos).margemContribuicaoCentavos, null);
const parcialMaior = {
  ...reativacao,
  id: "partial-cost-demo",
  dados: { ...reativacao.dados, alcancados: 50, pedidosAtribuidos: 10, receitaBrutaProdutosCentavos: 200_000, descontosCentavos: 10_000, custosVariaveisProdutosCentavos: null },
};
const parcial = agregarResultados([reativacao, parcialMaior]);
assert.equal(parcial.receitaLiquidaCentavos, 280_000);
assert.equal(parcial.margemPercentual, 40, "percentual da margem usa somente receita com custo conhecido");
assert.equal(parcial.ticketMedioCentavos, 280_000 / 26, "ticket usa a mesma base com receita conhecida");
assert.equal(calcularResultadoCampanha({ ...reativacao, dados: null }), null);
const descontoInvalido = { ...reativacao, dados: { ...reativacao.dados, descontosCentavos: 101_000 } };
assert.equal(calcularResultadoCampanha(descontoInvalido).receitaLiquidaCentavos, null);
assert.equal(calcularResultadoCampanha({ ...reativacao, dados: { ...reativacao.dados, pedidosAtribuidos: 101 } }), null);

const filtrosBase = { periodo: "todos", campanha: "todas", segmento: "todos", status: "todos", desempenho: "todos" };
assert.deepEqual(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, periodo: "30" }).map((c) => c.id), ["c5-demo-reativacao-60", "c5-demo-vip", "c5-demo-pos-atendimento"]);
assert.deepEqual(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, status: "Rejeitada" }).map((c) => c.id), ["c5-demo-pos-atendimento"]);
assert.deepEqual(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, segmento: "vip" }).map((c) => c.id), ["c5-demo-vip"]);
assert.deepEqual(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, desempenho: "sem-dados" }).map((c) => c.id), ["c5-demo-pos-atendimento"]);
assert.equal(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, desempenho: "abaixo-comparacao" }).length, 2);
assert.equal(filtrarResultados(CAMPANHAS_RESULTADO_DEMO, { ...filtrosBase, desempenho: "conversao-inferior" }).length, 2);
assert.ok(alertasResultados(CAMPANHAS_RESULTADO_DEMO).some((alerta) => alerta.titulo === "Dados insuficientes"));
assert.ok(alertasResultados(CAMPANHAS_RESULTADO_DEMO).some((alerta) => alerta.titulo === "Desconto acima da média demonstrativa"));
assert.ok(alertasResultados(CAMPANHAS_RESULTADO_DEMO).some((alerta) => alerta.titulo === "Margem de contribuição abaixo da comparação"));

const cliente = (id, diasSemComprar, segmento, status, totalPedidos, historico = []) => ({
  id, diasSemComprar, segmento, status, totalPedidos, historico,
});
const clientesDemoTeste = [
  cliente("r1", 47, "risco", "Recuperado", 5, [{ tipo: "Campanha" }, { tipo: "Retorno" }]),
  cliente("r2", 76, "inativo", "Recuperado", 2, [{ tipo: "Retorno" }]),
  cliente("a1", 38, "risco", "Em contato", 4),
  cliente("v1", 12, "ativo", "Não respondeu", 6),
];
const candidatos = new Map([
  ["r1", { vip: true, recorrente: true }], ["r2", { vip: false, recorrente: false }],
  ["a1", { vip: false, recorrente: true }], ["v1", { vip: true, recorrente: true }],
]);
const recuperacao = contarRecuperacaoUnica(clientesDemoTeste);
assert.equal(recuperacao.retornaram, 2);
assert.equal(recuperacao.comVinculoDemo, 1);
assert.ok(recuperacao.comVinculoDemo <= recuperacao.retornaram);
const segmentos = resumirRecuperacao(clientesDemoTeste, candidatos, ["inativos_30", "inativos_60", "inativos_90", "recorrentes", "vip", "queda_frequencia"]);
assert.equal(segmentos.length, 6);
assert.ok(segmentos.every((linha) => linha.retornoComVinculoDemo <= linha.retornaram));
assert.equal(segmentos.find((linha) => linha.segmento === "inativos_30").retornaram, 1);
assert.equal(segmentos.find((linha) => linha.segmento === "inativos_60").retornaram, 1);
assert.ok(segmentos.some((linha) => linha.segmento === "recorrentes" && linha.frequenciaQuatroMais !== null));
assert.equal(contarRecuperacaoPorSegmentos(clientesDemoTeste, candidatos, ["inativos_30", "vip", "recorrentes"]).retornaram, 1,
  "filtros em segmentos sobrepostos devem contar IDs únicos");

const tela = await readFile(new URL("../src/components/comercial-preview/tela-resultados.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/components/comercial-preview/resultados.css", import.meta.url), "utf8");
for (const label of ["Vendas com promoções", "Descontos concedidos", "Margem estimada", "Clientes que voltaram", "Pedidos com promoção"]) {
  assert.ok(tela.includes(`label: "${label}"`), `indicador principal ausente: ${label}`);
}
assert.match(tela, /c5-primary-kpis/);
assert.match(tela, /open=\{analiseAberta\}/, "análise avançada deve iniciar recolhida");
assert.match(tela, /function abrirDetalhes[\s\S]*setAnaliseAberta\(true\)/, "detalhes da campanha devem abrir a análise avançada");
assert.match(tela, /avisos\.map/, "alertas completos permanecem disponíveis na análise avançada");
assert.match(tela, /classificarMargemDemo/);
assert.match(tela, /const resumo = useMemo\(\(\) => agregarResultados\(campanhas\)/, "os cinco indicadores usam o mesmo conjunto filtrado");
assert.match(tela, /for \(const campanha of campanhas\)/, "a série mensal avançada acompanha os filtros ativos");
assert.match(tela, /contarRecuperacaoPorSegmentos\(clientes, candidatos, segmentosSelecionados\)/, "a recuperação aplica os segmentos filtrados sem duplicar clientes");
assert.match(tela, /Mais filtros[\s\S]*filtros\.segmento[\s\S]*filtros\.status[\s\S]*filtros\.desempenho/);
assert.match(css, /@media \(max-width:390px\)[\s\S]*c5-primary-kpis[^}]*grid-template-columns:minmax\(0,1fr\)/);
assert.match(css, /@media \(max-width:430px\)[\s\S]*c5-formula-flow[^}]*grid-template-columns:minmax\(0,1fr\)/);
assert.match(css, /@media \(max-width:430px\)[\s\S]*c5-highlight-copy[^}]*grid-column:2/);
assert.match(css, /c5-simple-table tbody tr/);
assert.doesNotMatch(tela, /\bfetch\s*\(|\bsupabase\b|\.from\s*\(|sendWhatsApp|Edge Function/i);
console.log("C5: receitas, descontos, reembolsos, custos, margem, conversão, ticket, incremental, recuperação, filtros, dados insuficientes, não duplicação e isolamento demonstrativo validados.");
