import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const { novoEstoque } = await import("@/lib/estoque.ts");
const migration = readFileSync("drizzle/migrations/0107_movimento_estoque_manual_atomico.sql", "utf8");
const admin = readFileSync("src/routes/admin.tsx", "utf8");

assert.match(migration, /has_role\(auth\.uid\(\), 'admin'\)[\s\S]*has_role\(auth\.uid\(\), 'producao'\)/,
  "RPC restringe o movimento a admin/produção");
assert.match(migration, /chave_idempotencia uuid PRIMARY KEY/,
  "cada tentativa possui chave idempotente única");
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_chave_idempotencia::text, 0\)\)/,
  "tentativas concorrentes com a mesma chave são serializadas");
assert.match(migration, /WHERE id = p_produto_id FOR UPDATE/,
  "saldo do produto é lido sob lock");
assert.match(migration, /p_estoque_esperado IS NOT NULL AND v_estoque <> p_estoque_esperado/,
  "edição do cadastro detecta saldo alterado por outro operador");
assert.match(migration, /v_estoque \+ v_delta < 0[\s\S]*estoque_insuficiente/,
  "baixa não pode ultrapassar o saldo");
assert.match(migration, /registrar_mov_estoque\([\s\S]*INSERT INTO public\.estoque_mov[\s\S]*INSERT INTO public\.estoque_mov_operacoes/,
  "saldo autoritativo, ledger compatível e deduplicação são gravados no mesmo RPC");
assert.match(migration, /REVOKE ALL ON FUNCTION public\.movimentar_estoque_manual_atomico[\s\S]*FROM PUBLIC, anon[\s\S]*GRANT EXECUTE ON FUNCTION public\.movimentar_estoque_manual_atomico[\s\S]*TO authenticated/,
  "RPC não fica pública nem acessível a anon");

const movimentoStart = admin.indexOf("async function salvar()", admin.indexOf("function MovEstoque("));
const movimentoEnd = admin.indexOf("\n  return (", movimentoStart);
const movimento = admin.slice(movimentoStart, movimentoEnd);
assert.match(movimento, /rpc\("movimentar_estoque_manual_atomico"/,
  "formulário usa a escrita atômica");
assert.doesNotMatch(movimento, /from\("estoque_mov"\)\.insert|from\("produtos"\)\.update/,
  "formulário não grava ledger e saldo em duas chamadas");
assert.match(movimento, /chavePendente\.current/,
  "repetição após falha de rede reutiliza a chave idempotente");
assert.match(movimento, /PGRST202[\s\S]*migration 0107 ainda não está instalada/,
  "RPC ausente pausa o movimento sem fallback legado");

const productSaveStart = admin.indexOf("async function salvar(e:", admin.indexOf("function ProdutosAdmin("));
const productSaveEnd = admin.indexOf("\n  async function excluir", productSaveStart);
const productSave = admin.slice(productSaveStart, productSaveEnd);
assert.match(productSave, /if \(id\) delete payloadProduto\["estoque"\]/,
  "atualização de cadastro não sobrescreve saldo em cache");
assert.match(productSave, /p_estoque_esperado: estoqueAnterior/,
  "ajuste de saldo no cadastro compara com a versão lida");

// Teste local do validador puro; concorrência do PostgreSQL não é simulada aqui.
assert.deepEqual(novoEstoque(12, "saida", 5), { ok: true, valor: 7 });
assert.equal(novoEstoque(12, "perda", 13).ok, false);
assert.equal(novoEstoque(12, "entrada", 1.5).ok, false);
assert.equal(novoEstoque(12, "entrada", 1).ok, true);

console.log("Estoque: contrato local de lock, idempotência e integração validado estaticamente.");
console.log("Execução concorrente real, erro/rollback do PostgreSQL e interação com lotes exigem staging isolado.");
