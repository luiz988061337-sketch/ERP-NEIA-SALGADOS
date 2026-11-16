import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AVALIACOES_DEMO_C4,
  RECLAMACOES_DEMO_C4,
  calcularIndicadoresC4,
  classificarAvaliacao,
  criarReclamacaoDeAvaliacao,
  filtrarAvaliacoes,
  filtrarReclamacoes,
  mudarStatusReclamacao,
  registrarAcompanhamento,
  registrarSolucao,
  reabrirReclamacao,
} from "../src/components/comercial-preview/pesquisas-reclamacoes-regras.ts";

assert.equal(classificarAvaliacao(1), "negativa");
assert.equal(classificarAvaliacao(2), "negativa");
assert.equal(classificarAvaliacao(3), "acompanhar");
assert.equal(classificarAvaliacao(4), "positiva");
assert.equal(classificarAvaliacao(5), "positiva");

const fA = { periodo: "7", origem: "Entrega", responsavel: "todos", avaliacao: "negativas", status: "todos" };
const filtradas = filtrarAvaliacoes(AVALIACOES_DEMO_C4, fA);
assert.deepEqual(filtradas.map((a) => a.id), ["AV-105", "AV-103"]);
assert.equal(filtrarAvaliacoes(AVALIACOES_DEMO_C4, { ...fA, avaliacao: "todas", origem: "Retirada" }).length, 2);
assert.equal(filtrarAvaliacoes(AVALIACOES_DEMO_C4, { ...fA, status: "aguardando" }).every((a) => a.aguardandoResposta), true);
assert.equal(filtrarReclamacoes(RECLAMACOES_DEMO_C4, { periodo: "7", origem: "Entrega", responsavel: "todos", status: "todos" }).length, 2);

const metrics = calcularIndicadoresC4(AVALIACOES_DEMO_C4, RECLAMACOES_DEMO_C4);
assert.equal(metrics.totalAvaliacoes, 10);
assert.equal(metrics.negativas, 4);
assert.equal(metrics.satisfeitos, 4);
assert.ok(metrics.notaMedia > 0 && metrics.notaMedia <= 5);
assert.ok(metrics.reclamacoesAbertas > 0);
assert.ok(metrics.reclamacoesResolvidas > 0);
assert.ok(metrics.tempoMedioResolucao > 0);

const review = AVALIACOES_DEMO_C4.find((a) => a.id === "AV-107");
assert.ok(review);
const created = criarReclamacaoDeAvaliacao(review, RECLAMACOES_DEMO_C4, "Marina Lopes", "2026-11-16T12:00:00-03:00");
assert.equal(created.ok, true);
if (created.ok) {
  assert.equal(created.reclamacao.avaliacaoId, review.id);
  assert.equal(created.reclamacao.status, "Nova");
  assert.equal(created.reclamacao.historico.length, 1);
  assert.equal(criarReclamacaoDeAvaliacao(review, [...RECLAMACOES_DEMO_C4, created.reclamacao], "Marina Lopes", "2026-11-16T12:00:00-03:00").ok, false);
}
const neutral = AVALIACOES_DEMO_C4.find((a) => a.nota === 3);
assert.ok(neutral);
assert.equal(criarReclamacaoDeAvaliacao(neutral, [], "Marina Lopes", "2026-11-16T12:00:00-03:00").ok, false);

const sample = RECLAMACOES_DEMO_C4.find((r) => r.id === "C4-104");
assert.ok(sample);
const transition = mudarStatusReclamacao(sample, "Resolvida", "Marina Lopes", "2026-11-16T12:00:00-03:00");
assert.equal(transition.ok, true);
if (transition.ok) {
  assert.equal(transition.reclamacao.status, "Resolvida");
  assert.equal(transition.reclamacao.historico.length, sample.historico.length + 1);
  assert.equal(mudarStatusReclamacao(transition.reclamacao, "Nova", "Marina Lopes", "2026-11-16T12:00:00-03:00").ok, false);
  assert.equal(mudarStatusReclamacao(transition.reclamacao, "Encerrada", "Marina Lopes", "2026-11-16T12:00:00-03:00").ok, false);
  const closed = mudarStatusReclamacao(transition.reclamacao, "Encerrada", "Marina Lopes", "2026-11-16T12:00:00-03:00", "Cliente confirmou resolução");
  assert.equal(closed.ok, true);
  if (closed.ok) {
    const reopened = reabrirReclamacao(closed.reclamacao, "Cliente retornou com o mesmo problema", "Marina Lopes", "2026-11-17T12:00:00-03:00");
    assert.equal(reopened.ok, true);
    if (reopened.ok) {
      assert.equal(reopened.reclamacao.status, "Em análise");
      assert.equal(reopened.reclamacao.historico.length, closed.reclamacao.historico.length + 1);
      assert.equal(reopened.reclamacao.reaberturas, sample.reaberturas + 1);
    }
  }
}
assert.equal(registrarAcompanhamento(sample, "", "Marina Lopes", "2026-11-16T12:00:00-03:00").ok, false);
const followup = registrarAcompanhamento(sample, "Cliente contatado", "Marina Lopes", "2026-11-16T12:00:00-03:00");
assert.equal(followup.ok, true);
if (followup.ok) assert.equal(followup.reclamacao.historico.length, sample.historico.length + 1);
const proposal = registrarSolucao(sample, "Contato com cliente", "Marina Lopes", "2026-11-16T12:00:00-03:00");
assert.equal(proposal.ok, true);
if (proposal.ok) assert.match(proposal.reclamacao.historico.at(-1).acao, /Nenhuma compensação foi executada/);

const component = await readFile(new URL("../src/components/comercial-preview/tela-pesquisas-reclamacoes.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../src/routes/preview/comercial/pesquisas-reclamacoes.tsx", import.meta.url), "utf8");
const rules = await readFile(new URL("../src/components/comercial-preview/pesquisas-reclamacoes-regras.ts", import.meta.url), "utf8");
assert.doesNotMatch(`${component}\n${route}\n${rules}`, /supabase|fetch\s*\(|axios|sendMessage|\.from\s*\(\s*["']/i);
assert.doesNotMatch(`${component}\n${route}\n${rules}`, /\.sent_at\s*=|pix|estornar\s*\(/i);

console.log("C4: classificação, filtros, métricas, abertura sem duplicidade, status, histórico, reabertura, propostas sem execução e isolamento local validados.");
