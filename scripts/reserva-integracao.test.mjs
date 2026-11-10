// Etapa 1.50 — testes LOCAIS (mocks) dos wrappers de integração 0087–0094.
// NÃO acessa Supabase, NÃO executa SQL, NÃO é teste transacional.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const R = await import("@/lib/reserva-integracao.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const UUID_PEDIDO = "11111111-1111-4111-8111-111111111111";
const UUID_RESERVA = "22222222-2222-4222-8222-222222222222";
const UUID_IDEM = "33333333-3333-4333-8333-333333333333";
const UUID_PRODUTO = "44444444-4444-4444-8444-444444444444";

const DEPS_OK = {
  reserva_consumos_0087: true,
  reservar_pedido_0089: true,
  liberar_pedido_0090: true,
  registrar_consumo_0091: true,
  proveniencia_0092: true,
  cancelar_pedido_0093: true,
  regime_proveniencia_ativo: true,
  fallback_checkout_removido: true,
  cancelamentos_diretos_migrados: true,
  producao_integrada: true,
};

function mockRpc(impl) {
  const chamadas = [];
  return {
    chamadas,
    rpc(fn, args) {
      chamadas.push({ fn, args });
      return Promise.resolve(impl(fn, args));
    },
  };
}

// ---------------------------------------------------------------------------
// 0. Gate puro: desativado / preparado / habilitado.
// ---------------------------------------------------------------------------
{
  let g = R.avaliarGate(false, "reserva", DEPS_OK);
  ok(g.ok === false && g.estado === "desativado" && g.faltando.length === 0, "0.1 flag off => desativado");

  g = R.avaliarGate(true, "reserva", R.DEPENDENCIAS_PADRAO);
  ok(
    g.ok === false &&
      g.estado === "preparado" &&
      g.faltando.includes("reservar_pedido_0089") &&
      g.faltando.includes("proveniencia_0092") &&
      g.faltando.includes("fallback_checkout_removido"),
    "0.2 flag on + deps padrão => preparado (env sozinho nunca habilita)",
  );

  g = R.avaliarGate(true, "reserva", DEPS_OK);
  ok(g.ok === true && g.estado === "habilitado", "0.3 flag on + deps completas => habilitado");

  g = R.avaliarGate(true, "cancelamento", { ...DEPS_OK, cancelamentos_diretos_migrados: false });
  ok(
    g.ok === false && g.estado === "preparado" && g.faltando.includes("cancelamentos_diretos_migrados"),
    "0.4 cancelamento exige caminhos diretos migrados",
  );

  g = R.avaliarGate(true, "consumo", { ...DEPS_OK, producao_integrada: false });
  ok(
    g.ok === false && g.estado === "preparado" && g.faltando.includes("producao_integrada"),
    "0.5 consumo exige produção integrada",
  );
}

// ---------------------------------------------------------------------------
// 1. Reserva bem-sucedida (+ montagem não é "totalmente reconciliado").
// ---------------------------------------------------------------------------
{
  let r = R.interpretarReservaAtomica({ status: "reservado", itens: 2, montagem: 0 });
  ok(
    r.ok === true && r.estado === "reservado" && r.itens === 2 && r.coberturaCompleta === true,
    "1. reserva bem-sucedida",
  );

  r = R.interpretarReservaAtomica({ status: "reservado", itens: 1, montagem: 3 });
  ok(r.ok === true && r.montagem === 3 && r.coberturaCompleta === false, "1b. montagem NÃO é cobertura total");

  r = R.interpretarReservaAtomica({ status: "ja_reservado", itens: 0, montagem: 0 });
  ok(r.ok === true && r.estado === "ja_reservado", "1c. ja_reservado é sucesso idempotente");
}

// ---------------------------------------------------------------------------
// 2. Estoque insuficiente (e resposta malformada não vira sucesso).
// ---------------------------------------------------------------------------
{
  let r = R.interpretarReservaAtomica({
    status: "estoque_insuficiente",
    itens: [{ produto_id: UUID_PRODUTO, faltante: 7 }],
  });
  ok(
    r.ok === false &&
      r.estado === "estoque_insuficiente" &&
      r.faltas.length === 1 &&
      r.faltas[0].produtoId === UUID_PRODUTO &&
      r.faltas[0].faltante === 7,
    "2. estoque insuficiente tipado",
  );

  r = R.interpretarReservaAtomica({ status: "estoque_insuficiente", itens: "x" });
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "2b. payload inválido não vira sucesso");

  r = R.interpretarReservaAtomica({ status: "reservado" });
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "2c. reservado sem itens não vira sucesso");

  r = R.interpretarReservaAtomica({ status: "inventado" });
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "2d. status desconhecido bloqueia");
}

