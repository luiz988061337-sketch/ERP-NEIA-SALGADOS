/**
 * Etapa 1.52 — CONTRATO E WRAPPER DA CRIAÇÃO ATÔMICA (0095) — DESATIVADO.
 *
 * Este módulo é importado pelos chamadores (checkout/PDV/atendente) SOMENTE
 * atrás da flag `VITE_FF_CRIACAO_ATOMICA`; com a flag OFF o caminho legado
 * permanece intacto. Ele prepara o contrato tipado da RPC
 * `criar_pedido_com_reserva(uuid, text, jsonb, jsonb)` (pedido + itens + reserva
 * em UMA transação) e um gate de ativação reutilizável.
 *
 * ============================================================================
 * ESTADOS DE ATIVAÇÃO
 * ============================================================================
 *   - "desativado": a flag NÃO está ligada. O wrapper não chama a RPC e
 *     devolve `{ ok: false, estado: "desativado" }`.
 *   - "preparado": a flag está ligada, MAS as dependências declaradas não estão
 *     completas. Nada é executado.
 *   - "habilitado": flag ligada + todas as dependências obrigatórias presentes.
 *
 * As dependências são DECLARADAS pelo chamador (attestation), nunca inferidas
 * de env. `DEPENDENCIAS_CRIACAO_PADRAO` é tudo `false`: uma flag sozinha leva a
 * "preparado", nunca a "habilitado".
 *
 * ============================================================================
 * GARANTIAS
 * ============================================================================
 *   - Somente `rpc("criar_pedido_com_reserva", ...)`. Nenhum acesso direto a
 *     tabela (sem `.from/.insert/.update/.delete`) => não existe fallback que
 *     grave pedido ou reserva sem débito.
 *   - RPC inexistente (PGRST202 / "could not find the function") é classificada
 *     como `rpc_indisponivel` e NUNCA como `estoque_insuficiente`.
 *   - Resposta ausente/malformada => `resposta_invalida` (nunca sucesso
 *     artificial). Rejeita SQL NULL, JSON null, array, status ausente ou
 *     desconhecido.
 *   - Nenhum retry automático; a idempotência é da própria RPC (chave `p_id`).
 *   - `estoque_insuficiente` vem da 0089 (chamada dentro da 0095) e é devolvido
 *     com o payload da falha, sem escrita parcial.
 *
 * IMPORTANTE: enquanto os chamadores antigos (checkout/PDV/atendimento) não
 * forem migrados, as flags desligadas NÃO corrigem o caminho legado. A
 * integração dos chamadores é etapa separada, atrás de autorização explícita.
 */

import { BUILD_DE_CORTE } from "@/lib/corte";

// ---------------------------------------------------------------------------
// Flags (mesmo mecanismo dos módulos de integração existentes; default "off").
// ---------------------------------------------------------------------------
// A flag vem de `src/lib/corte.ts` (acesso DIRETO ao env), e não de um
// helper genérico: só o acesso direto é substituído por literal em tempo de
// build, o que permite ao minificador eliminar o caminho legado.
export const FLAGS_CRIACAO = {
  criacao: BUILD_DE_CORTE,
} as const;

// ---------------------------------------------------------------------------
// Dependências declaradas (attestation) e requisitos.
// ---------------------------------------------------------------------------
export type DependenciasCriacao = {
  criar_pedido_com_reserva_0095: boolean;
  reservar_pedido_0089: boolean;
  proveniencia_0092: boolean;
  fallback_checkout_removido: boolean;
};

export type ChaveDependenciaCriacao = keyof DependenciasCriacao;

export const DEPENDENCIAS_CRIACAO_PADRAO: DependenciasCriacao = {
  criar_pedido_com_reserva_0095: false,
  reservar_pedido_0089: false,
  proveniencia_0092: false,
  fallback_checkout_removido: false,
};

/**
 * Requisitos da criação atômica:
 *   - 0095 (a própria RPC);
 *   - 0089 (reservar_pedido_atomico, chamada internamente pela 0095);
 *   - 0092 (proveniência; a 0089 falha fechada sem marcador);
 *   - fallback do checkout removido (senão conviveriam duas rotas, uma sem
 *     débito — C.7).
 */
