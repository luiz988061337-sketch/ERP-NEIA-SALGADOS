import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-steps";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, dataHora, hora, mensagemStatus, type OrderStatus, type ProdStatus } from "@/lib/format";
import { mediaPorDiaSemana } from "@/lib/inteligencia";
import { tempoFrituraPedido, filtrarNovos, type AlertaSonoro } from "@/lib/cozinha";
import {
  calcularProducao,
  classificarProcesso,
  estadoPrazoProducao,
  entradaJanelaProducao,
  inicioRecomendadoProducao,
  limiteImediatoProducao,
  ordenarFilaProducao,
  type EntradaFilaProducao,
  formatarMinutosProducao,
  NIVEL_META_PRODUCAO,
  MOTOR_PRODUCAO_CONFIG,
  type CalculoProducao,
} from "@/lib/motor-producao";
import { impressaoDireta, fichaDireta } from "@/lib/impressao";
import { avisarStatus } from "@/lib/push";
import { useRoles, useSession } from "@/lib/session";

export const Route = createFileRoute("/producao")({
  head: () => ({
    meta: [
      { title: "Painel de Preparo — Néia Salgados" },
      { name: "description", content: "Fila de pedidos para preparo na cozinha." },
      { property: "og:title", content: "Painel de Preparo — Néia Salgados" },
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
  // Snapshot de status p/ detectar TRANSIÇÃO real para pronto (1 bip por pedido).
  const statusAnteriores = useRef(new Map<string, string>());
  // Relógio central do motor (§26): um único timer de 30s; cards/alertas derivam dele.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/producao" }, replace: true });
  }, [loading, user, navigate]);

  const autorizado = roles?.includes("producao") || roles?.includes("admin");

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ["fila-producao"],
    enabled: !!autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("pedidos")
          .select("*, pedido_itens(*, produtos(tempo_fritura_s, categoria_id))")
          .in("status", ["recebido", "em_producao", "pronto"])
          .order("created_at");
        if (error) throw error;
        return data ?? [];
      } catch {
        const { data, error } = await supabase
          .from("pedidos")
          .select("*, pedido_itens(*)")
          .in("status", ["recebido", "em_producao", "pronto"])
          .order("created_at");
        if (error) throw error;
        return data ?? [];
      }
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

  const produzindo = (pedidos ?? []).filter((p: any) => p.status === "em_producao").length;
  const prontos = (pedidos ?? []).filter((p: any) => p.status === "pronto").length;

  // Categorias p/ classificar itens em processos (fritura/pastel/assado).
  // Falha aqui não quebra a fila: cai para classificação por nome.
  const { data: categorias } = useQuery({
    queryKey: ["categorias-slug"],
    enabled: !!autorizado,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("categorias").select("id, slug");
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });
  const slugPorCategoria = useMemo(
    () => new Map(((categorias ?? []) as any[]).map((c: any) => [c.id, c.slug])),
    [categorias],
  );

  // Motor: um cálculo por pedido (memoizado; recalcula ao chegar pedido/mudar status).
  const calculos = useMemo(() => {
    const map = new Map<string, CalculoProducao>();
    for (const p of ((pedidos ?? []) as any[])) {
      const itens = ((p as any).pedido_itens ?? []).map((i: any) => ({
        nome: String(i.nome ?? ""),
        quantidade: Number(i.quantidade ?? 0),
        categoriaSlug:
          (i.produtos?.categoria_id != null
            ? (slugPorCategoria.get(i.produtos.categoria_id) as string | undefined)
            : null) ?? null,
      }));
      map.set(p.id, calcularProducao(itens));
    }
    return map;
  }, [pedidos, slugPorCategoria]);
  function calcDe(p: any): CalculoProducao | undefined {
    return calculos.get(p.id);
  }
  function estadoDe(p: any) {
    const calc = calcDe(p);
    return estadoPrazoProducao(
      {
        status: p.status,
        recebidoEm: p.agendado_para ? null : (p.created_at ?? null),
        solicitadoPara: p.agendado_para ?? null,
      },
      calc?.tecnicoMin ?? null,
      agora,
    );
  }
  // Agendado fora da janela de 1h30 não ocupa NOVOS (§10).
  function naJanela(p: any): boolean {
    if (!p.agendado_para) return true;
    try {
      return entradaJanelaProducao(p.agendado_para).getTime() <= agora.getTime();
    } catch {
      return true;
    }
  }
  // Ordenação da fila (motor): gravidade > instante de preparo > created_at > id.
  type LinhaFilaProducao = EntradaFilaProducao & { pedido: any };
  function ordenarListaProducao(lista: any[]): any[] {
    const entradas: LinhaFilaProducao[] = lista.map((p: any) => ({
      id: String(p.id),
      status: String(p.status),
      created_at: (p.created_at ?? null) as string | null,
      agendado_para: (p.agendado_para ?? null) as string | null,
      tecnicoMin: (calcDe(p)?.tecnicoMin ?? null) as number | null,
      pedido: p,
    }));
    return ordenarFilaProducao(entradas, agora).map((e) => e.pedido);
  }

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

  const aguardandoLista = ordenarListaProducao(pedidosValidos.filter((p: any) => p.status === "recebido" && naJanela(p)));
  const proximosLista = ordenarListaProducao(pedidosValidos.filter((p: any) => p.status === "recebido" && !naJanela(p)));
  const preparoLista = ordenarListaProducao(pedidosValidos.filter((p: any) => p.status === "em_producao"));
  const prontosEntrega = pedidosValidos.filter((p: any) => p.status === "pronto" && p.tipo_entrega !== "retirada");
  const prontosRetirada = pedidosValidos.filter((p: any) => p.status === "pronto" && p.tipo_entrega === "retirada");
  // Prioridade no topo (mobile primeiro): risco + atraso de NOVOS e PREPARANDO.
  const prioridadeLista = ordenarListaProducao([...aguardandoLista, ...preparoLista].filter((p: any) => {
    const n = estadoDe(p).nivel;
    return n === "risco" || n === "atrasado";
  }));
  const atrasadosQtd = prioridadeLista.length;
  const fritEmUso = Math.min(
    MOTOR_PRODUCAO_CONFIG.maxFritadeiras,
    preparoLista.reduce((s: number, p: any) => s + (calcDe(p)?.fritadeiras ?? 0), 0),
  );
  const fornoEmUso = preparoLista.some((p: any) => (calcDe(p)?.qtdAssados ?? 0) > 0);

  const EMOJI_PROCESSO: Record<string, string> = { fritura: "🔥", pastel: "🥟", assado: "🥐" };
  function bordaPorNivel(nivel: string, agendadoFuturo: boolean): string {
    if (nivel === "atrasado") return "border-l-4 border-l-red-500";
    if (nivel === "risco") return "border-l-4 border-l-orange-500";
    if (nivel === "atencao") return "border-l-4 border-l-yellow-400";
    if (agendadoFuturo) return "border-l-4 border-l-sky-500";
    return "";
  }

  function cardPedido(p: any) {
    const calc = calcDe(p);
    const estado = estadoDe(p);
    const meta = NIVEL_META_PRODUCAO[estado.nivel];
    const agendadoFuturo = Boolean(p.agendado_para) && !naJanela(p);
    return (
      <article key={p.id} className={`rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] ${bordaPorNivel(estado.nivel, agendadoFuturo)}`}>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">#{p.numero}</h2>
          <StatusBadge status={p.status} />
          <span className="text-base" title={meta.rotulo}>{meta.cor}</span>
          <span className="ml-auto text-xs text-muted-foreground">{hora(p.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.cliente_nome}
          {p.tipo_entrega === "retirada" ? " • 🏪 RETIRADA" : " • 🚚 ENTREGA"}
          {p.agendado_para ? ` • 📅 ${new Date(p.agendado_para).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
        <ul className="mt-3 space-y-0.5 text-sm">
          {(p.pedido_itens ?? []).map((i: any) => {
            const cls = classificarProcesso({
              nome: String(i.nome ?? ""),
              categoriaSlug: i.produtos?.categoria_id != null ? (slugPorCategoria.get(i.produtos.categoria_id) as string | undefined) ?? null : null,
            });
            const emoji = EMOJI_PROCESSO[cls] ?? "•";
            return (
              <li key={i.id}>
                <span className="font-bold text-amber-600 dark:text-amber-300">{emoji} {i.nome}</span>
                {" — "}
                <span className="font-semibold">{i.quantidade}x</span>
              </li>
            );
          })}
        </ul>
        {p.observacoes ? (
          <p className="mt-2 rounded bg-muted p-2 text-xs">Obs.: {p.observacoes}</p>
        ) : null}
        <p className="mt-2 text-sm font-display text-primary">{brl(p.total)}</p>
        {calc?.tecnicoMin != null ? (
          <div className="mt-1 space-y-0.5 text-xs">
            <p className="text-muted-foreground">
              👤 Prazo cliente:{" "}
              {p.agendado_para ? (
                <>solicitado {hora(p.agendado_para)}</>
              ) : (
                <>até {p.created_at ? hora(limiteImediatoProducao(p.created_at).toISOString()) : "--:--"} (40–60 min)</>
              )}
            </p>
            <p className="text-muted-foreground">
              🎯 Técnico interno: <strong className="text-foreground">{calc.tecnicoMin} min</strong>
              {calc.qtdFritos > 0 ? ` (🔥 ${calc.minFritosEfetivo} · ${calc.fritadeiras}/3${calc.paralelismoEstimado ? " ⚠️est." : ""})` : ""}
              {calc.qtdPasteis > 0 ? ` (🥟 ${calc.minPasteis}${calc.pastelRefAValidar ? " ⚠️ref." : ""})` : ""}
              {calc.qtdAssados > 0 ? " (🥐 10 no MAX)" : ""}
            </p>
            <p className="text-muted-foreground">
              {p.agendado_para ? (
                <>▶️ Início recomendado: {hora(inicioRecomendadoProducao(p.agendado_para, calc.tecnicoMin).toISOString())}</>
              ) : (
                <>⏱️ Resta {formatarMinutosProducao(estado.restanteMin)}</>
              )}
              {p.tipo_entrega !== "retirada" && p.endereco ? ` • ${p.endereco}` : ""}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs font-semibold text-amber-600">
            ⚠️ Sem tempo estimado ({calc?.motivoSemTempo === "vazio" ? "pedido sem itens" : "sem processo reconhecido — validar cadastro"}).
          </p>
        )}
        {(calc?.naoReconhecidos?.length ?? 0) > 0 ? (
          <p className="mt-1 text-xs text-amber-600">
            ⚠️ Não reconhecido: {(calc?.naoReconhecidos ?? []).map((n) => `${n.nome} (${n.quantidade})`).join(", ")}
          </p>
        ) : null}
        {estado.nivel !== "normal" && p.status !== "pronto" ? (
          <p className="mt-2 rounded bg-muted p-2 text-xs font-bold">
            {estado.nivel === "hora-preparar" ? `🔔 HORA DE PREPARAR — estimado ${calc?.tecnicoMin ?? "?"} min. INICIAR PREPARO.` : null}
            {estado.nivel === "atencao" ? `⚠️ ATENÇÃO — faltam ${formatarMinutosProducao(estado.restanteMin)} para o limite.` : null}
            {estado.nivel === "risco" ? `🚨 RISCO DE ATRASO — restante ${formatarMinutosProducao(estado.restanteMin)}, estimado ${calc?.tecnicoMin ?? "?"} min.` : null}
            {estado.nivel === "atrasado" ? `🔴 ATRASADO ${formatarMinutosProducao(estado.restanteMin)}.` : null}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {p.status === "recebido" ? (
            <Button size="sm" onClick={() => mudarStatus(p, "em_producao", "produzindo")}>
              Iniciar preparo
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
          <Button size="sm" variant="ghost" onClick={() => imprimirDireto(p)}>
            <Printer className="mr-1 size-4" /> Imprimir direto
          </Button>
        </div>
      </article>
    );
  }

  function secao(titulo: string, lista: any[]) {
    if (lista.length === 0) return null;
    return (
      <section className="mt-6">
        <h2 className="font-display text-xl">{titulo} ({lista.length})</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {lista.map((p: any) => cardPedido(p))}
        </div>
      </section>
    );
  }

  async function mudarStatus(pedido: any, status: OrderStatus, producao_status: ProdStatus) {
    const { error } = await supabase.from("pedidos").update({ status, producao_status }).eq("id", pedido.id);
    if (error) {
      console.error("Erro ao atualizar status do pedido:", error);
      toast.error(error.message || "Não foi possível atualizar o pedido.");
      return;
    }
    void avisarStatus(supabase, pedido, status, mensagemStatus(status, pedido.cliente_nome, pedido.numero));
    try {
      await supabase.from("pedido_status_historico").insert({ pedido_id: pedido.id, de_status: pedido.status, para_status: status });
    } catch { /* sem migration — segue */ }
    if (status === "em_producao") {
      try {
        const itens = (pedido.pedido_itens ?? []).map((i: any) => ({ quantidade: Number(i.quantidade ?? 0), seg50: i.produtos?.tempo_fritura_s ?? null }));
        const totalUn = itens.reduce((s: number, i: { quantidade: number }) => s + i.quantidade, 0);
        await supabase.from("fila_fritura").insert({
          pedido_id: pedido.id, quantidade: totalUn, tempo_est_s: tempoFrituraPedido(itens), status: "aguardando",
        });
      } catch { /* sem migration — segue */ }
    }
    // Fase A: evita spam de cupom mínimo a cada troca de status.
    // O cupom completo já entra na fila no checkout; aqui só reimprime
    // automaticamente ao entrar em produção ou ficar pronto (use os
    // botões manuais para os demais casos).
    if (status === "em_producao" || status === "pronto") {
      try {
        await supabase.from("fila_impressao").insert({
          trabalho_uuid: `${pedido.id}:${status}:${Date.now()}`,
          pedido_id: pedido.id, tipo: "pedido",
          payload: `NEIA SALGADOS\nPEDIDO #${pedido.numero}\nSTATUS ${status}`,
          impressora: "Tanca TP-550",
        });
      } catch { /* fila opcional */ }
    }
    queryClient.invalidateQueries({ queryKey: ["fila-producao"] });
  }

  async function imprimirDireto(pedido: any) {
    try {
      await impressaoDireta(supabase, pedido);
      toast.success(`Pedido nº ${pedido.numero} enviado para a Tanca.`);
    } catch {
      toast.error("Não entrou na fila. Confira em /impressao.");
    }
  }

  async function imprimirFicha() {
    try {
      await fichaDireta(supabase, consolidado.map((c) => ({ nome: c.nome, qtd: c.total })));
      toast.success("Ficha enviada para a Tanca.");
    } catch {
      toast.error("Não entrou na fila. Confira em /impressao.");
    }
  }

  function bip(freq = 880) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.4);
    } catch { /* sem áudio — mantém alerta visual */ }
  }

  // Alertas sonoros (sem repetir): novo + hora de preparar + risco + atraso + pronto.
  // Reutiliza bip()/SONS_COZINHA/filtrarNovos; reavalia a cada tick do relógio.
  // O snapshot atualiza em toda avaliação (mesmo com som desligado): o bip de
  // pronto dispara só para transição observada ao vivo — nunca retroativo,
  // nunca repetido (dedup `pronto:<id>` + snapshot).
  useEffect(() => {
    const vistos = statusAnteriores.current;
    const primeiraLeitura = vistos.size === 0;
    const transicoesPronto = new Map<string, string>();
    for (const p of ((pedidos ?? []) as any[])) {
      const antes = vistos.get(p.id);
      if (!primeiraLeitura && antes !== undefined && antes !== "pronto" && p.status === "pronto") {
        transicoesPronto.set(p.id, p.created_at);
      }
      vistos.set(p.id, p.status);
    }
    if (!sonsAtivos || !pedidos) return;
    const eventos: AlertaSonoro[] = [];
    for (const p of (pedidos ?? []) as any[]) {
      if (p.status === "recebido") {
        eventos.push({ id: `novo:${p.id}`, tipo: "novo_pedido", em: p.created_at });
      }
      if (p.status === "recebido" || p.status === "em_producao") {
        const nivel = estadoDe(p).nivel;
        if (nivel === "hora-preparar") {
          eventos.push({ id: `hora:${p.id}`, tipo: "inicio_preparacao", em: p.created_at });
        } else if (nivel === "risco") {
          eventos.push({ id: `risco:${p.id}`, tipo: "pedido_urgente", em: p.created_at });
        } else if (nivel === "atrasado") {
          eventos.push({ id: `atraso:${p.id}`, tipo: "pedido_atrasado", em: p.created_at });
        }
      }
    }
    for (const [id, em] of transicoesPronto) {
      eventos.push({ id: `pronto:${id}`, tipo: "pedido_pronto", em });
    }
    const novos = filtrarNovos(eventos, tocados);
    if (novos.length > 0) {
      const FREQ: Record<string, number> = {
        novo_pedido: 880,
        inicio_preparacao: 660,
        pedido_urgente: 440,
        pedido_atrasado: 330,
        pedido_pronto: 880,
      };
      const tipos = new Set(novos.map((n) => n.tipo));
      if (tipos.has("pedido_atrasado")) bip(FREQ["pedido_atrasado"] ?? 880);
      else if (tipos.has("pedido_urgente")) bip(FREQ["pedido_urgente"] ?? 880);
      else if (tipos.has("pedido_pronto") || tipos.has("novo_pedido")) bip();
      else if (tipos.has("inicio_preparacao")) bip(FREQ["inicio_preparacao"] ?? 880);
      else bip();
      setTocados((s) => new Set([...s, ...novos.map((n) => n.id)]));
      const qtdNovos = novos.filter((n) => n.tipo === "novo_pedido").length;
      const qtdRisco = novos.filter((n) => n.tipo === "pedido_urgente" || n.tipo === "pedido_atrasado").length;
      const qtdProntos = novos.filter((n) => n.tipo === "pedido_pronto").length;
      if (qtdNovos > 0) toast.warning(`${qtdNovos} novo(s) pedido(s)!`);
      if (qtdRisco > 0) toast.error(`${qtdRisco} pedido(s) em risco/atraso!`);
      if (qtdProntos > 0) toast.success(`${qtdProntos} pedido(s) pronto(s)! 🔊`);
      if (qtdNovos === 0 && qtdRisco === 0 && qtdProntos === 0) toast.warning("Hora de preparar pedido(s)!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((pedidos ?? []).map((p: any) => p.id + p.status)), sonsAtivos, Math.floor(agora.getTime() / 30000)]);

  if (roles && !autorizado) {
    return <p className="p-10 text-center text-muted-foreground">Você não tem acesso ao painel de Preparo.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-3xl">Painel de Preparo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLoading
          ? "Carregando fila..."
          : `${pedidos?.length ?? 0} na fila • ${aguardandoLista.length} novos • ${produzindo} em preparo • ${prontos} prontos • ${atrasadosQtd} em risco/atraso • ${proximosLista.length} agendados`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        🔥 Fritadeiras em uso: {fritEmUso}/{MOTOR_PRODUCAO_CONFIG.maxFritadeiras}
        {` • 🥐 Forno: ${fornoEmUso ? "em uso" : "livre"}`}
        {" • O sabor que faz a diferença."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="space-y-1"><Label htmlFor="dia-producao">Data de referência</Label><Input id="dia-producao" type="date" value={diaFiltro} onChange={(e) => setDiaFiltro(e.target.value)} /></div>
        <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={incluirProntos} onChange={(e) => setIncluirProntos(e.target.checked)} /> Incluir prontos</label>
        <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={sonsAtivos} onChange={(e) => { setSonsAtivos(e.target.checked); if (e.target.checked) bip(); }} /> Ativar sons</label>
        <Button size="sm" variant="outline" onClick={() => bip()}>Testar som</Button>
        <p className="w-full text-xs text-muted-foreground">Som + impressão têm eventos independentes. Sem repetir após reload.</p>
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-4" aria-label="Consolidação">
        <h2 className="font-display text-xl">Salgados consolidados — {totalGeral} un no total</h2>
        {consolidado.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nada a preparar.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {consolidado.map((c) => (
              <li key={c.nome} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.nome}</span>
                  <span className="ml-auto font-display text-primary">{c.total} un</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">Pendente: {c.pendente} • Em preparo: {c.emProducao} • Pronto: {c.pronto}</p>
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
        <Button size="sm" variant="outline" className="mt-3" onClick={imprimirFicha}><Printer className="mr-1 size-4" /> Imprimir ficha direto</Button>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4" aria-label="Previsão">
        <h2 className="font-display text-xl">Previsão de preparo (estimativa)</h2>
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

      {secao("🚨 Prioridade (risco/atraso)", prioridadeLista)}
      {secao("🆕 PRÓXIMOS PEDIDOS", aguardandoLista)}
      {secao("👨‍🍳 PREPARANDO", preparoLista)}
      {secao("🚚 Prontos para entrega (aguardando motoboy)", prontosEntrega)}
      {secao("🏪 Prontos para retirada (aguardando cliente)", prontosRetirada)}
      {secao("📅 PRÓXIMOS AGENDADOS", proximosLista)}

      {pedidosValidos.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">Nenhum pedido na fila para este filtro.</p>
      ) : null}
    </div>
  );
}
