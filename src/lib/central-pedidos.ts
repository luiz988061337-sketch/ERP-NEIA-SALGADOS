import { visaoAtendente } from "@/lib/sincronizacao-paineis";
import type { ItemH02, ProdutoH02 } from "@/lib/pedidos-h02";
import { limitePrometido, type PrazoPedido } from "@/lib/prazo-pedido";
import { TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA } from "@/lib/producao-liberacao";

type ComponenteCentral = NonNullable<ItemH02["pedido_item_componentes"]>[number] & {
  produtos?: { nome: string } | null;
};

type ItemCentral = Omit<ItemH02, "pedido_item_componentes"> & {
  produtos?: ProdutoH02 | null;
  pedido_item_componentes?: ComponenteCentral[];
};

/**
 * Central de Pedidos da Atendente — regras PURAS (sem rede, sem banco).
 *
 * Tudo aqui deriva do modelo real do projeto:
 * - `pedidos.status` (enum `order_status`) e `pedidos.tipo_entrega`;
 * - `pedidos.aceito_em_atendente` (aceite da atendente — migration 0084);
 * - `pedidos.liberado_em` (liberação para a cozinha — migration 0084);
 * - `pedidos.conferido_em` (conferência final da cozinha);
 * - `pedidos.retirado_em` (confirmação da retirada);
 * - `pedidos.pagamento_status` / `forma_pagamento` (política comercial de
 *   `lib/atendente-aceite.ts`);
 * - views canônicas de `lib/sincronizacao-paineis.ts` (`visaoAtendente`).
 *
 * Nenhum status novo é criado aqui.
 */

export type PedidoCentral = PrazoPedido & {
  id: string;
  numero: number;
  cliente_nome: string;
  telefone?: string | null;
  status: string;
  tipo_entrega: string;
  total: number;
  created_at: string;
  aceito_em_atendente?: string | null;
  aceito_em?: string | null;
  aceito_por?: string | null;
  liberado_em?: string | null;
  conferido_em?: string | null;
  pronto_em?: string | null;
  preparo_em?: string | null;
  motoboy_id?: string | null;
  atrasado?: boolean | null;
  atraso_descricao?: string | null;
  retirado_em?: string | null;
  observacoes?: string | null;
  pagamento_status?: string | null;
  forma_pagamento?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  producao_status?: string | null;
  pedido_itens?: { nome: string; quantidade: number }[];
  itens_catalogados?: ItemCentral[];
  producao_remessas?: Array<{ indice: number; concluida_em?: string | null }>;
};

export const ESTADOS_CENTRAL = ["recebido", "em_producao", "pronto", "aguardando_motoboy"] as const;

export type ColunasCentral = {
  analise: PedidoCentral[];
  producao: PedidoCentral[];
  pronto: PedidoCentral[];
};

export function colunaDoPedido(p: PedidoCentral): keyof ColunasCentral | null {
  if (p.retirado_em || !ESTADOS_CENTRAL.some((estado) => estado === p.status)) return null;
  const visao = visaoAtendente({
    id: p.id,
    status: p.status,
    tipo_entrega: p.tipo_entrega,
    motoboy_id: p.motoboy_id ?? null,
    aceito_em_atendente: p.aceito_em_atendente ?? p.aceito_em ?? null,
    liberado_em: p.liberado_em ?? null,
    conferido_em: p.conferido_em ?? null,
    retirado_em: p.retirado_em ?? null,
    agendado_para: p.agendado_para ?? null,
    atrasado: !!p.atrasado,
  });
  if (visao === "novos") return "analise";
  if (visao === "aceitos" || visao === "producao") return "producao";
  return visao === "prontos" ? "pronto" : null;
}

/** Colunas da Central, conforme os estados reais (ver `visaoAtendente`). */
export function colunasCentral(pedidos: PedidoCentral[]): ColunasCentral {
  const colunas: ColunasCentral = { analise: [], producao: [], pronto: [] };
  for (const p of pedidos) {
    const coluna = colunaDoPedido(p);
    if (coluna) colunas[coluna].push(p);
  }
  return colunas;
}

export type FiltrosCentral = {
  busca?: string;
  status?: "todos" | keyof ColunasCentral;
  modalidade?: "todas" | "entrega" | "retirada";
  agendados?: boolean;
};

