import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizarTelefone } from "@/lib/crm";

export type PedidoItensRow = {
  pedido_id: string;
  produto_id: string | null;
  nome: string;
  preco_unitario: string | number;
  quantidade: number;
};

export type PedidoBasico = {
  id: string;
  numero: number;
  user_id: string | null;
  cliente_nome: string;
  telefone: string;
  bairro: string | null;
  endereco: string;
  total: string | number;
  status: string;
  forma_pagamento: string;
  created_at: string;
  agendado_para: string | null;
  tipo_evento: string | null;
  pedido_itens?: PedidoItensRow[];
};

/** Intervalo habitual entre compras (dias) a partir das datas — null se <2 pedidos. */
export function intervaloHabitual(datasISO: string[]): number | null {
  const ts = [...new Set(datasISO.map((d) => +new Date(d)))]
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (ts.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const a = ts[i];
    const b = ts[i - 1];
    if (a === undefined || b === undefined) continue;
    gaps.push((a - b) / 86400000);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const meio = gaps[Math.floor(gaps.length / 2)];
  if (meio === undefined) return null;
  return Math.max(1, Math.round(meio));
}

/** Próxima recompra estimada = último pedido + intervalo. Apenas estimativa. */
export function proximaRecompra(ultimoISO: string | null, intervaloDias: number | null): Date | null {
  if (!ultimoISO || !intervaloDias) return null;
  const t = +new Date(ultimoISO);
  if (Number.isNaN(t)) return null;
  return new Date(t + intervaloDias * 86400000);
}

/** Dias até a próxima recompra estimada (negativo = já passou). Null sem histórico. */
export function diasParaRecompra(c: { datas?: string[] | null | undefined; ultimo_pedido: string | null }): number | null {
  const intervalo = intervaloHabitual(c.datas ?? []);
  const prox = proximaRecompra(c.ultimo_pedido, intervalo);
  if (!prox) return null;
  return Math.ceil((prox.getTime() - Date.now()) / 86400000);
}

/** Item mais habitual do cliente: agrega quantidade por produto_id/nome. */
export function pedidoHabitual(
  pedidos: { status: string; pedido_itens?: { produto_id: string | null; nome: string; quantidade: number }[] }[],
): { produto_id: string | null; nome: string; qtdTotal: number; vezes: number }[] {
  const map = new Map<string, { produto_id: string | null; nome: string; qtdTotal: number; vezes: number }>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const vistos = new Set<string>();
    for (const i of p.pedido_itens ?? []) {
      const key = i.produto_id ?? `nome:${i.nome}`;
      const cur = map.get(key) ?? { produto_id: i.produto_id, nome: i.nome, qtdTotal: 0, vezes: 0 };
      cur.qtdTotal += i.quantidade;
      if (!vistos.has(key)) {
        vistos.add(key);
        cur.vezes += 1;
      }
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.vezes - a.vezes || b.qtdTotal - a.qtdTotal);
}

/**
 * Sugestões por co-ocorrência real: para os itens do carrinho atual,
 * encontra produtos que aparecem juntos nos mesmos pedidos (todos os clientes).
 * Retorna até `limite` ids com escore. Puramente dados reais.
 */
export function sugestoesPorCoocorrencia(
  itensCarrinho: { produtoId?: string | null | undefined; id: string }[],
  todosItens: PedidoItensRow[],
  excluirIds: Set<string>,
  limite = 4,
): { produto_id: string; escore: number }[] {
  const chaves = new Set(
    itensCarrinho.map((i) => i.produtoId ?? i.id).filter(Boolean) as string[],
  );
  if (chaves.size === 0) return [];
  // pedido_id -> set de produto_ids (só com produto_id)
  const porPedido = new Map<string, Set<string>>();
  for (const i of todosItens) {
    if (!i.produto_id) continue;
    const s = porPedido.get(i.pedido_id) ?? new Set<string>();
    s.add(i.produto_id);
    porPedido.set(i.pedido_id, s);
  }
  const escore = new Map<string, number>();
  for (const set of porPedido.values()) {
    let toca = false;
    for (const k of chaves) if (set.has(k)) { toca = true; break; }
    if (!toca) continue;
    for (const pid of set) {
      if (chaves.has(pid) || excluirIds.has(pid)) continue;
      escore.set(pid, (escore.get(pid) ?? 0) + 1);
    }
  }
  return [...escore.entries()]
    .map(([produto_id, escoreV]) => ({ produto_id, escore: escoreV }))
    .sort((a, b) => b.escore - a.escore)
    .slice(0, limite);
}

/** Agrupa pedidos de entrega por bairro (rotas simples). */
export function agruparPorBairro(pedidos: Pick<PedidoBasico, "bairro" | "id">[]): { bairro: string; qtd: number; ids: string[] }[] {
  const map = new Map<string, string[]>();
  for (const p of pedidos) {
    const b = (p.bairro ?? "").trim() || "Sem bairro";
    const arr = map.get(b) ?? [];
    arr.push(p.id);
    map.set(b, arr);
  }
  return [...map.entries()]
    .map(([bairro, ids]) => ({ bairro, qtd: ids.length, ids }))
    .sort((a, b) => b.qtd - a.qtd);
}

/** Queda de produto: compara qtd últimos 30d vs 30d anteriores. Retorna variação %. */
export function variacaoQueda(qtdRecente: number, qtdAnterior: number): number | null {
  if (qtdAnterior <= 0) return null;
  return ((qtdRecente - qtdAnterior) / qtdAnterior) * 100;
}

/** Média histórica por dia da semana (0=dom..6=sab) para previsão de produção. */
export function mediaPorDiaSemana(
  itens: { nome: string; quantidade: number; created_at: string }[],
): Map<number, Map<string, number>> {
  const porDia = new Map<number, Map<string, number>>();
  const contagem = new Map<number, Set<string>>();
  for (const i of itens) {
    const d = new Date(i.created_at);
    if (Number.isNaN(+d)) continue;
    const dow = d.getDay();
    const diaKey = d.toISOString().slice(0, 10);
    if (!contagem.get(dow)?.has(diaKey)) {
      let s = contagem.get(dow);
      if (!s) { s = new Set(); contagem.set(dow, s); }
      s.add(diaKey);
    }
    const m = porDia.get(dow) ?? new Map<string, number>();
    m.set(i.nome, (m.get(i.nome) ?? 0) + i.quantidade);
    porDia.set(dow, m);
  }
  // converte soma em média por dia ocorrido
  const medias = new Map<number, Map<string, number>>();
  for (const [dow, m] of porDia) {
    const n = Math.max(1, contagem.get(dow)?.size ?? 1);
    const mm = new Map<string, number>();
    for (const [nome, soma] of m) mm.set(nome, Math.round(soma / n));
    medias.set(dow, mm);
  }
  return medias;
}

/** Hook: itens de todos os pedidos (amostra limitada) p/ co-ocorrência e histórico. */
export function useTodosItens(habilitado: boolean) {
  return useQuery({
    queryKey: ["intel-todos-itens"],
    enabled: habilitado,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PedidoItensRow[]> => {
      const { data, error } = await supabase
        .from("pedido_itens")
        .select("pedido_id, produto_id, nome, preco_unitario, quantidade")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as PedidoItensRow[];
    },
  });
}

/** Registra evento de funil do carrinho (best-effort). */
export async function registrarEventoCarrinho(input: {
  userId?: string | null;
  telefone?: string;
  etapa: string;
  itens: { nome: string; quantidade: number; preco: number }[];
  subtotal: number;
}) {
  try {
    await supabase.from("carrinho_eventos").insert({
      user_id: input.userId ?? null,
      telefone: input.telefone ?? "",
      etapa: input.etapa,
      itens: input.itens,
      subtotal: input.subtotal,
    });
  } catch {
    /* tabela 0004 ainda não aplicada */
  }
}

export function telefoneWhats(texto: string): string {
  return texto;
}

/** Monta link wa.me reutilizando regra existente (sem nova integração). */
export function montarWhatsApp(telefone: string, texto: string): string {
  const digits = String(telefone ?? "").replace(/\D/g, "");
  const numero = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export { normalizarTelefone };
