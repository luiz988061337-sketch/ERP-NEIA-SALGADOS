/**
 * Adaptador demonstrativo da Produção (FUNC-01-B3).
 *
 * Estado 100% em memória, com dados fictícios. Nenhuma rede, Supabase, SQL,
 * impressora, WhatsApp, Pix, GPS ou estoque real é utilizado.
 *
 * Regras replicadas do fluxo aprovado:
 *   - só pedidos aceitos pela atendente entram na fila (quando o aceite é
 *     obrigatório);
 *   - remessas de até 50 unidades, sem misturar pedidos, com sabores/processos
 *     do mesmo pedido;
 *   - "Finalizar" conclui UMA remessa por vez (não conclui o pedido inteiro);
 *   - conferência obrigatória e completa antes da liberação final;
 *   - retirada → liberação de retirada; entrega → aviso ao caixa, sem motoboy,
 *     rota ou entrega automáticos;
 *   - reserva/consumo rastreáveis por pedido e remessa, sem duplicidade e sem
 *     consumo acima do reservado.
 */

import { classificarProcesso, entradaJanelaProducao } from "@/lib/motor-producao";
import { embalar } from "@/lib/preview-producao";
import {
  chaveAviso,
  TIPO_AVISO_CAIXA,
  TIPO_AVISO_RETIRADA,
} from "@/lib/producao-liberacao";

export const LIMITE_REMESSA = 50;

export type ProcessoSimplificado = "frito" | "assado";

export type ItemProducaoMemoria = {
  id?: string | null;
  produto_id?: string | null;
  produtoId?: string | null;
  nome: string;
  quantidade: number;
  produtos?: { categoria_id?: string | null; slug?: string | null; tempo_fritura_s?: number | null } | null;
};

export type PedidoProducaoMemoria = {
  id: string;
  numero?: number | null;
  status?: string | null;
  producao_status?: string | null;
  tipo_entrega?: string | null;
  aceito_em_atendente?: string | null;
  aceito_por?: string | null;
  updated_at?: string | null;
  liberado_em?: string | null;
  agendado_para?: string | null;
  observacoes?: string | null;
  conferido_em?: string | null;
  conferido_por?: string | null;
  conferencia_obs?: string | null;
  pronto_em?: string | null;
  retirado_em?: string | null;
  motoboy_id?: string | null;
  pedido_itens?: ItemProducaoMemoria[];
};

export type RemessaMemoria = {
  id: string;
  pedidoId: string;
  indice: number;
  quantidade: number;
  itens: { nome: string; quantidade: number; processo: ProcessoSimplificado; produtoId: string }[];
  concluida_em: string | null;
  concluida_por: string | null;
};

export type ReservaMemoria = {
  id: string;
  pedidoId: string;
  produtoId: string;
  nome: string;
  quantidade: number;
  consumido: number;
  status: "ativa" | "consumida" | "liberada";
};

export type ConsumoMemoria = {
  pedidoId: string;
  remessaId: string;
  produtoId: string;
  quantidade: number;
  idemKey: string;
  criado_em: string;
};

export type ConferenciaMemoria = {
  quantidadeTotal: number;
  porSabor: Record<string, number>;
  fritos: number;
  assados: number;
  embalagens: { c100: number; c50: number; avulsas: number };
  observacoes: string;
  modalidade: "entrega" | "retirada";
  responsavelId: string;
  responsavelNome: string;
};

export type AvisoMemoria = {
  tipo: string;
  chave: string;
  canal: "caixa" | "retirada";
  criado_em: string;
};

export type EstadoProducaoMemoria = {
  pedido: PedidoProducaoMemoria;
  remessas: RemessaMemoria[];
  reservas: ReservaMemoria[];
  consumos: ConsumoMemoria[];
  conferencia: ConferenciaMemoria | null;
  conferido_em: string | null;
  conferido_por: string | null;
  pronto_em: string | null;
  canal: "caixa" | "retirada" | null;
  avisos: AvisoMemoria[];
  cancelado_em: string | null;
};