/** Busca (nº, cliente ou telefone) + filtros de status e modalidade. */
export function filtrarPedidos(
  pedidos: PedidoCentral[],
  filtros: FiltrosCentral = {},
): PedidoCentral[] {
  const normalizar = (texto: string) =>
    texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const termo = normalizar(filtros.busca ?? "");
  const digitos = termo.replace(/\D/g, "");
  const status = filtros.status ?? "todos";
  return pedidos.filter((p) => {
    const coluna = colunaDoPedido(p);
    if (!coluna || (status !== "todos" && coluna !== status)) return false;
    if (filtros.modalidade && filtros.modalidade !== "todas") {
      if (p.tipo_entrega !== filtros.modalidade) return false;
    }
    if (filtros.agendados && !p.agendado_para) return false;
    if (!termo) return true;
    const soNumeros = digitos && /^[\d#()+.\s-]+$/.test(termo);
    return (
      (soNumeros &&
        (String(p.numero).includes(digitos) || p.telefone?.replace(/\D/g, "").includes(digitos))) ||
      [
        p.cliente_nome,
        ...(p.pedido_itens ?? []).map((item) => item.nome),
        ...(p.itens_catalogados ?? []).flatMap(
          (i) => i.pedido_item_componentes?.map((c) => c.produtos?.nome) ?? [],
        ),
      ].some((nome) => normalizar(nome ?? "").includes(termo))
    );
  });
}

/** Minutos desde a criação (tempo aguardando análise). */
export function minutosDesde(criadoEm: string, agoraMs = Date.now()): number {
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((agoraMs - t) / 60000));
}

