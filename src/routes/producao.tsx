import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-steps";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, dataHora, hora, mensagemStatus, whatsappLink, type OrderStatus, type ProdStatus } from "@/lib/format";
import { mediaPorDiaSemana } from "@/lib/inteligencia";
import { tempoFritura, formatarTempo, filtrarNovos, type AlertaSonoro } from "@/lib/cozinha";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Painel de produção — Néia Salgados" },
      { name: "description", content: "Fila de pedidos para preparo na cozinha." },
      { property: "og:title", content: "Painel de produção — Néia Salgados" },
      { property: "og:description", content: "Fila de pedidos para preparo na cozinha." },
    ],
  }),
  component: Producao,
});

function Producao() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { data: roles } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const [sonsAtivos, setSonsAtivos] = useState(false);
  const [tocados, setTocados] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/producao" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("producao") || roles?.includes("admin");

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ["fila-producao"],
    enabled: !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*, pedido_itens(*)")
        .in("status", ["recebido", "em_producao", "pronto"])
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!autorizado) return;
    const canal = supabase
      .channel("producao-fila")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [autorizado, queryClient]);

  const aguardando = (pedidos ?? []).filter((p: any) => p.status === "recebido").length;
  const produzindo = (pedidos ?? []).filter((p: any) => p.status === "em_producao").length;
  const prontos = (pedidos ?? []).filter((p: any) => p.status === "pronto").length;

  const [diaFiltro, setDiaFiltro] = useState(() => new Date().toISOString().slice(0, 10));
  const [incluirProntos, setIncluirProntos] = useState(false);
  const [dowPrevisao, setDowPrevisao] = useState<number>(6);

  const pedidosValidos = useMemo(() => {
    const base = (pedidos ?? []).filter((p: any) => (incluirProntos ? true : p.status !== "pronto") && p.status !== "cancelado");
    // Agendados aparecem no dia agendado; sem agendamento entram como "para agora".
    return base.filter((p: any) => {
      if (!p.agendado_para) return true;
      return String(p.agendado_para).slice(0, 10) === diaFiltro;
    });
  }, [pedidos, incluirProntos, diaFiltro]);

  const consolidado = useMemo(() => {
    type Linha = { nome: string; total: number; pendente: number; emProducao: number; pronto: number; pedidos: { numero: number; qtd: number; status: string; cliente: string; agendado: string | null }[] };
    const map = new Map<string, Linha>();
    for (const p of pedidosValidos) {
      for (const i of (p as any).pedido_itens ?? []) {
        const cur: Linha = map.get(i.nome) ?? { nome: i.nome, total: 0, pendente: 0, emProducao: 0, pronto: 0, pedidos: [] };
        cur.total += i.quantidade;
        if (p.status === "recebido") cur.pendente += i.quantidade;
        else if (p.status === "em_producao") cur.emProducao += i.quantidade;
        else if (p.status === "pronto") cur.pronto += i.quantidade;
        cur.pedidos.push({ numero: p.numero, qtd: i.quantidade, status: p.status, cliente: p.cliente_nome, agendado: p.agendado_para ?? null });
        map.set(i.nome, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [pedidosValidos]);

  const totalGeral = consolidado.reduce((a, c) => a + c.total, 0);

  // Histórico p/ previsão (pedidos válidos 90d + itens)
  const { data: histPedidos } = useQuery({
    queryKey: ["producao-historico"],
    enabled: !!autorizado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const corte = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data, error } = await supabase.from("pedidos").select("id, created_at, status").gte("created_at", corte).neq("status", "cancelado").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: histItens } = useQuery({
    queryKey: ["producao-historico-itens", (histPedidos ?? []).length],
    enabled: !!autorizado && (histPedidos ?? []).length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const ids = (histPedidos ?? []).map((p: any) => p.id);
      const { data, error } = await supabase.from("pedido_itens").select("pedido_id, nome, quantidade").in("pedido_id", ids).limit(8000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const previsao = useMemo(() => {
    const datas = new Map(((histPedidos ?? []) as any[]).map((p) => [p.id, p.created_at]));
    const itens = ((histItens ?? []) as any[]).map((i) => ({ nome: i.nome, quantidade: i.quantidade, created_at: datas.get(i.pedido_id) ?? "" })).filter((i) => i.created_at);
    const medias = mediaPorDiaSemana(itens);
    return medias.get(dowPrevisao) ?? new Map<string, number>();
  }, [histPedidos, histItens, dowPrevisao]);
  const nomesPrevisao = useMemo(() => {
    const nomes = new Set<string>([...previsao.keys()]);
    for (const c of consolidado) nomes.add(c.nome);
    return [...nomes].slice(0, 12);
  }, [previsao, consolidado]);
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  async function mudarStatus(pedido: any, status: OrderStatus, producao_status: ProdStatus) {
    const { error } = await supabase.from("pedidos").update({ status, producao_status }).eq("id", pedido.id);
    if (error) {
      toast.error("Não foi possível atualizar o pedido.");
      return;
    }
    try {
      await supabase.from("pedido_status_historico").insert({ pedido_id: pedido.id, de_status: pedido.status, para_status: status });
    } catch { /* sem migration — segue */ }
    try {
      const totalUn = (pedido.pedido_itens ?? []).reduce((s: number, i: any) => s + Number(i.quantidade ?? 0), 0);
      await supabase.from("fila_fritura").insert({
        pedido_id: pedido.id, quantidade: totalUn, tempo_est_s: tempoFritura(totalUn), status: status === "pronto" ? "pronto" : "aguardando",
      });
    } catch { /* sem migration — segue */ }
    try {
      await supabase.from("fila_impressao").insert({
        trabalho_uuid: `${pedido.id}:${status}:${Date.now()}`,
        pedido_id: pedido.id, tipo: "pedido",
        payload: `NEIA SALGADOS\nPEDIDO #${pedido.numero}\nSTATUS ${status}`,
        impressora: "Tanca TP-550",
      });
    } catch { /* fila opcional */ }
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
    window.open(
      whatsappLink(pedido.telefone, mensagemStatus(status, pedido.cliente_nome, pedido.numero)),
      "_blank",
      "noopener",
    );
  }

  function bip() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.4);
    } catch { /* sem áudio — mantém alerta visual */ }
  }

  // Alerta sonoro: novo pedido na fila (sem repetir após reload)
  useEffect(() => {
    if (!sonsAtivos || !pedidos) return;
    const eventos: AlertaSonoro[] = pedidos
      .filter((p: any) => p.status === "recebido")
      .map((p: any) => ({ id: `novo:${p.id}`, tipo: "novo_pedido" as const, em: p.created_at }));
    const novos = filtrarNovos(eventos, tocados);
    if (novos.length > 0) {
      bip();
      setTocados((s) => new Set([...s, ...novos.map((n) => n.id)]));
      toast.warning(`${novos.length} novo(s) pedido(s)!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((pedidos ?? []).map((p: any) => p.id + p.status)), sonsAtivos]);

  if (roles && !autorizado) {
    return <p className="p-10 text-center text-muted-foreground">Você não tem acesso ao painel de produção.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">Painel de produção</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLoading
          ? "Carregando fila..."
          : `${pedidos?.length ?? 0} na fila • ${aguardando} aguardando • ${produzindo} produzindo • ${prontos} prontos`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="space-y-1"><Label htmlFor="dia-producao">Data de referência</Label><Input id="dia-producao" type="date" value={diaFiltro} onChange={(e) => setDiaFiltro(e.target.value)} /></div>
        <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={incluirProntos} onChange={(e) => setIncluirProntos(e.target.checked)} /> Incluir prontos</label>
        <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={sonsAtivos} onChange={(e) => { setSonsAtivos(e.target.checked); if (e.target.checked) bip(); }} /> Ativar sons</label>
        <Button size="sm" variant="outline" onClick={bip}>Testar som</Button>
        <p className="w-full text-xs text-muted-foreground">Som + impressão têm eventos independentes. Sem repetir após reload.</p>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-4" aria-label="Consolidação">
        <h2 className="font-display text-xl">Produção consolidada — {totalGeral} un no total</h2>
        {consolidado.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nada a produzir.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {consolidado.map((c) => (
              <li key={c.nome} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.nome}</span>
                  <span className="ml-auto font-display text-primary">{c.total} un</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Pendente: {c.pendente} • Em produção: {c.emProducao} • Pronto: {c.pronto}</p>
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground underline">Ver pedidos ({c.pedidos.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {c.pedidos.map((pp, idx) => (
                      <li key={idx}>Pedido #{pp.numero} — {pp.cliente} — {pp.qtd}un — {pp.status}{pp.agendado ? ` — agendado ${new Date(pp.agendado).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" className="mt-3" onClick={() => window.print()}><Printer className="mr-1 size-4" /> Imprimir ficha</Button>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4" aria-label="Previsão">
        <h2 className="font-display text-xl">Previsão de produção (estimativa)</h2>
        <p className="text-xs text-muted-foreground">Média histórica do dia da semana (90 dias). Estimativa ≠ pedido real.</p>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {DOW.map((d, i) => (
            <button key={d} type="button" onClick={() => setDowPrevisao(i)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${dowPrevisao === i ? "bg-primary text-primary-foreground" : "bg-card"}`}>{d}</button>
          ))}
        </div>
        {nomesPrevisao.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Sem histórico para {DOW[dowPrevisao]}.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {nomesPrevisao.map((nome) => {
              const conf = consolidado.find((c) => c.nome === nome)?.total ?? 0;
              const est = previsao.get(nome) ?? 0;
              return (
                <li key={nome} className="flex justify-between gap-2">
                  <span>{nome}</span>
                  <span className="text-muted-foreground">Confirmado: <strong className="text-foreground">{conf}</strong> • Estimado: +{est} • Planejado: <strong className="text-primary">{conf + est}</strong></span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isLoading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Carregando fila">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-4">
              <div className="h-5 w-1/3 rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
              <div className="mt-3 h-3 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {pedidosValidos.map((p: any) => (
          <article key={p.id} className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg">Nº {p.numero}</h2>
              <StatusBadge status={p.status} />
              <span className="ml-auto text-xs text-muted-foreground">{hora(p.created_at)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {p.cliente_nome} • {p.bairro}
              {p.agendado_para ? ` • 📅 ${new Date(p.agendado_para).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
              {p.tipo_evento ? ` • ${p.tipo_evento}` : ""}
            </p>
            <ul className="mt-3 space-y-0.5 text-sm">
              {(p.pedido_itens ?? []).map((i: any) => (
                <li key={i.id}>
                  <span className="font-semibold">{i.quantidade}x</span> {i.nome}
                </li>
              ))}
            </ul>
            {p.observacoes ? (
              <p className="mt-2 rounded bg-muted p-2 text-xs">Obs.: {p.observacoes}</p>
            ) : null}
            <p className="mt-2 text-sm font-display text-primary">{brl(p.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fritura est: {formatarTempo(tempoFritura((p.pedido_itens ?? []).reduce((s: number, i: any) => s + Number(i.quantidade ?? 0), 0)))} • Próximo lote: {(p.pedido_itens ?? [])[0]?.nome ?? "—"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {p.status === "recebido" ? (
                <Button size="sm" onClick={() => mudarStatus(p, "em_producao", "produzindo")}>
                  Iniciar produção
                </Button>
              ) : null}
              {p.status === "em_producao" ? (
                <Button size="sm" onClick={() => mudarStatus(p, "pronto", "finalizado")}>
                  Marcar como pronto
                </Button>
              ) : null}
              {p.status === "pronto" ? (
                <Button size="sm" variant="outline" onClick={() => mudarStatus(p, "aguardando_motoboy", "finalizado")}>
                  Chamar motoboy
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                <Printer className="mr-1 size-4" /> Imprimir
              </Button>
            </div>
          </article>
        ))}
      </div>

      {pedidosValidos.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">Nenhum pedido na fila para este filtro.</p>
      ) : null}
    </div>
  );
}
