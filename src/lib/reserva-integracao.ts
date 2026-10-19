/**
 * Etapa 1.50 — CONTRATOS E WRAPPERS DE INTEGRAÇÃO (0087–0094) — DESATIVADOS.
 *
 * Este módulo é importado pelos chamadores (admin/pedido.$id/produção) SOMENTE
 * atrás das flags `VITE_FF_*`; com as flags OFF o caminho legado permanece
 * intacto. Ele prepara os contratos tipados das RPCs novas (0089/0091/0093) e um
 * gate de ativação reutilizável.
 *
 * ============================================================================
 * ESTADOS DE ATIVAÇÃO (C.8)
 * ============================================================================
 *   - "desativado": a flag da operação NÃO está ligada. O wrapper não faz
 *     NENHUMA chamada (nem RPC, nem escrita) e devolve { estado: "desativado" }.
 *   - "preparado": a flag está ligada, MAS as dependências declaradas não estão
 *     completas. O wrapper NÃO chama a RPC e devolve a lista `faltando`.
 *     Variável de ambiente sozinha NUNCA habilita (C.3).
 *   - "habilitado": flag ligada + TODAS as dependências obrigatórias declaradas
 *     como presentes. Só então a RPC é chamada.
 *
 * As dependências são DECLARADAS pelo chamador (attestation), não inferidas de
 * env: `DEPENDENCIAS_PADRAO` é tudo `false`, portanto uma flag ligada sozinha
 * leva a "preparado", nunca a "habilitado".
 *
 * ============================================================================
 * GARANTIAS
 * ============================================================================
 *   - Somente `rpc(...)`. Nenhum acesso direto a tabela (sem `.from/.insert/
 *     .update/.delete/.upsert`) => não existe fallback que grave reserva sem
 *     débito nem cancelamento por UPDATE direto.
 *   - RPC inexistente (PGRST202 / "could not find the function") é classificada
 *     como `rpc_indisponivel` e NUNCA como `estoque_insuficiente`.
 *   - Resposta ausente/malformada => `resposta_invalida` (nunca sucesso
 *     artificial). Rejeita SQL NULL, JSON null, array, status ausente ou
 *     desconhecido.
 *   - Nenhum retry automático; idempotência é responsabilidade da RPC (0089/
 *     0091/0093) e da chave `idem_key` do consumo.
 *   - Itens de montagem (sem `produto_id`) são CONTADOS em `montagem`; o
 *     wrapper nunca os declara reservados (`coberturaCompleta = montagem === 0`).
 *
 * IMPORTANTE: flags desligadas NÃO corrigem o caminho legado. O fallback do
 * checkout, os cancelamentos diretos e os pedidos sem reserva continuam
 * inseguros enquanto os chamadores antigos estiverem ativos.
 */

import {
  BUILD_DE_CORTE_CANCELAMENTO,
  BUILD_DE_CORTE_CONSUMO,
  BUILD_DE_CORTE_RESERVA,
} from "@/lib/corte";

// ---------------------------------------------------------------------------
// Flags (mesmo mecanismo dos módulos E3/E6 existentes; default "off").
// ---------------------------------------------------------------------------
// As flags vêm de `src/lib/corte.ts` (acesso DIRETO ao env), e não de um
// helper genérico: só o acesso direto é substituído por literal em tempo de
// build, o que permite ao minificador eliminar o caminho legado.
export const FLAGS_INTEGRACAO = {
  reserva: BUILD_DE_CORTE_RESERVA,
  consumo: BUILD_DE_CORTE_CONSUMO,
  cancelamento: BUILD_DE_CORTE_CANCELAMENTO,
} as const;

export type OperacaoIntegracao = keyof typeof FLAGS_INTEGRACAO;

