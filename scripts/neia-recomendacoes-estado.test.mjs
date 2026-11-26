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
  adiadaVigente,
  candidatosResolucao,
  correspondeFiltroSituacao,
  decidirOcorrencia,
  dispensaExpirada,
  LIMITE_ADIAMENTO_CRITICO_MS,
  prazoAdiamento,
  prazosAdiamento,
  rotuloSituacaoRecomendacao,
  situacaoEfetiva,
  validarAdiamento,
  validarMotivo,
  VALIDADE_DISPENSA_DIAS,
} = await import(carregar("../src/lib/neia-recomendacoes-estado.ts"));

const agora = Date.parse("2026-11-26T12:00:00.000Z");
const hora = 60 * 60 * 1000;
const dia = 24 * hora;

const estado = (extra = {}) => ({
  id: "e1",
  recomendacao_id: "estoque-revisar",
  situacao: "pendente",
  prioridade: "alta",
  ocorrencia: 1,
  adiada_ate: null,
  dispensada_em: null,
  resolvida_em: null,
  ...extra,
});

test("recomendação adiada com prazo vencido volta a ficar pendente", () => {
  const vencida = estado({ situacao: "adiada", adiada_ate: new Date(agora - 1000).toISOString() });
  assert.equal(situacaoEfetiva(vencida, agora), "pendente");
  assert.equal(adiadaVigente(vencida, agora), false);

  const vigente = estado({ situacao: "adiada", adiada_ate: new Date(agora + hora).toISOString() });
  assert.equal(situacaoEfetiva(vigente, agora), "adiada");
  assert.equal(adiadaVigente(vigente, agora), true);
});

test("situação efetiva preserva ciência, dispensa e resolução", () => {
  assert.equal(situacaoEfetiva(estado({ situacao: "ciente" }), agora), "ciente");
  assert.equal(situacaoEfetiva(estado({ situacao: "dispensada" }), agora), "dispensada");
  assert.equal(situacaoEfetiva(estado({ situacao: "resolvida" }), agora), "resolvida");
  assert.equal(situacaoEfetiva(undefined, agora), "pendente");
});

test("primeira ocorrência cria registro novo", () => {
  assert.equal(decidirOcorrencia(undefined, "alta", agora), "nova-ocorrencia");
});

test("problema que volta depois de resolvido gera nova ocorrência", () => {
  assert.equal(
    decidirOcorrencia(estado({ situacao: "resolvida" }), "alta", agora),
    "nova-ocorrencia",
  );
});

test("dispensa dentro do prazo mantém o estado, salvo piora de prioridade", () => {
  const dentro = estado({
    situacao: "dispensada",
    dispensada_em: new Date(agora - dia).toISOString(),
    prioridade: "alta",
  });
  assert.equal(decidirOcorrencia(dentro, "alta", agora), "manter");
  assert.equal(decidirOcorrencia(dentro, "critica", agora), "reativar");
  assert.equal(dispensaExpirada(dentro, agora), false);
});

test("dispensa vencida (7 dias) permite reativação", () => {
  const vencida = estado({
    situacao: "dispensada",
    dispensada_em: new Date(agora - VALIDADE_DISPENSA_DIAS * dia - 1000).toISOString(),
  });
  assert.equal(dispensaExpirada(vencida, agora), true);
  assert.equal(decidirOcorrencia(vencida, "alta", agora), "reativar");
});

test("recomendação em acompanhamento continua no estado atual", () => {
  assert.equal(decidirOcorrencia(estado({ situacao: "ciente" }), "alta", agora), "manter");
  assert.equal(decidirOcorrencia(estado({ situacao: "adiada" }), "alta", agora), "manter");
});

test("resolução automática exige fonte com dados suficientes", () => {
  const pendente = estado();
  const base = {
    categoria: (id) => (id === "estoque-revisar" ? "estoque" : undefined),
    suficiente: () => "suficiente",
  };

  const semDados = candidatosResolucao(
    [pendente],
    [],
    base.categoria,
    () => "sem-registros",
    agora,
  );
  assert.equal(semDados.length, 0, "sem registros não resolve");

  const parcial = candidatosResolucao([pendente], [], base.categoria, () => "parcial", agora);
  assert.equal(parcial.length, 0, "dados parciais não resolvem");

  const falha = candidatosResolucao([pendente], [], base.categoria, () => "falha", agora);
  assert.equal(falha.length, 0, "falha de consulta não resolve");

  const suficiente = candidatosResolucao([pendente], [], base.categoria, base.suficiente, agora);
  assert.equal(suficiente.length, 1, "fonte suficiente resolve");
});