export type AutorProducao = {
  id: string | null | undefined;
  papeis?: readonly string[] | null;
  nome?: string | null;
};

export type ResultadoOperacao<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; codigo: string; detalhe: string; motivos?: string[] };

type Motivo = { valida: boolean; motivos: string[] };

const estados = new Map<string, EstadoProducaoMemoria>();
const chavesConsumo = new Set<string>();

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function inteiro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function agoraISO(agora: Date | string | undefined): string {
  if (agora instanceof Date) return agora.toISOString();
  return texto(agora) || new Date().toISOString();
}

function falha<T>(codigo: string, detalhe: string, motivos?: string[]): ResultadoOperacao<T> {
  return { ok: false, codigo, detalhe, ...(motivos ? { motivos } : {}) };
}

function autorizado(autor: AutorProducao): boolean {
  return Boolean(
    texto(autor.id) &&
      (autor.papeis?.includes("producao") || autor.papeis?.includes("admin")),
  );
}

function itensDoPedido(pedido: PedidoProducaoMemoria): ItemProducaoMemoria[] {
  return (pedido.pedido_itens ?? []).filter((i) => texto(i.nome) && inteiro(i.quantidade) > 0);
}

export function totalUnidades(pedido: PedidoProducaoMemoria): number {
  return itensDoPedido(pedido).reduce((s, i) => s + inteiro(i.quantidade), 0);
}

function processoDoItem(item: ItemProducaoMemoria): ProcessoSimplificado {
  const cls = classificarProcesso({
    nome: texto(item.nome),
    categoriaSlug: texto(item.produtos?.slug) || texto(item.produtos?.categoria_id) || null,
  });
  // Pastel é frito na operação da Néia; assado é o processo de forno.
  return cls === "assado" ? "assado" : "frito";
}

function idProduto(item: ItemProducaoMemoria, pedidoId: string): string {
  return texto(item.produto_id ?? item.produtoId ?? item.id) || `${pedidoId}:${texto(item.nome)}`;
}

/**
 * Filtra a fila simulada: pedido novo sem aceite da atendente não fica
 * disponível para preparo. Pedidos já em preparo/prontos são histórico legado.
 */
export function pedidosVisiveisProducao<
  T extends { status?: string | null; aceito_em_atendente?: string | null },
>(pedidos: T[]): T[] {
  return pedidos.filter((p) => {
    if (p.status === "cancelado") return false;
    if (p.status === "recebido") return Boolean(p.aceito_em_atendente);
    return true;
  });
}

/** Plano determinístico: remessas de até 50 unidades, sem misturar pedidos. */
export function planoRemessas(pedido: PedidoProducaoMemoria): RemessaMemoria[] {
  const remessas: RemessaMemoria[] = [];
  let atual: RemessaMemoria | null = null;
  let sequencia = 0;

  for (const item of itensDoPedido(pedido)) {
    let restante = inteiro(item.quantidade);
    const produtoId = idProduto(item, pedido.id);
    const processo = processoDoItem(item);
    while (restante > 0) {
      if (!atual || atual.quantidade >= LIMITE_REMESSA) {
        atual = {
          id: `${pedido.id}:remessa:${++sequencia}`,
          pedidoId: pedido.id,
          indice: sequencia,
          quantidade: 0,
          itens: [],
          concluida_em: null,
          concluida_por: null,
        };
        remessas.push(atual);
      }
      const quantidade = Math.min(LIMITE_REMESSA - atual.quantidade, restante);
      const linha = atual.itens.find(
        (i) => i.nome === texto(item.nome) && i.produtoId === produtoId,
      );
      if (linha) linha.quantidade += quantidade;
      else
        atual.itens.push({
          nome: texto(item.nome),
          quantidade,
          processo,
          produtoId,
        });
      atual.quantidade += quantidade;
      restante -= quantidade;
    }
  }
  return remessas;
}

