/**
 * Contratos locais da etapa final do Estoque de Salgados.
 *
 * Execução:
 *   node --experimental-transform-types scripts/estoque-dia-contrato.test.mjs
 *
 * Checa estaticamente a ACL 0133, a carga/reversão exemplificativa e os
 * contratos puros entregues ao Codex. Nenhuma escrita remota é realizada.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("drizzle/migrations/0129_vinculos_operacionais_salgados.sql", "utf8");
const acl = readFileSync("drizzle/migrations/0133_acl_reserva_estoque_dia.sql", "utf8");
const carga = readFileSync("scripts/carga-exemplo-salgados-homolog.sql", "utf8");
const reversao = readFileSync("scripts/reverter-carga-exemplo-salgados-homolog.sql", "utf8");
const catalogo = readFileSync("src/lib/catalogo-sabores-estoque.ts", "utf8");
const contrato = await import("../src/lib/estoque-dia.ts");

function pares(sql) {
  return [...sql.matchAll(/\('([a-z-]+)',\s*(\d+)\)/g)].map((m) => [m[1], Number(m[2])]);
}

function semComentarios(sql) {
  return sql.replace(/^\s*--.*$/gm, "");
}

test("0133 reconcilia só o EXECUTE das duas RPCs usadas pelo painel", () => {
  assert.match(acl, /public\.reservar_estoque_atomica\(uuid,uuid,integer\)/);
  assert.match(acl, /public\.reservar_pedido_atomico\(uuid\)/);
  assert.match(acl, /REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
  assert.match(acl, /GRANT EXECUTE ON FUNCTION %s TO authenticated/);
  assert.match(acl, /'20261127230000'/);
  assert.match(acl, /'acl_reserva_estoque_dia'/);
  assert.match(acl, /Central da Atendente do Codex ocupa 0130/);
  assert.match(acl, /depois de 0130–0132 e da 0129 revisada/i);

  // A reconciliação não reaplica 0098 nem altera corpo, owner, RLS ou dados.
  assert.doesNotMatch(acl, /CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  assert.doesNotMatch(acl, /ALTER\s+FUNCTION[\s\S]*?OWNER\s+TO/i);
  assert.doesNotMatch(acl, /ALTER\s+TABLE[\s\S]*?(ENABLE|DISABLE)\s+ROW\s+LEVEL/i);
  assert.doesNotMatch(acl, /DROP\s+POLICY/i);
  assert.doesNotMatch(acl, /CREATE\s+POLICY/i);
  assert.doesNotMatch(acl, /DELETE\s+FROM/i);
  assert.doesNotMatch(acl, /TRUNCATE/i);
  for (const tabela of ["reservas_estoque", "lotes", "produtos", "pedidos", "notificacoes"]) {
    assert.doesNotMatch(acl, new RegExp(`(UPDATE|INSERT\\s+INTO)\\s+public\\.${tabela}\\b`, "i"));
  }
});

test("0133 valida owner, SECURITY DEFINER, search_path e autoridade funcional", () => {
  assert.match(acl, /pg_get_userbyid\(p\.proowner\)/);
  assert.match(acl, /v_owner IN \('anon', 'authenticated', 'service_role'\)/);
  assert.match(acl, /v_sd IS DISTINCT FROM r\.exige_sd/);
  assert.match(acl, /v_config @> ARRAY\['search_path=public'\]::text\[\]/);
  assert.match(acl, /v_def NOT LIKE '%has_role%' OR v_def NOT LIKE '%auth.uid\(\)%'/);

  const blocoRls = acl.slice(acl.indexOf("DO $rls$"), acl.indexOf("DO $acl$"));
  for (const tabela of ["reservas_estoque", "estoque_movimentacoes", "lotes", "reserva_consumos"]) {
    assert.match(blocoRls, new RegExp(`'public\\.${tabela}'`));
  }
  assert.match(blocoRls, /relrowsecurity/);
});

test("0133 falha fecha a transação e nenhum papel amplo conserva EXECUTE", () => {
  assert.match(acl, /^BEGIN;/m);
  assert.match(acl, /^COMMIT;/m);
  assert.match(acl, /RAISE EXCEPTION '0133/);
  assert.match(acl, /a\.grantee = 0 AND a\.privilege_type = 'EXECUTE'/);
  assert.match(acl, /has_function_privilege\('authenticated', r\.sig, 'EXECUTE'\)/);
  assert.match(acl, /ARRAY\['anon', 'service_role'\]::name\[\]/);
  assert.match(acl, /NOT rl\.rolsuper/);
  assert.doesNotMatch(acl, /GRANT[^\n]*TO\s+(PUBLIC|anon|service_role|motoboy)/i);
});

test("carga e reversão cobrem exatamente os 26 sabores oficiais", () => {
  const itensCarga = pares(carga);
  const itensReversao = pares(reversao);
  assert.equal(itensCarga.length, 26);
  assert.deepEqual(itensReversao, itensCarga);
  assert.equal(new Set(itensCarga.map(([chave]) => chave)).size, 26);
  for (const [chave] of itensCarga) {
    assert.match(catalogo, new RegExp(`"${chave}"`), `sabor fora do catálogo: ${chave}`);
  }
});

test("carga é idempotente por sabor e usa somente lote e validade de teste", () => {
  assert.match(carga, /md5\('carga-exemplo-homologacao:' \|\| r\.chave\)::uuid/);
  assert.match(carga, /p_tipo => 'entrada'/);
  assert.match(carga, /p_produto => NULL/);
  assert.match(carga, /'HOMOLOGAÇÃO-TESTE-' \|\| upper\(replace\(r\.chave, '-', '_'\)\)/);
  assert.match(carga, /DATE '2026-11-20'/);
  assert.match(carga, /DATE '2027-01-15'/);
  assert.match(carga, /'registrado', 'ja_registrado'/);
  const cargaExec = semComentarios(carga);
  assert.doesNotMatch(cargaExec, /ruioyioynwwwiqbjznoa/);
  assert.doesNotMatch(cargaExec, /service_role/i);
  assert.match(cargaExec, /has_role\(v_ator, 'admin'::public\.app_role\)/);
});

test("reversão compensa o mesmo lote com saldo conferido e nunca apaga histórico", () => {
  assert.match(reversao, /md5\('carga-exemplo-homologacao:' \|\| r\.chave \|\| ':reversao'\)::uuid/);
  assert.match(reversao, /codigo = 'HOMOLOGAÇÃO-TESTE-' \|\| upper\(replace\(r\.chave, '-', '_'\)\)/);
  assert.match(reversao, /p_tipo => 'retirada'/);
  assert.match(reversao, /p_lote => v_lote_id/);
  assert.match(reversao, /p_saldo_esperado => r\.quantidade/);
  assert.match(reversao, /chave_idempotencia = v_key/);
  assert.match(reversao, /CONTINUE;/);
  const reversaoExec = semComentarios(reversao);
  assert.doesNotMatch(reversaoExec, /\bDELETE\b|\bTRUNCATE\b/i);
  assert.doesNotMatch(reversaoExec, /ruioyioynwwwiqbjznoa/);
  assert.doesNotMatch(reversaoExec, /service_role/i);
  assert.match(reversaoExec, /has_role\(v_ator, 'admin'::public\.app_role\)/);
});

test("contratos entregues ao Codex nomeiam somente RPCs canônicas da 0129", () => {
  const nomes = Object.values(contrato.RPC_ESTOQUE_DIA);
  assert.equal(nomes.length, new Set(nomes).size);
  for (const nome of nomes) {
    assert.match(
      migration,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\(`),
      `RPC ausente na 0129: ${nome}`,
    );
  }
  assert.equal(contrato.RPC_ESTOQUE_DIA.consultar, "consultar_estoque_dia_salgados");
  assert.equal(contrato.RPC_ESTOQUE_DIA.avaliarVenda, "avaliar_venda_salgado");
});

test("falha técnica, margem e não inventariado nunca viram discretização comercial", () => {
  const tecnico = ["sabor_inexistente", "permissao_negada", "dados_invalidos"];
  for (const status of tecnico) {
    const c = contrato.classificarViabilidade(status);
    assert.equal(c.classe, "erro_tecnico");
    assert.equal(c.permiteConfirmacaoAutomatica, false);
    assert.equal(c.requerEncaminhamento, true);
    assert.doesNotMatch(c.titulo, /esgotad/i);
    assert.match(c.mensagem, /Não interpretar como estoque esgotado/);
  }
  for (const motivo of [
    "rpc_indisponivel",
    "rpc_sem_permissao",
    "nao_autenticado",
    "erro_rede",
    "resposta_invalida",
  ]) {
    const c = contrato.classificarErroConsultaEstoque(motivo);
    assert.equal(c.classe, "erro_tecnico");
    assert.equal(c.permiteConfirmacaoAutomatica, false);
    assert.doesNotMatch(c.titulo, /esgotad/i);
    assert.match(c.mensagem, /Não interpretar como estoque esgotado/);
  }

  const margem = contrato.classificarViabilidade("margem_atingida");
  assert.equal(margem.classe, "margem_atingida");
  assert.equal(margem.permiteConfirmacaoAutomatica, false);
  assert.equal(margem.requerEncaminhamento, true);

  const naoInventariado = contrato.classificarViabilidade("nao_inventariado");
  assert.equal(naoInventariado.classe, "analise");
  assert.equal(naoInventariado.permiteConfirmacaoAutomatica, false);
  assert.doesNotMatch(naoInventariado.mensagem, /esgotad/i);

  const disponivel = contrato.classificarViabilidade("disponivel");
  assert.equal(disponivel.classe, "disponivel");
  assert.equal(disponivel.permiteConfirmacaoAutomatica, true);

  const indisponivel = contrato.classificarViabilidade("indisponivel");
  assert.equal(indisponivel.classe, "indisponivel_real");
  assert.equal(indisponivel.permiteConfirmacaoAutomatica, false);
});

test("modo padrão é monitoramento e as proteções essenciais não podem ser desligadas", () => {
  assert.match(contrato.rotuloModoOperacao(undefined, undefined), /^Monitoramento/);
  assert.match(contrato.rotuloModoOperacao("controle_operacional", false), /^Monitoramento/);
  assert.equal(
    contrato.rotuloModoOperacao("validacao_assistida", true),
    "Validação assistida — conferência orientada",
  );
  assert.match(migration, /modo text NOT NULL DEFAULT 'monitoramento'/);
  assert.match(migration, /protecoes_essenciais boolean NOT NULL DEFAULT true CHECK \(protecoes_essenciais\)/);
  assert.match(migration, /protecoes_essenciais = true/);
});

test("uma entrada cobre vários compromissos sem duplicar baixa", () => {
  assert.match(migration, /acao_idempotencia uuid NOT NULL/);
  assert.match(migration, /PRIMARY KEY \(compromisso_id, lote_id\)/);
  assert.doesNotMatch(migration, /UNIQUE \(acao_idempotencia\)/);
  assert.match(migration, /ON CONFLICT \(compromisso_id, lote_id\) DO UPDATE SET/);
  assert.match(migration, /registrar_consumo_reserva\(/);
});
