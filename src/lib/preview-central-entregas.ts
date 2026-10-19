/**
 * Lógica pura do preview da Central de Entregas 2.0 (K8.1) — sem banco, sem React.
 * Testável em scripts/preview-central-v2.test.mjs.
 * Regras determinísticas; empates por menor número do pedido / ordem alfabética.
 */

export type ColunaCentral = "aguardando" | "atribuidos" | "rota" | "entregues";

export type StatusMotoboy = "disponivel" | "em-rota" | "retornando" | "indisponivel";

export type MotoboyCentral = {
  id: string;
  nome: string;
  status: StatusMotoboy;
  /** Distância da base em km (null = desconhecida). */
  baseKm: number | null;
  /** Timestamp desde quando está disponível (só faz sentido em "disponivel"). */
  disponivelDesde: number | null;
  entregasHoje: number;
  /** Última atualização de localização (para alerta de dado desatualizado). */
  atualizacaoEm: number;
};

export type ItemCentral = { sabor: string; qtd: number };

export type PedidoCentral = {
  id: string;
  numero: number;
  cliente: string;
  endereco: string;
  distanciaKm: number | null;
  prontoEm: number;
  prometidoEm: number;
  saidaPrevistaEm: number | null;
  saidaEm: number | null;
  chegadaPrevistaEm: number | null;
  entregueEm: number | null;
  /** Minutos de deslocamento estimados (null = sem dado confiável). */
  deslocMin: number | null;
  itens: ItemCentral[];
  obs?: string;
  motoboyId: string | null;
  coluna: ColunaCentral;
  /** Prioridade manual autorizada pelo administrador (só ordena, não auto-atribui). */
  prioridadeManual: boolean;
};

export type RotaDia = {
  id: string;
  motoboyId: string;
  paradas: string[];
  situacao: "planejada" | "em-andamento" | "concluida";
};

export type OcorrenciaCentral = {
  id: string;
  pedidoNumero: number | null;
  tipo: string;
  descricao: string;
  aberta: boolean;
};

export function totalUnidades(p: Pick<PedidoCentral, "itens">): number {
  return p.itens.reduce((s, i) => s + i.qtd, 0);
}

/**
 * Sugere o motoboy disponível há mais tempo (menor disponivelDesde).
 * Retornando à base NUNCA é sugerido (só após confirmação de chegada,
 * que no preview é a transição manual para "disponivel").
 */
export function sugerirMotoboy(
  motoboys: Pick<MotoboyCentral, "id" | "status" | "disponivelDesde">[],
): { id: string | null; motivo: string } {
  const disp = motoboys
    .filter((m) => m.status === "disponivel" && m.disponivelDesde != null)
    .sort((a, b) => (a.disponivelDesde ?? 0) - (b.disponivelDesde ?? 0) || (a.id < b.id ? -1 : 1));
  if (disp.length === 0) return { id: null, motivo: "Nenhum motoboy disponível na base." };
  const top = disp[0]!;
  const esperaMin = Math.max(0, Math.round((Date.now() - (top.disponivelDesde ?? 0)) / 60000));
  return {
    id: top.id,
    motivo: `Disponível há mais tempo (~${esperaMin} min). Atribuição manual — sem automática.`,
  };
}

/** Localização desatualizada: sem update há mais de 10 min. */
export function localizacaoDesatualizada(
  m: Pick<MotoboyCentral, "atualizacaoEm">,
  agora: number,
): boolean {
  return agora - m.atualizacaoEm > 10 * 60000;
}

/**
 * Bloqueio de atribuição duplicada: pedido já atribuído/em rota/entregue,
 * motoboy indisponível, ou pedido já em alguma rota ativa.
 */
