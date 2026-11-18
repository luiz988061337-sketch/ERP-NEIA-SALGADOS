// ============================================================================
// Teste estatico do COMPLEMENTO B (sem banco, sem rede).
// Prova tres coisas:
//   1) o complemento nao inventa regra: cada objeto reproduz a migration de origem;
//   2) o complemento cobre exatamente as lacunas medidas, sem sobra nem falta;
//   3) o endurecimento de GRANT nao revoga nada que nao tenha sido concedido.
// Roda com: node scripts/homologacao-complemento.test.mjs
// ============================================================================
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const COMP =
  "scripts/homologacao-pg17/lfl-finalizacao-0123/complemento-b-laboratorio/04-complemento-hardening.sql";
const PERM = "scripts/homologacao-pg17/lfl-finalizacao-0123/00-permissoes-novas.sql";
const T03 = "scripts/homologacao-pg17/lfl-finalizacao-0123/03-capacidades-financeiras.sql";
const M0072 = "drizzle/migrations/0072_financeiro_caixa_contas.sql";
const M0083 = "drizzle/migrations/0083_hardening.sql";
const M0084 = "drizzle/migrations/0084_etapas_operacionais.sql";
const M0095 = "drizzle/migrations/0095_criar_pedido_com_reserva.sql";
const M0104 = "drizzle/migrations/0104_notificacoes_whatsapp.sql";

const T29 = [
  "acertos_motoboy",
  "acertos_rota",
  "acertos_rota_eventos",
  "caixa_sessoes",
  "centros_custo",
  "config_entrega",
  "conta_pagamento_eventos",
  "contador_acessos",
  "contas",
  "contas_bancarias",
  "escalas",
  "estoque_mov_operacoes",
  "extratos",
  "fechamentos_mensais",
  "funcionarios",
  "notificacoes_log",
  "pedido_item_componentes",
  "pedido_pagamento_eventos",
  "plano_contas",
  "pontos",
  "precificacao_config",
  "preco_historico",
  "reserva_consumos",
  "reserva_proveniencia",
  "reserva_proveniencia_config",
  "solicitacoes_contador",
  "turnos_motoboy",
  "turnos_motoboy_eventos",
  "vales",
];

// As 10 RPCs financeiras publicas + a funcao de trigger.
const RPCS = [
  ["conferir_acerto_rota_independente", "uuid,text,bigint,bigint,text"],
  ["confirmar_pagamento_turno_motoboy", "uuid,bigint,text,timestamptz,text,text"],
  ["registrar_pagamento_conta", "uuid,bigint,text"],
  ["estornar_pagamento_conta", "uuid,bigint,text,text"],
  ["cancelar_conta_financeira", "uuid"],
  ["conciliar_extrato_atomico", "uuid,text,uuid"],
  ["registrar_movimento_caixa", "text,bigint,text"],
  ["registrar_pagamento_pedido", "uuid,bigint,text"],
  ["estornar_pagamento_pedido", "uuid,bigint,text,text"],
  ["estornar_conta", "uuid,text"],
];

const norm = (s) =>
  s
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const sqlOnly = (s) =>
  s
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");

const bodyBetween = (sql, start, end) => {
  const i = sql.indexOf(start);
  const j = sql.indexOf(end, i + start.length);
  assert.ok(i >= 0 && j > i, `marcador ausente: ${start}`);
  return sql.slice(i + start.length, j);
};

const comp = read(COMP);
const compCode = sqlOnly(comp);
const perm = read(PERM);

test("complemento e' uma unica transacao, com guarda de laboratorio", () => {
  const begins = (compCode.match(/^BEGIN;$/gm) || []).length;
  const commits = (compCode.match(/^COMMIT;$/gm) || []).length;
  assert.equal(begins, 1, "deve haver exatamente um BEGIN");
  assert.equal(commits, 1, "deve haver exatamente um COMMIT");
  const last = compCode
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .pop();
  assert.equal(last.trim(), "COMMIT;");
  for (const g of [
    "inet_server_addr()",
    "current_database()<>'lfl_partial'",
    "current_user !~ '^restore_",
    "neia_homologacao.ensaio",
  ]) {
    assert.ok(compCode.includes(g), `guarda ausente: ${g}`);
  }
});

test("complemento nao executa operacao administrativa nem cria estrutura de negocio", () => {
  for (const proibido of [
    /SET\s+SESSION\s+AUTHORIZATION/i,
    /\bOWNER\s+TO\b/i,
    /USING\s*\(\s*true\s*\)/i,
    /\bCREATE\s+TABLE\b/i,
    /\bALTER\s+TABLE\b[\s\S]{0,80}\bADD\s+COLUMN\b/i,
    /\bDROP\s+POLICY\b/i,
    /\bCREATE\s+POLICY\b/i,
    /\bGRANT\b[\s\S]{0,60}\bTO\s+(anon|public)\b/i,
  ]) {
    assert.ok(!proibido.test(compCode), `proibido no complemento: ${proibido}`);
  }
});