test("recomendação ainda ativa, adiada vigente, dispensada ou resolvida não resolvem", () => {
  const categoria = () => "estoque";
  const suficiente = () => "suficiente";

  assert.equal(
    candidatosResolucao([estado()], ["estoque-revisar"], categoria, suficiente, agora).length,
    0,
    "ainda ativa não resolve",
  );
  assert.equal(
    candidatosResolucao(
      [estado({ situacao: "adiada", adiada_ate: new Date(agora + hora).toISOString() })],
      [],
      categoria,
      suficiente,
      agora,
    ).length,
    0,
    "adiada vigente não resolve",
  );
  assert.equal(
    candidatosResolucao([estado({ situacao: "dispensada" })], [], categoria, suficiente, agora)
      .length,
    0,
    "dispensada não resolve",
  );
  assert.equal(
    candidatosResolucao([estado({ situacao: "resolvida" })], [], categoria, suficiente, agora)
      .length,
    0,
    "resolvida não resolve",
  );
});

test("adiamento de crítico é limitado a 24 horas", () => {
  assert.equal(validarAdiamento("alta", agora, agora + 7 * dia), null);
  assert.equal(validarAdiamento("critica", agora, agora + LIMITE_ADIAMENTO_CRITICO_MS), null);
  assert.ok(validarAdiamento("critica", agora, agora + LIMITE_ADIAMENTO_CRITICO_MS + 1000));
  assert.ok(validarAdiamento("alta", agora, agora - 1000), "prazo precisa ser futuro");
  assert.ok(validarAdiamento("alta", agora, Number.NaN), "prazo inválido");
});

test("prazos rápidos de adiamento estão dentro do limite crítico", () => {
  const prazos = prazosAdiamento(agora);
  assert.deepEqual(
    prazos.map((prazo) => prazo.id),
    ["1h", "3h", "amanha", "7d", "personalizado"],
  );
  const umaHora = prazos.find((prazo) => prazo.id === "1h");
  const amanha = prazos.find((prazo) => prazo.id === "amanha");
  const seteDias = prazos.find((prazo) => prazo.id === "7d");
  assert.equal(umaHora?.ate, agora + hora);
  assert.ok((amanha?.ate ?? 0) > agora);
  assert.ok(
    (amanha?.ate ?? 0) - agora <= LIMITE_ADIAMENTO_CRITICO_MS,
    "amanhã respeita o limite de 24 horas do crítico",
  );
  assert.ok(
    (seteDias?.ate ?? 0) - agora > LIMITE_ADIAMENTO_CRITICO_MS,
    "sete dias excede o limite de 24 horas do crítico",
  );
});

test("filtro por situação separa pendentes, cientes, adiadas e com tarefa", () => {
  assert.equal(correspondeFiltroSituacao("pendente", "todas", false), true);
  assert.equal(correspondeFiltroSituacao("pendente", "pendente", false), true);
  assert.equal(correspondeFiltroSituacao("pendente", "ciente", false), false);
  assert.equal(correspondeFiltroSituacao("ciente", "ciente", false), true);
  assert.equal(correspondeFiltroSituacao("adiada", "adiada", false), true);
  assert.equal(correspondeFiltroSituacao("pendente", "com-tarefa", true), true);
  assert.equal(correspondeFiltroSituacao("pendente", "com-tarefa", false), false);
  assert.equal(correspondeFiltroSituacao("resolvida", "resolvida", false), true);
  assert.equal(correspondeFiltroSituacao("dispensada", "dispensada", false), true);
});

test("motivo é obrigatório e limitado a 500 caracteres", () => {
  assert.ok(validarMotivo(""), "motivo vazio é recusado");
  assert.ok(validarMotivo("   "), "motivo em branco é recusado");
  assert.equal(validarMotivo("Conferido com a gerência"), null);
  assert.ok(validarMotivo("x".repeat(501)), "motivo longo é recusado");
});

test("rótulos de situação aparecem para a tela", () => {
  assert.equal(rotuloSituacaoRecomendacao("pendente"), "Pendentes");
  assert.equal(rotuloSituacaoRecomendacao("com-tarefa"), "Com tarefa");
  assert.equal(rotuloSituacaoRecomendacao("dispensada"), "Dispensadas");
});
