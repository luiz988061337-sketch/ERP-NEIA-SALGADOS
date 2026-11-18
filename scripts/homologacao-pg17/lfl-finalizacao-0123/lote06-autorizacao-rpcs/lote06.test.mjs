import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(dir, '../../../..');
const sql = readFileSync(resolve(dir, '06-autorizacao-rpcs.sql'), 'utf8');
const driver = readFileSync(resolve(dir, 'executar-lote06.ps1'), 'utf8');
const cases = readFileSync(resolve(dir, '06-autorizacao-rpcs.test.sql'), 'utf8');
const plan = readFileSync(resolve(dir, 'P1-PARCEIROS-PLANO-REVISADO.md'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(dir, 'ORIGEM-06.json'), 'utf8'));
const bare = sql.replace(/--[^\n]*/g, '');

test('lote restrito a loopback, banco descartavel, usuario e marca do ensaio', () => {
  for (const guard of ['127.0.0.1', 'lfl_partial', '^restore_[a-f0-9]{12}$', 'LFL_LOCAL_ADITIVO_0123']) {
    assert.ok(sql.includes(guard), guard);
  }
});
test('nenhum novo GRANT ou alteracao de tabela, policy, enum ou cron', () => {
  assert.doesNotMatch(bare, /\bGRANT\b|\bALTER\s+(?:TABLE|TYPE)|\b(?:CREATE|DROP)\s+POLICY|\bcron\./i);
  assert.doesNotMatch(bare, /processar_lembretes|app\.financeiro_atomic_write/);
});
test('worker privado fechado; nao usa profundidade de trigger como autorizacao', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION neia_operacao\.consumir_insumos_pedido_interno\(uuid\)\s+FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(bare, /pg_trigger_depth\s*\(/i);
  assert.match(sql, /PERFORM neia_operacao\.consumir_insumos_pedido_interno\(NEW\.id\);\s+RETURN NEW;/);
});
test('guardas falham fechadas e negam com SQLSTATE 42501', () => {
  assert.equal((sql.match(/IS NOT TRUE THEN/g) ?? []).length, 4);
  assert.equal((sql.match(/ERRCODE='42501'/g) ?? []).length, 4);
  for (const label of ['compra_nao_autorizada','consumo_nao_autorizado','impressao_nao_autorizada','reprocessamento_nao_autorizado']) {
    assert.ok(sql.includes('lote06_'+label));
  }
});
test('contrato anterior e worker sao comparados, inclusive job e ACL', () => {
  for (const field of ['identity','owner','acl','args','result','originalConsumo','a.body -cne $b.clean']) assert.ok(driver.includes(field));
  assert.match(driver, /Funcao fora do escopo alterada/);
  assert.match(driver, /Lote 06 nao idempotente/);
});
test('instrumentacao aplica 06 antes de U1-U9 e nao edita o driver 05', () => {
  assert.match(driver, /scriptblock\]::Create\(\$source\)/);
  assert.match(driver, /\$source\.Replace\(\$applyMarker/);
  assert.doesNotMatch(driver, /Set-Content\s+.*\$original|WriteAllText\(\$original/);
  assert.match(driver, /ORIGEM-06\.json/);
});
test('matriz exercita oito contextos, worker fechado e efeitos reais', () => {
  for (const role of ['anon','cliente','atendente','producao','financeiro','admin','servico','claims_ausentes']) assert.ok(cases.includes("'"+role+"'"));
  for (const effect of ['quantidade_recebida','estoque_atual','insumo_movimentacoes','solicitar_reimpressao','em_producao']) assert.ok(cases.includes(effect));
  assert.match(cases, /EXCEPTION WHEN insufficient_privilege/);
  assert.match(cases, /ROLLBACK;/);
});
test('plano parceiros preserva nova, view e candidatura; separa estrutural', () => {
  for (const name of ['parceiros read','parceiros write',"status='nova'",'parceiros_publicos','TRUNCATE']) assert.ok(plan.includes(name));
  assert.match(plan, /Nao recriar automaticamente/);
});
test('hashes atuais e driver 05 aprovado conferem', () => {
  for (const [file, sha] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(readFileSync(resolve(repo,file))).digest('hex'), sha, file);
  }
  const original=resolve(repo,'scripts/homologacao-pg17/lfl-finalizacao-0123/complemento-b-laboratorio/executar-complemento.ps1');
  assert.equal(createHash('sha256').update(readFileSync(original)).digest('hex'), manifest.driver05);
});