// ---------------------------------------------------------------------------
// Dependências declaradas (attestation) e requisitos por operação.
// ---------------------------------------------------------------------------
export type DependenciasIntegracao = {
  reserva_consumos_0087: boolean;
  reservar_pedido_0089: boolean;
  liberar_pedido_0090: boolean;
  registrar_consumo_0091: boolean;
  proveniencia_0092: boolean;
  cancelar_pedido_0093: boolean;
  controlado_ativo: boolean;
  fallback_checkout_removido: boolean;
  cancelamentos_diretos_migrados: boolean;
  producao_integrada: boolean;
};

export type ChaveDependencia = keyof DependenciasIntegracao;

export const DEPENDENCIAS_PADRAO: DependenciasIntegracao = {
  reserva_consumos_0087: false,
  reservar_pedido_0089: false,
  liberar_pedido_0090: false,
  registrar_consumo_0091: false,
  proveniencia_0092: false,
  cancelar_pedido_0093: false,
  controlado_ativo: false,
  fallback_checkout_removido: false,
  cancelamentos_diretos_migrados: false,
  producao_integrada: false,
};

/**
 * Attestation do BUILD DE CORTE — cancelamento (0093/0090).
 *
 * No bundle de corte o caminho legado de cancelamento (UPDATE direto em
 * `pedidos` + `liberar_reserva_atomica` + UPDATE direto em `reservas_estoque`)
 * é removido pelo mesmo interruptor de build; logo estas afirmações são
 * verdadeiras no bundle, não otimistas.
 */
export const DEPENDENCIAS_CANCELAMENTO_CORTE: DependenciasIntegracao = {
  ...DEPENDENCIAS_PADRAO,
  reservar_pedido_0089: true,
  liberar_pedido_0090: true,
  cancelar_pedido_0093: true,
  proveniencia_0092: true,
  controlado_ativo: true,
  fallback_checkout_removido: true,
  cancelamentos_diretos_migrados: true,
};

/** Attestation efetiva do cancelamento (bundle de corte vs. build comum). */
export const ATTESTACAO_CANCELAMENTO: DependenciasIntegracao = BUILD_DE_CORTE_CANCELAMENTO
  ? DEPENDENCIAS_CANCELAMENTO_CORTE
  : DEPENDENCIAS_PADRAO;

/**
 * Requisitos POR OPERAÇÃO (o que precisa estar declarado como pronto).
 *   - reserva: 0089 + 0092 + fallback do checkout removido (senão conviveriam
 *     duas rotas de reserva, uma delas sem débito — C.7).
 *   - consumo: 0091 + 0087 + produção integrada (a retirada física não pode ser
 *     tratada como obrigatória antes da implantação coordenada — C.5).
 *   - cancelamento: 0093 + 0090 + 0089 + 0092 + controlado ativo + cancelamentos
 *     diretos migrados + fallback removido. Sem isso, a 0090 falha fechada
 *     (sem marcador) e restariam caminhos diretos inseguros (C.6).
 */
export const REQUISITOS: Record<OperacaoIntegracao, readonly ChaveDependencia[]> = {
  reserva: ["reservar_pedido_0089", "proveniencia_0092", "fallback_checkout_removido"],
  consumo: ["registrar_consumo_0091", "reserva_consumos_0087", "producao_integrada"],
  cancelamento: [
    "cancelar_pedido_0093",
    "liberar_pedido_0090",
    "reservar_pedido_0089",
    "proveniencia_0092",
    "controlado_ativo",
    "cancelamentos_diretos_migrados",
    "fallback_checkout_removido",
  ],
};

export type EstadoIntegracao = "desativado" | "preparado" | "habilitado";

export type ResultadoGate =
  | { ok: true; estado: "habilitado"; faltando: ChaveDependencia[] }
  | { ok: false; estado: "desativado" | "preparado"; faltando: ChaveDependencia[] };

/** Bloqueio devolvido por um wrapper quando o gate não está habilitado. */
export type BloqueioIntegracao = {
  ok: false;
  estado: "desativado" | "preparado";
  faltando: ChaveDependencia[];
};

export function dependenciasFaltantes(
  operacao: OperacaoIntegracao,
  deps: DependenciasIntegracao = DEPENDENCIAS_PADRAO,
): ChaveDependencia[] {
  return REQUISITOS[operacao].filter((chave) => !deps[chave]);
}