/** Confere que o plano não inventa nem perde unidades. */
export function validarPlanoRemessas(
  pedido: PedidoProducaoMemoria,
  remessas: RemessaMemoria[],
): Motivo {
  const motivos: string[] = [];
  const total = totalUnidades(pedido);
  const soma = remessas.reduce((s, r) => s + r.quantidade, 0);
  if (soma !== total) motivos.push(`soma das remessas (${soma}) difere do pedido (${total})`);
  if (remessas.some((r) => r.pedidoId !== pedido.id)) motivos.push("remessa de outro pedido");
  if (remessas.some((r) => r.quantidade <= 0 || r.quantidade > LIMITE_REMESSA))
    motivos.push("remessa fora do limite de 50 unidades");
  const porItem = new Map<string, number>();
  for (const r of remessas) {
    for (const i of r.itens) {
      porItem.set(i.nome, (porItem.get(i.nome) ?? 0) + i.quantidade);
    }
  }
  for (const i of itensDoPedido(pedido)) {
    if ((porItem.get(texto(i.nome)) ?? 0) !== inteiro(i.quantidade))
      motivos.push(`quantidade de ${texto(i.nome)} divergente`);
  }
  return { valida: motivos.length === 0, motivos };
}

/**
 * Monta a conferência a partir dos dados reais do pedido + responsável.
 * Se faltar dado obrigatório, o validador bloqueia a liberação.
 */
export function construirConferencia(
  pedido: PedidoProducaoMemoria,
  responsavel: AutorProducao,
  agora?: Date | string,
): ConferenciaMemoria | null {
  const itens = itensDoPedido(pedido);
  const total = totalUnidades(pedido);
  if (itens.length === 0 || total <= 0 || !texto(responsavel.id)) return null;

  const porSabor: Record<string, number> = {};
  let fritos = 0;
  let assados = 0;
  for (const item of itens) {
    const nome = texto(item.nome);
    const quantidade = inteiro(item.quantidade);
    porSabor[nome] = (porSabor[nome] ?? 0) + quantidade;
    if (processoDoItem(item) === "assado") assados += quantidade;
    else fritos += quantidade;
  }

  return {
    quantidadeTotal: total,
    porSabor,
    fritos,
    assados,
    embalagens: embalar(total),
    observacoes: typeof pedido.observacoes === "string" ? pedido.observacoes : "",
    modalidade: pedido.tipo_entrega === "retirada" ? "retirada" : "entrega",
    responsavelId: texto(responsavel.id),
    responsavelNome: texto(responsavel.nome) || "Responsável da cozinha",
  };
}

/** Valida TODOS os campos obrigatórios da conferência. */
export function validarConferencia(
  conferencia: ConferenciaMemoria | null | undefined,
  pedido: PedidoProducaoMemoria,
): Motivo {
  const motivos: string[] = [];
  if (!conferencia) return { valida: false, motivos: ["conferência ausente"] };
  const total = totalUnidades(pedido);
  const c = conferencia as Partial<ConferenciaMemoria>;

  if (inteiro(c.quantidadeTotal) !== total)
    motivos.push(`quantidade total conferida (${inteiro(c.quantidadeTotal)}) difere de ${total}`);

  const porSabor = c.porSabor;
  if (!porSabor || typeof porSabor !== "object" || Array.isArray(porSabor)) {
    motivos.push("quantidade por sabor ausente");
  } else {
    const esperado = new Map<string, number>();
    for (const i of itensDoPedido(pedido))
      esperado.set(texto(i.nome), (esperado.get(texto(i.nome)) ?? 0) + inteiro(i.quantidade));
    for (const [nome, qtd] of esperado) {
      if (inteiro(porSabor[nome]) !== qtd) motivos.push(`sabor ${nome} divergente`);
    }
    for (const [nome, qtd] of Object.entries(porSabor)) {
      if (!esperado.has(nome) && inteiro(qtd) > 0) motivos.push(`sabor extra: ${nome}`);
    }
  }

  let fritosEsperados = 0;
  let assadosEsperados = 0;
  for (const i of itensDoPedido(pedido)) {
    if (processoDoItem(i) === "assado") assadosEsperados += inteiro(i.quantidade);
    else fritosEsperados += inteiro(i.quantidade);
  }
  if (inteiro(c.fritos) !== fritosEsperados) motivos.push("quantidade de fritos divergente");
  if (inteiro(c.assados) !== assadosEsperados) motivos.push("quantidade de assados divergente");

  const esperadoEmbalagens = embalar(total);
  const emb = c.embalagens;
  if (
    !emb ||
    inteiro(emb.c100) !== esperadoEmbalagens.c100 ||
    inteiro(emb.c50) !== esperadoEmbalagens.c50 ||
    inteiro(emb.avulsas) !== esperadoEmbalagens.avulsas
  ) {
    motivos.push("quantidade de embalagens divergente");
  }

  const observacoesEsperadas = typeof pedido.observacoes === "string" ? pedido.observacoes : "";
  if (typeof c.observacoes !== "string") motivos.push("observações/separações ausentes");
  else if (c.observacoes !== observacoesEsperadas)
    motivos.push("observações/separações divergentes do pedido");

  const modalidadeEsperada = pedido.tipo_entrega === "retirada" ? "retirada" : "entrega";
  if (c.modalidade !== modalidadeEsperada) motivos.push("modalidade divergente");

  if (!texto(c.responsavelId)) motivos.push("funcionário responsável ausente");
  if (!texto(c.responsavelNome)) motivos.push("identificação do responsável ausente");

  return { valida: motivos.length === 0, motivos };
}

