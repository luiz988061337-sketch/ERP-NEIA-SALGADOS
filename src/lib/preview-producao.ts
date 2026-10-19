/**
 * Lógica pura do preview de produção (K7) — sem banco, sem React.
 * Testável em scripts/preview-producao.test.mjs.
 * Regras documentadas e determinísticas (empate: menor vencimento, menor número).
 */

export type ItemBase = { sabor: string; qtd: number; tipo: "frito" | "assado" };
export type BlocoBase = {
  id: string;
  qtd: number;
  feito: boolean;
  composicao: { sabor: string; qtd: number }[];
};
export type FinalBase = { estado: string } | null;
export type PedidoBase = {
  id: string;
  numero: number;
  tipo: "entrega" | "retirada";
  coluna: "proximos" | "preparo" | "finalizados";
  vencimentoEm: number;
  prometidoEm: number;
  etaRotaMin: number | null;
  agendado: boolean;
  pausado: boolean;
  prioridadeManual: boolean;
  itens: ItemBase[];
  blocos: BlocoBase[];
  finalizado: FinalBase;
};

export type ProblemaBase = {
  id: string;
  pedidoId: string;
  gravidade: "baixa" | "media" | "critica";
  resolvido: boolean;
};

export function atrasoMin(p: Pick<PedidoBase, "vencimentoEm">, agora: number): number {
  return Math.max(0, Math.round((agora - p.vencimentoEm) / 60000));
}

/**
 * Pontuação da recomendação (maior = preparar primeiro):
 * +10 por minuto de atraso; +10000 prioridade manual; −5000 agendado
 * distante (>30 min, ainda não deve entrar na fila ativa).
 * Disponibilidade de motoboy NÃO pontua (só informa).
 */
export function pontuar(
  p: Pick<PedidoBase, "vencimentoEm" | "agendado" | "prioridadeManual" | "numero">,
  agora: number,
): { pontos: number; motivo: string } {
  const atraso = atrasoMin(p, agora);
  let pontos = atraso * 10;
  const partes: string[] = [];
  if (p.prioridadeManual) {
    pontos += 10000;
    partes.push("prioridade manual do responsável");
  }
  if (atraso > 0) partes.push(`atrasado ${atraso} min`);
  const falta = Math.round((p.vencimentoEm - agora) / 60000);
  if (p.agendado && falta > 30) {
    pontos -= 5000;
    partes.push("agendado distante");
  } else if (atraso === 0) {
    partes.push(`despacho mais próximo (${falta} min)`);
  }
  return { pontos, motivo: `Prioridade: ${partes.join("; ") || "ordem de horário"}.` };
}

/** Recomenda 1 pedido entre os próximos (empate: menor vencimento, menor número). */
export function recomendar(
  pedidos: Pick<
    PedidoBase,
    "id" | "numero" | "coluna" | "vencimentoEm" | "agendado" | "prioridadeManual" | "pausado"
  >[],
  agora: number,
): { id: string | null; motivo: string } {
  const cand = pedidos.filter((p) => p.coluna === "proximos" && !p.pausado);
  if (cand.length === 0) return { id: null, motivo: "Sem pedidos aguardando início." };
  const rank = cand
    .map((p) => ({ p, ...pontuar(p, agora) }))
    .sort(
      (a, b) =>
        b.pontos - a.pontos || a.p.vencimentoEm - b.p.vencimentoEm || a.p.numero - b.p.numero,
    );
  const top = rank[0];
  if (!top) return { id: null, motivo: "Sem pedidos aguardando início." };
  return { id: top.p.id, motivo: top.motivo };
}

export type ResumoFritura = {
  ativos: number;
  totalPendente: number;
  fritosPendente: number;
  fritosProximaHora: number;
  emPreparo: number;
  atrasados: number;
};

function unidadesFeitas(blocos: BlocoBase[], sabor?: string): number {
  return blocos
    .filter((b) => b.feito && (!sabor || b.composicao.some((c) => c.sabor === sabor)))
    .reduce(
      (s, b) =>
        s + b.composicao.filter((c) => !sabor || c.sabor === sabor).reduce((a, c) => a + c.qtd, 0),
      0,
    );
}

/**
 * Resumo de demanda (blocos concluídos NÃO contam de novo).
 * "Próxima hora": pedidos com vencimento até agora+60min.
 */
export function resumirFritura(
  pedidos: Pick<PedidoBase, "id" | "coluna" | "vencimentoEm" | "itens" | "blocos" | "pausado">[],
  agora: number,
): ResumoFritura {
  const ativos = pedidos.filter((p) => p.coluna !== "finalizados");
  let totalPendente = 0;
  let fritosPendente = 0;
  let fritosProximaHora = 0;
  for (const p of ativos) {
    for (const it of p.itens) {
      const feito = unidadesFeitas(p.blocos, it.sabor);
      const resto = Math.max(0, it.qtd - feito);
      totalPendente += resto;
      if (it.tipo === "frito") fritosPendente += resto;
      if (it.tipo === "frito" && p.vencimentoEm <= agora + 3600000) fritosProximaHora += resto;
    }
  }
  return {
    ativos: ativos.length,
    totalPendente,
    fritosPendente,
    fritosProximaHora,
    emPreparo: ativos.filter((p) => p.coluna === "preparo").length,
    atrasados: ativos.filter((p) => atrasoMin(p, agora) > 0).length,
  };
}

/** Caixas de 100 e 100/50: 250 = 2×100 + 1×50. Resto <50 = avulsas (não obrigatório). */
export function embalar(totalUn: number): { c100: number; c50: number; avulsas: number } {
  const t = Math.max(0, Math.floor(Number(totalUn) || 0));
  const c100 = Math.floor(t / 100);
  const resto = t % 100;
  return { c100, c50: resto >= 50 ? 1 : 0, avulsas: resto % 50 };
}

/** Bloqueio crítico aberto impede finalização (mas não outros pedidos). */
export function bloqueioCritico(problemas: ProblemaBase[], pedidoId: string): boolean {
  return problemas.some(
    (p) => p.pedidoId === pedidoId && p.gravidade === "critica" && !p.resolvido,
  );
}

export function podeFinalizar(
  blocos: Pick<BlocoBase, "feito">[],
  conferencia: boolean,
  bloqueado: boolean,
): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (blocos.length > 0 && blocos.some((b) => !b.feito)) motivos.push("blocos incompletos");
  if (!conferencia) motivos.push("conferência não aprovada");
  if (bloqueado) motivos.push("impedimento crítico aberto");
  return { ok: motivos.length === 0, motivos };
}

/** Dedupe de notificações de despacho (1 por pedido). */
export function jaNotificado(notifs: { pedidoId: string }[], pedidoId: string): boolean {
  return notifs.some((n) => n.pedidoId === pedidoId);
}
