import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const [, , psql, port] = process.argv;
assert(psql && /^\d{4,5}$/.test(port ?? ""), "Informe o psql e a porta do cluster local descartável.");
const args = [
  "-X", "-h", "127.0.0.1", "-U", "postgres", "-d", "central_atendente_prazo_teste",
  "-p", port, "-v", "ON_ERROR_STOP=1",
];
const env = { ...process.env, PGCLIENTENCODING: "UTF8" };
const aqui = (arquivo) => fileURLToPath(new URL(arquivo, import.meta.url));
const sql = (query) => execFileSync(psql, [...args, "-Atq", "-c", query], { env, encoding: "utf8" }).trim();
const membro = "00000000-0000-4000-8000-000000000011";
const pedido = "10000000-0000-4000-8000-000000000020";
const claims = `SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','${membro}',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);`;

const temporario = mkdtempSync(join(tmpdir(), "neia-prazo-0134-"));
const guard = join(temporario, "guard.sql");
const freeze = join(temporario, "freeze.sql");
try {
  const guardFonte = readFileSync(aqui("lfl-finalizacao-0123/00-guard-pedido.sql"), "utf8");
  const freezeFonte = readFileSync(aqui("../../drizzle/migrations/0084_etapas_operacionais.sql"), "utf8");
  const guardSql = guardFonte.match(/CREATE OR REPLACE FUNCTION public\.pedidos_guard_update\(\)[\s\S]*?\$function\$\s*;/);
  const freezeSql = freezeFonte.match(/CREATE OR REPLACE FUNCTION public\.congelar_colunas_protegidas\(\)[\s\S]*?END \$\$;/);
  assert(guardSql && freezeSql, "Definições de segurança da fixture não encontradas.");
  writeFileSync(guard, guardSql[0]);
  writeFileSync(freeze, freezeSql[0]);
  execFileSync(psql, [...args, "-q", "-v", `p0_guard=${guard.replaceAll("\\", "/")}`,
    "-v", `p0_freeze=${freeze.replaceAll("\\", "/")}`, "-f", aqui("prazo-comercial-0134.test.sql")],
    { env, stdio: "inherit" });
} finally {
  for (const arquivo of [guard, freeze]) {
    try { unlinkSync(arquivo); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  rmdirSync(temporario);
}

function sessao(nome) {
  const proc = spawn(psql, [...args, "-Atq"], {
    env: { ...env, PGAPPNAME: nome }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  proc.stdout.resume();
  let erro = "";
  proc.stderr.on("data", (chunk) => { erro += chunk; });
  const encerrada = new Promise((resolve) => {
    proc.on("error", (error) => resolve({ code: 1, erro: error.message }));
    proc.on("close", (code) => resolve({ code, erro }));
  });
  return { proc, encerrada };
}

async function aguardarSessao(nome, condicao) {
  for (let tentativa = 0; tentativa < 25; tentativa++) {
    if (sql(`SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE application_name='${nome}' AND ${condicao}
    )`) === "t") return;
    await setTimeout(120);
  }
  throw new Error(`Sessão ${nome} não atingiu a etapa esperada.`);
}

const primeira = sessao("neia_p0_primeira");
const segunda = sessao("neia_p0_segunda");
try {
  primeira.proc.stdin.write(`${claims}
BEGIN;
INSERT INTO public.pedido_itens(id,pedido_id,produto_id) VALUES (2001,'${pedido}',2);
`);
  await aguardarSessao("neia_p0_primeira", "state='idle in transaction'");
  segunda.proc.stdin.end(`${claims}
BEGIN;
INSERT INTO public.pedido_itens(id,pedido_id,produto_id) VALUES (2002,'${pedido}',5);
COMMIT;
`);
  await aguardarSessao("neia_p0_segunda", "wait_event_type='Lock'");
  primeira.proc.stdin.end("COMMIT;\n");
  for (const resultado of await Promise.all([primeira.encerrada, segunda.encerrada])) {
    assert.equal(resultado.code, 0, resultado.erro);
  }
  assert.equal(sql(`SELECT prazo_comercial_assados IS TRUE
    AND abs(extract(epoch FROM (prazo_prometido_inicio_em-created_at))-4200)<1
    AND abs(extract(epoch FROM (prazo_prometido_em-created_at))-6000)<1
    AND (SELECT count(*) FROM public.pedido_itens WHERE pedido_id='${pedido}')=2
    FROM public.pedidos WHERE id='${pedido}'`), "t");
  console.log("OK: duas sessões gravam itens concorrentes com um único adicional");
} finally {
  for (const { proc } of [primeira, segunda]) if (proc.exitCode === null) proc.kill();
}

const prazoAntes = sql(`SELECT prazo_prometido_em FROM public.pedidos WHERE id='${pedido}'`);
execFileSync(psql, [...args, "-q", "-f", aqui("reverter-prazo-comercial-0134.sql")], { env, stdio: "inherit" });
assert.equal(sql(`SELECT prazo_prometido_em FROM public.pedidos WHERE id='${pedido}'`), prazoAntes);
assert.equal(sql(`SELECT tgqual IS NULL FROM pg_trigger
  WHERE tgrelid='public.pedidos'::regclass AND tgname='pedidos_guard_update_trg'`), "t");
const smoke = sql(`${claims}
INSERT INTO public.pedidos(id,user_id,tipo_entrega)
VALUES ('10000000-0000-4000-8000-000000000021',auth.uid(),'entrega');
INSERT INTO public.pedido_itens(pedido_id,produto_id)
VALUES ('10000000-0000-4000-8000-000000000021',2);
SELECT count(*)=1 FROM public.pedido_itens WHERE pedido_id='10000000-0000-4000-8000-000000000021';`);
assert.equal(smoke.split(/\r?\n/).at(-1), "t");
console.log("OK: reversão preserva prazo gravado, restaura a guarda e mantém a venda de assados");
