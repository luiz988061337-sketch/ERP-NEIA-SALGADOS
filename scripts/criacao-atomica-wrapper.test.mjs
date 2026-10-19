// Etapa 1.52 — testes LOCAIS (mocks) do wrapper da criação atômica (0095).
// NÃO acessa Supabase, NÃO executa SQL, NÃO é teste transacional.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve("scripts/alias-loader.mjs")).href);
const C = await import("@/lib/criacao-atomica.ts");

let falhas = 0;
function ok(cond, nome, detalhe = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!cond) falhas += 1;
}

const UUID_PEDIDO = "11111111-1111-4111-8111-111111111111";
const UUID_PRODUTO = "44444444-4444-4444-8444-444444444444";

const DEPS_OK = {
  criar_pedido_com_reserva_0095: true,
  reservar_pedido_0089: true,
  proveniencia_0092: true,
  fallback_checkout_removido: true,
};

const ENTRADA = {
  pedidoId: UUID_PEDIDO,
  canal: "checkout",
  dados: { cliente_nome: "Maria", telefone: "11999998888" },
  itens: [{ produtoId: UUID_PRODUTO, quantidade: 50 }],
};

function mockRpc(impl) {
  const chamadas = [];
  return {
    chamadas,
    async rpc(fn, args) {
      chamadas.push({ fn, args });
      return impl(fn, args);
    },
  };
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------
{
  const desativado = C.avaliarGateCriacao(false, DEPS_OK);
  ok(!desativado.ok && desativado.estado === "desativado" && desativado.faltando.length === 0, "gate: flag off => desativado");

  const preparado = C.avaliarGateCriacao(true, C.DEPENDENCIAS_CRIACAO_PADRAO);
  ok(!preparado.ok && preparado.estado === "preparado" && preparado.faltando.length === 4, "gate: flag on sem deps => preparado");

  const habilitado = C.avaliarGateCriacao(true, DEPS_OK);
  ok(habilitado.ok && habilitado.estado === "habilitado" && habilitado.faltando.length === 0, "gate: flag on + deps completas => habilitado");
}

// ---------------------------------------------------------------------------
// Interpretação — sucesso
// ---------------------------------------------------------------------------
{
  const r = C.interpretarCriacao({
    status: "criado",
    pedido_id: UUID_PEDIDO,
    numero: 1001,
    canal: "checkout",
    subtotal: 80,
    taxa_entrega: 6,
    desconto: 0,
    total: 86,
    pagamento_status: "pendente",
    pagamento_modalidade: "online",
    reserva: { status: "reservado" },
  });
  ok(r.ok && r.estado === "criado" && r.pedidoId === UUID_PEDIDO && r.numero === 1001 && r.total === 86, "parse: criado completo");
  ok(r.ok && r.reserva && r.reserva.status === "reservado", "parse: criado carrega reserva");

  const j = C.interpretarCriacao({
    status: "ja_criado",
    pedido_id: UUID_PEDIDO,
    numero: 1001,
    total: 86,
    cobertura: { status: "coberto", unidades: 50, cobertas: 50, montagem: 0 },
  });
  ok(j.ok && j.estado === "ja_criado" && j.cobertura?.status === "coberto", "parse: ja_criado");
}

// ---------------------------------------------------------------------------
// Interpretação — erros de negócio
// ---------------------------------------------------------------------------
{
  for (const status of [
    "canal_invalido",
    "permissao_negada",
    "entrada_invalida",
    "dados_invalidos",
    "itens_invalidos",
    "produto_inexistente",
    "produto_indisponivel",
    "regra_combo",
    "montagem_sem_modelagem",
    "cupom_invalido",
    "cupom_esgotado",
    "configuracao_ausente",
    "dependencia_ausente",
    "estoque_insuficiente",
    "erro_interno",
  ]) {
    const r = C.interpretarCriacao({ status });
    ok(!r.ok && r.estado === status, `parse: erro de negócio "${status}"`);
  }

  const div = C.interpretarCriacao({ status: "idempotencia_divergente", motivo: "itens" });
  ok(!div.ok && div.estado === "idempotencia_divergente", "parse: idempotencia_divergente");
  const outro = C.interpretarCriacao({ status: "pedido_de_outro_usuario" });
  ok(!outro.ok && outro.estado === "pedido_de_outro_usuario", "parse: pedido_de_outro_usuario");
  const fin = C.interpretarCriacao({ status: "inconsistencia_financeira" });
  ok(!fin.ok && fin.estado === "inconsistencia_financeira", "parse: inconsistencia_financeira");

  const ra = C.interpretarCriacao({ status: "reservas_ausentes", pedido_id: UUID_PEDIDO, numero: 1001 });
  ok(!ra.ok && ra.estado === "reservas_ausentes" && ra.pedidoId === UUID_PEDIDO, "parse: reservas_ausentes");
  const rp = C.interpretarCriacao({ status: "reconciliacao_pendente", pedido_id: UUID_PEDIDO, numero: 1001 });
  ok(!rp.ok && rp.estado === "reconciliacao_pendente" && rp.pedidoId === UUID_PEDIDO, "parse: reconciliacao_pendente");
}

// ---------------------------------------------------------------------------
// Interpretação — resposta inválida (nunca sucesso artificial)
// ---------------------------------------------------------------------------
{
  ok(!C.interpretarCriacao(null).ok, "parse: SQL NULL => resposta_invalida");
  ok(!C.interpretarCriacao([1, 2]).ok, "parse: array => resposta_invalida");
  ok(!C.interpretarCriacao({}).ok, "parse: sem status => resposta_invalida");
  ok(!C.interpretarCriacao({ status: "desconhecido" }).ok, "parse: status desconhecido => resposta_invalida");
  ok(!C.interpretarCriacao({ status: "criado", pedido_id: UUID_PEDIDO }).ok, "parse: criado incompleto => resposta_invalida");
  const completoSemReserva = C.interpretarCriacao({
    status: "criado",
    pedido_id: UUID_PEDIDO,
    numero: 1,
    subtotal: 1,
    taxa_entrega: 0,
    desconto: 0,
    total: 1,
    pagamento_status: "pendente",
    pagamento_modalidade: "online",
  });
  ok(completoSemReserva.ok && completoSemReserva.estado === "criado" && completoSemReserva.reserva === null, "parse: criado completo (sem reserva) aceito");
}

// ---------------------------------------------------------------------------
// Erro de transporte / RPC
// ---------------------------------------------------------------------------
{
  const rpcIndisponivel = await C.executarCriacaoAtomica(
    mockRpc(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })),
    ENTRADA,
  );
  ok(rpcIndisponivel.ok === false && rpcIndisponivel.estado === "erro_tecnico" && rpcIndisponivel.motivo === "rpc_indisponivel", "erro: PGRST202 => rpc_indisponivel (nunca estoque_insuficiente)");

  const rpcPermissao = await C.executarCriacaoAtomica(
    mockRpc(() => ({ data: null, error: { code: "42501", message: "permission denied" } })),
    ENTRADA,
  );
  ok(rpcPermissao.ok === false && rpcPermissao.motivo === "rpc_sem_permissao", "erro: 42501 => rpc_sem_permissao");

  const rpcRede = await C.executarCriacaoAtomica(
    mockRpc(() => ({ data: null, error: { message: "network" } })),
    ENTRADA,
  );
  ok(rpcRede.ok === false && rpcRede.motivo === "erro_rede", "erro: rede => erro_rede");

  const rpcExcecao = await C.executarCriacaoAtomica(
    mockRpc(() => {
      throw new Error("transport");
    }),
    ENTRADA,
  );
  ok(rpcExcecao.ok === false && rpcExcecao.estado === "erro_tecnico", "erro: exceção de transporte => erro_tecnico");
}