/** "12 min" / "1h 05" — tempo legível. */
export function formatarMinutos(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}`;
}

export function prazoRegistrado(p: PedidoCentral): number | null {
  const limite = limitePrometido(p);
  return limite === null ? null : Date.parse(limite);
}

/** Usa a promessa persistida e o alerta operacional existente. */
export function atrasoCentral(p: PedidoCentral, agoraMs: number): boolean | null {
  const coluna = colunaDoPedido(p);
  if (!coluna) return false;
  if (p.atrasado) return true;
  const prazo = prazoRegistrado(p);
  if (prazo === null) return null;
  const prontoEm = Date.parse(p.pronto_em ?? "");
  if (coluna === "pronto" && p.tipo_entrega === "retirada") {
    return Number.isFinite(prontoEm) ? prontoEm > prazo : null;
  }
  return agoraMs > prazo;
}

export function estaEmPreparo(p: PedidoCentral): boolean {
  return (
    !!p.preparo_em || ["em_producao", "produzindo", "embalando"].includes(p.producao_status ?? "")
  );
}

/** Pedidos em atraso e compromissos mais próximos vêm primeiro. */
export function ordenarPorPrioridade(
  pedidos: PedidoCentral[],
  agoraMs = Date.now(),
): PedidoCentral[] {
  return [...pedidos].sort((a, b) => {
    const atraso =
      Number(atrasoCentral(b, agoraMs) === true) - Number(atrasoCentral(a, agoraMs) === true);
    const pa = prazoRegistrado(a) ?? Infinity;
    const pb = prazoRegistrado(b) ?? Infinity;
    return atraso || pa - pb || a.created_at.localeCompare(b.created_at) || a.numero - b.numero;
  });
}

/** Pedidos que ainda NÃO foram vistos pela atendente (identidade real do ID). */
export function pedidosNovos(
  pedidos: PedidoCentral[],
  idsConhecidos: Set<string>,
): PedidoCentral[] {
  return pedidos.filter((p) => !idsConhecidos.has(p.id));
}

/** Pedidos novos ainda NÃO reconhecidos (o som continua para eles). */
export function pedidosNaoReconhecidos(
  pedidos: PedidoCentral[],
  reconhecidos: Set<string>,
): PedidoCentral[] {
  return pedidos.filter((p) => !reconhecidos.has(p.id));
}

/* ------------------------------------------------------------------ */
/* Configuração do alerta sonoro (aprovada pelo proprietário)          */
/* ------------------------------------------------------------------ */

export type ConfigAlerta = {
  ativo: boolean;
  /** 0..1 — padrão 75%. */
  volume: number;
  /** Intervalo de repetição, em segundos — padrão 30s. */
  intervaloSegundos: number;
};

export const CONFIG_ALERTA_PADRAO: ConfigAlerta = {
  ativo: true,
  volume: 0.75,
  intervaloSegundos: 30,
};

export const CHAVE_CONFIG_ALERTA = "neia:central-pedidos:alerta";
export const CHAVE_RECONHECIDOS = "neia:central-pedidos:reconhecidos";
export const CHAVE_CONHECIDOS = "neia:central-pedidos:conhecidos";

/** Normaliza a config lida do storage (valores fora de faixa são corrigidos). */
export function normalizarConfig(valor: unknown): ConfigAlerta {
  const c = (valor ?? {}) as Partial<ConfigAlerta>;
  const volume = Number(c.volume);
  const intervalo = Number(c.intervaloSegundos);
  return {
    ativo: c.ativo === undefined ? CONFIG_ALERTA_PADRAO.ativo : Boolean(c.ativo),
    volume:
      Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : CONFIG_ALERTA_PADRAO.volume,
    intervaloSegundos:
      Number.isFinite(intervalo) && intervalo >= 5 && intervalo <= 600
        ? Math.round(intervalo)
        : CONFIG_ALERTA_PADRAO.intervaloSegundos,
  };
}

/** Lê a config persistida (string JSON) — devolve o padrão quando vazia/inválida. */
export function lerConfig(bruto: string | null): ConfigAlerta {
  if (!bruto) return CONFIG_ALERTA_PADRAO;
  try {
    return normalizarConfig(JSON.parse(bruto));
  } catch {
    return CONFIG_ALERTA_PADRAO;
  }
}

/** Leitura segura do localStorage (SSR/aba anônima não quebram). */
export function lerArmazenamento(chave: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

export function gravarArmazenamento(chave: string, valor: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(chave, valor);
  } catch {
    /* modo privado / quota — segue */
  }
}

/** IDs reconhecidos (individual) — persistidos entre recargas e abas. */
export function lerReconhecidos(chave = CHAVE_RECONHECIDOS): Set<string> {
  const bruto = lerArmazenamento(chave);
  if (!bruto) return new Set();
  try {
    const lista = JSON.parse(bruto);
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function gravarReconhecidos(ids: Set<string>, chave = CHAVE_RECONHECIDOS): void {
  gravarArmazenamento(chave, JSON.stringify([...ids]));
}

/** IDs já vistos (para não alertar o que já existia antes). */
export function lerConhecidos(): Set<string> {
  const bruto = lerArmazenamento(CHAVE_CONHECIDOS);
  if (!bruto) return new Set();
  try {
    const lista = JSON.parse(bruto);
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function gravarConhecidos(ids: Set<string>): void {
  gravarArmazenamento(CHAVE_CONHECIDOS, JSON.stringify([...ids]));
}

/* ------------------------------------------------------------------ */
/* Notificações internas da cozinha (tabela real `notificacoes`)      */
/* ------------------------------------------------------------------ */

export { TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA };
export const TOPICO_AVISOS_COZINHA = "atendente-avisos-cozinha";
export const EVENTO_AVISO_COZINHA = "aviso-cozinha";

export type AvisoCozinha = {
  id: string;
  tipo: string;
  titulo: string;
  detalhe: string;
  link: string;
  lida: boolean;
  created_at: string;
};

/** Avisos da cozinha que pertencem a um pedido (link traz o id real). */
export function idPedidoDoAviso(aviso: AvisoCozinha): string | null {
  const m = /[?&]pedido=([0-9a-f-]{4,})/i.exec(aviso.link ?? "");
  return m?.[1]?.toLowerCase() ?? null;
}

/** Avisos de cozinha (pronto para entrega / liberado para retirada). */
export function avisosDaCozinha(avisos: AvisoCozinha[]): AvisoCozinha[] {
  return avisos.filter((a) => a.tipo === TIPO_AVISO_CAIXA || a.tipo === TIPO_AVISO_RETIRADA);
}

/** Aviso de cozinha de um pedido específico (para exibir no card). */
export function avisoDoPedido(
  avisos: AvisoCozinha[],
  pedidoId: string,
  modalidade?: string,
): AvisoCozinha | null {
  const tipo = modalidade === "entrega" ? TIPO_AVISO_CAIXA :
    modalidade === "retirada" ? TIPO_AVISO_RETIRADA : null;
  return avisosDaCozinha(avisos).find((aviso) =>
    idPedidoDoAviso(aviso) === pedidoId && (tipo === null || aviso.tipo === tipo),
  ) ?? null;
}

/* ------------------------------------------------------------------ */
/* Métricas da Central (linha de cartões da referência)                */
/* ------------------------------------------------------------------ */

export type MetricasCentral = {
  novos: number;
  emProducao: number;
  prontos: number;
  atrasados: number;
  prazosSemDados: number;
};

export function metricasCentral(pedidos: PedidoCentral[], agoraMs = Date.now()): MetricasCentral {
  const c = colunasCentral(pedidos);
  const atrasos = [...c.analise, ...c.producao, ...c.pronto].map((p) => atrasoCentral(p, agoraMs));
  return {
    novos: c.analise.length,
    emProducao: c.producao.length,
    prontos: c.pronto.length,
    atrasados: atrasos.filter((a) => a === true).length,
    prazosSemDados: atrasos.filter((a) => a === null).length,
  };
}