/**
 * Função PURA do gate. `flagAtiva` é injetado para testes; os wrappers públicos
 * passam `FLAGS_INTEGRACAO[operacao]`.
 */
export function avaliarGate(
  flagAtiva: boolean,
  operacao: OperacaoIntegracao,
  deps: DependenciasIntegracao = DEPENDENCIAS_PADRAO,
): ResultadoGate {
  if (!flagAtiva) return { ok: false, estado: "desativado", faltando: [] };
  const faltando = dependenciasFaltantes(operacao, deps);
  if (faltando.length > 0) return { ok: false, estado: "preparado", faltando };
  return { ok: true, estado: "habilitado", faltando: [] };
}

// ---------------------------------------------------------------------------
// Cliente mínimo (mocks em teste; nada é instanciado na importação).
// ---------------------------------------------------------------------------
export type RespostaRpc = { data: unknown; error: unknown };

export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RespostaRpc>;
};

// ---------------------------------------------------------------------------
// Erros técnicos (nunca confundidos com estados de negócio).
// ---------------------------------------------------------------------------
export type CodigoTecnico =
  | "rpc_indisponivel"
  | "rpc_sem_permissao"
  | "nao_autenticado"
  | "erro_rede"
  | "resposta_invalida";

export type ErroTecnico = {
  ok: false;
  estado: "erro_tecnico";
  motivo: CodigoTecnico;
  detalhe: string | null;
};

export function classificarErroRpc(error: unknown): { motivo: CodigoTecnico; detalhe: string | null } {
  if (error == null) return { motivo: "erro_rede", detalhe: null };
  const objeto =
    typeof error === "object" ? (error as Record<string, unknown>) : ({} as Record<string, unknown>);
  const code = typeof objeto["code"] === "string" ? objeto["code"] : "";
  const status = typeof objeto["status"] === "number" ? objeto["status"] : 0;
  const mensagem =
    typeof objeto["message"] === "string"
      ? objeto["message"]
      : typeof error === "string"
        ? error
        : "";

  if (
    code === "PGRST202" ||
    /could not find the function|function\s+.*\s+does not exist|schema cache/i.test(mensagem)
  ) {
    return { motivo: "rpc_indisponivel", detalhe: mensagem || code || null };
  }
  if (code === "42501" || /permission denied for function/i.test(mensagem)) {
    return { motivo: "rpc_sem_permissao", detalhe: mensagem || code || null };
  }
  if (code === "PGRST301" || status === 401 || /JWT|not authenticated|invalid claim/i.test(mensagem)) {
    return { motivo: "nao_autenticado", detalhe: mensagem || code || null };
  }
  return { motivo: "erro_rede", detalhe: mensagem || code || null };
}

function erroTecnico(error: unknown): ErroTecnico {
  const { motivo, detalhe } = classificarErroRpc(error);
  return { ok: false, estado: "erro_tecnico", motivo, detalhe };
}

function respostaInvalida(): ErroTecnico {
  return { ok: false, estado: "erro_tecnico", motivo: "resposta_invalida", detalhe: null };
}

async function chamar(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RespostaRpc> {
  try {
    return await client.rpc(fn, args);
  } catch (e) {
    // Exceção de transporte vira erro estruturado (não sucesso, não silêncio).
    return { data: null, error: e };
  }
}

// ---------------------------------------------------------------------------
// Leitura defensiva de JSON.
// ---------------------------------------------------------------------------
function lerObjeto(valor: unknown): Record<string, unknown> | null {
  if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
    return valor as Record<string, unknown>;
  }
  return null;
}

function lerTexto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function lerInteiro(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) ? valor : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor.trim());
}

/** Nova chave de idempotência para UMA ação de retirada (reutilize no retry). */
export function novoIdemKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c?.randomUUID) throw new Error("crypto.randomUUID indisponível neste ambiente.");
  return c.randomUUID();
}