type FalhaOperacao = Extract<ResultadoOperacao, { ok: false }>;

function estadoOuFalha(pedidoId: string): EstadoProducaoMemoria | FalhaOperacao {
  const estado = estados.get(texto(pedidoId));
  return estado ?? falha("inexistente", "pedido não encontrado no adaptador de produção");
}

function eEstado(
  valor: EstadoProducaoMemoria | FalhaOperacao,
): valor is EstadoProducaoMemoria {
  return !("ok" in valor);
}

function consumirReservasDaRemessa(estado: EstadoProducaoMemoria, remessa: RemessaMemoria, idemKey: string, criadoEm: string): boolean {
  for (const item of remessa.itens) {
    const reserva = estado.reservas.find(
      (r) => r.produtoId === item.produtoId || r.nome === item.nome,
    );
    if (!reserva || reserva.status === "liberada") return false;
    if (reserva.consumido + item.quantidade > reserva.quantidade) return false;
    reserva.consumido += item.quantidade;
    reserva.status = reserva.consumido >= reserva.quantidade ? "consumida" : "ativa";
    estado.consumos.push({
      pedidoId: estado.pedido.id,
      remessaId: remessa.id,
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      idemKey,
      criado_em: criadoEm,
    });
  }
  return true;
}

function todasConcluidas(estado: EstadoProducaoMemoria): boolean {
  return estado.remessas.length > 0 && estado.remessas.every((r) => Boolean(r.concluida_em));
}

function criarEstado(pedidoFonte: PedidoProducaoMemoria, instante: string): EstadoProducaoMemoria {
  const pedido: PedidoProducaoMemoria = {
    ...pedidoFonte,
    pedido_itens: itensDoPedido(pedidoFonte).map((i) => ({ ...i })),
  };
  const remessas = planoRemessas(pedido);
  const reservas: ReservaMemoria[] = itensDoPedido(pedido).map((item, indice) => ({
    id: `${pedido.id}:reserva:${indice + 1}`,
    pedidoId: pedido.id,
    produtoId: idProduto(item, pedido.id),
    nome: texto(item.nome),
    quantidade: inteiro(item.quantidade),
    consumido: 0,
    status: "ativa",
  }));
  const estado: EstadoProducaoMemoria = {
    pedido,
    remessas,
    reservas,
    consumos: [],
    conferencia: null,
    conferido_em: pedido.conferido_em ?? null,
    conferido_por: pedido.conferido_por ?? null,
    pronto_em: pedido.pronto_em ?? null,
    canal: null,
    avisos: [],
    cancelado_em: pedido.status === "cancelado" ? instante : null,
  };

  // Histórico legado da demo: pedidos já em preparo/prontos entram com as
  // remessas concluídas para não exigir trabalho já feito antes da B3.
  if (pedido.status === "em_producao" || pedido.status === "pronto") {
    for (const remessa of remessas) {
      consumirReservasDaRemessa(estado, remessa, `historico:${remessa.id}`, instante);
      remessa.concluida_em = instante;
      remessa.concluida_por = pedido.conferido_por ?? "00000000-0000-4000-8000-000000000001";
    }
    const conferencia = construirConferencia(pedido, {
      id: pedido.conferido_por ?? "00000000-0000-4000-8000-000000000001",
      nome: "Responsável (demo)",
    });
    if (pedido.status === "pronto" && conferencia && validarConferencia(conferencia, pedido).valida) {
      estado.conferencia = conferencia;
      estado.conferido_em = pedido.conferido_em ?? instante;
    }
  }
  return estado;
}

