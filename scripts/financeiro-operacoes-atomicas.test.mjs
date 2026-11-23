import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("drizzle/migrations/0106_financeiro_operacoes_atomicas.sql", "utf8");
const route = readFileSync("src/routes/financeiro.tsx", "utf8");

function functionBody(sql, name, nextName = null) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} existe`);
  const end = nextName
    ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}(`, start + 1)
    : sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `fim da função ${name} encontrado`);
  return sql.slice(start, end);
}

const payment = functionBody(migration, "registrar_pagamento_conta", "estornar_pagamento_conta");
const reversal = functionBody(migration, "estornar_pagamento_conta", "cancelar_conta_financeira");
const orderReversal = functionBody(migration, "estornar_pagamento_pedido");
const cancel = functionBody(migration, "cancelar_conta_financeira", "registrar_movimento_caixa");
const cash = functionBody(migration, "registrar_movimento_caixa", "conciliar_extrato_atomico");
const reconcile = functionBody(migration, "conciliar_extrato_atomico");

// Contrato estático: não prova locking, rollback nem privilégios efetivos em PostgreSQL.
assert.match(migration, /UPDATE public\.contas[\s\S]*pagamento_abertura_centavos = round\(COALESCE\(valor_pago, 0\) \* 100\)::bigint[\s\S]*WHERE pagamento_abertura_centavos IS NULL/,
  "saldo histórico é preservado como abertura apenas uma vez, sem eventos antigos fabricados");
assert.match(migration, /OLD\.pagamento_abertura_centavos IS NULL[\s\S]*NEW\.pagamento_abertura_centavos = round\(COALESCE\(OLD\.valor_pago, 0\) \* 100\)::bigint[\s\S]*to_jsonb\(NEW\) - 'pagamento_abertura_centavos'[\s\S]*to_jsonb\(OLD\) - 'pagamento_abertura_centavos'/,
  "backfill permite somente copiar o agregado histórico, inclusive em competência fechada");
assert.match(migration, /WHERE competencia = v_comp AND status = 'fechado'[\s\S]*RAISE EXCEPTION 'mes_fechado:%'/,
  "a guarda continua bloqueando alterações operacionais em períodos fechados");
assert.match(migration, /SET search_path = pg_catalog/,
  "funções financeiras usam um search_path restrito");
assert.match(migration, /chave_idempotencia text NOT NULL UNIQUE/,
  "chave idempotente é única no ledger");
assert.match(migration, /CREATE POLICY[\s\S]*has_role\(auth\.uid\(\), 'admin'\)[\s\S]*has_role\(auth\.uid\(\), 'financeiro'\)/,
  "leitura do ledger limitada a admin/financeiro por RLS");
assert.match(migration, /REVOKE ALL ON public\.conta_pagamento_eventos FROM PUBLIC, anon, authenticated/,
  "cliente não grava diretamente no ledger");
assert.match(migration, /current_setting\('app\.financeiro_atomic_write', true\)[\s\S]*baixa_financeira_exige_rpc/,
  "gravação direta de baixa é rejeitada sem a marca transacional dos RPCs");

assert.match(payment, /has_role\(auth\.uid\(\), 'admin'\)[\s\S]*has_role\(auth\.uid\(\), 'financeiro'\)/,
  "baixa valida papel financeiro");
assert.match(payment, /pg_advisory_xact_lock\(hashtextextended\(p_chave_idempotencia, 0\)\)/,
  "operações concorrentes com mesma chave são serializadas");
assert.match(payment, /WHERE id = p_conta_id FOR UPDATE/,
  "baixa bloqueia a linha da conta antes de calcular saldo");
assert.match(payment, /v_valor := COALESCE\(p_valor_centavos, v_saldo\)/,
  "baixa parcial aceita centavos; pagamento integral usa o saldo calculado no servidor");
assert.match(payment, /v_valor > v_saldo[\s\S]*valor_superior_ao_saldo/,
  "pagamento acima do saldo é rejeitado");
