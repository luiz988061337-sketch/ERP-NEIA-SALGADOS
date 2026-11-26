/**
 * Testes da barreira de destino dos bancos (P0 de 26/11/2026).
 *
 * Somente leitura local e valores fictícios. Nenhum teste abre conexão com
 * banco, executa migração ou lê segredo. Comprova que produção é bloqueada
 * sem depender de `supabase --linked` ou do `.env` real.
 *
 * Uso: node --test scripts/ambiente-seguro.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { avaliarBuild } from "./proteger-build.mjs";
import { avaliarAmbiente } from "./proteger-dev.mjs";
import {
  PROJETO_HOMOLOGACAO,
  PROJETO_PRODUCAO,
  avaliarOperacao,
  carregarConfiguracao,
  ehProjetoProducao,
  extrairRefDaUrl,
  lerAlvoDosArgumentos,
} from "./ambiente-seguro.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const CLI = fileURLToPath(new URL("./validar-destino.mjs", import.meta.url));
const EXECUTOR = fileURLToPath(new URL("./executar-sql-homolog.mjs", import.meta.url));
const SQL_EXISTENTE = "drizzle/migrations/0127_a01_tarefas_gestao.sql";

const ENV_HOMOLOG = {
  VITE_SUPABASE_URL: `https://${PROJETO_HOMOLOGACAO}.supabase.co`,
  VITE_SUPABASE_PROJECT_ID: PROJETO_HOMOLOGACAO,
  NEIA_AMBIENTE: "homologacao",
};
const ENV_PRODUCAO = {
  VITE_SUPABASE_URL: `https://${PROJETO_PRODUCAO}.supabase.co`,
  VITE_SUPABASE_PROJECT_ID: PROJETO_PRODUCAO,
  NEIA_AMBIENTE: "homologacao",
};

function semConfig(extra = {}) {
  return {
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_PROJECT_ID: "",
    SUPABASE_URL: "",
    SUPABASE_PROJECT_ID: "",
    ...extra,
  };
}

function comEnv(env) {
  return avaliarOperacao({ alvo: PROJETO_HOMOLOGACAO, raiz: RAIZ, env });
}

function raizTemporaria(conteudoEnv) {
  const dir = mkdtempSync(join(tmpdir(), "neia-ambiente-"));
  writeFileSync(join(dir, ".env"), conteudoEnv, "utf8");
  return dir;
}

// --- classificação básica -------------------------------------------------

test("reconhece produção sem diferenciar caixa ou espaços", () => {
  assert.equal(ehProjetoProducao(PROJETO_PRODUCAO), true);
  assert.equal(ehProjetoProducao(`  ${PROJETO_PRODUCAO.toUpperCase()}  `), true);
  assert.equal(ehProjetoProducao(PROJETO_HOMOLOGACAO), false);
  assert.equal(ehProjetoProducao(""), false);
});

test("extrai a referência apenas de hosts supabase.co", () => {
  assert.equal(extrairRefDaUrl(`https://${PROJETO_HOMOLOGACAO}.supabase.co`), PROJETO_HOMOLOGACAO);
  assert.equal(extrairRefDaUrl("https://exemplo.com"), "");
  assert.equal(extrairRefDaUrl("url-invalida"), "");
  assert.equal(extrairRefDaUrl(""), "");
});

test("carrega configuração efetiva com ambiente sobrepondo o .env", () => {
  const dir = raizTemporaria(`VITE_SUPABASE_URL="https://${PROJETO_PRODUCAO}.supabase.co"\n`);
  try {
    const soArquivo = carregarConfiguracao(dir, {});
    assert.equal(soArquivo.projeto, "");
    assert.equal(extrairRefDaUrl(soArquivo.url), PROJETO_PRODUCAO);
    const comAmbiente = carregarConfiguracao(dir, ENV_HOMOLOG);
    assert.equal(comAmbiente.projeto, PROJETO_HOMOLOGACAO);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- bloqueios de destino -------------------------------------------------

test("homologação com configuração coerente é autorizada", () => {
  const r = comEnv(ENV_HOMOLOG);
  assert.equal(r.ok, true);
  assert.equal(r.projeto, PROJETO_HOMOLOGACAO);
});

test("produção é bloqueada pelo próprio --project-ref", () => {
  const r = avaliarOperacao({ alvo: PROJETO_PRODUCAO, raiz: RAIZ, env: ENV_PRODUCAO });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "producao");
});

test("produção disfarçada de caixa alta é bloqueada", () => {
  const r = avaliarOperacao({
    alvo: PROJETO_PRODUCAO.toUpperCase(),
    raiz: RAIZ,
    env: ENV_PRODUCAO,
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "producao");
});

test("destino ausente não cai para o .env nem para --linked", () => {
  const dir = raizTemporaria(`VITE_SUPABASE_URL="https://${PROJETO_PRODUCAO}.supabase.co"\n`);
  try {
    const r = avaliarOperacao({ alvo: "", raiz: dir, env: semConfig() });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "destino_nao_declarado");
    assert.match(r.motivo, /--linked/);
    assert.match(r.motivo, /\.env/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("referência com formato inválido é bloqueada", () => {
  const r = avaliarOperacao({ alvo: "curto", raiz: RAIZ, env: ENV_HOMOLOG });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "destino_invalido");
});

test("destino desconhecido não é aceito, mesmo fora de produção", () => {
  const r = avaliarOperacao({ alvo: "aaaaaaaaaaaaaaaaaaaa", raiz: RAIZ, env: ENV_HOMOLOG });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "fora_de_homologacao");
});

test("banco local não é confundido com homologação", () => {
  const r = avaliarOperacao({
    alvo: PROJETO_HOMOLOGACAO,
    raiz: RAIZ,
    env: semConfig({ VITE_SUPABASE_URL: "http://127.0.0.1:54321" }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "fora_de_homologacao");
});

// --- bloqueios por configuração efetiva -----------------------------------

test("alvo homologado com URL de produção é bloqueado (sem fallback silencioso)", () => {
  const r = comEnv(ENV_PRODUCAO);
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "configuracao_producao");
});

test(".env apontando para produção bloqueia mesmo com alvo homologado", () => {
  const dir = raizTemporaria(
    `VITE_SUPABASE_URL="https://${PROJETO_PRODUCAO}.supabase.co"\n` +
      `VITE_SUPABASE_PROJECT_ID="${PROJETO_PRODUCAO}"\n`,
  );
  try {
    const r = avaliarOperacao({ alvo: PROJETO_HOMOLOGACAO, raiz: dir, env: {} });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "configuracao_producao");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("URL de homologação com PROJECT_ID de produção é bloqueada", () => {
  const r = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_PROJECT_ID: PROJETO_PRODUCAO,
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "configuracao_producao");
});

test("URL de produção com PROJECT_ID de homologação é bloqueada", () => {
  const r = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_URL: `https://${PROJETO_PRODUCAO}.supabase.co`,
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "configuracao_producao");
});

test("projeto efetivo divergente do alvo é bloqueado", () => {
  const r = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_PROJECT_ID: "bbbbbbbbbbbbbbbbbbbb",
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "divergencia");
});

test("URL efetiva divergente do alvo é bloqueada", () => {
  const r = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "divergencia");
});

test("configuração ausente bloqueia em vez de assumir um destino", () => {
  const r = avaliarOperacao({ alvo: PROJETO_HOMOLOGACAO, raiz: RAIZ, env: semConfig() });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "configuracao_ausente");
});

test("URL inválida e host desconhecido são bloqueados", () => {
  const invalida = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_URL: "::::",
    VITE_SUPABASE_PROJECT_ID: "",
  });
  assert.equal(invalida.ok, false);
  assert.equal(invalida.codigo, "url_invalida");

  const desconhecida = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_URL: "https://banco.exemplo.com",
    VITE_SUPABASE_PROJECT_ID: PROJETO_HOMOLOGACAO,
  });
  assert.equal(desconhecida.ok, false);
  assert.equal(desconhecida.codigo, "destino_desconhecido");
});

test("broker de produção é bloqueado", () => {
  const r = comEnv({
    ...ENV_HOMOLOG,
    VITE_SUPABASE_URL: "https://abc-prod.lovable.cloud",
    VITE_SUPABASE_PROJECT_ID: PROJETO_HOMOLOGACAO,
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "configuracao_producao");
});

test("motivos nunca expõem o valor da referência de produção", () => {
  const r = avaliarOperacao({ alvo: PROJETO_PRODUCAO, raiz: RAIZ, env: ENV_PRODUCAO });
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.motivo, new RegExp(PROJETO_PRODUCAO));
});

// --- leitura de argumentos ------------------------------------------------

test("lê --project-ref nas duas formas", () => {
  assert.equal(
    lerAlvoDosArgumentos(["--project-ref", PROJETO_HOMOLOGACAO], {}),
    PROJETO_HOMOLOGACAO,
  );
  assert.equal(
    lerAlvoDosArgumentos([`--project-ref=${PROJETO_HOMOLOGACAO}`], {}),
    PROJETO_HOMOLOGACAO,
  );
  assert.equal(
    lerAlvoDosArgumentos([], { NEIA_PROJETO_ALVO: PROJETO_HOMOLOGACAO }),
    PROJETO_HOMOLOGACAO,
  );
});

test("--linked sozinho não declara destino", () => {
  assert.equal(lerAlvoDosArgumentos(["--linked"], semConfig()), "");
});

// --- CLI: códigos de saída comprovam o bloqueio ---------------------------

function executar(script, args, env) {
  try {
    const saida = execFileSync(process.execPath, [script, ...args], {
      cwd: RAIZ,
      env: { ...semConfig(), ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, saida };
  } catch (erro) {
    return {
      status: erro.status ?? 1,
      saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}`,
    };
  }
}

test("CLI: produção retorna código 2 e não imprime valores sensíveis", () => {
  const r = executar(CLI, ["--project-ref", PROJETO_PRODUCAO], ENV_PRODUCAO);
  assert.equal(r.status, 2);
  assert.match(r.saida, /bloqueada/);
  assert.doesNotMatch(r.saida, new RegExp(PROJETO_PRODUCAO));
});

test("CLI: sem --project-ref retorna código 2 mesmo com --linked", () => {
  const r = executar(CLI, ["--linked"], {});
  assert.equal(r.status, 2);
  assert.match(r.saida, /destino não declarado/);
});

test("CLI: homologação coerente retorna código 0", () => {
  const r = executar(CLI, ["--project-ref", PROJETO_HOMOLOGACAO, "--json"], ENV_HOMOLOG);
  assert.equal(r.status, 0);
  assert.match(r.saida, /"ok":true/);
});

test("executor SQL: produção bloqueia antes de qualquer conexão", () => {
  const r = executar(
    EXECUTOR,
    ["--arquivo", SQL_EXISTENTE, "--project-ref", PROJETO_PRODUCAO],
    ENV_PRODUCAO,
  );
  assert.equal(r.status, 2);
  assert.match(r.saida, /bloqueada/);
});

test("executor SQL: homologação sem --confirmar apenas simula", () => {
  const r = executar(
    EXECUTOR,
    ["--arquivo", SQL_EXISTENTE, "--project-ref", PROJETO_HOMOLOGACAO],
    ENV_HOMOLOG,
  );
  assert.equal(r.status, 0);
  assert.match(r.saida, /Simulação/);
});

// --- barreira de build ----------------------------------------------------

test("build de homologação exige URL/projeto, ambiente e demo desligado", () => {
  const base = { ...ENV_HOMOLOG, VITE_DEMO_PREVIEW: "0" };
  assert.equal(avaliarBuild({ exigir: "homologacao", raiz: RAIZ, env: base }).ok, true);

  const comProducao = avaliarBuild({
    exigir: "homologacao",
    raiz: RAIZ,
    env: { ...base, ...ENV_PRODUCAO },
  });
  assert.equal(comProducao.ok, false);

  const comDemo = avaliarBuild({
    exigir: "homologacao",
    raiz: RAIZ,
    env: { ...base, VITE_DEMO_PREVIEW: "1" },
  });
  assert.equal(comDemo.ok, false);

  const semAmbiente = avaliarBuild({
    exigir: "homologacao",
    raiz: RAIZ,
    env: { ...base, NEIA_AMBIENTE: "" },
  });
  assert.equal(semAmbiente.ok, false);
});

test("build de produção só é liberado dentro da Vercel de produção", () => {
  const env = { ...ENV_PRODUCAO, VITE_DEMO_PREVIEW: "0" };
  assert.equal(avaliarBuild({ exigir: "producao", raiz: RAIZ, env }).ok, false);
  assert.equal(
    avaliarBuild({ exigir: "producao", raiz: RAIZ, env: { ...env, VERCEL_ENV: "production" } }).ok,
    true,
  );
});

test("build sem exigência falha fechado", () => {
  assert.equal(avaliarBuild({ exigir: "", raiz: RAIZ, env: ENV_HOMOLOG }).ok, false);
});

// --- barreira de desenvolvimento -----------------------------------------

test("dev em homologação exige o projeto oficial", () => {
  const ok = avaliarAmbiente({
    url: `https://${PROJETO_HOMOLOGACAO}.supabase.co`,
    projectId: PROJETO_HOMOLOGACAO,
    ambiente: "homologacao",
  });
  assert.equal(ok.ok, true);

  const outro = avaliarAmbiente({
    url: "https://stg-ficticio-123.supabase.co",
    projectId: "stg-ficticio-123",
    ambiente: "homologacao",
  });
  assert.equal(outro.ok, false);
});