// ---------------------------------------------------------------------------
// 3. RPC inexistente ≠ falta de estoque.
// ---------------------------------------------------------------------------
{
  const m = mockRpc(() => ({
    data: null,
    error: { code: "PGRST202", message: "Could not find the function public.reservar_pedido_atomico" },
  }));
  const r = await R.executarReservaAtomica(m, UUID_PEDIDO);
  ok(
    r.ok === false && r.estado === "erro_tecnico" && r.motivo === "rpc_indisponivel",
    "3. RPC inexistente => rpc_indisponivel",
  );
  ok(r.estado !== "estoque_insuficiente", "3b. RPC inexistente NÃO é estoque insuficiente");
  ok(m.chamadas.length === 1 && m.chamadas[0].fn === "reservar_pedido_atomico", "3c. chamou a RPC correta");
  ok(
    m.chamadas[0].args.p_pedido_id === UUID_PEDIDO && Object.keys(m.chamadas[0].args).length === 1,
    "3d. apenas p_pedido_id",
  );
}

// ---------------------------------------------------------------------------
// 4. Reconciliação pendente.
// ---------------------------------------------------------------------------
{
  let r = R.interpretarReservaAtomica({ status: "reconciliacao_pendente", reservas: 2 });
  ok(r.ok === false && r.estado === "reconciliacao_pendente" && r.reservas === 2, "4. reconciliação de reserva");

  r = R.interpretarReservaAtomica({ status: "permissao_negada" });
  ok(r.ok === false && r.estado === "permissao_negada", "4b. permissão negada (negócio)");

  r = R.interpretarReservaAtomica({ status: "produto_inexistente", produtos: [UUID_PRODUTO] });
  ok(r.ok === false && r.estado === "produto_inexistente" && r.produtos.length === 1, "4c. produto inexistente");
}

// ---------------------------------------------------------------------------
// 5. Cancelamento bem-sucedido (com liberação tipada).
// ---------------------------------------------------------------------------
{
  let r = R.interpretarCancelamento({
    status: "cancelado",
    pedido_id: UUID_PEDIDO,
    liberacao: { status: "liberado", reservas: 1, unidades: 50, montagem: 0 },
  });
  ok(
    r.ok === true &&
      r.estado === "cancelado" &&
      r.pedidoId === UUID_PEDIDO &&
      r.liberacao !== null &&
      r.liberacao.unidades === 50,
    "5. cancelamento bem-sucedido",
  );

  r = R.interpretarCancelamento({ status: "ja_cancelado" });
  ok(r.ok === true && r.estado === "ja_cancelado" && r.idempotente === true, "5b. ja_cancelado idempotente");

  const m = mockRpc(() => ({
    data: { status: "cancelado", pedido_id: UUID_PEDIDO, liberacao: { status: "ja_liberado", reservas: 0, unidades: 0, montagem: 0 } },
    error: null,
  }));
  const c = await R.executarCancelamentoAtomico(m, UUID_PEDIDO, "  cliente pediu  ");
  ok(c.ok === true && c.estado === "cancelado", "5c. executar cancelamento");
  ok(m.chamadas[0].fn === "cancelar_pedido_atomico" && m.chamadas[0].args.p_motivo === "cliente pediu", "5d. motivo normalizado");
}

// ---------------------------------------------------------------------------
// 6. Pagamento não elegível.
// ---------------------------------------------------------------------------
{
  const r = R.interpretarCancelamento({
    status: "pagamento_nao_elegivel",
    pagamento_status: "pago",
  });
  ok(
    r.ok === false && r.estado === "pagamento_nao_elegivel" && r.pagamentoStatus === "pago",
    "6. pagamento não elegível preserva o status",
  );
}

