/**
 * MOTOR DE PRAZOS — PREVIEW ONLY (correção final: assado + fritura).
 *
 * NÃO é usado pelo `/producao` real. Não toca banco, RLS, status ou estoque.
 * Serve apenas para demonstrar visualmente a lógica operacional proposta em
 * `/preview/producao-nova` com dados fictícios.
 *
 * PRINCÍPIO (obrigatório): cada pedido é separado em PROCESSOS (fritura,
 * pastel, assado). Processos que começam juntos são paralelos: o tempo do
 * conjunto é o MAX, nunca a soma. Etapas sequenciais (dependência real de
 * uma etapa anterior) somam — hoje NÃO há nenhuma confirmada, então a lista
 * de dependências nasce vazia e o motor já está preparado para recebê-las.
 *
 * Regras operacionais confirmadas:
 * - Pedido imediato: prazo informado ao cliente = 40–60 min (NÃO é o tempo técnico).
 * - Pedido agendado: entra na janela de produção 1h30 antes do horário solicitado.
 * - Início recomendado = horário solicitado − tempo técnico − buffer (10 min).
 *   Buffer é separado: NUNCA somado ao tempo técnico.
 * - Fritos: 100 un ≈ 7 min; 1 fritadeira até 300, 2 até 1000, 3 acima (teto 3).
 * - Pastéis: referência de 2 min por lote/ciclo de 50 un (PARÂMETRO A VALIDAR).
 * - Assado: 10 min fixos como PROCESSO (entra no MAX). NÃO existe +10 automático.
 *   Somente assado = 10. Frito + assado = MAX(frito, 10). Os três = MAX(frito, pastel, 10).
 *
 * PONTOS A CONFIRMAR antes da implementação definitiva:
 * 1. Capacidade real por lote de cada fritadeira — sem ela, o "tempo efetivo com
 *    2–3 fritadeiras" é ESTIMATIVA (referência linear ÷ nº de fritadeiras).
 * 2. Referência de ciclo do pastel (lote/capacidade do equipamento).
 */

export type TipoItemPreview = "frito" | "pastel" | "assado";

export type ItemPedidoPreview = {
  sabor: string;
  qtd: number;
  tipo: TipoItemPreview;
};

/** Status VISUAIS do preview. O banco continua com os 7 `order_status` reais. */
export type ColunaPreview = "agendado" | "novo" | "preparando" | "pronto";

export type PedidoPreview = {
  numero: number;
  cliente: string;
  tipoEntrega: "entrega" | "retirada";
  /** ISO. Imediato => preenchido; agendado => null. */
  recebidoEm: string | null;
  /** ISO. Agendado => preenchido; imediato => null. */
  solicitadoPara: string | null;
  itens: ItemPedidoPreview[];
  coluna: ColunaPreview;
  observacao?: string;
};

/**
 * Configuração do motor: tempos NÃO ficam presos no código — ficam aqui para
 * futura parametrização (tela admin/loja_config). Nada aqui altera a operação real.
 */
export type MotorPreviewConfig = {
  /** Promessa operacional ao cliente no pedido imediato (min). */
  prazoClienteMin: number;
  prazoClienteMax: number;
  /** Janela de entrada do agendado na produção (min antes do solicitado). */
  janelaAgendadoMin: number;
  /** Buffer operacional aplicado ao início recomendado (min). Separado do técnico. */
  bufferOperacionalMin: number;
  /** Referência de fritos: minutos por `baseFritosQtd` unidades. */
  fritosMinPorLote: number;
  baseFritosQtd: number;
  /** Limites de fritadeiras por quantidade de fritos (teto = 3). */
  fritadeiraLimite1: number;
  fritadeiraLimite2: number;
  maxFritadeiras: number;
  /** Referência de pastéis: minutos por `basePasteisQtd` (A VALIDAR). */
  pasteisMinPorLote: number;
  basePasteisQtd: number;
  /** Assado: minutos fixos do PROCESSO (entra no MAX, sem adicional). */
  assadosMinFixo: number;
  /** Limiar do alerta de atenção (min restantes). */
  limiarAtencaoMin: number;
};