test("os 3 indices unicos sao identicos aos das migrations de origem", () => {
  const origem = {
    caixa_sessao_aberta_unica: read(M0072),
    rotas_preparando_motoboy_uniq: read(M0084),
    notificacoes_log_idem_idx: read(M0104),
  };
  for (const [nome, texto] of Object.entries(origem)) {
    const re = new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${nome}[\\s\\S]*?;`, "i");
    const doOrigem = texto.match(re);
    assert.ok(doOrigem, `indice ${nome} nao encontrado na origem`);
    const doComp = compCode.match(re);
    assert.ok(doComp, `indice ${nome} ausente do complemento`);
    assert.equal(norm(doComp[0]), norm(doOrigem[0]), `definicao divergente: ${nome}`);
  }
  const criados = compCode.match(/CREATE UNIQUE INDEX IF NOT EXISTS \w+/g) || [];
  assert.equal(criados.length, 3, "o complemento deve criar exatamente 3 indices unicos");
});

test("guarda de fechamento reproduz 0083 e o trigger e' identico", () => {
  const orig = read(M0083);
  const corpoOrig = bodyBetween(
    orig,
    "CREATE OR REPLACE FUNCTION public.contas_fechamento_guard()",
    "$$;",
  );
  const corpoComp = bodyBetween(
    comp,
    "CREATE OR REPLACE FUNCTION public.contas_fechamento_guard()",
    "$function$;",
  );

  const limpa = (s) =>
    norm(s)
      .replace(/using errcode\s*=\s*'p0001'/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s+;/g, ";");
  // Recorta apenas o corpo entre o primeiro par de delimitadores.
  const recorta = (s) => {
    const n = limpa(s);
    const a = n.indexOf("declare");
    const b = n.lastIndexOf("end;");
    return n.slice(a, b + 4);
  };
  assert.equal(recorta(corpoComp), recorta(corpoOrig), "corpo da guarda diverge da migration 0083");

  const trigOrig = norm((orig.match(/CREATE TRIGGER contas_fechamento_trg[\s\S]*?;/) || [""])[0]);
  const trigComp = norm(
    (compCode.match(/CREATE TRIGGER contas_fechamento_trg[\s\S]*?;/) || [""])[0],
  );
  assert.ok(trigOrig.length > 0, "trigger ausente na origem 0083");
  assert.equal(trigComp, trigOrig, "definicao do trigger diverge de 0083");
});

test("todo objeto criado em 03-capacidades recebe tratamento de ACL", () => {
  const nomes03 = [...read(T03).matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(
    (m) => m[1],
  );
  const unicos = [...new Set(nomes03)].sort();
  assert.equal(
    unicos.length,
    11,
    `esperadas 11 funcoes publicas em 03, encontradas ${unicos.length}`,
  );
  for (const nome of unicos) {
    assert.ok(
      new RegExp(`ON FUNCTION public\\.${nome}\\s*\\(`, "i").test(compCode),
      `sem REVOKE/GRANT no complemento: ${nome}`,
    );
  }
});

test("as 10 RPCs financeiras: revoga PUBLIC/anon/service_role e concede authenticated", () => {
  for (const [nome, sig] of RPCS) {
    const revoke = new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${nome}\\(${sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) FROM PUBLIC,anon,service_role;`,
      "i",
    );
    const grant = new RegExp(
      `GRANT EXECUTE ON FUNCTION public\\.${nome}\\(${sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) TO authenticated;`,
      "i",
    );
    assert.ok(revoke.test(compCode), `REVOKE ausente/errado: ${nome}(${sig})`);
    assert.ok(grant.test(compCode), `GRANT ausente/errado: ${nome}(${sig})`);
  }
  // Nenhuma RPC pode ficar executavel por anon ou service_role.
  const concessoes = [...compCode.matchAll(/GRANT EXECUTE ON FUNCTION [^\n]*TO (\w[\w,]*);/gi)].map(
    (m) => m[1].toLowerCase(),
  );
  assert.ok(concessoes.length > 0);
  for (const alvo of concessoes) {
    assert.equal(alvo, "authenticated", `concessao indevida para: ${alvo}`);
  }
});

