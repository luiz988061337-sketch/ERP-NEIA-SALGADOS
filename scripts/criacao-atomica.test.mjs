// Teste local (estático) da migration 0095 — Etapa 1.52.
// NÃO executa SQL, NÃO acessa Supabase, NÃO valida transação real.
// Verifica contrato, garantias de segurança/atomicidade e presença dos 20 casos.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arquivo = path.join(raiz, "drizzle", "migrations", "0095_criar_pedido_com_reserva.sql");

assert.ok(fs.existsSync(arquivo), "0095_criar_pedido_com_reserva.sql deve existir");

const bruto = fs.readFileSync(arquivo, "utf8");
// Remove apenas comentários de linha (--). Mantém strings de COMMENT ON.
const codigo = bruto
  .split(/\r?\n/)
  .filter((linha) => !linha.trimStart().startsWith("--"))
  .join("\n");

let assercoes = 0;

function ok(condicao, mensagem) {
  assert.ok(condicao, mensagem);
  assercoes += 1;
}

function contem(texto, alvo, rotulo) {
  ok(texto.includes(alvo), `${rotulo}: esperado conter ${JSON.stringify(alvo)}`);
}

function naoContem(texto, alvo, rotulo) {
  ok(!texto.includes(alvo), `${rotulo}: NÃO deveria conter ${JSON.stringify(alvo)}`);
}

function posicao(texto, alvo, rotulo) {
  const i = texto.indexOf(alvo);
  ok(i >= 0, `${rotulo}: âncora não encontrada ${JSON.stringify(alvo)}`);
  return i;
}

// ---------------------------------------------------------------------------
// 1. Cabeçalho, numeração e escopo
// ---------------------------------------------------------------------------
contem(bruto, "0095", "cabeçalho");
contem(bruto.toUpperCase(), "NAO FOI APLICADA", "cabeçalho: não aplicada");
contem(bruto.toUpperCase(), "PREPARADA", "cabeçalho: preparada");
contem(bruto, "Nao altera tabelas", "cabeçalho: sem alteração de tabelas");

const dirMigracoes = path.join(raiz, "drizzle", "migrations");
const migracoes = fs
  .readdirSync(dirMigracoes)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f));
ok(migracoes.some((f) => f.startsWith("0094_")), "0094 deve existir (numeração anterior)");
ok(migracoes.some((f) => f.startsWith("0095_")), "0095 deve existir");
const numeros = migracoes.map((f) => Number.parseInt(f.slice(0, 4), 10));
ok(Math.max(...numeros) >= 95, `0095 deve ser a maior numeração funcional (máx=${Math.max(...numeros)})`);

// ---------------------------------------------------------------------------
// 2. Assinatura e contrato da RPC
// ---------------------------------------------------------------------------
contem(
  codigo,
  "CREATE OR REPLACE FUNCTION public.criar_pedido_com_reserva(\n  p_id    uuid,\n  p_canal text,\n  p_dados jsonb,\n  p_itens jsonb\n)",
  "assinatura da RPC",
);
contem(codigo, "RETURNS jsonb", "retorno jsonb");
contem(codigo, "SECURITY DEFINER", "security definer");
contem(codigo, "SET search_path = public", "search_path fixo");
naoContem(codigo, "SECURITY INVOKER", "não pode ser invoker");
naoContem(codigo, "SET search_path = public,", "search_path não pode incluir outros schemas");

// ---------------------------------------------------------------------------
// 3. Segurança / autorização / permissões
// ---------------------------------------------------------------------------
contem(codigo, "auth.uid()", "autenticação");
contem(codigo, "public.has_role(v_uid, 'admin'::public.app_role)", "papel admin");
contem(codigo, "public.has_role(v_uid, 'atendente'::public.app_role)", "papel atendente");
contem(codigo, "v_canal IN ('pdv', 'atendente')", "canal staff exige papel");
contem(codigo, "p_id, v_uid, v_cliente", "user_id vem de auth.uid()");
contem(codigo, "REVOKE ALL ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) FROM PUBLIC;", "revoke public");
contem(codigo, "GRANT EXECUTE ON FUNCTION public.criar_pedido_com_reserva(uuid, text, jsonb, jsonb) TO authenticated;", "grant authenticated");
naoContem(codigo, "TO anon", "não conceder a anon");
naoContem(codigo, "TO PUBLIC", "não conceder a PUBLIC");
naoContem(codigo, "GRANT ALL", "não conceder tudo");

// Campos que NUNCA podem ser lidos do navegador.
for (const chave of [
  "user_id",
  "status",
  "numero",
  "preco",
  "preco_unitario",
  "subtotal",
  "total",
  "desconto",
  "taxa_entrega",
  "pagamento_status",
  "pagamento_modalidade",
]) {
  naoContem(codigo, `v_dados->>'${chave}'`, `não ler ${chave} de p_dados`);
  naoContem(codigo, `p_dados->>'${chave}'`, `não ler ${chave} de p_dados`);
}
naoContem(codigo, "->>'preco_unitario'", "não ler preço do item enviado");
naoContem(codigo, "SQLERRM", "não expor SQLERRM");