/** Inicializa/reinicia o estado fictício. Seguro para testes e recarga da demo. */
export function inicializarProducaoMemoria(
  pedidos: PedidoProducaoMemoria[],
  agora?: Date | string,
): EstadoProducaoMemoria[] {
  estados.clear();
  chavesConsumo.clear();
  const instante = agoraISO(agora);
  for (const pedido of pedidos) estados.set(texto(pedido.id), criarEstado(pedido, instante));
  return [...estados.values()];
}

/**
 * Garante que pedidos recém-chegados (por exemplo, recém-aceitos na Central)
 * entrem no adaptador SEM apagar o progresso dos pedidos já iniciados.
 */
export function sincronizarProducaoMemoria(
  pedidos: PedidoProducaoMemoria[],
  agora?: Date | string,
): EstadoProducaoMemoria[] {
  const instante = agoraISO(agora);
  for (const pedido of pedidos) {
    const id = texto(pedido.id);
    if (!id) continue;
    const atual = estados.get(id);
    if (!atual) {
      estados.set(id, criarEstado(pedido, instante));
      continue;
    }
    // O aceite pode ter sido confirmado na Central DEPOIS da primeira
    // sincronização; preserva-se o progresso e adota-se apenas o aceite.
    if (pedido.aceito_em_atendente && !atual.pedido.aceito_em_atendente) {
      atual.pedido.aceito_em_atendente = pedido.aceito_em_atendente;
      atual.pedido.aceito_por = pedido.aceito_por ?? null;
      atual.pedido.updated_at = pedido.updated_at ?? null;
    }
  }
  return pedidos
    .map((pedido) => estados.get(texto(pedido.id)))
    .filter((estado): estado is EstadoProducaoMemoria => Boolean(estado));
}

export function estadoProducaoMemoria(pedidoId: string): EstadoProducaoMemoria | null {
  return estados.get(texto(pedidoId)) ?? null;
}

/** Próxima remessa pendente, na ordem do plano determinístico. */
export function proximaRemessaMemoria(pedidoId: string): RemessaMemoria | null {
  const estado = estados.get(texto(pedidoId));
  return estado?.remessas.find((r) => !r.concluida_em) ?? null;
}

/** Resumo curto para mensagens (sem prazo técnico ao cliente). */
export function progressoRemessas(pedidoId: string): {
  concluidas: number;
  total: number;
  unidadesConcluidas: number;
  unidadesTotal: number;
} {
  const estado = estados.get(texto(pedidoId));
  if (!estado)
    return { concluidas: 0, total: 0, unidadesConcluidas: 0, unidadesTotal: 0 };
  return {
    concluidas: estado.remessas.filter((r) => r.concluida_em).length,
    total: estado.remessas.length,
    unidadesConcluidas: estado.remessas
      .filter((r) => r.concluida_em)
      .reduce((s, r) => s + r.quantidade, 0),
    unidadesTotal: totalUnidades(estado.pedido),
  };
}

/**
 * Aplica o estado simulado aos pedidos exibidos na fila. Não cria outro
 * componente nem outro painel: apenas mantém os campos já usados pelo card.
 */
