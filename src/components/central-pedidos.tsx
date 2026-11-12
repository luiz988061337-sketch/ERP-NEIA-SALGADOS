import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Bike,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Eye,
  Package,
  Search,
  ShoppingCart,
  Store,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, hora } from "@/lib/format";
import {
  CHAVE_CONFIG_ALERTA,
  CHAVE_CONHECIDOS,
  CHAVE_RECONHECIDOS,
  CONFIG_ALERTA_PADRAO,
  colunasCentral,
  avisosDaCozinha,
  avisoDoPedido,
  filtrarPedidos,
  formatarMinutos,
  gravarConhecidos,
  gravarReconhecidos,
  lerArmazenamento,
  lerConhecidos,
  lerReconhecidos,
  metricasCentral,
  minutosDesde,
  lerConfig,
  normalizarConfig,
  ordenarPorPrioridade,
  pedidosNaoReconhecidos,
  type AvisoCozinha,
  type ConfigAlerta,
  type PedidoCentral,
} from "@/lib/central-pedidos";
import { CANAIS } from "@/lib/sincronizacao-paineis";
import { elegivelAceiteLocal } from "@/lib/atendente-aceite";

/**
 * Central de Pedidos da Atendente.
 *
 * Três colunas: Em análise (laranja), Em produção (azul) e Pronto para
 * entrega (verde). Todos os dados vêm de `pedidos`/`notificacoes` reais —
 * nenhuma escrita é feita aqui: as transições pertencem às ações canônicas
 * (aceite da atendente, liberação para a cozinha e o fluxo de entrega).
 */

const COLUNAS = [
  { key: "analise", titulo: "Em análise", cor: "#B8862B", icone: ClipboardList },
  { key: "producao", titulo: "Em produção", cor: "#2563EB", icone: ChefHat },
  { key: "pronto", titulo: "Pronto para entrega", cor: "#1E9E63", icone: CheckCircle2 },
] as const;