// ===========================================================================
// 1) RESERVA POR PEDIDO — reservar_pedido_atomico (0089)
// ===========================================================================
export type FaltaEstoque = { produtoId: string; faltante: number };

export type ResultadoReserva =
  | {
      ok: true;
      estado: "reservado" | "ja_reservado";
      itens: number;
      montagem: number;
      coberturaCompleta: boolean;
    }
  | { ok: false; estado: "estoque_insuficiente"; faltas: FaltaEstoque[] }
  | { ok: false; estado: "reconciliacao_pendente"; reservas: number }
  | { ok: false; estado: "produto_inexistente"; produtos: string[] }
  | {
      ok: false;
      estado: "permissao_negada" | "pedido_invalido" | "status_invalido" | "quantidade_invalida";
    }
  | BloqueioIntegracao
  | ErroTecnico;

function lerFaltas(valor: unknown): FaltaEstoque[] | null {
  if (!Array.isArray(valor)) return null;
  const saida: FaltaEstoque[] = [];
  for (const item of valor) {
    const o = lerObjeto(item);
    if (!o) return null;
    const produtoId = lerTexto(o["produto_id"]);
    const faltante = lerInteiro(o["faltante"]);
    if (produtoId === null || faltante === null || faltante < 0) return null;
    saida.push({ produtoId, faltante });
  }
  return saida;
}

export function interpretarReservaAtomica(data: unknown): ResultadoReserva {
  const obj = lerObjeto(data);
  if (!obj) return respostaInvalida();
  const status = lerTexto(obj["status"]);

  switch (status) {
    case "reservado":
    case "ja_reservado": {
      const itens = lerInteiro(obj["itens"]);
      const montagem = lerInteiro(obj["montagem"]) ?? 0;
      if (itens === null || itens < 0 || montagem < 0) return respostaInvalida();
      return { ok: true, estado: status, itens, montagem, coberturaCompleta: montagem === 0 };
    }
    case "estoque_insuficiente": {
      const faltas = lerFaltas(obj["itens"]);
      if (faltas === null) return respostaInvalida();
      return { ok: false, estado: "estoque_insuficiente", faltas };
    }
    case "reconciliacao_pendente": {
      const reservas = lerInteiro(obj["reservas"]);
      if (reservas === null || reservas < 0) return respostaInvalida();
      return { ok: false, estado: "reconciliacao_pendente", reservas };
    }
    case "produto_inexistente": {
      const bruto = obj["produtos"];
      if (!Array.isArray(bruto)) return respostaInvalida();
      const produtos = bruto.filter((p): p is string => typeof p === "string");
      if (produtos.length !== bruto.length) return respostaInvalida();
      return { ok: false, estado: "produto_inexistente", produtos };
    }
    case "permissao_negada":
    case "pedido_invalido":
    case "status_invalido":
    case "quantidade_invalida":
      return { ok: false, estado: status };
    default:
      return respostaInvalida();
  }
}

/** Camada sem gate (RPC + interpretação). Usada pelo wrapper e pelos testes. */
export async function executarReservaAtomica(
  client: RpcClient,
  pedidoId: string,
): Promise<ResultadoReserva> {
  if (!ehUuid(pedidoId)) return { ok: false, estado: "pedido_invalido" };
  const { data, error } = await chamar(client, "reservar_pedido_atomico", {
    p_pedido_id: pedidoId,
  });
  if (error) return erroTecnico(error);
  return interpretarReservaAtomica(data);
}

export type OpcoesReserva = { dependencias?: DependenciasIntegracao };

export async function reservarPedidoAtomico(
  client: RpcClient,
  pedidoId: string,
  opcoes: OpcoesReserva = {},
): Promise<ResultadoReserva> {
  const gate = avaliarGate(
    FLAGS_INTEGRACAO.reserva,
    "reserva",
    opcoes.dependencias ?? DEPENDENCIAS_PADRAO,
  );
  if (!gate.ok) return gate;
  return executarReservaAtomica(client, pedidoId);
}