// ---------------------------------------------------------------------------
// 7. Cancelamento exigindo análise.
// ---------------------------------------------------------------------------
{
  let r = R.interpretarCancelamento({ status: "requer_analise", atual: "em_producao" });
  ok(r.ok === false && r.estado === "requer_analise" && r.atual === "em_producao", "7. requer análise");

  r = R.interpretarCancelamento({ status: "status_invalido", atual: "entregue" });
  ok(r.ok === false && r.estado === "status_invalido" && r.atual === "entregue", "7b. status inválido");

  r = R.interpretarCancelamento({ status: "reconciliacao_pendente", motivo: "sem_reserva_ativa" });
  ok(r.ok === false && r.estado === "reconciliacao_pendente" && r.motivo === "sem_reserva_ativa", "7c. reconciliação de cancelamento");
}

// ---------------------------------------------------------------------------
// 8. Retirada parcial.
// ---------------------------------------------------------------------------
{
  const r = R.interpretarConsumo({
    status: "consumido",
    reserva_id: UUID_RESERVA,
    quantidade: 20,
    consumido_total: 20,
    restante: 80,
  });
  ok(
    r.ok === true && r.estado === "consumido" && r.quantidade === 20 && r.restante === 80,
    "8. retirada parcial",
  );

  const r2 = R.interpretarConsumo({ status: "acima_do_restante", restante: 5 });
  ok(r2.ok === false && r2.estado === "acima_do_restante" && r2.restante === 5, "8b. acima do restante");
}

// ---------------------------------------------------------------------------
// 9. Repetição idempotente.
// ---------------------------------------------------------------------------
{
  let r = R.interpretarConsumo({ status: "ja_registrado", reserva_id: UUID_RESERVA });
  ok(r.ok === true && r.estado === "ja_registrado" && r.idempotente === true, "9. replay idempotente");

  r = R.interpretarConsumo({ status: "chave_conflito" });
  ok(r.ok === false && r.estado === "chave_conflito", "9b. chave reutilizada com dados diferentes");

  const k = R.novoIdemKey();
  ok(typeof k === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k), "9c. idem key é UUID");

  const m = mockRpc(() => ({
    data: { status: "consumido", reserva_id: UUID_RESERVA, quantidade: 10, consumido_total: 10, restante: 90 },
    error: null,
  }));
  const c = await R.executarConsumoAtomico(m, {
    reservaId: UUID_RESERVA,
    quantidade: 10,
    idemKey: UUID_IDEM,
    produtoId: UUID_PRODUTO,
    observacao: "freezer",
  });
  ok(c.ok === true && c.estado === "consumido", "9d. executar consumo");
  ok(m.chamadas[0].fn === "registrar_consumo_reserva", "9e. RPC correta");
  ok(
    m.chamadas[0].args.p_reserva_id === UUID_RESERVA &&
      m.chamadas[0].args.p_quantidade === 10 &&
      m.chamadas[0].args.p_idem_key === UUID_IDEM &&
      m.chamadas[0].args.p_produto_id === UUID_PRODUTO,
    "9f. argumentos da 0091",
  );
}

// ---------------------------------------------------------------------------
// 10. Erro técnico (rede / exceção / resposta nula).
// ---------------------------------------------------------------------------
{
  let m = mockRpc(() => ({ data: null, error: { code: "XX000", message: "network down" } }));
  let r = await R.executarReservaAtomica(m, UUID_PEDIDO);
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "erro_rede", "10. erro de rede");

  m = { chamadas: [], rpc() { throw new Error("boom"); } };
  r = await R.executarReservaAtomica(m, UUID_PEDIDO);
  ok(r.ok === false && r.estado === "erro_tecnico", "10b. exceção de transporte vira erro estruturado");

  r = R.interpretarReservaAtomica(null);
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "10c. data null não vira sucesso");

  r = R.interpretarCancelamento(null);
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "10d. cancelamento null não vira sucesso");

  r = R.interpretarConsumo(null);
  ok(r.ok === false && r.estado === "erro_tecnico" && r.motivo === "resposta_invalida", "10e. consumo null não vira sucesso");

  ok(R.classificarErroRpc({ code: "42501", message: "permission denied for function" }).motivo === "rpc_sem_permissao", "10f. 42501");
  ok(R.classificarErroRpc({ code: "PGRST301", message: "JWT expired" }).motivo === "nao_autenticado", "10g. JWT");
}

