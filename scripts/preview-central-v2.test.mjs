// Testes K8.1 do preview da Central de Entregas 2.0 (lógica pura).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const L = await import("@/lib/preview-central-entregas.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}
const AGORA = Date.now();
const M = (over) => ({
  id: "m",
  nome: "M",
  status: "disponivel",
  baseKm: 1,
  disponivelDesde: AGORA - 30 * 60000,
  entregasHoje: 0,
  atualizacaoEm: AGORA,
  ...over,
});
const P = (over) => ({
  id: "p",
  numero: 1,
  cliente: "C",
  endereco: "Rua X",
  distanciaKm: 2,
  prontoEm: AGORA - 10 * 60000,
  prometidoEm: AGORA + 20 * 60000,
  saidaPrevistaEm: null,
  saidaEm: null,
  chegadaPrevistaEm: null,
  entregueEm: null,
  deslocMin: 10,
  itens: [{ sabor: "Coxinha", qtd: 20 }],
  motoboyId: null,
  coluna: "aguardando",
  ...over,
});

// 1. Sugere quem está disponível há mais tempo.
{
  const a = M({ id: "a", disponivelDesde: AGORA - 40 * 60000 });
  const b = M({ id: "b", disponivelDesde: AGORA - 5 * 60000 });
  const r = L.sugerirMotoboy([b, a]);
  ok(r.id === "a", "1. sugere disponível há mais tempo");
}
// 2. Retornando à base não é sugerido.
{
  const r = L.sugerirMotoboy([M({ id: "r", status: "retornando", disponivelDesde: AGORA - 99 * 60000 })]);
  ok(r.id === null, "2. retornando não é sugerido");
}
// 3. Em rota / indisponível nunca sugeridos.
{
  const r = L.sugerirMotoboy([
    M({ id: "x", status: "em-rota" }),
    M({ id: "y", status: "indisponivel" }),
  ]);
  ok(r.id === null, "3. em-rota/indisponível não sugeridos");
}
// 4. Atribuição válida.
{
  const r = L.podeAtribuir(P({}), M({}), []);
  ok(r.ok, "4. atribuição válida libera");
}
// 5. Bloqueio de atribuição duplicada (pedido em rota ativa).
{
  const p = P({ id: "p1" });
  const r = L.podeAtribuir(p, M({}), [{ paradas: ["p1"] }]);
  ok(!r.ok && r.motivos.some((m) => /rota ativa/.test(m)), "5. bloqueia pedido em rota ativa");
}
// 6. Motoboy não disponível bloqueia.
{
  const r = L.podeAtribuir(P({}), M({ status: "em-rota" }), []);
  ok(!r.ok, "6. motoboy em rota bloqueia atribuição");
}
// 7. Totais da rota.
{
  const ps = [P({ id: "a", distanciaKm: 2, deslocMin: 10, itens: [{ sabor: "X", qtd: 20 }] }), P({ id: "b", distanciaKm: 3.5, deslocMin: 15, itens: [{ sabor: "Y", qtd: 30 }] })];
  const t = L.totaisRota(ps, ["a", "b"]);
  ok(t.qtd === 2 && t.totalUn === 50 && t.distKm === 5.5 && t.tempoMin === 35, "7. totais da rota", JSON.stringify(t));
}
// 8. Reordenar paradas.
{
  const r = L.reordenar(["a", "b", "c"], 0, 2);
  ok(JSON.stringify(r) === JSON.stringify(["b", "c", "a"]), "8. reordena paradas");
}
// 9. >3 paradas exige confirmação.
{
  ok(!L.podeCriarRota(["a", "b", "c", "d"], false), "9. 4 paradas sem confirmação bloqueia");
  ok(L.podeCriarRota(["a", "b", "c", "d"], true), "9b. 4 paradas com confirmação libera");
  ok(!L.podeCriarRota([], true), "9c. rota vazia bloqueia");
}
// 10. Dividir rota.
{
  const [a, b] = L.dividirRota(["x", "y", "z"], [2]);
  ok(JSON.stringify(a) === JSON.stringify(["x", "y"]) && JSON.stringify(b) === JSON.stringify(["z"]), "10. divide rota");
}
// 11. Atraso e próximo do prazo.
{
  const atrasado = P({ coluna: "rota", prometidoEm: AGORA - 5 * 60000 });
  const okk = P({ coluna: "rota", prometidoEm: AGORA + 10 * 60000 });
  const entregue = P({ coluna: "entregues", prometidoEm: AGORA - 60 * 60000 });
  ok(L.emAtraso(atrasado, AGORA) && !L.emAtraso(okk, AGORA) && !L.emAtraso(entregue, AGORA), "11. atraso só conta antes da entrega");
  ok(L.proximoDoPrazo(okk, AGORA) && !L.proximoDoPrazo(entregue, AGORA), "11b. próximo do prazo");
}
// 12. Localização desatualizada.
{
  ok(L.localizacaoDesatualizada(M({ atualizacaoEm: AGORA - 11 * 60000 }), AGORA), "12. localização >10min desatualizada");
  ok(!L.localizacaoDesatualizada(M({ atualizacaoEm: AGORA - 2 * 60000 }), AGORA), "12b. localização recente ok");
}
// 13. Alerta: no prazo (chegada prevista dentro do prometido).
{
  const a = L.alertaDe(P({ coluna: "rota", prometidoEm: AGORA + 30 * 60000, chegadaPrevistaEm: AGORA + 20 * 60000 }), AGORA);
  ok(a.estado === "no-prazo" && a.atrasoMin === 0, "13. no prazo");
}
// 14. Alerta: risco (previsão após o prometido, prazo ainda válido).
{
  const a = L.alertaDe(P({ coluna: "rota", prometidoEm: AGORA + 20 * 60000, chegadaPrevistaEm: AGORA + 28 * 60000 }), AGORA);
  ok(a.estado === "risco" && a.atrasoMin === 8, "14. risco com 8 min", JSON.stringify(a));
}
// 15. Alerta: atrasado (prometido passou, sem entrega).
{
  const a = L.alertaDe(P({ coluna: "aguardando", prometidoEm: AGORA - 5 * 60000 }), AGORA);
  ok(a.estado === "atrasado" && a.atrasoMin === 5, "15. atrasado");
}
// 16. Alerta: sem previsão (sem dado confiável, prazo válido).
{
  const a = L.alertaDe(P({ coluna: "aguardando", prometidoEm: AGORA + 30 * 60000, deslocMin: null }), AGORA);
  ok(a.estado === "sem-previsao" && a.previsaoEm === null, "16. sem previsão");
}
// 17. Alerta: aguardando estima saída agora + desloc.
{
  const a = L.alertaDe(P({ coluna: "aguardando", prometidoEm: AGORA + 5 * 60000, deslocMin: 15 }), AGORA);
  ok(a.estado === "risco" && a.fonte === "saida-agora", "17. aguardando projeta saída agora");
}
// 18. Previsões da rota acumulam desloc + manejo e sinalizam parada em risco.
{
  const ps = [
    P({ id: "a", deslocMin: 10, prometidoEm: AGORA + 15 * 60000 }),
    P({ id: "b", deslocMin: 10, prometidoEm: AGORA + 18 * 60000 }),
  ];
  const r = L.previsoesRota(ps, ["a", "b"], AGORA);
  ok(r[0].chegadaEm === AGORA + 10 * 60000 && r[0].atrasoMin === 0, "18. 1ª parada no prazo");
  ok(r[1].chegadaEm === AGORA + 25 * 60000 && r[1].atrasoMin === 7, "18b. 2ª parada em risco após reordenar base");
  const inv = L.previsoesRota(ps, ["b", "a"], AGORA);
  ok(inv[0].atrasoMin === 0 && inv[1].atrasoMin > 0, "18c. reordenar recalcula previsões");
}
// 19. Pontuação de despacho: manual > atrasado > risco > prazo.
{
  const s = (pm, est, atraso, prom) => L.pontuarDespacho({ prioridadeManual: pm, prometidoEm: prom, deslocMin: 10 }, { estado: est, atrasoMin: atraso }, AGORA);
  const manual = s(true, "no-prazo", 0, AGORA + 60 * 60000);
  const atr = s(false, "atrasado", 5, AGORA - 5 * 60000);
  const risco = s(false, "risco", 8, AGORA + 10 * 60000);
  const okk = s(false, "no-prazo", 0, AGORA + 10 * 60000);
  ok(manual > atr && atr > risco && risco > okk, "19. ordem manual > atrasado > risco > prazo");
}

if (falhas > 0) {
  console.error(`K8.1/K8.2: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log("K8.1/K8.2: casos passando.");