// ===========================================================================
// 2) RETIRADA FÍSICA — registrar_consumo_reserva (0091)
// ===========================================================================
export type EntradaConsumo = {
  reservaId: string;
  quantidade: number;
  idemKey: string;
  produtoId?: string;
  observacao?: string;
};

export type ResultadoConsumo =
  | {
      ok: true;
      estado: "consumido";
      reservaId: string;
      quantidade: number;
      consumidoTotal: number;
      restante: number;
    }
  | { ok: true; estado: "ja_registrado"; reservaId: string; idempotente: true }
  | { ok: false; estado: "acima_do_restante"; restante: number }
  | { ok: false; estado: "reconciliacao_pendente"; reservaId: string }
  | {
      ok: false;
      estado:
        | "chave_conflito"
        | "reserva_encerrada"
        | "reserva_invalida"
        | "pedido_invalido"
        | "status_invalido"
        | "produto_divergente"
        | "entrada_invalida"
        | "quantidade_invalida"
        | "permissao_negada";
    }
  | BloqueioIntegracao
  | ErroTecnico;

export function interpretarConsumo(data: unknown): ResultadoConsumo {
  const obj = lerObjeto(data);
  if (!obj) return respostaInvalida();
  const status = lerTexto(obj["status"]);

  switch (status) {
    case "consumido": {
      const reservaId = lerTexto(obj["reserva_id"]);
      const quantidade = lerInteiro(obj["quantidade"]);
      const consumidoTotal = lerInteiro(obj["consumido_total"]);
      const restante = lerInteiro(obj["restante"]);
      if (reservaId === null || quantidade === null || consumidoTotal === null || restante === null) {
        return respostaInvalida();
      }
      if (quantidade <= 0 || consumidoTotal < 0 || restante < 0) return respostaInvalida();
      return { ok: true, estado: "consumido", reservaId, quantidade, consumidoTotal, restante };
    }
    case "ja_registrado": {
      const reservaId = lerTexto(obj["reserva_id"]);
      if (reservaId === null) return respostaInvalida();
      return { ok: true, estado: "ja_registrado", reservaId, idempotente: true };
    }
    case "acima_do_restante": {
      const restante = lerInteiro(obj["restante"]);
      if (restante === null || restante < 0) return respostaInvalida();
      return { ok: false, estado: "acima_do_restante", restante };
    }
    case "reconciliacao_pendente": {
      const reservaId = lerTexto(obj["reserva_id"]);
      if (reservaId === null) return respostaInvalida();
      return { ok: false, estado: "reconciliacao_pendente", reservaId };
    }
    case "chave_conflito":
    case "reserva_encerrada":
    case "reserva_invalida":
    case "pedido_invalido":
    case "status_invalido":
    case "produto_divergente":
    case "entrada_invalida":
    case "quantidade_invalida":
    case "permissao_negada":
      return { ok: false, estado: status };
    default:
      return respostaInvalida();
  }
}

/** Camada sem gate. Pré-checagens locais impedem retiradas fictícias. */
export async function executarConsumoAtomico(
  client: RpcClient,
  entrada: EntradaConsumo,
): Promise<ResultadoConsumo> {
  if (!ehUuid(entrada.reservaId) || !ehUuid(entrada.idemKey)) {
    return { ok: false, estado: "entrada_invalida" };
  }
  if (!Number.isInteger(entrada.quantidade) || entrada.quantidade <= 0) {
    return { ok: false, estado: "quantidade_invalida" };
  }
  if (entrada.produtoId !== undefined && !ehUuid(entrada.produtoId)) {
    return { ok: false, estado: "entrada_invalida" };
  }

  const args: Record<string, unknown> = {
    p_reserva_id: entrada.reservaId,
    p_quantidade: entrada.quantidade,
    p_idem_key: entrada.idemKey,
  };
  if (entrada.produtoId !== undefined) args["p_produto_id"] = entrada.produtoId;
  if (entrada.observacao !== undefined) args["p_observacao"] = entrada.observacao;

  const { data, error } = await chamar(client, "registrar_consumo_reserva", args);
  if (error) return erroTecnico(error);
  return interpretarConsumo(data);
}