assert.match(payment, /saldo_centavos', v_saldo[\s\S]*status = CASE WHEN v_saldo = 0 THEN 'paga'/,
  "conta só recebe status paga quando o saldo chega a zero");
assert.match(payment, /INSERT INTO public\.conta_pagamento_eventos[\s\S]*UPDATE public\.contas/,
  "ledger e saldo agregado são escritos pelo mesmo RPC");
assert.match(payment, /status', 'repetido/,
  "repetição idempotente não cria novo evento");

assert.match(reversal, /pagamento_id = p_pagamento_id/,
  "estorno aponta para um pagamento original");
assert.match(reversal, /v_estornado \+ p_valor_centavos > v_pagamento\.valor_centavos/,
  "estorno acima do pagamento original é recusado");
assert.match(reversal, /INSERT INTO public\.conta_pagamento_eventos[\s\S]*UPDATE public\.contas/,
  "estorno preserva histórico e recalcula agregado na mesma chamada");
assert.match(orderReversal, /has_role\(auth\.uid\(\), 'admin'\)[\s\S]*has_role\(auth\.uid\(\), 'financeiro'\)/,
  "estorno de pedido valida papel financeiro");
assert.match(orderReversal, /pg_advisory_xact_lock[\s\S]*FOR UPDATE[\s\S]*estorno_superior_ao_pagamento/,
  "estorno de pedido é idempotente, serializa o pagamento original e limita o saldo estornado");
assert.match(orderReversal, /INSERT INTO public\.pedido_pagamento_eventos[\s\S]*tipo, valor_centavos[\s\S]*pagamento_id, motivo, actor/,
  "estorno de pedido mantém evento, origem, motivo e ator no histórico");
assert.match(cancel, /FOR UPDATE[\s\S]*historico_pago_exige_estorno/,
  "cancelamento bloqueia conta com pagamentos registrados");
assert.match(cash, /pg_advisory_xact_lock[\s\S]*INSERT INTO public\.contas[\s\S]*INSERT INTO public\.conta_pagamento_eventos[\s\S]*UPDATE public\.contas/,
  "movimento de caixa idempotente inclui conta e pagamento no mesmo RPC");

assert.match(reconcile, /FROM public\.extratos WHERE id = p_extrato_id FOR UPDATE/,
  "conciliação bloqueia o extrato");
assert.match(reconcile, /FROM public\.contas WHERE id = p_vinculo_id FOR UPDATE/,
  "conciliação de conta bloqueia o destino");
assert.match(reconcile, /registrar_pagamento_conta\(p_vinculo_id, v_centavos,[\s\S]*UPDATE public\.extratos/,
  "conta e extrato são ligados somente após o registro do pagamento");
assert.match(reconcile, /extrato_alterado_durante_conciliacao[\s\S]*ERRCODE = '40001'/,
  "conflito final lança erro para reverter a transação completa");
assert.match(reconcile, /v_centavos <> round\(v_pedido\.total \* 100\)::bigint/,
  "pedido só é conciliado quando o extrato cobre o total integral");
assert.match(reconcile, /p_vinculo_tipo IS NULL/,
  "conciliação recusa tipo de destino ausente");

for (const rpc of [
  "registrar_pagamento_conta",
  "estornar_pagamento_conta",
  "cancelar_conta_financeira",
  "registrar_movimento_caixa",
  "conciliar_extrato_atomico",
  "estornar_pagamento_pedido",
]) {
  assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}\\([\\s\\S]*?FROM PUBLIC, anon`),
    `${rpc} revoga execução pública/anon`);
  assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([\\s\\S]*?TO authenticated`),
    `${rpc} concede execução somente a authenticated`);
}