export const REQUISITOS_CRIACAO: readonly ChaveDependenciaCriacao[] = [
  "criar_pedido_com_reserva_0095",
  "reservar_pedido_0089",
  "proveniencia_0092",
  "fallback_checkout_removido",
];

export type EstadoCriacaoGate = "desativado" | "preparado" | "habilitado";

export type ResultadoGateCriacao =
  | { ok: true; estado: "habilitado"; faltando: ChaveDependenciaCriacao[] }
  | { ok: false; estado: "desativado" | "preparado"; faltando: ChaveDependenciaCriacao[] };

export type BloqueioCriacao = {
  ok: false;
  estado: "desativado" | "preparado";
  faltando: ChaveDependenciaCriacao[];
};

export function dependenciasCriacaoFaltantes(
  deps: DependenciasCriacao = DEPENDENCIAS_CRIACAO_PADRAO,
): ChaveDependenciaCriacao[] {
  return REQUISITOS_CRIACAO.filter((chave) => !deps[chave]);
}

/** Função PURA do gate. `flagAtiva` é injetado para testes. */
export function avaliarGateCriacao(
  flagAtiva: boolean,
  deps: DependenciasCriacao = DEPENDENCIAS_CRIACAO_PADRAO,
): ResultadoGateCriacao {
  if (!flagAtiva) return { ok: false, estado: "desativado", faltando: [] };
  const faltando = dependenciasCriacaoFaltantes(deps);
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
export type CodigoTecnicoCriacao =
  | "rpc_indisponivel"
  | "rpc_sem_permissao"
  | "nao_autenticado"
  | "erro_rede"
  | "resposta_invalida";

export type ErroTecnicoCriacao = {
  ok: false;
  estado: "erro_tecnico";
  motivo: CodigoTecnicoCriacao;
  detalhe: string | null;
};

export function classificarErroCriacao(error: unknown): { motivo: CodigoTecnicoCriacao; detalhe: string | null } {
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

function erroTecnicoCriacao(error: unknown): ErroTecnicoCriacao {
  const { motivo, detalhe } = classificarErroCriacao(error);
  return { ok: false, estado: "erro_tecnico", motivo, detalhe };
}

function respostaInvalidaCriacao(): ErroTecnicoCriacao {
  return { ok: false, estado: "erro_tecnico", motivo: "resposta_invalida", detalhe: null };
}

async function chamarCriacao(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RespostaRpc> {
  try {
    return await client.rpc(fn, args);
  } catch (e) {
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

function lerNumero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuidCriacao(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor.trim());
}

// ---------------------------------------------------------------------------
// Entrada e saída tipadas.
// ---------------------------------------------------------------------------
export type ItemCriacao = {
  produtoId?: string | undefined;
  nome?: string | undefined;
  quantidade: number;
  observacao?: string | undefined;
  /** Combo/montagem: produtos e quantidades que compoem este item. */
  componentes?: import("./combo-componentes").ComponenteCombo[] | undefined;
};

export type EntradaCriacaoPedido = {
  pedidoId: string;
  canal: "checkout" | "pdv" | "atendente";
  dados: Record<string, unknown>;
  itens: ItemCriacao[];
};

export type StatusErroCriacao =
  | "canal_invalido"
  | "permissao_negada"
  | "entrada_invalida"
  | "dados_invalidos"
  | "itens_invalidos"
  | "produto_inexistente"
  | "produto_indisponivel"
  | "regra_combo"
  | "montagem_sem_modelagem"
  | "montagem_soma_divergente"
  | "montagem_categoria_divergente"
  | "montagem_componente_duplicado"
  | "montagem_preco_ausente"
  | "cupom_invalido"
  | "cupom_esgotado"
  | "configuracao_ausente"
  | "dependencia_ausente"
  | "estoque_insuficiente"
  | "idempotencia_divergente"
  | "pedido_de_outro_usuario"
  | "inconsistencia_financeira"
  | "entregas_desativadas"
  | "fora_da_area"
  | "erro_interno";

export type CoberturaResumida = {
  status: string;
  faltante?: number | null;
  unidades?: number | null;
  cobertas?: number | null;
  montagem?: number | null;
  motivo?: string | null;
};

export type ResultadoCriacao =
  | {
      ok: true;
      estado: "criado";
      pedidoId: string;
      numero: number;
      subtotal: number;
      taxaEntrega: number;
      desconto: number;
      total: number;
      pagamentoStatus: string;
      pagamentoModalidade: string;
      reserva: Record<string, unknown> | null;
    }
  | {
      ok: true;
      estado: "ja_criado";
      pedidoId: string;
      numero: number;
      total: number;
      cobertura: CoberturaResumida | null;
    }
  | { ok: false; estado: "reservas_ausentes"; pedidoId: string; numero: number | null }
  | { ok: false; estado: "reconciliacao_pendente"; pedidoId: string; numero: number | null }
  | { ok: false; estado: StatusErroCriacao; campo?: string; motivo?: string }
  | BloqueioCriacao
  | ErroTecnicoCriacao;

function lerCobertura(valor: unknown): CoberturaResumida | null {
  const obj = lerObjeto(valor);
  if (!obj) return null;
  const status = lerTexto(obj["status"]);
  if (status === null) return null;
  return {
    status,
    faltante: typeof obj["faltante"] === "number" ? obj["faltante"] : null,
    unidades: typeof obj["unidades"] === "number" ? obj["unidades"] : null,
    cobertas: typeof obj["cobertas"] === "number" ? obj["cobertas"] : null,
    montagem: typeof obj["montagem"] === "number" ? obj["montagem"] : null,
    motivo: lerTexto(obj["motivo"]),
  };
}

function erroNegocio(
  estado: StatusErroCriacao,
  obj: Record<string, unknown>,
): ResultadoCriacao {
  const campo = lerTexto(obj["campo"]);
  const motivo = lerTexto(obj["motivo"]);
  return { ok: false, estado, ...(campo !== null ? { campo } : {}), ...(motivo !== null ? { motivo } : {}) };
}

export function interpretarCriacao(data: unknown): ResultadoCriacao {
  const obj = lerObjeto(data);
  if (!obj) return respostaInvalidaCriacao();
  const status = lerTexto(obj["status"]);

  switch (status) {
    case "criado": {
      const pedidoId = lerTexto(obj["pedido_id"]);
      const numero = lerNumero(obj["numero"]);
      const subtotal = lerNumero(obj["subtotal"]);
      const taxaEntrega = lerNumero(obj["taxa_entrega"]);
      const desconto = lerNumero(obj["desconto"]);
      const total = lerNumero(obj["total"]);
      const pagamentoStatus = lerTexto(obj["pagamento_status"]);
      const pagamentoModalidade = lerTexto(obj["pagamento_modalidade"]);
      if (
        pedidoId === null ||
        numero === null ||
        subtotal === null ||
        taxaEntrega === null ||
        desconto === null ||
        total === null ||
        pagamentoStatus === null ||
        pagamentoModalidade === null
      ) {
        return respostaInvalidaCriacao();
      }
      const reserva = lerObjeto(obj["reserva"]);
      return {
        ok: true,
        estado: "criado",
        pedidoId,
        numero,
        subtotal,
        taxaEntrega,
        desconto,
        total,
        pagamentoStatus,
        pagamentoModalidade,
        reserva,
      };
    }
    case "ja_criado": {
      const pedidoId = lerTexto(obj["pedido_id"]);
      const numero = lerNumero(obj["numero"]);
      const total = lerNumero(obj["total"]);
      if (pedidoId === null || numero === null || total === null) return respostaInvalidaCriacao();
      return { ok: true, estado: "ja_criado", pedidoId, numero, total, cobertura: lerCobertura(obj["cobertura"]) };
    }
    case "reservas_ausentes": {
      const pedidoId = lerTexto(obj["pedido_id"]);
      if (pedidoId === null) return respostaInvalidaCriacao();
      return { ok: false, estado: "reservas_ausentes", pedidoId, numero: lerNumero(obj["numero"]) };
    }
    case "reconciliacao_pendente": {
      const pedidoId = lerTexto(obj["pedido_id"]);
      if (pedidoId === null) return respostaInvalidaCriacao();
      return { ok: false, estado: "reconciliacao_pendente", pedidoId, numero: lerNumero(obj["numero"]) };
    }
    case "idempotencia_divergente":
    case "pedido_de_outro_usuario":
    case "inconsistencia_financeira":
      return erroNegocio(status, obj);
    case "canal_invalido":
    case "permissao_negada":
    case "entrada_invalida":
    case "dados_invalidos":
    case "itens_invalidos":
    case "produto_inexistente":
    case "produto_indisponivel":
    case "regra_combo":
    case "montagem_sem_modelagem":
    case "montagem_soma_divergente":
    case "montagem_categoria_divergente":
    case "montagem_componente_duplicado":
    case "montagem_preco_ausente":
    case "cupom_invalido":
    case "cupom_esgotado":
    case "configuracao_ausente":
    case "dependencia_ausente":
    case "estoque_insuficiente":
    case "entregas_desativadas":
    case "fora_da_area":
    case "erro_interno":
      return erroNegocio(status, obj);
    default:
      return respostaInvalidaCriacao();
  }
}

// ---------------------------------------------------------------------------
// Execução e wrapper com gate.
// ---------------------------------------------------------------------------
function mapearItens(itens: ItemCriacao[]): Array<Record<string, unknown>> {
  return itens.map((i) => {
    const item: Record<string, unknown> = { quantidade: i.quantidade };
    if (i.produtoId !== undefined) item["produto_id"] = i.produtoId;
    if (i.nome !== undefined) item["nome"] = i.nome;
    if (i.observacao !== undefined) item["observacao"] = i.observacao;
    if (i.componentes !== undefined) {
      item["componentes"] = i.componentes.map((c) => ({
        produto_id: c.produtoId,
        quantidade: c.quantidade,
      }));
    }
    return item;
  });
}

/** Camada sem gate (RPC + interpretação). Usada pelo wrapper e pelos testes. */
export async function executarCriacaoAtomica(
  client: RpcClient,
  entrada: EntradaCriacaoPedido,
): Promise<ResultadoCriacao> {
  if (!ehUuidCriacao(entrada.pedidoId)) {
    return { ok: false, estado: "entrada_invalida" };
  }
  if (entrada.canal !== "checkout" && entrada.canal !== "pdv" && entrada.canal !== "atendente") {
    return { ok: false, estado: "canal_invalido" };
  }
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) {
    return { ok: false, estado: "itens_invalidos", motivo: "vazio" };
  }
  for (const item of entrada.itens) {
    if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) {
      return { ok: false, estado: "itens_invalidos", motivo: "quantidade" };
    }
    if (item.produtoId !== undefined && !ehUuidCriacao(item.produtoId)) {
      return { ok: false, estado: "itens_invalidos", motivo: "produto_id" };
    }
  }

  const { data, error } = await chamarCriacao(client, "criar_pedido_com_reserva", {
    p_id: entrada.pedidoId,
    p_canal: entrada.canal,
    p_dados: entrada.dados,
    p_itens: mapearItens(entrada.itens),
  });
  if (error) return erroTecnicoCriacao(error);
  return interpretarCriacao(data);
}

export type OpcoesCriacao = { dependencias?: DependenciasCriacao; flagAtiva?: boolean };

export async function criarPedidoComReservaAtomico(
  client: RpcClient,
  entrada: EntradaCriacaoPedido,
  opcoes: OpcoesCriacao = {},
): Promise<ResultadoCriacao> {
  const ativa = opcoes.flagAtiva ?? FLAGS_CRIACAO.criacao;
  const gate = avaliarGateCriacao(ativa, opcoes.dependencias ?? DEPENDENCIAS_CRIACAO_PADRAO);
  if (!gate.ok) return gate;
  return executarCriacaoAtomica(client, entrada);
}

/**
 * Attestation de dependências usada pelos CHAMADORES. Tudo `false` por padrão:
 * ligar a flag sem attestation deixa o gate em "preparado" (nada executa).
 * No cutover, após verificar 0087+0092+0089 instalados e o fallback legado
 * removido, este ÚNICO ponto passa a `true` (auditoria simples).
 */
/**
 * Attestation do BUILD DE CORTE.
 *
 * É verdadeira porque o mesmo interruptor de build (`VITE_FF_CRIACAO_ATOMICA`)
 * que a habilita também REMOVE o caminho legado do bundle (ver
 * `src/lib/corte.ts` e os blocos `if (!BUILD_DE_CORTE)` nos chamadores).
 * Logo `fallback_checkout_removido` NÃO é uma afirmação otimista: no bundle
 * de corte não existe mais o fallback.
 */
export const DEPENDENCIAS_CRIACAO_CORTE: DependenciasCriacao = {
  criar_pedido_com_reserva_0095: true,
  reservar_pedido_0089: true,
  proveniencia_0092: true,
  fallback_checkout_removido: true,
};

/**
 * Attestation efetiva: no bundle de corte usa a de corte; em qualquer outro
 * build usa a padrão (tudo `false` => gate "preparado" => nada executa).
 */
export const ATTESTACAO_CRIACAO: DependenciasCriacao = BUILD_DE_CORTE
  ? DEPENDENCIAS_CRIACAO_CORTE
  : DEPENDENCIAS_CRIACAO_PADRAO;

export type DecisaoCriacaoAtomica =
  | { modo: "atomico"; pedido: { id: string; numero: number } }
  | { modo: "legado" }
  | { modo: "erro"; mensagem: string };

/**
 * Decide entre a criação atômica (0095) e o caminho legado.
 *   - flag OFF                          => { modo: "legado" } (comportamento atual intacto);
 *   - flag ON + gate habilitado + sucesso => { modo: "atomico", pedido };
 *   - flag ON + gate nao habilitado/erro  => { modo: "erro", mensagem }
 *     (NUNCA cai no caminho legado: nao existe fallback inseguro).
 */
export async function decidirCriacaoAtomica(
  client: RpcClient,
  entrada: EntradaCriacaoPedido,
): Promise<DecisaoCriacaoAtomica> {
  const r = await criarPedidoComReservaAtomico(client, entrada, {
    dependencias: ATTESTACAO_CRIACAO,
  });
  if (!r.ok && r.estado === "desativado") return { modo: "legado" };
  if (r.ok && (r.estado === "criado" || r.estado === "ja_criado")) {
    return { modo: "atomico", pedido: { id: r.pedidoId, numero: r.numero } };
  }
  return { modo: "erro", mensagem: mensagemCriacao(r.estado) };
}

// ---------------------------------------------------------------------------
// Mensagens padrão para as telas futuras (apresentação; não altera layout).
// ---------------------------------------------------------------------------
export const MENSAGENS_CRIACAO: Readonly<Record<string, string>> = {
  desativado: "Criação atômica desativada — nenhuma operação foi executada.",
  preparado: "Criação atômica preparada, mas dependências pendentes — nada foi executado.",
  criado: "Pedido criado com estoque reservado.",
  ja_criado: "Este pedido já estava registrado com estoque reservado.",
  reservas_ausentes: "O pedido existe, mas as reservas não puderam ser comprovadas.",
  reconciliacao_pendente: "Reservas divergentes — é necessária reconciliação manual.",
  idempotencia_divergente: "Esta solicitação diverge do pedido já registrado.",
  pedido_de_outro_usuario: "Você não tem permissão para repetir este pedido.",
  inconsistencia_financeira: "Inconsistência financeira detectada — o pedido não foi confirmado.",
  canal_invalido: "Canal de venda inválido.",
  permissao_negada: "Sem permissão para criar pedido neste canal.",
  entrada_invalida: "Dados de entrada inválidos.",
  dados_invalidos: "Dados do pedido inválidos.",
  itens_invalidos: "Itens do pedido inválidos.",
  quantidade_invalida: "Quantidade inválida.",
  produto_inexistente: "Há item com produto inexistente.",
  produto_indisponivel: "Há item indisponível para venda.",
  regra_combo: "A quantidade não atende à regra comercial do combo.",
  montagem_sem_modelagem: "Combos montados ainda não têm modelagem de preço no servidor.",
  cupom_invalido: "Cupom inválido ou não aplicável a este pedido.",
  cupom_esgotado: "Este cupom atingiu o limite de usos.",
  configuracao_ausente: "Configuração comercial ausente (ex.: taxa de entrega).",
  dependencia_ausente: "Dependência de banco ausente para concluir o pedido.",
  estoque_insuficiente: "Estoque insuficiente para concluir o pedido.",
  entregas_desativadas:
    "A entrega está temporariamente desativada. Escolha retirada na loja.",
  fora_da_area: "Este endereço está fora da nossa área de entrega.",
  erro_interno: "Falha interna — o pedido NÃO foi confirmado.",
  erro_tecnico: "Falha técnica — a operação NÃO foi confirmada.",
};

export function mensagemCriacao(estado: string): string {
  return MENSAGENS_CRIACAO[estado] ?? "Não foi possível concluir a operação. Tente novamente.";
}