export const MOTOR_PREVIEW_CONFIG: MotorPreviewConfig = {
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

export const PRAZO_CLIENTE_MIN = MOTOR_PREVIEW_CONFIG.prazoClienteMin;
export const PRAZO_CLIENTE_MAX = MOTOR_PREVIEW_CONFIG.prazoClienteMax;
export const JANELA_AGENDADO_MIN = MOTOR_PREVIEW_CONFIG.janelaAgendadoMin;
export const BUFFER_OPERACIONAL_MIN = MOTOR_PREVIEW_CONFIG.bufferOperacionalMin;
export const LIMITE_FRITADEIRAS = MOTOR_PREVIEW_CONFIG.maxFritadeiras;
export const MIN_POR_100_FRITOS = MOTOR_PREVIEW_CONFIG.fritosMinPorLote;
export const MIN_POR_50_PASTEIS = MOTOR_PREVIEW_CONFIG.pasteisMinPorLote;
export const MIN_ASSADOS_FIXO = MOTOR_PREVIEW_CONFIG.assadosMinFixo;
export const LIMIAR_ATENCAO_MIN = MOTOR_PREVIEW_CONFIG.limiarAtencaoMin;

/** Um processo do pedido. `sequencialDe` vazio = pode começar junto (paralelo). */
export type EtapaProcesso = {
  processo: "fritura" | "pastel" | "assado";
  minutos: number;
  /** Nomes dos processos que precisam terminar antes (hoje: sempre vazio). */
  sequencialDe: string[];
};

export type CalculoPedido = {
  qtdFritos: number;
  qtdPasteis: number;
  qtdAssados: number;
  qtdTotal: number;
  fritadeiras: number;
  /** Referência linear, sem paralelismo. */
  minFritosRef: number;
  /** Estimativa com paralelismo (ref ÷ fritadeiras). A CONFIRMAR no lote real. */
  minFritosEfetivo: number;
  paralelismoEstimado: boolean;
  minPasteis: number;
  /** Referência de ciclo — A VALIDAR operacionalmente. */
  pastelRefAValidar: boolean;
  minAssados: number;
  bufferOperacional: number;
  /** Processos presentes no pedido (só entra no MAX quem existe). */
  etapas: EtapaProcesso[];
  /**
   * Tempo técnico = MAX(paralelos) + soma(sequenciais após dependência).
   * Sem dependências confirmadas, hoje = MAX dos processos presentes.
   */
  tecnicoMin: number;
};

export function arredonda1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function fritadeirasPara(
  qtdFritos: number,
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): number {
  if (qtdFritos <= 0) return 0;
  if (qtdFritos <= cfg.fritadeiraLimite1) return 1;
  if (qtdFritos <= cfg.fritadeiraLimite2) return 2;
  return cfg.maxFritadeiras;
}

/** Núcleo do motor: monta as etapas e resolve MAX(paralelos) + sequenciais. */
export function resolverEtapas(etapas: EtapaProcesso[]): number {
  const paralelos = etapas.filter((e) => e.sequencialDe.length === 0);
  const sequenciais = etapas.filter((e) => e.sequencialDe.length > 0);
  const base = paralelos.length > 0 ? Math.max(...paralelos.map((e) => e.minutos)) : 0;
  return arredonda1(base + sequenciais.reduce((s, e) => s + e.minutos, 0));
}

export function calcularPedido(
  itens: ItemPedidoPreview[],
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): CalculoPedido {
  let qtdFritos = 0;
  let qtdPasteis = 0;
  let qtdAssados = 0;
  for (const i of itens) {
    if (i.tipo === "frito") qtdFritos += i.qtd;
    else if (i.tipo === "pastel") qtdPasteis += i.qtd;
    else qtdAssados += i.qtd;
  }
  const fritadeiras = fritadeirasPara(qtdFritos, cfg);
  const minFritosRef = arredonda1((qtdFritos / cfg.baseFritosQtd) * cfg.fritosMinPorLote);
  const minFritosEfetivo =
    fritadeiras > 0 ? arredonda1(minFritosRef / fritadeiras) : 0;
  const minPasteis = arredonda1((qtdPasteis / cfg.basePasteisQtd) * cfg.pasteisMinPorLote);
  const minAssados = qtdAssados > 0 ? cfg.assadosMinFixo : 0;

  // Só entra no MAX o processo que EXISTE no pedido. Sem +10 automático:
  // os 10 min são o próprio processo de assado.
  const etapas: EtapaProcesso[] = [];
  if (qtdFritos > 0) etapas.push({ processo: "fritura", minutos: minFritosEfetivo, sequencialDe: [] });
  if (qtdPasteis > 0) etapas.push({ processo: "pastel", minutos: minPasteis, sequencialDe: [] });
  if (qtdAssados > 0) etapas.push({ processo: "assado", minutos: minAssados, sequencialDe: [] });

  return {
    qtdFritos,
    qtdPasteis,
    qtdAssados,
    qtdTotal: qtdFritos + qtdPasteis + qtdAssados,
    fritadeiras,
    minFritosRef,
    minFritosEfetivo,
    paralelismoEstimado: fritadeiras > 1,
    minPasteis,
    pastelRefAValidar: true,
    minAssados,
    bufferOperacional: cfg.bufferOperacionalMin,
    etapas,
    tecnicoMin: resolverEtapas(etapas),
  };
}

/** Limite máximo prometido ao cliente no pedido imediato (recebido + 60 min). */
export function limiteImediato(
  recebidoEm: string,
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): Date {
  return new Date(new Date(recebidoEm).getTime() + cfg.prazoClienteMax * 60000);
}

/** Início da janela de produção do agendado (solicitado − 90 min). */
export function entradaJanela(
  solicitadoPara: string,
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): Date {
  return new Date(new Date(solicitadoPara).getTime() - cfg.janelaAgendadoMin * 60000);
}

/**
 * Início recomendado = horário solicitado − tempo técnico − buffer operacional.
 * Ex.: solicitado 18:00, técnico 14 min, buffer 10 min → iniciar às 17:36.
 */
export function inicioRecomendado(
  solicitadoPara: string,
  tecnicoMin: number,
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): Date {
  return new Date(
    new Date(solicitadoPara).getTime() - (tecnicoMin + cfg.bufferOperacionalMin) * 60000,
  );
}

export type NivelAlerta = "normal" | "hora-preparar" | "atencao" | "risco" | "atrasado";

export type EstadoPrazo = {
  nivel: NivelAlerta;
  /** Minutos restantes até o limite (imediato) ou horário solicitado (agendado). */
  restanteMin: number;
  /** Minutos até o início recomendado (agendado) ou 0. */
  paraInicioMin: number;
  limite: Date | null;
  inicioRec: Date | null;
};

export function estadoPrazo(
  pedido: PedidoPreview,
  calc: CalculoPedido,
  agora: Date,
  cfg: MotorPreviewConfig = MOTOR_PREVIEW_CONFIG,
): EstadoPrazo {
  if (pedido.coluna === "pronto") {
    return { nivel: "normal", restanteMin: 0, paraInicioMin: 0, limite: null, inicioRec: null };
  }
  if (pedido.solicitadoPara) {
    const alvo = new Date(pedido.solicitadoPara);
    const restanteMin = (alvo.getTime() - agora.getTime()) / 60000;
    const inicioRec = inicioRecomendado(pedido.solicitadoPara, calc.tecnicoMin, cfg);
    const paraInicioMin = (inicioRec.getTime() - agora.getTime()) / 60000;
    let nivel: NivelAlerta = "normal";
    if (restanteMin < 0) nivel = "atrasado";
    else if (restanteMin < calc.tecnicoMin) nivel = "risco";
    else if (restanteMin <= cfg.limiarAtencaoMin) nivel = "atencao";
    else if (paraInicioMin <= 0) nivel = "hora-preparar";
    return { nivel, restanteMin, paraInicioMin, limite: alvo, inicioRec };
  }
  if (pedido.recebidoEm) {
    const limite = limiteImediato(pedido.recebidoEm, cfg);
    const restanteMin = (limite.getTime() - agora.getTime()) / 60000;
    let nivel: NivelAlerta = "normal";
    if (restanteMin < 0) nivel = "atrasado";
    else if (restanteMin < calc.tecnicoMin) nivel = "risco";
    else if (restanteMin <= cfg.limiarAtencaoMin) nivel = "atencao";
    return { nivel, restanteMin, paraInicioMin: 0, limite, inicioRec: null };
  }
  return { nivel: "normal", restanteMin: 0, paraInicioMin: 0, limite: null, inicioRec: null };
}

export const NIVEL_META: Record<
  NivelAlerta,
  { rotulo: string; cor: string; som: string }
> = {
  normal: { rotulo: "Normal", cor: "🟢", som: "" },
  "hora-preparar": { rotulo: "Hora de preparar", cor: "🟢", som: "inicio_preparacao" },
  atencao: { rotulo: "Atenção", cor: "🟡", som: "pedido_proximo" },
  risco: { rotulo: "Risco de atraso", cor: "🟠", som: "pedido_urgente" },
  atrasado: { rotulo: "Atrasado", cor: "🔴", som: "pedido_atrasado" },
};

export function formatarMinutos(min: number): string {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = Math.floor(abs % 60);
  if (h > 0) return `${sinal}${h}h${String(m).padStart(2, "0")}`;
  return `${sinal}${m}min`;
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