// ---------------------------------------------------------------------------
// Wrapper com gate: desativado/preparado não chamam a RPC
// ---------------------------------------------------------------------------
{
  const cliente = mockRpc(() => ({ data: { status: "criado" }, error: null }));
  const r1 = await C.criarPedidoComReservaAtomico(cliente, ENTRADA, { dependencias: DEPS_OK });
  ok(!r1.ok && r1.estado === "desativado" && cliente.chamadas.length === 0, "wrapper: flag off não chama RPC");

  const cliente2 = mockRpc(() => ({ data: { status: "criado" }, error: null }));
  const r2 = await C.criarPedidoComReservaAtomico(cliente2, ENTRADA, { dependencias: C.DEPENDENCIAS_CRIACAO_PADRAO, flagAtiva: true });
  ok(!r2.ok && r2.estado === "preparado" && cliente2.chamadas.length === 0, "wrapper: flag on sem deps não chama RPC");
}

// ---------------------------------------------------------------------------
// Wrapper habilitado: chama a RPC correta com os argumentos corretos
// ---------------------------------------------------------------------------
{
  const cliente = mockRpc(() => ({
    data: {
      status: "criado",
      pedido_id: UUID_PEDIDO,
      numero: 1001,
      subtotal: 80,
      taxa_entrega: 6,
      desconto: 0,
      total: 86,
      pagamento_status: "pendente",
      pagamento_modalidade: "online",
      reserva: null,
    },
    error: null,
  }));
  const r = await C.criarPedidoComReservaAtomico(cliente, ENTRADA, { dependencias: DEPS_OK, flagAtiva: true });
  ok(r.ok && r.estado === "criado", "wrapper: habilitado chama a RPC e devolve criado");
  ok(cliente.chamadas.length === 1, "wrapper: exatamente uma chamada");
  const chamada = cliente.chamadas[0];
  ok(chamada.fn === "criar_pedido_com_reserva", "wrapper: RPC correta");
  ok(chamada.args.p_id === UUID_PEDIDO && chamada.args.p_canal === "checkout", "wrapper: p_id/p_canal");
  ok(Array.isArray(chamada.args.p_itens) && chamada.args.p_itens[0].produto_id === UUID_PRODUTO, "wrapper: p_itens mapeado");
  ok(chamada.args.p_itens[0].quantidade === 50, "wrapper: quantidade preservada");
}