const section = (start, end) => route.slice(route.indexOf(start), route.indexOf(end, route.indexOf(start) + start.length));
const reconcileUi = section("async function conciliar(", "async function ignorarExtrato(");
const settleUi = section("async function mudarConta(", "async function salvarBanco(");
assert.match(reconcileUi, /rpc\("conciliar_extrato_atomico"/,
  "tela usa a conciliação transacional em vez de writes em sequência");
assert.doesNotMatch(reconcileUi, /\.from\("extratos"\)\.update|\.from\("contas"\)\.update|\.from\("pedidos"\)\.update/,
  "conciliação da tela não executa updates separados");
assert.match(settleUi, /rpc\("registrar_pagamento_conta"/,
  "baixa e quitação manual usam o RPC de pagamento");
assert.match(settleUi, /rpc\("cancelar_conta_financeira"/,
  "cancelamento usa o RPC validado");
assert.match(settleUi, /rpc\("registrar_movimento_caixa"/,
  "sangria e suprimento usam o RPC idempotente");
assert.match(cash, /v_categoria := p_tipo;/,
  "sangria e suprimento preservam categoria rastreável na conta financeira");
assert.match(cash, /v_tipo_conta := CASE WHEN p_tipo = 'sangria' THEN 'pagar' ELSE 'receber' END;/,
  "o tipo contábil da movimentação interna permanece explícito para o caixa físico");
assert.doesNotMatch(settleUi, /\.from\("contas"\)\.update/,
  "tela não altera saldo/status financeiro diretamente");
assert.match(route, /chavesOperacao\.current\.get\(identidade\)/,
  "repetição após falha ambígua reutiliza chave no cliente");
assert.match(route, /PGRST202[\s\S]*migration financeira ainda não está instalada/,
  "RPC ausente falha fechado e informa que a operação está pausada");
assert.match(route, /const fechamentoDisponivel[\s\S]*pagamentosSemDataConfiavel === 0/,
  "fechamento de caixa é bloqueado quando há pagamentos legados sem data confiável");
assert.match(route, /const fechamentoDisponivel[\s\S]*eventosContaSemMeioCaixa === 0/,
  "fechamento não presume o meio efetivo de baixa das contas pelo valor padrão da conta");
assert.match(route, /function invalidarFluxoFinanceiro\(\)[\s\S]*fin-eventos-pagamento-caixa[\s\S]*fin-eventos-pedido-caixa[\s\S]*fin-pedidos-recebidos-caixa[\s\S]*fin-pedidos-pagos-sem-data/,
  "invalidação cobre as quatro chaves do fluxo financeiro");
assert.match(reconcileUi, /invalidarFluxoFinanceiro\(\)/,
  "conciliação atualiza o fluxo após sucesso");
assert.match(settleUi, /invalidarFluxoFinanceiro\(\)/,
  "baixa, cancelamento e movimento de caixa atualizam o fluxo");
assert.match(route, /async function abrirCaixa[\s\S]*invalidarFluxoFinanceiro\(\)/,
  "abertura de caixa atualiza o fluxo da sessão");
assert.match(route, /async function fecharCaixa[\s\S]*invalidarFluxoFinanceiro\(\)/,
  "fechamento de caixa atualiza o fluxo da sessão");
assert.match(route, /isError: erroPedidos/, "falha de leitura de pedidos é observada");
assert.match(route, /valorPedidos\(conc\.pendente\)/, "conciliação não exibe zero fictício quando pedidos falham");
assert.match(route, /isError: erroCaixaAberto/, "falha de leitura do caixa é observada");
assert.match(route, /Estado do caixa indisponível/, "caixa com leitura falha não é tratado como fechado");
assert.match(route, /import \{ faixaCompetencia, hojeSP \}/, "data corrente usa fuso de São Paulo");
assert.match(route, /const hoje = hojeSP\(\)/, "vencimentos usam hoje de São Paulo");
assert.doesNotMatch(route, /hojeISO/, "data UTC antiga foi removida");
assert.match(route, /const vencidasSaldo = totalContas\(vencidas\.filter/, "vencidas usa saldo restante por tipo");
assert.match(route, /valorContas\(vencidasSaldo\)/, "vencidas exibe saldo restante");
assert.doesNotMatch(route, /vencidas\.reduce/, "soma bruta de vencidas foi removida");

console.log("Financeiro: contrato SQL e integração do frontend validados estaticamente.");
console.log("Atomicidade, RLS e concorrência reais ainda exigem execução em PostgreSQL isolado/staging.");