export function podeAtribuir(
  pedido: Pick<PedidoCentral, "id" | "coluna" | "motoboyId">,
  motoboy: Pick<MotoboyCentral, "id" | "status">,
  rotasAtivas: Pick<RotaDia, "paradas">[],
): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (pedido.coluna !== "aguardando") motivos.push("pedido não está aguardando motoboy");
  if (motoboy.status !== "disponivel") motivos.push("motoboy não está disponível na base");
  if (rotasAtivas.some((r) => r.paradas.includes(pedido.id)))
    motivos.push("pedido já está em uma rota ativa");
  return { ok: motivos.length === 0, motivos };
}

/** Totais da rota: soma de distâncias conhecidas + 5 min por parada de manejo. */
export function totaisRota(
  pedidos: Pick<PedidoCentral, "id" | "distanciaKm" | "deslocMin" | "itens">[],
  paradas: string[],
): { qtd: number; totalUn: number; distKm: number; tempoMin: number } {
  const sel = paradas
    .map((id) => pedidos.find((p) => p.id === id))
    .filter((p): p is (typeof pedidos)[number] => !!p);
  const distKm = Math.round(sel.reduce((s, p) => s + (p.distanciaKm ?? 0), 0) * 10) / 10;
  const tempoMin = sel.reduce((s, p) => s + (p.deslocMin ?? 0), 0) + sel.length * 5;
  const totalUn = sel.reduce((s, p) => s + totalUnidades(p), 0);
  return { qtd: sel.length, totalUn, distKm, tempoMin };
}

/** Move um item dentro da sequência de paradas (simulação de reordenar). */
export function reordenar<T>(lista: T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length || para < 0 || para >= lista.length) return [...lista];
  const out = [...lista];
  const [item] = out.splice(de, 1);
  out.splice(para, 0, item!);
  return out;
}

/** Até 3 paradas por rota; acima disso exige confirmação explícita. */
export function podeCriarRota(paradas: string[], confirmouExtra: boolean): boolean {
  if (paradas.length === 0) return false;
  if (paradas.length > 3 && !confirmouExtra) return false;
  return true;
}

/** Divide a rota: índices do segundo grupo formam a nova rota. */
export function dividirRota(paradas: string[], idxGrupoB: number[]): [string[], string[]] {
  const setB = new Set(idxGrupoB);
  const a = paradas.filter((_, i) => !setB.has(i));
  const b = paradas.filter((_, i) => setB.has(i));
  return [a, b];
}

/** Atrasado: prazo prometido passou e ainda não foi entregue. */
export function emAtraso(
  p: Pick<PedidoCentral, "prometidoEm" | "coluna">,
  agora: number,
): boolean {
  return p.coluna !== "entregues" && agora > p.prometidoEm;
}

/** Próximo do prazo: vence em até `janelaMin` e ainda não entregue. */
export function proximoDoPrazo(
  p: Pick<PedidoCentral, "prometidoEm" | "coluna">,
  agora: number,
  janelaMin = 20,
): boolean {
  if (p.coluna === "entregues") return false;
  const falta = p.prometidoEm - agora;
  return falta >= 0 && falta <= janelaMin * 60000;
}

export type EstadoAlerta = "no-prazo" | "risco" | "atrasado" | "sem-previsao";

export type AlertaEntrega = {
  estado: EstadoAlerta;
  /** Previsão de chegada em ms (null = sem dado confiável). */
  previsaoEm: number | null;
  /** Minutos estimados além do prometido (0 quando dentro do prazo). */
  atrasoMin: number;
  /** Origem da previsão (para exibir sem inventar dado). */
  fonte: "saida-confirmada" | "saida-prevista" | "saida-agora" | "nenhuma";
};

/**
 * Alerta inteligente (K8.2): compara a melhor previsão disponível com o
 * prometido, sem confundir tempo de rota com atraso real.
 * - Em rota: usa chegadaPrevistaEm (saída confirmada).
 * - Atribuído: usa saidaPrevistaEm + desloc (quando ambos conhecidos).
 * - Aguardando: estima saída agora + desloc (quando desloc conhecido).
 * - Sem desloc confiável e sem previsão: "sem-previsao".
 * Entregue não entra no alerta operacional.
 */