export function pedidosComEstadoProducaoMemoria<T extends PedidoProducaoMemoria>(pedidos: T[]): T[] {
  return pedidos.map((pedido) => {
    const estado = estados.get(texto(pedido.id));
    if (!estado) return pedido;
    return {
      ...pedido,
      status: estado.pedido.status,
      producao_status: estado.pedido.producao_status,
      aceito_em_atendente: pedido.aceito_em_atendente ?? estado.pedido.aceito_em_atendente ?? null,
      aceito_por: pedido.aceito_por ?? estado.pedido.aceito_por ?? null,
      liberado_em: estado.pedido.liberado_em ?? pedido.liberado_em ?? null,
      conferido_em: estado.conferido_em,
      conferido_por: estado.conferido_por,
      conferencia_obs: estado.conferencia?.observacoes ?? null,
      pronto_em: estado.pronto_em ?? pedido.pronto_em ?? null,
      retirado_em: pedido.retirado_em ?? null,
      remessas: estado.remessas.map((r) => ({ ...r })),
      progresso_remessas: progressoRemessas(texto(pedido.id)),
      conferencia: estado.conferencia ? { ...estado.conferencia } : null,
    } as T;
  });
}

/** Iniciar preparo: exige aceite, status recebido e janela operacional. */
export function iniciarProducaoMemoria(params: {
  pedidoId: string;
  autor: AutorProducao;
  agora?: Date | string;
}): ResultadoOperacao<{ remessas: RemessaMemoria[]; liberado_em: string }> {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.cancelado_em) return falha("cancelado", "pedido cancelado");
  if (bruto.pedido.status !== "recebido")
    return falha(
      bruto.pedido.status === "em_producao" ? "conflito" : "inelegivel",
      "pedido não está em Novos/Aceitos",
    );
  if (!bruto.pedido.aceito_em_atendente)
    return falha("aceite-ausente", "aceite da atendente obrigatório antes do preparo");
  if (bruto.pedido.agendado_para) {
    const instante = new Date(agoraISO(params.agora));
    const entrada = entradaJanelaProducao(bruto.pedido.agendado_para);
    if (instante.getTime() < entrada.getTime())
      return falha("fora-da-janela", "agendado fora da janela operacional");
  }

  const plano = validarPlanoRemessas(bruto.pedido, bruto.remessas);
  if (!plano.valida) return falha("plano-invalido", "plano de remessas inconsistente", plano.motivos);

  const instante = agoraISO(params.agora);
  bruto.pedido.status = "em_producao";
  bruto.pedido.producao_status = "em_producao";
  bruto.pedido.liberado_em = instante;
  return { ok: true, remessas: bruto.remessas.map((r) => ({ ...r })), liberado_em: instante };
}

/**
 * Finalizar UMA remessa. Não conclui o pedido inteiro: exige a quantidade exata
 * da remessa, reserva correspondente e chave de idempotência única.
 */