// ---------------------------------------------------------------------------
// 4. Idempotência / concorrência
// ---------------------------------------------------------------------------
contem(codigo, "pg_advisory_xact_lock", "serialização por id");
contem(codigo, "SELECT * INTO v_ped FROM public.pedidos WHERE id = p_id", "checagem de existente");
contem(codigo, "v_ped.user_id IS DISTINCT FROM v_uid", "não repetir pedido de terceiro");
contem(codigo, "'criacao_atomica:' || v_canal", "canal registrado no histórico");
contem(codigo, "v_req_fp", "fingerprint da requisição");
contem(codigo, "v_db_fp", "fingerprint do banco");
contem(codigo, "'idempotencia_divergente'", "divergência de idempotência");
contem(codigo, "'ja_criado'", "retorno ja_criado");
contem(codigo, "'pedido_de_outro_usuario'", "retorno de outro usuário");
contem(codigo, "'inconsistencia_financeira'", "consistência financeira");
contem(codigo, "'reservas_ausentes'", "reservas ausentes");
contem(codigo, "'reconciliacao_pendente'", "reconciliação pendente");

// ---------------------------------------------------------------------------
// 5. Dependência, atomicidade e rollback
// ---------------------------------------------------------------------------
contem(codigo, "to_regprocedure('public.reservar_pedido_atomico(uuid)')", "checa 0089");
contem(codigo, "'dependencia_ausente'", "retorno dependência ausente");
contem(codigo, "v_res := public.reservar_pedido_atomico(p_id);", "chama 0089");
contem(codigo, "NOT IN ('reservado', 'ja_reservado')", "exige reserva confirmada");
contem(codigo, "RAISE EXCEPTION USING", "aborta em falha de reserva");
contem(codigo, "ERRCODE = 'P0095'", "SQLSTATE próprio");
contem(codigo, "WHEN SQLSTATE 'P0095'", "captura o próprio SQLSTATE");
contem(codigo, "GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;", "recupera detalhe");
contem(codigo, "'erro_interno'", "erro interno");
contem(codigo, "'sqlstate', SQLSTATE", "devolve SQLSTATE sem SQLERRM");

// Escritas e ausência de compensação/fallback.
contem(codigo, "INSERT INTO public.pedidos", "insert pedido");
contem(codigo, "INSERT INTO public.pedido_itens", "insert itens");
contem(codigo, "INSERT INTO public.pedido_status_historico", "insert histórico");
naoContem(codigo, "INSERT INTO public.reservas_estoque", "sem escrita direta em reservas");
naoContem(codigo, "DELETE FROM", "sem DELETE compensatório");
naoContem(codigo, "UPDATE public.pedidos", "sem UPDATE direto");
naoContem(codigo, "EXECUTE format(", "sem SQL dinâmico");
naoContem(codigo, "EXECUTE '", "sem SQL dinâmico literal");

// Ordem: pedido -> itens -> reserva -> histórico.
const iPedido = posicao(codigo, "INSERT INTO public.pedidos", "ordem pedido");
const iItens = posicao(codigo, "INSERT INTO public.pedido_itens", "ordem itens");
const iReserva = posicao(codigo, "v_res := public.reservar_pedido_atomico(p_id);", "ordem reserva");
const iHistorico = posicao(codigo, "INSERT INTO public.pedido_status_historico", "ordem histórico");
ok(iPedido < iItens, "pedido deve ser inserido antes dos itens");
ok(iItens < iReserva, "itens devem existir antes da reserva");
ok(iReserva < iHistorico, "histórico deve ser gravado após a reserva");

// Ordem de proteção: advisory lock antes de checar existente; dependência antes de escrever.
ok(
  posicao(codigo, "pg_advisory_xact_lock", "lock") <
    posicao(codigo, "SELECT * INTO v_ped", "existente"),
  "advisory lock deve vir antes da checagem de existente",
);
ok(
  posicao(codigo, "to_regprocedure", "dependência") < iPedido,
  "dependência da 0089 deve ser checada antes de qualquer escrita",
);
ok(
  posicao(codigo, "FOR UPDATE", "lock produto/cupom") < iPedido,
  "produtos/cupom devem ser bloqueados antes de criar o pedido",
);

