/**
 * Motor de prazos da PRODUÇÃO REAL (Fase 1.6).
 *
 * Lógica validada no preview (`motor-prazo-preview.ts`, testes A–H 8/8),
 * adaptada aos dados reais do pedido (itens com categoria/nome, sem coluna
 * de processo no banco — classificação por slug + nome, §24 controlado).
 *
 * PRINCÍPIO: separa o pedido em PROCESSOS presentes (fritura/pastel/assado).
 * Processos que começam juntos são paralelos: técnico = MAX. Etapas com
 * dependência real (`sequencialDe`) somam — hoje nenhuma confirmada.
 *
 * Puro (sem Supabase/React): testável em `scripts/fases.test.mjs`.
 * NÃO toca banco, RLS, status, estoque ou impressão.
 */

export type ProcessoProducao = "fritura" | "pastel" | "assado";
export type ClassificacaoItem = ProcessoProducao | "ignorar" | "desconhecido";

export type MotorProducaoConfig = {
  prazoClienteMin: number;
  prazoClienteMax: number;
  janelaAgendadoMin: number;
  bufferOperacionalMin: number;
  fritosMinPorLote: number;
  baseFritosQtd: number;
  fritadeiraLimite1: number;
  fritadeiraLimite2: number;
  maxFritadeiras: number;
  pasteisMinPorLote: number;
  basePasteisQtd: number;
  assadosMinFixo: number;
  limiarAtencaoMin: number;
};

export const MOTOR_PRODUCAO_CONFIG: MotorProducaoConfig = {
  prazoClienteMin: 40,
  prazoClienteMax: 60,
  janelaAgendadoMin: 90,
  bufferOperacionalMin: 10,
  fritosMinPorLote: 7,
  baseFritosQtd: 100,
  fritadeiraLimite1: 300,
  fritadeiraLimite2: 1000,
  maxFritadeiras: 3,
  pasteisMinPorLote: 2,
  basePasteisQtd: 50,
  assadosMinFixo: 10,
  limiarAtencaoMin: 15,
};

export type ItemProducao = {
  nome: string;
  quantidade: number;
  /** slug da categoria do produto, quando conhecido (join com categorias). */
  categoriaSlug?: string | null;
};

export type EtapaProducao = {
  processo: ProcessoProducao;
  minutos: number;
  /** Processos que precisam terminar antes (hoje: sempre vazio). */
  sequencialDe: string[];
};