export function finalizarRemessaMemoria(params: {
  pedidoId: string;
  remessaId: string;
  quantidade: number;
  autor: AutorProducao;
  idemKey: string;
  agora?: Date | string;
}): ResultadoOperacao<{
  remessa: RemessaMemoria;
  progresso: ReturnType<typeof progressoRemessas>;
  pedidoConcluido: boolean;
}> {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.cancelado_em) return falha("cancelado", "pedido cancelado");
  if (bruto.pedido.status !== "em_producao") return falha("inelegivel", "pedido não está em preparo");

  const remessa = bruto.remessas.find((r) => r.id === texto(params.remessaId));
  if (!remessa) return falha("inexistente", "remessa não encontrada");
  if (remessa.concluida_em) return falha("remessa-duplicada", "esta remessa já foi finalizada");

  const quantidade = inteiro(params.quantidade);
  if (quantidade <= 0 || quantidade !== remessa.quantidade)
    return falha(
      "quantidade-invalida",
      `a remessa tem ${remessa.quantidade} unidades; informe essa quantidade exata`,
    );

  const progresso = progressoRemessas(params.pedidoId);
  if (progresso.unidadesConcluidas + quantidade > progresso.unidadesTotal)
    return falha("acima-do-total", "a soma das remessas ultrapassaria o pedido");

  const idem = texto(params.idemKey);
  if (!idem || chavesConsumo.has(idem)) return falha("consumo-duplicado", "consumo já registrado");

  const instante = agoraISO(params.agora);
  // Validação de reservas antes de qualquer gravação (operação atômica local).
  for (const item of remessa.itens) {
    const reserva = bruto.reservas.find(
      (r) => r.produtoId === item.produtoId || r.nome === item.nome,
    );
    if (!reserva || reserva.status === "liberada")
      return falha("sem-reserva", `sem reserva para ${item.nome}`);
    if (reserva.consumido + item.quantidade > reserva.quantidade)
      return falha("acima-da-reserva", `consumo acima do reservado para ${item.nome}`);
  }
  if (!consumirReservasDaRemessa(bruto, remessa, idem, instante))
    return falha("consumo-invalido", "não foi possível registrar o consumo da remessa");

  chavesConsumo.add(idem);
  remessa.concluida_em = instante;
  remessa.concluida_por = texto(params.autor.id);
  const progressoFinal = progressoRemessas(params.pedidoId);
  return {
    ok: true,
    remessa: { ...remessa },
    progresso: progressoFinal,
    pedidoConcluido: progressoFinal.concluidas === progressoFinal.total,
  };
}

/** Registra a conferência completa; NÃO muda status nem libera o pedido. */
export function conferirPedidoMemoria(params: {
  pedidoId: string;
  conferencia: ConferenciaMemoria | null | undefined;
  autor: AutorProducao;
  agora?: Date | string;
}): ResultadoOperacao {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.cancelado_em) return falha("cancelado", "pedido cancelado");
  if (bruto.pedido.status !== "em_producao") return falha("inelegivel", "pedido não está em preparo");
  if (!todasConcluidas(bruto))
    return falha("remessas-pendentes", "todas as remessas precisam estar concluídas");
  if (bruto.conferido_em) return falha("conferencia-duplicada", "conferência já registrada");

  const conferencia = params.conferencia;
  const verificacao = validarConferencia(conferencia, bruto.pedido);
  if (!verificacao.valida)
    return falha(
      "conferencia-incompleta",
      "conferência obrigatória incompleta: " + verificacao.motivos.join("; "),
      verificacao.motivos,
    );

  const instante = agoraISO(params.agora);
  bruto.conferencia = conferencia as ConferenciaMemoria;
  bruto.conferido_em = instante;
  bruto.conferido_por = texto(params.autor.id);
  bruto.pedido.conferido_em = instante;
  bruto.pedido.conferido_por = texto(params.autor.id);
  bruto.pedido.conferencia_obs = conferencia?.observacoes ?? null;
  return { ok: true };
}

/** Conferência + todas as remessas → pedido pronto, conforme modalidade. */
export function finalizarPedidoMemoria(params: {
  pedidoId: string;
  autor: AutorProducao;
  agora?: Date | string;
}): ResultadoOperacao<{ canal: "caixa" | "retirada" }> {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.cancelado_em) return falha("cancelado", "pedido cancelado");
  if (bruto.pedido.status === "pronto") return falha("conflito", "pedido já está pronto");
  if (bruto.pedido.status !== "em_producao") return falha("inelegivel", "pedido não está em preparo");
  if (!todasConcluidas(bruto))
    return falha("remessas-pendentes", "todas as remessas precisam estar concluídas");

  const verificacao = validarConferencia(bruto.conferencia, bruto.pedido);
  if (!verificacao.valida || !bruto.conferido_em)
    return falha(
      "conferencia-incompleta",
      "conferência obrigatória não aprovada: " + verificacao.motivos.join("; "),
      verificacao.motivos,
    );

  const instante = agoraISO(params.agora);
  const canal: "caixa" | "retirada" =
    bruto.pedido.tipo_entrega === "retirada" ? "retirada" : "caixa";
  bruto.pedido.status = "pronto";
  bruto.pedido.producao_status = "finalizado";
  bruto.pedido.pronto_em = instante;
  bruto.pronto_em = instante;
  bruto.canal = canal;
  // Nada aqui atribui motoboy, cria rota, inicia rota ou marca entrega.
  return { ok: true, canal };
}