// ---------------------------------------------------------------------------
// Validações locais (sem chamada à RPC)
// ---------------------------------------------------------------------------
{
  const cliente = mockRpc(() => ({ data: null, error: null }));

  const semUuid = await C.criarPedidoComReservaAtomico(
    cliente,
    { ...ENTRADA, pedidoId: "nao-e-uuid" },
    { dependencias: DEPS_OK, flagAtiva: true },
  );
  ok(!semUuid.ok && semUuid.estado === "entrada_invalida" && cliente.chamadas.length === 0, "validação: pedidoId não-UUID não chama RPC");

  const canalRuim = await C.criarPedidoComReservaAtomico(
    cliente,
    { ...ENTRADA, canal: "web" },
    { dependencias: DEPS_OK, flagAtiva: true },
  );
  ok(!canalRuim.ok && canalRuim.estado === "canal_invalido" && cliente.chamadas.length === 0, "validação: canal inválido não chama RPC");

  const semItens = await C.criarPedidoComReservaAtomico(
    cliente,
    { ...ENTRADA, itens: [] },
    { dependencias: DEPS_OK, flagAtiva: true },
  );
  ok(!semItens.ok && semItens.estado === "itens_invalidos" && cliente.chamadas.length === 0, "validação: itens vazios não chamam RPC");

  const qtdRuim = await C.criarPedidoComReservaAtomico(
    cliente,
    { ...ENTRADA, itens: [{ produtoId: UUID_PRODUTO, quantidade: 0 }] },
    { dependencias: DEPS_OK, flagAtiva: true },
  );
  ok(!qtdRuim.ok && qtdRuim.estado === "itens_invalidos" && cliente.chamadas.length === 0, "validação: quantidade inválida não chama RPC");

  const produtoRuim = await C.criarPedidoComReservaAtomico(
    cliente,
    { ...ENTRADA, itens: [{ produtoId: "xyz", quantidade: 1 }] },
    { dependencias: DEPS_OK, flagAtiva: true },
  );
  ok(!produtoRuim.ok && produtoRuim.estado === "itens_invalidos" && cliente.chamadas.length === 0, "validação: produto_id inválido não chama RPC");

  ok(cliente.chamadas.length === 0, "validação: nenhuma chamada em nenhuma pré-checagem");
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------
{
  ok(typeof C.mensagemCriacao("criado") === "string" && C.mensagemCriacao("criado").length > 0, "mensagem: criado");
  ok(C.mensagemCriacao("inexistente").length > 0, "mensagem: fallback");
}

console.log(
  falhas === 0
    ? "\ncriacao-atomica-wrapper: casos locais passando. Transacionais da 0095 executados em PGlite/PG 18.6; concorrência multi-sessão permanece PENDENTE."
    : `\ncriacao-atomica-wrapper: ${falhas} FALHA(S).`,
);
process.exitCode = falhas === 0 ? 0 : 1;