export type CalculoProducao = {
  qtdFritos: number;
  qtdPasteis: number;
  qtdAssados: number;
  qtdTotal: number;
  fritadeiras: number;
  minFritosRef: number;
  /** Estimativa com paralelismo — capacidade por lote ainda a confirmar. */
  minFritosEfetivo: number;
  paralelismoEstimado: boolean;
  minPasteis: number;
  /** Referência de ciclo — sujeita a validação operacional. */
  pastelRefAValidar: boolean;
  minAssados: number;
  bufferOperacional: number;
  etapas: EtapaProducao[];
  /** null = zero processos reconhecidos (§24: exibir estado controlado). */
  tecnicoMin: number | null;
  motivoSemTempo: "vazio" | "sem-processo" | null;
  naoReconhecidos: { nome: string; quantidade: number }[];
  ignorados: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/**
 * Classifica um item em processo. Ordem: categoria (fonte primária) e depois
 * nome (fallback p/ combos avulsos sem produto). Bebidas são ignoradas (não
 * consomem produção); o resto sem match é "desconhecido" (§24).
 */
export function classificarProcesso(item: {
  nome: string;
  categoriaSlug?: string | null | undefined;
}): ClassificacaoItem {
  const slug = norm(item.categoriaSlug);
  const nome = norm(item.nome);
  const hit = (s: string, ...keys: string[]) => keys.some((k) => s.includes(k));
  for (const s of [slug, nome]) {
    if (!s) continue;
    if (hit(s, "bebida", "refrigerante", "suco", "cerveja")) return "ignorar";
  }
  // "past" cobre pastel/pasteis/pastéis (plural do slug "mini-pasteis").
  if (hit(slug, "pastel", "pasteis", "pastéis", "past")) return "pastel";
  if (hit(slug, "assad", "pizza", "empad")) return "assado";
  if (hit(slug, "frito", "congelado", "kit", "mini", "salgado")) return "fritura";
  if (hit(nome, "pastel", "pasteis", "pastéis", "past")) return "pastel";
  if (hit(nome, "esfiha", "pizza", "empad", "assad")) return "assado";
  if (hit(nome, "coxinha", "kibe", "risole", "bolinha", "salgad", "frito", "congelado", "mini")) {
    return "fritura";
  }
  return "desconhecido";
}

export function arredonda1Producao(v: number): number {
  return Math.round(v * 10) / 10;
}

export function fritadeirasParaProducao(
  qtdFritos: number,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): number {
  if (qtdFritos <= 0) return 0;
  if (qtdFritos <= cfg.fritadeiraLimite1) return 1;
  if (qtdFritos <= cfg.fritadeiraLimite2) return 2;
  return cfg.maxFritadeiras;
}

export function resolverEtapasProducao(etapas: EtapaProducao[]): number {
  const paralelos = etapas.filter((e) => e.sequencialDe.length === 0);
  const sequenciais = etapas.filter((e) => e.sequencialDe.length > 0);
  const base = paralelos.length > 0 ? Math.max(...paralelos.map((e) => e.minutos)) : 0;
  return arredonda1Producao(base + sequenciais.reduce((s, e) => s + e.minutos, 0));
}

export function calcularProducao(
  itens: ItemProducao[],
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): CalculoProducao {
  let qtdFritos = 0;
  let qtdPasteis = 0;
  let qtdAssados = 0;
  let ignorados = 0;
  const naoReconhecidos: { nome: string; quantidade: number }[] = [];
  let qtdTotal = 0;
  for (const i of itens) {
    const qtd = Math.max(0, Number(i.quantidade ?? 0) || 0);
    qtdTotal += qtd;
    const cls = classificarProcesso({ nome: i.nome, categoriaSlug: i.categoriaSlug });
    if (cls === "fritura") qtdFritos += qtd;
    else if (cls === "pastel") qtdPasteis += qtd;
    else if (cls === "assado") qtdAssados += qtd;
    else if (cls === "ignorar") ignorados += qtd;
    else naoReconhecidos.push({ nome: i.nome, quantidade: qtd });
  }
  const fritadeiras = fritadeirasParaProducao(qtdFritos, cfg);
  const minFritosRef = arredonda1Producao((qtdFritos / cfg.baseFritosQtd) * cfg.fritosMinPorLote);
  const minFritosEfetivo =
    fritadeiras > 0 ? arredonda1Producao(minFritosRef / fritadeiras) : 0;
  const minPasteis = arredonda1Producao(
    (qtdPasteis / cfg.basePasteisQtd) * cfg.pasteisMinPorLote,
  );
  const minAssados = qtdAssados > 0 ? cfg.assadosMinFixo : 0;

  const etapas: EtapaProducao[] = [];
  if (qtdFritos > 0) {
    etapas.push({ processo: "fritura", minutos: minFritosEfetivo, sequencialDe: [] });
  }
  if (qtdPasteis > 0) {
    etapas.push({ processo: "pastel", minutos: minPasteis, sequencialDe: [] });
  }
  if (qtdAssados > 0) {
    etapas.push({ processo: "assado", minutos: minAssados, sequencialDe: [] });
  }

  const tecnicoMin = etapas.length > 0 ? resolverEtapasProducao(etapas) : null;
  const motivoSemTempo =
    tecnicoMin === null ? (qtdTotal === 0 ? "vazio" : "sem-processo") : null;

  return {
    qtdFritos,
    qtdPasteis,
    qtdAssados,
    qtdTotal,
    fritadeiras,
    minFritosRef,
    minFritosEfetivo,
    paralelismoEstimado: fritadeiras > 1,
    minPasteis,
    pastelRefAValidar: true,
    minAssados,
    bufferOperacional: cfg.bufferOperacionalMin,
    etapas,
    tecnicoMin,
    motivoSemTempo,
    naoReconhecidos,
    ignorados,
  };
}

export function limiteImediatoProducao(
  recebidoEm: string,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): Date {
  return new Date(new Date(recebidoEm).getTime() + cfg.prazoClienteMax * 60000);
}

export function entradaJanelaProducao(
  solicitadoPara: string,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): Date {
  return new Date(new Date(solicitadoPara).getTime() - cfg.janelaAgendadoMin * 60000);
}

export function inicioRecomendadoProducao(
  solicitadoPara: string,
  tecnicoMin: number,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): Date {
  return new Date(
    new Date(solicitadoPara).getTime() - (tecnicoMin + cfg.bufferOperacionalMin) * 60000,
  );
}

export type NivelAlertaProducao =
  | "normal"
  | "hora-preparar"
  | "atencao"
  | "risco"
  | "atrasado";

export type EstadoPrazoProducao = {
  nivel: NivelAlertaProducao;
  restanteMin: number;
  paraInicioMin: number;
};

export function estadoPrazoProducao(
  pedido: { status: string; recebidoEm: string | null; solicitadoPara: string | null; limiteComercialEm?: string | null | undefined },
  tecnicoMin: number | null,
  agora: Date,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): EstadoPrazoProducao {
  const limiteImediato = pedido.limiteComercialEm === undefined && pedido.recebidoEm
    ? limiteImediatoProducao(pedido.recebidoEm, cfg).getTime()
    : Date.parse(pedido.limiteComercialEm ?? "");
  if (pedido.status !== "pronto" && tecnicoMin === null && pedido.limiteComercialEm !== undefined) {
    const limite = pedido.solicitadoPara ? Date.parse(pedido.solicitadoPara) : limiteImediato;
    if (Number.isFinite(limite) && limite < agora.getTime()) {
      return { nivel: "atrasado", restanteMin: (limite - agora.getTime()) / 60000, paraInicioMin: 0 };
    }
  }
  if (pedido.status === "pronto" || tecnicoMin === null) {
    return { nivel: "normal", restanteMin: 0, paraInicioMin: 0 };
  }
  if (pedido.solicitadoPara) {
    const restanteMin = (new Date(pedido.solicitadoPara).getTime() - agora.getTime()) / 60000;
    const paraInicioMin =
      (inicioRecomendadoProducao(pedido.solicitadoPara, tecnicoMin, cfg).getTime() -
        agora.getTime()) /
      60000;
    let nivel: NivelAlertaProducao = "normal";
    if (restanteMin < 0) nivel = "atrasado";
    else if (restanteMin < tecnicoMin) nivel = "risco";
    else if (restanteMin <= cfg.limiarAtencaoMin) nivel = "atencao";
    else if (paraInicioMin <= 0) nivel = "hora-preparar";
    return { nivel, restanteMin, paraInicioMin };
  }
  if (Number.isFinite(limiteImediato)) {
    const restanteMin = (limiteImediato - agora.getTime()) / 60000;
    let nivel: NivelAlertaProducao = "normal";
    if (restanteMin < 0) nivel = "atrasado";
    else if (restanteMin < tecnicoMin) nivel = "risco";
    else if (restanteMin <= cfg.limiarAtencaoMin) nivel = "atencao";
    return { nivel, restanteMin, paraInicioMin: 0 };
  }
  return { nivel: "normal", restanteMin: 0, paraInicioMin: 0 };
}

/**
 * Ordenação da fila da cozinha (K6.10.1-B).
 *
 * Critérios, nesta ordem (sem pesos arbitrários):
 * 1. Gravidade do `estadoPrazoProducao` (atrasado > risco > hora-preparar >
 *    atencao > normal) — a mesma urgência das cores/sons já usados na tela.
 * 2. Instante em que o pedido precisa entrar em preparo
 *    (`inicioRecomendadoProducao` para agendados com técnico conhecido;
 *    `solicitadoPara` como fallback; `limiteImediatoProducao` para
 *    imediatos; `created_at` em último caso). Agendado futuro nunca passa
 *    na frente de quem já deve iniciar: a gravidade decide antes.
 * 3. `created_at` como desempate, depois `id` (ordem determinística).
 *
 * Pura, sem mutação (devolve cópia ordenada). `agora` injetável p/ testes.
 */
export type EntradaFilaProducao = {
  id: string;
  status: string;
  created_at?: string | null;
  agendado_para?: string | null;
  prazo_prometido_em?: string | null;
  tecnicoMin?: number | null;
};

const ORDEM_NIVEL_FILA: Record<NivelAlertaProducao, number> = {
  atrasado: 0,
  risco: 1,
  "hora-preparar": 2,
  atencao: 3,
  normal: 4,
};

export function instantePreparoFila(
  p: EntradaFilaProducao,
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): number | null {
  if (p.agendado_para) {
    const solicitado = new Date(p.agendado_para).getTime();
    if (Number.isNaN(solicitado)) return null;
    if (p.tecnicoMin != null && p.tecnicoMin >= 0) {
      return inicioRecomendadoProducao(p.agendado_para, p.tecnicoMin, cfg).getTime();
    }
    return solicitado;
  }
  if (p.prazo_prometido_em !== undefined) {
    const limite = Date.parse(p.prazo_prometido_em ?? "");
    return Number.isFinite(limite) ? limite : null;
  }
  if (!p.created_at) return null;
  const base = new Date(p.created_at).getTime();
  if (Number.isNaN(base)) return null;
  return base + cfg.prazoClienteMax * 60000;
}

type ChaveFilaProducao = { nivel: number; instante: number | null; criadoEm: string; id: string };

function compararChaveFila(a: ChaveFilaProducao, b: ChaveFilaProducao): number {
  if (a.nivel !== b.nivel) return a.nivel - b.nivel;
  if (a.instante !== null && b.instante !== null && a.instante !== b.instante) {
    return a.instante < b.instante ? -1 : 1;
  }
  if (a.instante !== null && b.instante === null) return -1;
  if (a.instante === null && b.instante !== null) return 1;
  if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function ordenarFilaProducao<T extends EntradaFilaProducao>(
  pedidos: readonly T[],
  agora: Date = new Date(),
  cfg: MotorProducaoConfig = MOTOR_PRODUCAO_CONFIG,
): T[] {
  const chaves = new Map<T, ChaveFilaProducao>();
  for (const p of pedidos) {
    const estado = estadoPrazoProducao(
      {
        status: p.status,
        recebidoEm: p.agendado_para ? null : (p.created_at ?? null),
        solicitadoPara: p.agendado_para ?? null,
        limiteComercialEm: p.prazo_prometido_em,
      },
      p.tecnicoMin ?? null,
      agora,
      cfg,
    );
    chaves.set(p, {
      nivel: ORDEM_NIVEL_FILA[estado.nivel],
      instante: instantePreparoFila(p, cfg),
      criadoEm: p.created_at ?? "",
      id: p.id,
    });
  }
  return [...pedidos].sort((a, b) => {
    const ka = chaves.get(a);
    const kb = chaves.get(b);
    if (!ka || !kb) return 0;
    return compararChaveFila(ka, kb);
  });
}

export const NIVEL_META_PRODUCAO: Record<
  NivelAlertaProducao,
  { rotulo: string; cor: string; som: string }
> = {
  normal: { rotulo: "Normal", cor: "🟢", som: "" },
  "hora-preparar": { rotulo: "Hora de preparar", cor: "🟢", som: "inicio_preparacao" },
  atencao: { rotulo: "Atenção", cor: "🟡", som: "pedido_proximo" },
  risco: { rotulo: "Risco de atraso", cor: "🟠", som: "pedido_urgente" },
  atrasado: { rotulo: "Atrasado", cor: "🔴", som: "pedido_atrasado" },
};

export function formatarMinutosProducao(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = Math.floor(abs % 60);
  if (h > 0) return `${sinal}${h}h${String(m).padStart(2, "0")}`;
  return `${sinal}${m}min`;
}