export type OpcoesConsumo = { dependencias?: DependenciasIntegracao };

export async function registrarConsumoAtomico(
  client: RpcClient,
  entrada: EntradaConsumo,
  opcoes: OpcoesConsumo = {},
): Promise<ResultadoConsumo> {
  const gate = avaliarGate(
    FLAGS_INTEGRACAO.consumo,
    "consumo",
    opcoes.dependencias ?? DEPENDENCIAS_PADRAO,
  );
  if (!gate.ok) return gate;
  return executarConsumoAtomico(client, entrada);
}

// ===========================================================================
// 3) CANCELAMENTO — cancelar_pedido_atomico (0093)
// ===========================================================================
export type LiberacaoInfo = {
  status: string;
  reservas: number;
  unidades: number;
  montagem: number;
};

export type ResultadoCancelamento =
  | { ok: true; estado: "cancelado"; pedidoId: string; liberacao: LiberacaoInfo | null }
  | { ok: true; estado: "ja_cancelado"; pedidoId: string | null; idempotente: true }
  | { ok: false; estado: "requer_analise" | "status_invalido"; atual: string | null }
  | { ok: false; estado: "pagamento_nao_elegivel"; pagamentoStatus: string | null }
  | { ok: false; estado: "reconciliacao_pendente"; motivo: string | null }
  | { ok: false; estado: "entrada_invalida" | "pedido_invalido" | "permissao_negada" }
  | BloqueioIntegracao
  | ErroTecnico;

function lerLiberacao(valor: unknown): LiberacaoInfo | null {
  const obj = lerObjeto(valor);
  if (!obj) return null;
  const status = lerTexto(obj["status"]);
  const reservas = lerInteiro(obj["reservas"]);
  const unidades = lerInteiro(obj["unidades"]);
  const montagem = lerInteiro(obj["montagem"]);
  if (status === null || reservas === null || unidades === null || montagem === null) return null;
  return { status, reservas, unidades, montagem };
}

export function interpretarCancelamento(data: unknown): ResultadoCancelamento {
  const obj = lerObjeto(data);
  if (!obj) return respostaInvalida();
  const status = lerTexto(obj["status"]);

  switch (status) {
    case "cancelado": {
      const pedidoId = lerTexto(obj["pedido_id"]);
      if (pedidoId === null) return respostaInvalida();
      return { ok: true, estado: "cancelado", pedidoId, liberacao: lerLiberacao(obj["liberacao"]) };
    }
    case "ja_cancelado":
      return {
        ok: true,
        estado: "ja_cancelado",
        pedidoId: lerTexto(obj["pedido_id"]),
        idempotente: true,
      };
    case "requer_analise":
    case "status_invalido":
      return { ok: false, estado: status, atual: lerTexto(obj["atual"]) };
    case "pagamento_nao_elegivel":
      return {
        ok: false,
        estado: "pagamento_nao_elegivel",
        pagamentoStatus: lerTexto(obj["pagamento_status"]),
      };
    case "reconciliacao_pendente":
      return { ok: false, estado: "reconciliacao_pendente", motivo: lerTexto(obj["motivo"]) };
    case "entrada_invalida":
    case "pedido_invalido":
    case "permissao_negada":
      return { ok: false, estado: status };
    default:
      return respostaInvalida();
  }
}

/** Camada sem gate (RPC + interpretação). */
export async function executarCancelamentoAtomico(
  client: RpcClient,
  pedidoId: string,
  motivo?: string,
): Promise<ResultadoCancelamento> {
  if (!ehUuid(pedidoId)) return { ok: false, estado: "pedido_invalido" };
  const args: Record<string, unknown> = { p_pedido_id: pedidoId };
  const limpo = typeof motivo === "string" ? motivo.trim() : "";
  if (limpo !== "") args["p_motivo"] = limpo;

  const { data, error } = await chamar(client, "cancelar_pedido_atomico", args);
  if (error) return erroTecnico(error);
  return interpretarCancelamento(data);
}