// ---------------------------------------------------------------------------
// 11. Flags desligadas: nenhuma chamada, nem escrita.
// ---------------------------------------------------------------------------
{
  ok(
    R.FLAGS_INTEGRACAO.reserva === false &&
      R.FLAGS_INTEGRACAO.consumo === false &&
      R.FLAGS_INTEGRACAO.cancelamento === false,
    "11. flags iniciam desligadas",
  );

  const m = { chamadas: [], rpc() { throw new Error("não deveria chamar RPC"); } };

  let r = await R.reservarPedidoAtomico(m, UUID_PEDIDO, { dependencias: DEPS_OK });
  ok(r.ok === false && r.estado === "desativado", "11b. reserva desativada");
  r = await R.registrarConsumoAtomico(
    m,
    { reservaId: UUID_RESERVA, quantidade: 10, idemKey: UUID_IDEM },
    { dependencias: DEPS_OK },
  );
  ok(r.ok === false && r.estado === "desativado", "11c. consumo desativado");
  r = await R.cancelarPedidoAtomico(m, UUID_PEDIDO, { dependencias: DEPS_OK });
  ok(r.ok === false && r.estado === "desativado", "11d. cancelamento desativado");
  ok(m.chamadas.length === 0, "11e. NENHUMA chamada RPC com flags off");
}

// ---------------------------------------------------------------------------
// 12. Pré-checagens locais (retiradas fictícias) e ausência de fallback.
// ---------------------------------------------------------------------------
{
  const m = { chamadas: [], rpc() { throw new Error("não deveria chamar RPC"); } };

  let r = await R.executarConsumoAtomico(m, { reservaId: UUID_RESERVA, quantidade: 0, idemKey: UUID_IDEM });
  ok(r.ok === false && r.estado === "quantidade_invalida", "12.1 quantidade 0 bloqueada");

  r = await R.executarConsumoAtomico(m, { reservaId: "x", quantidade: 1, idemKey: UUID_IDEM });
  ok(r.ok === false && r.estado === "entrada_invalida", "12.2 reserva inválida bloqueada");

  r = await R.executarConsumoAtomico(m, { reservaId: UUID_RESERVA, quantidade: 1, idemKey: "nao-uuid" });
  ok(r.ok === false && r.estado === "entrada_invalida", "12.3 idem key inválida bloqueada");

  r = await R.executarConsumoAtomico(m, {
    reservaId: UUID_RESERVA,
    quantidade: 1,
    idemKey: UUID_IDEM,
    produtoId: "x",
  });
  ok(r.ok === false && r.estado === "entrada_invalida", "12.4 produto inválido bloqueado");

  r = await R.executarCancelamentoAtomico(m, "nao-uuid");
  ok(r.ok === false && r.estado === "pedido_invalido", "12.5 pedido inválido bloqueado");

  ok(m.chamadas.length === 0, "12.6 pré-checagens não chamam a RPC");

  const src = readFileSync("src/lib/reserva-integracao.ts", "utf8");
  const semComentarios = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  ok(!/\.from\s*\(/.test(semComentarios), "12.7 sem acesso direto a tabela (.from)");
  ok(!/\.(insert|update|delete|upsert)\s*\(/.test(semComentarios), "12.8 sem escrita direta");
  ok(/\.rpc\s*\(/.test(semComentarios), "12.9 operações somente via rpc()");
  ok(
    /reservar_pedido_atomico/.test(semComentarios) &&
      /registrar_consumo_reserva/.test(semComentarios) &&
      /cancelar_pedido_atomico/.test(semComentarios),
    "12.10 nomes das RPCs corretos",
  );
  ok(
    !/integrations\/supabase|supabase-loose|createClient/.test(src),
    "12.11 módulo não instancia cliente na importação",
  );
  ok(!/setTimeout|retry|tentativas/i.test(semComentarios), "12.12 sem retry automático");
}

// ---------------------------------------------------------------------------
// 13. Mensagens de apresentação (sem alterar layout).
// ---------------------------------------------------------------------------
{
  ok(R.mensagemEstado("estoque_insuficiente").length > 0, "13. mensagem de negócio");
  ok(R.mensagemEstado("estado_inexistente").length > 0, "13b. fallback de mensagem");
  ok(/NÃO foi confirmada/.test(R.mensagemEstado("erro_tecnico")), "13c. erro técnico não é sucesso");
}

if (falhas > 0) {
  console.error(`\nreserva-integracao: ${falhas} caso(s) falhando.`);
  process.exit(1);
}
console.log(
  "\nreserva-integracao: casos locais passando. " +
    "Transacionais de 0089/0091/0093 executados em PGlite/PG 18.6; concorrência multi-sessão permanece PENDENTE.",
);