test("funcao de trigger do ledger nao e' executavel por ninguem", () => {
  const linha = compCode.match(
    /REVOKE ALL ON FUNCTION public\.registrar_pagamento_pedido_status_ledger\(\)[^\n]*/i,
  );
  assert.ok(linha, "revoke da funcao de trigger ausente");
  for (const papel of ["PUBLIC", "anon", "authenticated", "service_role"]) {
    assert.ok(new RegExp(`\\b${papel}\\b`, "i").test(linha[0]), `papel nao revogado: ${papel}`);
  }
  assert.ok(
    !/GRANT EXECUTE ON FUNCTION public\.registrar_pagamento_pedido_status_ledger/i.test(compCode),
    "funcao de trigger nao pode receber GRANT",
  );
});

test("DELETE so' e' revogado das tabelas que realmente tinham DELETE concedido", () => {
  const concedidas = new Set(
    [...perm.matchAll(/^GRANT DELETE ON TABLE public\."(\w+)" TO "authenticated";$/gm)].map(
      (m) => m[1],
    ),
  );
  const revogadas = [
    ...compCode.matchAll(/^REVOKE DELETE ON TABLE public\."(\w+)" FROM authenticated;$/gm),
  ].map((m) => m[1]);

  assert.equal(
    revogadas.length,
    15,
    `esperadas 15 revogacoes de DELETE, encontradas ${revogadas.length}`,
  );
  assert.equal(new Set(revogadas).size, revogadas.length, "tabela repetida no REVOKE DELETE");

  for (const t of revogadas) {
    assert.ok(T29.includes(t), `tabela fora das 29: ${t}`);
    assert.ok(concedidas.has(t), `revogando DELETE que nao existia: ${t}`);
  }
  // Depois do complemento, nenhuma das 15 mantem DELETE para authenticated.
  const restantes = [...concedidas].filter((t) => !revogadas.includes(t));
  assert.deepEqual(restantes.sort(), [], "sobrou DELETE para authenticated");
});

test("escrita direta e' removida apenas das tabelas sem uso no app", () => {
  for (const t of ["plano_contas", "centros_custo"]) {
    const linha = compCode.match(
      new RegExp(`REVOKE INSERT,UPDATE ON TABLE public\\."${t}" FROM authenticated;`, "i"),
    );
    assert.ok(linha, `revogacao de escrita ausente: ${t}`);
  }
  // Nenhuma outra tabela perde escrita: o app escreve nelas hoje.
  const revogacoesEscrita = [
    ...compCode.matchAll(/^REVOKE INSERT,UPDATE ON TABLE public\."(\w+)"/gm),
  ].map((m) => m[1]);
  assert.deepEqual(revogacoesEscrita.sort(), ["centros_custo", "plano_contas"]);
});

test("regressao: as 29 tabelas novas tem policy (nao repetir o falso negativo)", () => {
  const cobertas = new Set(
    [...perm.matchAll(/tablename='(\w+)' AND policyname='([^']+)'/g)].map((m) => m[1]),
  );
  assert.equal(cobertas.size, 29, `esperadas 29 tabelas com policy, encontradas ${cobertas.size}`);
  const sem = T29.filter((t) => !cobertas.has(t));
  assert.deepEqual(sem, [], `tabelas sem policy: ${sem.join(", ")}`);
  // E nenhuma policy usa USING (true) fora da leitura publica de config_entrega.
  const abertas = [
    ...perm.matchAll(/tablename='(\w+)' AND policyname='([^']+)'[\s\S]{0,400}?USING \(true\)/g),
  ].map((m) => `${m[1]}.${m[2]}`);
  assert.deepEqual(
    abertas,
    ["config_entrega.config_entrega select publico"],
    `policy permissiva inesperada: ${abertas.join(", ")}`,
  );
});

test("triggers de reserva/consumo permanecem NAO instalados (decisao de 0095)", () => {
  const origem = read(M0095);
  assert.ok(
    /NAO[\s\S]{0,60}descomentar nesta etapa/i.test(origem),
    "0095 deve declarar a postergacao",
  );
  assert.ok(
    /NAO[\s\S]{0,30}INSTALADO/i.test(origem),
    "0095 deve marcar a funcao como nao instalada",
  );
  assert.ok(
    !/CREATE\s+TRIGGER\s+trigger_exigir_(reserva|consumo)_producao/i.test(compCode),
    "o complemento nao pode instalar os triggers postergados",
  );
  assert.ok(
    /NAO INSTALADO AQUI, POR DECISAO REGISTRADA/i.test(comp),
    "o complemento deve registrar a decisao em comentario",
  );
});

test("nenhum GRANT de tabela e' ampliado pelo complemento", () => {
  const grantsTabela = compCode.match(/GRANT\s+\w[\w, ]*\s+ON\s+TABLE/gi) || [];
  assert.deepEqual(grantsTabela, [], "complemento so' revoga privilegio de tabela");
});