export function CentralPedidos({
  preview = false,
  pedidosInjetados,
  avisosInjetados,
  onAvisoReconhecido,
}: {
  preview?: boolean;
  pedidosInjetados?: PedidoCentral[];
  avisosInjetados?: AvisoCozinha[];
  onAvisoReconhecido?: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [modalidade, setModalidade] = useState<"todas" | "entrega" | "retirada">("todas");
  const [soAgendados, setSoAgendados] = useState(false);
  const [detalhe, setDetalhe] = useState<PedidoCentral | null>(null);

  /* ---------------------------------------------------------------- */
  /* Dados reais                                                      */
  /* ---------------------------------------------------------------- */
  const hojeISO = new Date().toISOString().slice(0, 10);
  const { data: pedidosHook } = useQuery({
    queryKey: ["central-pedidos", hojeISO],
    enabled: !preview,
    refetchInterval: CANAIS.atendente.pollingMs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(
          "id, numero, cliente_nome, status, tipo_entrega, total, created_at, agendado_para, observacoes, aceito_em_atendente, liberado_em, conferido_em, retirado_em, pagamento_status, forma_pagamento, endereco, bairro, producao_status, pedido_itens(nome, quantidade)",
        )
        .or(`created_at.gte.${hojeISO}T00:00:00,agendado_para.gte.${hojeISO}T00:00:00`)
        .in("status", ["recebido", "em_producao", "pronto"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as PedidoCentral[];
    },
  });

  const { data: avisosHook } = useQuery({
    queryKey: ["central-pedidos-avisos"],
    enabled: !preview,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, tipo, titulo, detalhe, link, lida, created_at")
        .in("tipo", ["pedido_pronto_caixa", "pedido_liberado_retirada"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AvisoCozinha[];
    },
  });

  const pedidos = useMemo(
    () => (preview ? (pedidosInjetados ?? []) : (pedidosHook ?? [])),
    [preview, pedidosInjetados, pedidosHook],
  );
  const avisos = useMemo(
    () => (preview ? (avisosInjetados ?? []) : (avisosHook ?? [])),
    [preview, avisosInjetados, avisosHook],
  );

  /* ---------------------------------------------------------------- */
  /* Alerta sonoro (aprovado: ativo, 75%, 30s, reconhecimento individual) */
  /* ---------------------------------------------------------------- */
  const [config, setConfig] = useState<ConfigAlerta>(CONFIG_ALERTA_PADRAO);
  const [audioLiberado, setAudioLiberado] = useState(false);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const reconhecidosRef = useRef<Set<string>>(new Set());
  const conhecidosRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  // Config e reconhecimento persistidos (recarregar a página não duplica alerta).
  useEffect(() => {
    setConfig(lerConfig(lerArmazenamento(CHAVE_CONFIG_ALERTA)));
    reconhecidosRef.current = lerReconhecidos();
    conhecidosRef.current = lerConhecidos();
  }, []);

  const bip = useCallback(
    (volume: number) => {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (!audioRef.current) audioRef.current = new Ctx();
        const ctx = audioRef.current;
        if (ctx.state === "suspended") void ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        o.start();
        g.gain.setValueAtTime(Math.max(0.0001, volume), ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.stop(ctx.currentTime + 0.4);
        setAudioBloqueado(false);
        setAudioLiberado(true);
      } catch {
        setAudioBloqueado(true);
      }
    },
    [],
  );

  const salvarConfig = useCallback((nova: ConfigAlerta) => {
    const normalizada = normalizarConfig(nova);
    setConfig(normalizada);
    try {
      localStorage.setItem(CHAVE_CONFIG_ALERTA, JSON.stringify(normalizada));
    } catch {
      /* segue */
    }
  }, []);

  // Um único timer: reavalia os pedidos e repete o som enquanto houver
  // pedido não reconhecido. Sem loops aninhados nem sons simultâneos.
  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!config.ativo) return;
    const ms = Math.max(5, config.intervaloSegundos) * 1000;
    timerRef.current = window.setInterval(() => {
      const pendentes = pedidosNaoReconhecidos(
        colunasCentral(pedidos).analise,
        reconhecidosRef.current,
      );
      if (pendentes.length > 0) bip(config.volume);
    }, ms);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [config.ativo, config.intervaloSegundos, config.volume, pedidos, bip]);

  // Reconhecimento individual: o som deixa de ser pedido por aquele pedido.
  const reconhecer = useCallback((id: string) => {
    reconhecidosRef.current.add(id);
    gravarReconhecidos(reconhecidosRef.current);
    toast.success("Alerta reconhecido.");
  }, []);

  // Pedido realmente novo (ID real). Na primeira leitura (reconexão/reload)
  // os pedidos existentes são registrados SEM tocar o som — só IDs que
  // aparecerem depois disparam o alerta. Reconhecimento é individual.
  const primeiraLeituraRef = useRef(true);
  useEffect(() => {
    if (pedidos.length === 0) return;
    const novos = pedidos.filter((p) => !conhecidosRef.current.has(p.id));
    const primeira = primeiraLeituraRef.current;
    for (const p of novos) conhecidosRef.current.add(p.id);
    if (novos.length > 0) gravarConhecidos(conhecidosRef.current);
    if (primeira) {
      primeiraLeituraRef.current = false;
      return;
    }
    if (novos.length > 0 && config.ativo) bip(config.volume);
  }, [pedidos, config.ativo, config.volume, bip]);

  // Reconexão/reload: pedidos já reconhecidos não voltam a tocar.
  const naoReconhecidos = useMemo(
    () => pedidosNaoReconhecidos(colunasCentral(pedidos).analise, reconhecidosRef.current),
    [pedidos],
  );

  /* ---------------------------------------------------------------- */
  /* Colunas, filtros e métricas                                       */
  /* ---------------------------------------------------------------- */
  const filtrados = useMemo(
    () => filtrarPedidos(pedidos, { busca, modalidade, agendados: soAgendados }),
    [pedidos, busca, modalidade, soAgendados],
  );
  const colunas = useMemo(() => colunasCentral(filtrados), [filtrados]);
  const metricas = useMemo(() => metricasCentral(filtrados), [filtrados]);
  const ordenadas = useCallback(
    (lista: PedidoCentral[]) => ordenarPorPrioridade(lista),
    [],
  );

  const abrirDetalhes = (p: PedidoCentral) => setDetalhe(p);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      {/* ---------------- Cabeçalho da Central ---------------- */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-3 shadow-card">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
            <ClipboardList className="size-5 text-[#F2CE6B]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-foreground sm:text-xl">
              Pedidos — Central da Atendente
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Recebimento, conferência e acompanhamento dos pedidos online
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C97C]/55 bg-[#35C97C]/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#35C97C]">
          <span className="size-1.5 rounded-full bg-[#35C97C]" aria-hidden />
          Atendimento online
        </span>
      </header>

      {/* ---------------- Métricas ---------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricaCard
          icone={Bell}
          label="Novos pedidos"
          valor={String(metricas.novos)}
          extra={
            naoReconhecidos.length > 0 ? (
              <span className="rounded-full bg-[#B8862B]/25 px-2 py-0.5 text-[10px] font-bold text-[#F5B301]">
                {naoReconhecidos.length} sem reconhecer
              </span>
            ) : null
          }
        />
        <MetricaCard
          icone={ChefHat}
          label="Em produção"
          valor={String(metricas.emProducao)}
          extra={<span className="text-[11px] font-semibold text-[#35C97C]">na cozinha</span>}
        />
        <MetricaCard
          icone={Package}
          label="Prontos"
          valor={String(metricas.prontos)}
          extra={<span className="text-[11px] font-semibold text-[#35C97C]">para despacho</span>}
        />
        <MetricaCard
          icone={Wallet}
          label="Ticket médio"
          valor={brl(metricas.ticketMedio)}
          extra={<span className="text-[11px] font-semibold text-[#35C97C]">do período</span>}
        />
      </div>

      {/* ---------------- Busca, filtros e alerta sonoro ---------------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#D4A94A] bg-[#121110] p-3 shadow-card">
        <div className="flex min-h-[42px] min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#D4A94A]/45 bg-[#17150F] px-3">
          <Search className="size-4 shrink-0 text-[#C9A24B]" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pedido ou cliente…"
            aria-label="Buscar pedido ou cliente"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-[#8A8278]"
          />
        </div>
        <FiltroBtn
          ativo={modalidade === "todas"}
          onClick={() => setModalidade("todas")}
          label="Todos"
        />
        <FiltroBtn
          ativo={modalidade === "entrega"}
          onClick={() => setModalidade("entrega")}
          label="Entrega"
          icone={Truck}
        />
        <FiltroBtn
          ativo={modalidade === "retirada"}
          onClick={() => setModalidade("retirada")}
          label="Retirada"
          icone={Store}
        />
        <FiltroBtn
          ativo={soAgendados}
          onClick={() => setSoAgendados((v) => !v)}
          label="Agendados"
          icone={CalendarClock}
        />
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={config.ativo}
              onChange={(e) => salvarConfig({ ...config, ativo: e.target.checked })}
              className="accent-[#D4A94A]"
            />
            Som
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(config.volume * 100)}
              onChange={(e) =>
                salvarConfig({ ...config, volume: Number(e.target.value) / 100 })
              }
              className="w-20 accent-[#D4A94A]"
              aria-label="Volume do alerta"
            />
            <span className="w-8 text-right">{Math.round(config.volume * 100)}%</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Repetir
            <select
              value={config.intervaloSegundos}
              onChange={(e) =>
                salvarConfig({ ...config, intervaloSegundos: Number(e.target.value) })
              }
              className="rounded-lg border border-[#D4A94A]/45 bg-[#17150F] px-2 py-1 text-[11px] text-foreground"
              aria-label="Intervalo de repetição do alerta"
            >
              {[15, 30, 45, 60, 120].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bip(config.volume)}
            className="h-9 border-[#D4A94A]/60 bg-transparent text-[11px] font-bold text-[#F2CE6B] hover:bg-[#F2CE6B]/12"
          >
            <BellRing className="mr-1 size-3.5" /> Testar som
          </Button>
        </span>
      </div>

      {audioBloqueado ? (
        <p className="rounded-xl border border-[#F5B301]/45 bg-[#F5B301]/10 px-3 py-2 text-xs text-[#F5B301]">
          O navegador bloqueou o áudio — clique em “Testar som” para liberar o alerta.
        </p>
      ) : null}

      {/* ---------------- Três colunas ---------------- */}
      <div className="grid gap-3 xl:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = ordenadas(colunas[col.key]);
          const IconeColuna = col.icone;
          return (
            <section
              key={col.key}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#D4A94A] bg-[#121110] shadow-card"
              aria-label={col.titulo}
            >
              <header
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{ backgroundColor: col.cor, color: "#fff" }}
              >
                <IconeColuna className="size-5 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-base font-bold uppercase leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]">
                    {col.titulo} ({lista.length})
                  </h2>
                  <p className="truncate text-[11px] leading-tight text-white/85">
                    {col.key === "analise"
                      ? "Novos pedidos aguardando sua análise"
                      : col.key === "producao"
                        ? "Pedidos aceitos e em preparo na cozinha"
                        : "Pedidos prontos para despacho ou retirada"}
                  </p>
                </div>
              </header>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {lista.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum pedido nesta coluna.
                  </p>
                ) : (
                  lista.map((p) => (
                    <CardPedido
                      key={p.id}
                      pedido={p}
                      coluna={col.key}
                      avisoCozinha={avisoDoPedido(avisos, p.id)}
                      naoReconhecido={naoReconhecidos.some((x) => x.id === p.id)}
                      onReconhecer={() => reconhecer(p.id)}
                      onDetalhes={() => abrirDetalhes(p)}
                      onAvisoLido={() => onAvisoReconhecido?.(p.id)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {detalhe ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetalhe(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#D4A94A] bg-[#121110] p-4 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-foreground">
                Pedido #{detalhe.numero}
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDetalhe(null)}
                className="h-9 border-[#D4A94A]/60 bg-transparent text-xs text-[#F2CE6B]"
              >
                Fechar
              </Button>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <LinhaDetalhe rotulo="Cliente" valor={detalhe.cliente_nome} />
              <LinhaDetalhe
                rotulo="Modalidade"
                valor={detalhe.tipo_entrega === "retirada" ? "Retirada" : "Entrega"}
              />
              <LinhaDetalhe rotulo="Total" valor={brl(detalhe.total)} />
              <LinhaDetalhe
                rotulo="Pagamento"
                valor={`${detalhe.forma_pagamento ?? "—"} · ${detalhe.pagamento_status ?? "pendente"}`}
              />
              <LinhaDetalhe rotulo="Recebido em" valor={hora(detalhe.created_at)} />
              <LinhaDetalhe
                rotulo="Agendado"
                valor={detalhe.agendado_para ? hora(detalhe.agendado_para) : "—"}
              />
              <LinhaDetalhe
                rotulo="Endereço"
                valor={
                  detalhe.tipo_entrega === "retirada"
                    ? "Retirada no balcão"
                    : `${detalhe.endereco ?? "—"} · ${detalhe.bairro ?? ""}`
                }
              />
              <LinhaDetalhe rotulo="Observações" valor={detalhe.observacoes || "—"} />
            </dl>
            <ul className="mt-3 space-y-1 text-sm">
              {(detalhe.pedido_itens ?? []).map((i) => (
                <li key={i.nome} className="flex justify-between gap-2">
                  <span className="text-[#C9C2B8]">
                    {i.quantidade}x {i.nome}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Peças da tela                                                       */
/* ------------------------------------------------------------------ */

function MetricaCard({
  icone: Icone,
  label,
  valor,
  extra,
}: {
  icone: any;
  label: string;
  valor: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-3 shadow-card">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#D4A94A]/60 bg-[#1A1712]">
        <Icone className="size-5 text-[#F2CE6B]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-display text-2xl font-bold leading-tight text-foreground">
          {valor}
        </p>
      </div>
      {extra ? <div className="shrink-0">{extra}</div> : null}
    </div>
  );
}

function FiltroBtn({
  ativo,
  onClick,
  label,
  icone: Icone,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  icone?: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
        ativo
          ? "border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-[#14120C]"
          : "border-[#2A2721] bg-[#17150F] text-[#C9C2B8] hover:border-[#D4A94A]/60 hover:text-[#F2CE6B]"
      }`}
    >
      {Icone ? <Icone className="size-3.5" /> : null}
      {label}
    </button>
  );
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#2A2721] pb-1.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="text-right font-semibold text-foreground">{valor}</dd>
    </div>
  );
}

function CardPedido({
  pedido,
  coluna,
  avisoCozinha,
  naoReconhecido,
  onReconhecer,
  onDetalhes,
}: {
  pedido: PedidoCentral;
  coluna: "analise" | "producao" | "pronto";
  avisoCozinha: AvisoCozinha | null;
  naoReconhecido: boolean;
  onReconhecer: () => void;
  onDetalhes: () => void;
  onAvisoLido?: () => void;
}) {
  const retirada = pedido.tipo_entrega === "retirada";
  const aguardando = minutosDesde(pedido.created_at);
  const itens = (pedido.pedido_itens ?? [])
    .map((i) => `${i.quantidade} ${i.nome}`)
    .join(", ");
  const aceite = elegivelAceiteLocal({
    status: pedido.status,
    aceito_em_atendente: pedido.aceito_em_atendente ?? null,
    pagamento_status: pedido.pagamento_status ?? "pendente",
  });

  return (
    <article
      className={`rounded-xl border-2 bg-[#17150F] p-3 shadow-card ${
        naoReconhecido ? "border-l-[#F5B301]" : "border-l-[#D4A94A]/60"
      }`}
    >
      {/* Linha 1: número, cliente, modalidade */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-base font-bold text-foreground">
          #{pedido.numero}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-[#C9C2B8]">
          <UserRound className="size-3.5" aria-hidden />
          {pedido.cliente_nome}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#D4A94A]/60 bg-[#F2CE6B]/12 px-2 py-0.5 text-[10px] font-bold text-[#F2CE6B]">
          {retirada ? (
            <Store className="size-3" aria-hidden />
          ) : (
            <Truck className="size-3" aria-hidden />
          )}
          {retirada ? "Retirada" : "Entrega"}
        </span>
      </div>

      {/* Linha 2: total e pagamento */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-display text-sm font-bold text-foreground">
          <Wallet className="size-3.5 text-[#F2CE6B]" aria-hidden />
          {brl(pedido.total)}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            pedido.pagamento_status === "pago"
              ? "bg-[#35C97C]/15 text-[#35C97C]"
              : "bg-white/8 text-[#C9C2B8]"
          }`}
        >
          {pedido.pagamento_status === "pago" ? (
            <CheckCircle2 className="size-3" aria-hidden />
          ) : (
            <Clock className="size-3" aria-hidden />
          )}
          {pedido.pagamento_status === "pago"
            ? `${(pedido.forma_pagamento ?? "pix").toUpperCase()} pago`
            : "Aguardando pagamento"}
        </span>
      </div>

      {/* Linha 3: horário, itens e espera */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          {pedido.agendado_para
            ? `Agendado ${hora(pedido.agendado_para)}`
            : `Hoje, ${hora(pedido.created_at)}`}
        </span>
        {itens ? (
          <span className="inline-flex items-center gap-1">
            <Package className="size-3.5" aria-hidden />
            {itens}
          </span>
        ) : null}
        {coluna === "analise" ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            aguardando {formatarMinutos(aguardando)}
          </span>
        ) : null}
      </div>

      {/* Observações / aviso da cozinha */}
      {pedido.observacoes ? (
        <p className="mt-2 text-[11px] italic text-[#C9C2B8]">{pedido.observacoes}</p>
      ) : null}
      {avisoCozinha ? (
        <p className="mt-2 rounded-lg border border-[#35C97C]/40 bg-[#35C97C]/10 px-2 py-1.5 text-[11px] text-[#35C97C]">
          {avisoCozinha.titulo} — {avisoCozinha.detalhe}
        </p>
      ) : null}
      {retirada && coluna === "pronto" ? (
        <p className="mt-2 rounded-lg border border-[#D4A94A]/40 bg-[#F2CE6B]/10 px-2 py-1.5 text-[11px] text-[#F2CE6B]">
          Aguardando retirada no balcão
          {pedido.retirado_em ? " · retirada confirmada" : ""}
        </p>
      ) : null}

      {/* Ações */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDetalhes}
          className="h-10 flex-1 border-[#D4A94A]/55 bg-transparent text-xs font-bold text-[#E7E2D8] hover:bg-[#F2CE6B]/10"
        >
          <Eye className="mr-1.5 size-4" /> Ver detalhes
        </Button>

        {coluna === "analise" ? (
          <Button
            size="sm"
            disabled={!aceite.elegivel}
            onClick={onDetalhes}
            className="erp-btn-gold h-10 flex-1 border border-[#D4A94A] bg-gradient-to-b from-[#F2CE6B] to-[#D4A94A] text-xs font-bold text-[#14120C] hover:brightness-105 disabled:opacity-45"
          >
            <CheckCircle2 className="mr-1.5 size-4" /> Aceitar pedido
          </Button>
        ) : null}
        {coluna === "analise" && naoReconhecido ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onReconhecer}
            className="h-10 border-[#F5B301]/60 bg-transparent text-xs font-bold text-[#F5B301] hover:bg-[#F5B301]/12"
          >
            <BellRing className="mr-1.5 size-4" /> Reconhecer alerta
          </Button>
        ) : null}
        {coluna === "producao" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onDetalhes}
            className="h-10 flex-1 border-[#5B93F5]/70 bg-gradient-to-b from-[#2F62C8] to-[#1F4CA8] text-xs font-bold text-white hover:brightness-110"
          >
            <ChefHat className="mr-1.5 size-4" /> Acompanhar preparo
          </Button>
        ) : null}
        {coluna === "pronto" && !retirada ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onDetalhes}
            className="h-10 flex-1 border-[#35C97C]/70 bg-gradient-to-b from-[#1E9E63] to-[#146E48] text-xs font-bold text-white hover:brightness-110"
          >
            <Bike className="mr-1.5 size-4" /> Chamar motoboy
          </Button>
        ) : null}
        {coluna === "pronto" && retirada ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onDetalhes}
            className="h-10 flex-1 border-[#35C97C]/70 bg-gradient-to-b from-[#1E9E63] to-[#146E48] text-xs font-bold text-white hover:brightness-110"
          >
            <Store className="mr-1.5 size-4" /> Liberar retirada
          </Button>
        ) : null}
      </div>
    </article>
  );
}