// ---------------------------------------------------------------------------
// 6. Valores, combos, cupom, pagamento
// ---------------------------------------------------------------------------
contem(codigo, "COALESCE(v_prod.preco_promocional, v_prod.preco)", "preço do catálogo");
contem(codigo, "NOT v_prod.disponivel", "produto disponível");
contem(codigo, "'regra_combo'", "regra de combo");
contem(codigo, "v_qtd < 50", "mínimo 50");
contem(codigo, "v_qtd % 50 <> 0", "múltiplo de 50");
contem(codigo, "'montagem_sem_modelagem'", "montagem sem modelagem");
contem(codigo, "v_pid IS NULL", "detecta produto_id NULL");
contem(codigo, "v_tipo_imovel = 'apartamento' AND v_apartamento IS NULL", "apartamento sem número validado antes do INSERT");
contem(codigo, "'campo', 'apartamento'", "erro de apartamento devolve campo específico");
contem(codigo, "ELSE 6", "taxa default server-side (R$ 6)");
naoContem(codigo, "'configuracao_ausente'", "sem configuracao_ausente (default server-side)");
contem(codigo, "loja_config.taxa_entrega", "fonte da taxa em loja_config");
contem(codigo, "(to_jsonb(lc)->>'taxa_entrega')", "fonte opcional da taxa");
contem(codigo, "desconto_manual", "desconto manual (staff)");
contem(codigo, "v_desc + v_desc_manual", "desconto = cupom + manual, limitado ao subtotal");
contem(codigo, "'cupom_invalido'", "cupom inválido");
contem(codigo, "'cupom_esgotado'", "cupom esgotado");
contem(codigo, "v_cupom.max_usos", "limite de usos");
contem(codigo, "v_cupom.cliente_telefone", "cupom por cliente");
contem(codigo, "v_cupom.produtos_ids", "cupom por produtos");
contem(codigo, "v_cupom.validade_ini", "validade inicial");
contem(codigo, "v_cupom.validade_fim", "validade final");
contem(codigo, "v_cupom.minimo", "mínimo do cupom");
contem(codigo, "v_forma::public.pagamento", "enum de pagamento");
contem(codigo, "'na_entrega'", "modalidade na entrega");
contem(codigo, "pagamento_imediato", "pagamento imediato PDV");
contem(codigo, "v_pag_status := 'pago'", "PDV pago");
contem(codigo, "v_forma <> 'pix'", "Pix não nasce pago");
contem(codigo, "v_pag_status", "status de pagamento");
contem(codigo, "'pendente'", "padrão pendente");

// ---------------------------------------------------------------------------
// 7. Cobertura e gate de produção
// ---------------------------------------------------------------------------
contem(codigo, "CREATE OR REPLACE FUNCTION public.pedido_cobertura_reserva(p_pedido_id uuid)", "função de cobertura");
contem(codigo, "STABLE", "cobertura é stable");
contem(codigo, "estoque_movimentacoes", "confere ledger");
contem(codigo, "'debito_nao_comprovado'", "bloqueia sem débito");
contem(codigo, "reserva_proveniencia", "confere proveniência");
contem(codigo, "'proveniencia_ausente'", "bloqueia sem proveniência");
contem(codigo, "'proveniencia_indisponivel'", "bloqueia sem tabela de proveniência");
contem(codigo, "controlado", "lê configuração de ativação");
contem(codigo, "CREATE OR REPLACE FUNCTION public.exigir_reserva_producao()", "função de trigger");
contem(codigo, "CREATE OR REPLACE FUNCTION public.exigir_consumo_producao()", "defesa de consumo (0091)");
contem(codigo, "reserva_consumos", "defesa confere retirada física");
contem(codigo, "REVOKE ALL ON FUNCTION public.exigir_consumo_producao() FROM PUBLIC;", "revoke defesa consumo");
contem(codigo, "RETURNS trigger", "retorna trigger");
contem(codigo, "OLD.status <> 'recebido'", "olha saída de recebido");
contem(codigo, "NEW.status IN ('recebido', 'cancelado')", "exceto recebido/cancelado");
contem(codigo, "REVOKE ALL ON FUNCTION public.exigir_reserva_producao() FROM PUBLIC;", "revoke trigger fn");

// Trigger preparado no comentário, mas NÃO instalado.
naoContem(codigo, "CREATE TRIGGER", "trigger não pode estar ativo no código");
contem(bruto, "-- CREATE TRIGGER trigger_exigir_reserva_producao", "trigger preparado em comentário");
contem(bruto, "BEFORE UPDATE OF status ON public.pedidos", "definição do trigger comentada");
contem(bruto, "NEW.status NOT IN ('recebido', 'cancelado')", "WHEN do trigger comentado");

// Sem alteração estrutural.
naoContem(codigo, "ALTER TABLE", "sem ALTER TABLE");
naoContem(codigo, "CREATE TABLE", "sem CREATE TABLE");
naoContem(codigo, "DROP TRIGGER", "sem DROP TRIGGER");