/** Avisar caixa (entrega) ou liberar retirada, com dedupe por chave. */
export function despacharPedidoMemoria(params: {
  pedidoId: string;
  canal: "caixa" | "retirada";
  autor: AutorProducao;
  agora?: Date | string;
}): ResultadoOperacao<{ jaAvisado: boolean; tipo: string; chave: string }> {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.cancelado_em) return falha("cancelado", "pedido cancelado");
  if (bruto.pedido.status !== "pronto") return falha("inelegivel", "pedido não está pronto");
  if (!bruto.conferido_em || !validarConferencia(bruto.conferencia, bruto.pedido).valida)
    return falha("conferencia-incompleta", "conferência obrigatória não aprovada");

  const canalEsperado = bruto.pedido.tipo_entrega === "retirada" ? "retirada" : "caixa";
  if (params.canal !== canalEsperado)
    return falha(
      "modalidade-invalida",
      "retirada usa liberação de retirada; entrega usa aviso ao caixa",
    );
  if (canalEsperado === "retirada" && bruto.pedido.retirado_em)
    return falha("retirada-ja-confirmada", "a retirada já foi confirmada");

  const instante = agoraISO(params.agora);
  const dia = instante.slice(0, 10);
  const tipo = canalEsperado === "caixa" ? TIPO_AVISO_CAIXA : TIPO_AVISO_RETIRADA;
  const chave = chaveAviso(bruto.pedido.id, canalEsperado, dia);
  const jaAvisado = bruto.avisos.some((a) => a.chave === chave);
  if (!jaAvisado)
    bruto.avisos.push({ tipo, chave, canal: canalEsperado, criado_em: instante });
  bruto.canal = canalEsperado;
  // Retirada: NÃO marcar retirado_em (o cliente ainda confirma no balcão).
  // Entrega: NÃO tocar motoboy_id, rota ou status.
  return { ok: true, jaAvisado, tipo, chave };
}

/** Cancelamento/inconsistência local: bloqueia ações e libera o restante. */
export function cancelarPedidoMemoria(params: {
  pedidoId: string;
  autor: AutorProducao;
  motivo?: string;
  agora?: Date | string;
}): ResultadoOperacao {
  if (!autorizado(params.autor)) return falha("negado", "sem papel de produção/admin");
  const bruto = estadoOuFalha(params.pedidoId);
  if (!eEstado(bruto)) return bruto;
  if (bruto.pedido.status === "entregue") return falha("inelegivel", "pedido entregue");
  if (bruto.cancelado_em) return falha("cancelado", "pedido já cancelado");
  const instante = agoraISO(params.agora);
  bruto.cancelado_em = instante;
  bruto.pedido.status = "cancelado";
  for (const reserva of bruto.reservas) {
    if (reserva.status !== "consumida") reserva.status = "liberada";
  }
  return { ok: true };
}

/** Inconsistências de reserva/consumo para auditoria local. */
export function inconsistenciasProducaoMemoria(): string[] {
  const problemas: string[] = [];
  for (const estado of estados.values()) {
    for (const reserva of estado.reservas) {
      if (reserva.consumido > reserva.quantidade)
        problemas.push(`${reserva.id}: consumo acima da reserva`);
      if (reserva.consumido < 0) problemas.push(`${reserva.id}: consumo negativo`);
    }
    for (const remessa of estado.remessas) {
      const soma = remessa.itens.reduce((s, i) => s + i.quantidade, 0);
      if (soma !== remessa.quantidade) problemas.push(`${remessa.id}: itens divergentes`);
      if (remessa.pedidoId !== estado.pedido.id) problemas.push(`${remessa.id}: pedido divergente`);
    }
  }
  return problemas;
}

/** Uso exclusivo de testes: reinicia o estado simulado. */
export function limparProducaoMemoria(): void {
  estados.clear();
  chavesConsumo.clear();
}
