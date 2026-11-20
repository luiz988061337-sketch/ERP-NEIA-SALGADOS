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

export type PedidoCentral = {
  id: string;
  numero: number;
  cliente_nome: string;
  telefone?: string | null;
  status: string;
  tipo_entrega: string;
  total: number;
  created_at: string;
  agendado_para?: string | null;
  aceito_em_atendente?: string | null;
  aceito_por?: string | null;
  liberado_em?: string | null;
  conferido_em?: string | null;
  pronto_em?: string | null;
  retirado_em?: string | null;
  observacoes?: string | null;
  pagamento_status?: string | null;
  forma_pagamento?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  producao_status?: string | null;
  pedido_itens?: { nome: string; quantidade: number }[];
};

export type ColunasCentral = {
  analise: PedidoCentral[];
  producao: PedidoCentral[];
  pronto: PedidoCentral[];
};

/** Colunas da Central, conforme os estados reais (ver `visaoAtendente`). */
export function colunasCentral(pedidos: PedidoCentral[]): ColunasCentral {
  const analise: PedidoCentral[] = [];
  const producao: PedidoCentral[] = [];
  const pronto: PedidoCentral[] = [];
  for (const p of pedidos) {
    if (p.status === "recebido" && !p.aceito_em_atendente) {
      analise.push(p);
      continue;
    }
    if (p.status === "recebido" || p.status === "em_producao") {
      producao.push(p);
      continue;
    }
    if (p.status === "pronto") {
      pronto.push(p);
    }
  }
  return { analise, producao, pronto };
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
  const termo = (filtros.busca ?? "").trim().toLowerCase();
  const status = filtros.status ?? "todos";
  return pedidos.filter((p) => {
    if (filtros.modalidade && filtros.modalidade !== "todas") {
      if ((p.tipo_entrega ?? "entrega") !== filtros.modalidade) return false;
    }
    if (filtros.agendados && !p.agendado_para) return false;
    if (status !== "todos") {
      const analise = p.status === "recebido" && !p.aceito_em_atendente;
      const producao =
        (p.status === "recebido" && Boolean(p.aceito_em_atendente)) ||
        p.status === "em_producao";
      const pronto = p.status === "pronto";
      if (status === "analise" && !analise) return false;
      if (status === "producao" && !producao) return false;
      if (status === "pronto" && !pronto) return false;
    }
    if (!termo) return true;
    const numero = String(p.numero ?? "").toLowerCase();
    const cliente = String(p.cliente_nome ?? "").toLowerCase();
    const telefone = String(p.telefone ?? "").toLowerCase();
    return numero.includes(termo) || cliente.includes(termo) || telefone.includes(termo);
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

/**
 * Prioridade da Central: agendado/urgente/atrasado primeiro, depois o mais
 * antigo. Não altera nenhuma promessa comercial — só a ordem de exibição.
 */
export function ordenarPorPrioridade(pedidos: PedidoCentral[], agoraMs = Date.now()): PedidoCentral[] {
  const pontuacao = (p: PedidoCentral): number => {
    const minutos = minutosDesde(p.created_at, agoraMs);
    if (p.status === "pronto" && (p.tipo_entrega ?? "entrega") === "retirada" && p.retirado_em)
      return 0;
    if (minutos >= 60) return 1; // atrasado
    if (p.agendado_para) return 2; // agendado
    if (minutos >= 40) return 3; // crítico
    return 4;
  };
  return [...pedidos].sort((a, b) => {
    const pa = pontuacao(a);
    const pb = pontuacao(b);
    if (pa !== pb) return pa - pb;
    const ma = minutosDesde(a.created_at, agoraMs);
    const mb = minutosDesde(b.created_at, agoraMs);
    if (ma !== mb) return mb - ma; // mais antigo primeiro
    return (a.numero ?? 0) - (b.numero ?? 0);
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
      Number.isFinite(volume) && volume >= 0 && volume <= 1
        ? volume
        : CONFIG_ALERTA_PADRAO.volume,
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
export function lerReconhecidos(): Set<string> {
  const bruto = lerArmazenamento(CHAVE_RECONHECIDOS);
  if (!bruto) return new Set();
  try {
    const lista = JSON.parse(bruto);
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function gravarReconhecidos(ids: Set<string>): void {
  gravarArmazenamento(CHAVE_RECONHECIDOS, JSON.stringify([...ids]));
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

export const TIPO_AVISO_CAIXA = "pedido_pronto_caixa";
export const TIPO_AVISO_RETIRADA = "pedido_liberado_retirada";

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
  return m ? (m[1] ?? null) : null;
}

/** Avisos de cozinha (pronto para entrega / liberado para retirada). */
export function avisosDaCozinha(avisos: AvisoCozinha[]): AvisoCozinha[] {
  return avisos.filter(
    (a) => a.tipo === TIPO_AVISO_CAIXA || a.tipo === TIPO_AVISO_RETIRADA,
  );
}

/** Aviso de cozinha de um pedido específico (para exibir no card). */
export function avisoDoPedido(
  avisos: AvisoCozinha[],
  pedidoId: string,
): AvisoCozinha | null {
  return avisosDaCozinha(avisos).find((a) => idPedidoDoAviso(a) === pedidoId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Métricas da Central (linha de cartões da referência)                */
/* ------------------------------------------------------------------ */

export type MetricasCentral = {
  novos: number;
  emProducao: number;
  prontos: number;
  ticketMedio: number;
};

export function metricasCentral(pedidos: PedidoCentral[]): MetricasCentral {
  const c = colunasCentral(pedidos);
  const todos = [...c.analise, ...c.producao, ...c.pronto];
  const ticketMedio =
    todos.length > 0
      ? todos.reduce((s, p) => s + (Number(p.total) || 0), 0) / todos.length
      : 0;
  return {
    novos: c.analise.length,
    emProducao: c.producao.length,
    prontos: c.pronto.length,
    ticketMedio,
  };
}