export type OpcoesCancelamento = {
  dependencias?: DependenciasIntegracao;
  motivo?: string;
};

export async function cancelarPedidoAtomico(
  client: RpcClient,
  pedidoId: string,
  opcoes: OpcoesCancelamento = {},
): Promise<ResultadoCancelamento> {
  const gate = avaliarGate(
    FLAGS_INTEGRACAO.cancelamento,
    "cancelamento",
    opcoes.dependencias ?? DEPENDENCIAS_PADRAO,
  );
  if (!gate.ok) return gate;
  return executarCancelamentoAtomico(client, pedidoId, opcoes.motivo);
}

export type DecisaoCancelamentoAtomico =
  | { modo: "atomico" }
  | { modo: "legado" }
  | { modo: "erro"; mensagem: string };

/**
 * Decide entre o cancelamento atômico (0093) e o caminho legado.
 *   - flag OFF => { modo: "legado" } (comportamento atual intacto);
 *   - flag ON + sucesso => { modo: "atomico" } (RPC já cancelou e liberou);
 *   - flag ON + gate nao habilitado/erro => { modo: "erro", mensagem }
 *     (NUNCA cai no UPDATE direto/liberar_reserva_atomica: sem fallback inseguro).
 */
export async function decidirCancelamentoAtomico(
  client: RpcClient,
  pedidoId: string,
  motivo?: string,
): Promise<DecisaoCancelamentoAtomico> {
  const opcoes: OpcoesCancelamento = { dependencias: ATTESTACAO_CANCELAMENTO };
  const motivoLimpo = typeof motivo === "string" ? motivo.trim() : "";
  if (motivoLimpo !== "") opcoes.motivo = motivoLimpo;
  const r = await cancelarPedidoAtomico(client, pedidoId, opcoes);
  if (!r.ok && r.estado === "desativado") return { modo: "legado" };
  if (r.ok) return { modo: "atomico" };
  return { modo: "erro", mensagem: mensagemEstado(r.estado) };
}

// ---------------------------------------------------------------------------
// Mensagens padrão para as telas futuras (apresentação; não altera layout).
// ---------------------------------------------------------------------------
export const MENSAGENS_ESTADO: Readonly<Record<string, string>> = {
  desativado: "Integração desativada — nenhuma operação foi executada.",
  preparado: "Integração preparada, mas dependências pendentes — nada foi executado.",
  reservado: "Estoque reservado para o pedido.",
  ja_reservado: "Estoque já estava reservado para o pedido.",
  estoque_insuficiente: "Estoque insuficiente para concluir a reserva.",
  produto_inexistente: "Há item com produto inexistente no pedido.",
  reconciliacao_pendente: "Reservas divergentes — é necessária reconciliação manual.",
  consumido: "Retirada física registrada.",
  ja_registrado: "Esta retirada já havia sido registrada.",
  acima_do_restante: "Quantidade acima do restante da reserva.",
  chave_conflito: "Chave de idempotência reutilizada com dados diferentes.",
  reserva_encerrada: "A reserva já foi encerrada.",
  cancelado: "Pedido cancelado e estoque liberado.",
  ja_cancelado: "O pedido já estava cancelado.",
  requer_analise: "O pedido está em andamento — requer análise antes de cancelar.",
  pagamento_nao_elegivel: "Pagamento não elegível para cancelamento direto (trate o estorno).",
  permissao_negada: "Sem permissão para esta operação.",
  pedido_invalido: "Pedido inválido.",
  status_invalido: "Status do pedido não permite esta operação.",
  quantidade_invalida: "Quantidade inválida.",
  entrada_invalida: "Dados de entrada inválidos.",
  produto_divergente: "Produto informado diverge do produto da reserva.",
  erro_tecnico: "Falha técnica — a operação NÃO foi confirmada.",
};

export function mensagemEstado(estado: string): string {
  return MENSAGENS_ESTADO[estado] ?? "Não foi possível concluir a operação. Tente novamente.";
}