export function alertaDe(
  p: Pick<
    PedidoCentral,
    "coluna" | "prometidoEm" | "deslocMin" | "saidaPrevistaEm" | "saidaEm" | "chegadaPrevistaEm"
  >,
  agora: number,
): AlertaEntrega {
  if (p.coluna === "entregues") {
    return { estado: "no-prazo", previsaoEm: null, atrasoMin: 0, fonte: "nenhuma" };
  }
  if (agora > p.prometidoEm) {
    return {
      estado: "atrasado",
      previsaoEm: p.chegadaPrevistaEm,
      atrasoMin: Math.max(1, Math.round((agora - p.prometidoEm) / 60000)),
      fonte: p.chegadaPrevistaEm != null ? "saida-confirmada" : "nenhuma",
    };
  }
  let previsao: number | null = null;
  let fonte: AlertaEntrega["fonte"] = "nenhuma";
  if (p.chegadaPrevistaEm != null) {
    previsao = p.chegadaPrevistaEm;
    fonte = "saida-confirmada";
  } else if (p.saidaPrevistaEm != null && p.deslocMin != null) {
    previsao = p.saidaPrevistaEm + p.deslocMin * 60000;
    fonte = "saida-prevista";
  } else if (p.deslocMin != null) {
    previsao = agora + p.deslocMin * 60000;
    fonte = "saida-agora";
  }
  if (previsao == null) {
    return { estado: "sem-previsao", previsaoEm: null, atrasoMin: 0, fonte: "nenhuma" };
  }
  if (previsao > p.prometidoEm) {
    return {
      estado: "risco",
      previsaoEm: previsao,
      atrasoMin: Math.max(1, Math.round((previsao - p.prometidoEm) / 60000)),
      fonte,
    };
  }
  return { estado: "no-prazo", previsaoEm: previsao, atrasoMin: 0, fonte };
}

export type PrevisaoParada = {
  pedidoId: string;
  chegadaEm: number;
  atrasoMin: number;
};

/**
 * Previsões por parada (K8.2, item 5): chegada acumulada =
 * partida + desloc da parada + 5 min de manejo por parada anterior.
 * Recalcula ao reordenar; usa só dados existentes (sem trânsito inventado).
 */
export function previsoesRota(
  pedidos: Pick<PedidoCentral, "id" | "deslocMin" | "prometidoEm" | "saidaEm">[],
  paradas: string[],
  partidaEm: number,
): PrevisaoParada[] {
  let t = partidaEm;
  const out: PrevisaoParada[] = [];
  for (const id of paradas) {
    const p = pedidos.find((x) => x.id === id);
    if (!p) continue;
    t += (p.deslocMin ?? 0) * 60000;
    out.push({
      pedidoId: id,
      chegadaEm: t,
      atrasoMin: Math.max(0, Math.round((t - p.prometidoEm) / 60000)),
    });
    t += 5 * 60000;
  }
  return out;
}

/**
 * Ordem de despacho (K8.2, item 4): manual autorizada primeiro;
 * depois atrasados (maior atraso), risco (maior risco), prometido mais
 * próximo e menor rota. Nunca altera prazos nem atribui sozinho.
 */
export function pontuarDespacho(
  p: Pick<PedidoCentral, "prometidoEm" | "deslocMin"> & { prioridadeManual: boolean },
  alerta: Pick<AlertaEntrega, "estado" | "atrasoMin">,
  agora: number,
): number {
  let pts = 0;
  if (p.prioridadeManual) pts += 100000;
  if (alerta.estado === "atrasado") pts += 10000 + alerta.atrasoMin * 10;
  else if (alerta.estado === "risco") pts += 1000 + alerta.atrasoMin * 10;
  else if (alerta.estado === "no-prazo") pts += Math.max(0, 500 - Math.round((p.prometidoEm - agora) / 60000));
  pts -= p.deslocMin ?? 30;
  return pts;
}
