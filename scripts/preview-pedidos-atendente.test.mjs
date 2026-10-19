// Testes K9 do preview de Gestão de Pedidos — Atendente (lógica pura).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const L = await import("@/lib/preview-pedidos-atendente.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}
const AGORA = Date.now();
const P = (over) => ({
  id: "p",
  numero: 1,
  cliente: "C",
  telefone: "(11) 90000-0000",
  tipo: "entrega",
  distanciaKm: 2,
  prometidoEm: AGORA + 60 * 60000,
  agendado: false,
  itens: [{ sabor: "Coxinha", qtd: 20 }],
  valorCentavos: 5000,
  pagamento: "Pix",
  pagamentoConfirmado: true,
  bloqueio: null,
  emAnalise: false,
  liberacaoEm: null,
  prontoEm: null,
  despacho: "nenhum",
  coluna: "novos",
  ...over,
});

// 1. Janela: prometido − desloc − antecedência − preparo.
{
  const j = L.janelaLiberacao(AGORA + 100 * 60000, 40, 15, 5);
  ok(j.vencimentoEm === AGORA + 80 * 60000 && j.liberacaoEm === AGORA + 40 * 60000, "1. janela de liberação");
}
// 2. Aceite válido.
{
  ok(L.podeAceitar(P({})).ok, "2. aceite válido libera");
}
// 3. Bloqueio impede aceite.
{
  const r = L.podeAceitar(P({ bloqueio: "pagamento-pendente" }));
  ok(!r.ok && r.motivos.some((m) => /pagamento-pendente/.test(m)), "3. bloqueio impede aceite");
}
// 4. Sem itens / sem pagamento impedem.
{
  ok(!L.podeAceitar(P({ itens: [] })).ok, "4. sem itens bloqueia");
  ok(!L.podeAceitar(P({ pagamento: "" })).ok, "4b. sem pagamento bloqueia");
}
// 5. Liberação só na janela.
{
  ok(L.podeLiberar(P({ coluna: "aceitos", liberacaoEm: AGORA - 1000 }), AGORA), "5. libera na janela");
  ok(!L.podeLiberar(P({ coluna: "aceitos", liberacaoEm: AGORA + 60000 }), AGORA), "5b. antes da janela bloqueia");
  ok(!L.podeLiberar(P({ coluna: "novos", liberacaoEm: AGORA - 1000 }), AGORA), "5c. novo não libera");
}
// 6. Atraso exclui concluídos/cancelados.
{
  ok(L.emAtrasoAtendente(P({ coluna: "producao", prometidoEm: AGORA - 1000 }), AGORA), "6. atraso conta");
  ok(!L.emAtrasoAtendente(P({ coluna: "concluidos", prometidoEm: AGORA - 1000 }), AGORA), "6b. concluído fora");
  ok(!L.emAtrasoAtendente(P({ coluna: "cancelados", prometidoEm: AGORA - 1000 }), AGORA), "6c. cancelado fora");
}
// 7. Ordenação por prometido.
{
  const o = L.ordenarPorPrometido([P({ numero: 2, prometidoEm: AGORA + 50 * 60000 }), P({ numero: 1, prometidoEm: AGORA + 10 * 60000 })]);
  ok(o[0].numero === 1, "7. ordena por prometido");
}
// 8. WhatsApp contém dados do pedido.
{
  const m = L.mensagemWhatsApp(P({ numero: 1249, cliente: "Roberto" }));
  ok(m.includes("#1249") && m.includes("Roberto"), "8. prévia WhatsApp");
}
// 9. CSV com BOM e cabeçalho.
{
  const c = L.resumoCSV([P({ numero: 1261 })]);
  ok(c.startsWith("﻿") && c.includes("1261"), "9. CSV demonstrativo");
}
// 10. Totais e moeda.
{
  ok(L.totalUnidades(P({ itens: [{ sabor: "A", qtd: 30 }, { sabor: "B", qtd: 20 }] })) === 50, "10. total unidades");
  ok(L.brl(5000).includes("50,00"), "10b. moeda BRL");
}
// 11. Parâmetros por pedido (K9 ajuste 2): escala com unidades/distância.
{
  const a = L.parametrosJanela(50, 2.1, "entrega");
  ok(a.preparoMin === 40 && a.deslocMin === 13 && a.margemMin === 10, "11. parâmetros por pedido", JSON.stringify(a));
  const r = L.parametrosJanela(20, null, "retirada");
  ok(r.deslocMin === 0, "11b. retirada sem desloc");
  const j = L.janelaLiberacao(AGORA + 200 * 60000, a.preparoMin, a.deslocMin, a.margemMin);
  ok(j.liberacaoEm < j.vencimentoEm && j.vencimentoEm < AGORA + 200 * 60000, "11c. promessa preservada, liberação derivada");
}

if (falhas > 0) {
  console.error(`K9: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("K9: casos passando.");