// ---------------------------------------------------------------------------
// 8. Matriz dos 20 casos (evidência estática; testes transacionais pendentes)
// ---------------------------------------------------------------------------
const casos = [
  {
    id: 1,
    nome: "criação completa",
    alvos: ["INSERT INTO public.pedidos", "INSERT INTO public.pedido_itens", "v_res := public.reservar_pedido_atomico(p_id);", "'criado'"],
  },
  {
    id: 2,
    nome: "estoque insuficiente",
    alvos: ["NOT IN ('reservado', 'ja_reservado')", "PG_EXCEPTION_DETAIL", "DETAIL  = COALESCE(v_res::text"],
    bruto: ["estoque_insuficiente"],
  },
  {
    id: 3,
    nome: "falha na inserção de itens",
    alvos: ["INSERT INTO public.pedido_itens", "WHEN OTHERS", "'erro_interno'"],
  },
  {
    id: 4,
    nome: "falha ao registrar movimentação",
    alvos: ["v_res := public.reservar_pedido_atomico(p_id);", "WHEN OTHERS", "'erro_interno'"],
  },
  {
    id: 5,
    nome: "falha ao criar proveniência",
    alvos: ["v_res := public.reservar_pedido_atomico(p_id);", "WHEN OTHERS", "'erro_interno'"],
    bruto: ["reserva_proveniencia"],
  },
  {
    id: 6,
    nome: "repetição da mesma solicitação",
    alvos: ["pg_advisory_xact_lock", "'ja_criado'", "'criacao_atomica:' || v_canal"],
  },
  {
    id: 7,
    nome: "UUID repetido com dados divergentes",
    alvos: ["'idempotencia_divergente'", "v_req_fp", "v_db_fp"],
  },
  {
    id: 8,
    nome: "pedido pertencente a outro usuário",
    alvos: ["v_ped.user_id IS DISTINCT FROM v_uid", "'pedido_de_outro_usuario'"],
  },
  {
    id: 9,
    nome: "pedido criado no PDV",
    alvos: ["v_canal IN ('pdv', 'atendente')", "public.has_role(v_uid, 'admin'::public.app_role)", "pagamento_imediato"],
  },
  {
    id: 10,
    nome: "pedido criado pelo atendimento",
    alvos: ["v_canal IN ('pdv', 'atendente')", "public.has_role(v_uid, 'atendente'::public.app_role)", "'criacao_atomica:' || v_canal"],
  },
  {
    id: 11,
    nome: "pagamento Pix pendente",
    alvos: ["v_pag_status", "v_forma <> 'pix'"],
  },
  {
    id: 12,
    nome: "pagamento na entrega",
    alvos: ["'na_entrega'", "v_forma = 'dinheiro'"],
  },
  {
    id: 13,
    nome: "cupom inválido ou esgotado",
    alvos: ["'cupom_invalido'", "'cupom_esgotado'", "v_cupom.max_usos"],
  },
  {
    id: 14,
    nome: "preço manipulado pelo navegador",
    alvos: ["COALESCE(v_prod.preco_promocional, v_prod.preco)", "v_forma::public.pagamento"],
  },
  {
    id: 15,
    nome: "combo sem composição",
    alvos: ["'montagem_sem_modelagem'", "v_pid IS NULL"],
  },
  {
    id: 16,
    nome: "quantidade comercial inválida",
    alvos: ["'regra_combo'", "v_qtd < 50", "v_qtd % 50 <> 0"],
  },
  {
    id: 17,
    nome: "pedido sem cobertura tentando entrar na produção",
    alvos: ["public.exigir_reserva_producao()", "public.pedido_cobertura_reserva(NEW.id)", "controlado", "'reconciliacao_pendente'"],
  },
  {
    id: 18,
    nome: "concorrência entre compras",
    alvos: ["pg_advisory_xact_lock", "FOR UPDATE"],
  },
  {
    id: 19,
    nome: "falha do histórico",
    alvos: ["INSERT INTO public.pedido_status_historico", "WHEN OTHERS", "'erro_interno'"],
  },
  {
    id: 20,
    nome: "rollback integral sem débito duplicado",
    alvos: ["RAISE EXCEPTION USING", "ERRCODE = 'P0095'", "GET STACKED DIAGNOSTICS", "v_res := public.reservar_pedido_atomico(p_id);"],
  },
];

for (const caso of casos) {
  for (const alvo of caso.alvos) {
    ok(codigo.includes(alvo), `caso ${caso.id} (${caso.nome}): código deveria conter ${JSON.stringify(alvo)}`);
  }
  for (const alvo of caso.bruto ?? []) {
    ok(bruto.includes(alvo), `caso ${caso.id} (${caso.nome}): cabeçalho/documentação deveria conter ${JSON.stringify(alvo)}`);
  }
}

console.log(`criacao-atomica: ${assercoes} asserções locais OK (transacionais executados em PGlite/PG 18.6; concorrência multi-sessão pendente)`);
