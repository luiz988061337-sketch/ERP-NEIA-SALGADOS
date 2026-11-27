import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Eye,
  Package,
  Search,
  Store,
  Truck,
  UserRound,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabaseLoose as supabase } from "@/lib/supabase-loose";
import { brl, PAGAMENTO_LABEL, PAGAMENTO_STATUS_LABEL } from "@/lib/format";
import {
  CHAVE_CONFIG_ALERTA,
  CHAVE_RECONHECIDOS,
  CONFIG_ALERTA_PADRAO,
  ESTADOS_CENTRAL,
  EVENTO_AVISO_COZINHA,
  TOPICO_AVISOS_COZINHA,
  atrasoCentral,
  colunasCentral,
  avisoDoPedido,
  estaEmPreparo,
  filtrarPedidos,
  formatarMinutos,
  gravarArmazenamento,
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
  prazoRegistrado,
  TIPO_AVISO_CAIXA,
  TIPO_AVISO_RETIRADA,
  type AvisoCozinha,
  type ColunasCentral,
  type ConfigAlerta,
  type PedidoCentral,
} from "@/lib/central-pedidos";
import { CANAIS } from "@/lib/sincronizacao-paineis";
import {
  executarAceiteAtendente,
  elegivelAceiteLocal,
  podeAceitarPerfil,
  type ResultadoAceite,
} from "@/lib/atendente-aceite";
import { elegivelRetirada, retirarPedidoCliente } from "@/lib/motoboy-finalizacao";
import { entradaJanelaProducao } from "@/lib/motor-producao";
import { unidadesSalgadosH02 } from "@/lib/pedidos-h02";
import { MINIMO_COMBO } from "@/lib/totals";
import { lerDashboard } from "@/lib/dashboard-a01-dados";
import "./central-pedidos.css";

/**
 * Central de Pedidos da Atendente.
 *
 * A fila consulta pedidos e notificações. Aceite e retirada usam as ações
 * existentes, enquanto a produção e o despacho são atualizados nos seus painéis.
 */

const COLUNAS = [
  {
    key: "analise",
    titulo: "Em análise",
    descricao: "Pedidos aguardando aceitação",
    icone: ClipboardList,
  },
  {
    key: "producao",
    titulo: "Em produção",
    descricao: "Aguardando preparo ou em preparo",
    icone: ChefHat,
  },
  {
    key: "pronto",
    titulo: "Prontos",
    descricao: "Aguardando retirada ou despacho",
    icone: Package,
  },
] as const;

function mensagemFalhaAceite(r: ResultadoAceite): string {
  switch (r.codigo) {
    case "negado":
      return "Acesso negado: apenas atendentes e administradores podem aceitar pedidos.";
    case "inelegivel":
      return "Este pedido não está mais disponível para aceite.";
    case "conflito":
      return "Este pedido já foi aceito. A fila será atualizada.";
    case "inexistente":
      return "Pedido não encontrado.";
    case "flag-desativada":
      return "A integração de aceite não está ativada neste ambiente.";
    default:
      return r.detalhe || "Não foi possível confirmar o aceite. Tente novamente.";
  }
}

export function CentralPedidos({
  preview = false,
  pedidosInjetados,
  avisosInjetados,
  onAceitar,
  onAvisoReconhecido,
  configInicial,
  usuarioId = null,
  papeis = [],
}: {
  preview?: boolean;
  pedidosInjetados?: PedidoCentral[];
  avisosInjetados?: AvisoCozinha[];
  /** Executor injetado (prévias). Deve retornar o resultado real da operação. */
  onAceitar?: (pedido: PedidoCentral) => ResultadoAceite | Promise<ResultadoAceite>;
  onAvisoReconhecido?: (id: string) => void;
  /** Demo: força a config aprovada (som ligado, 75%, 30s) na montagem. */
  configInicial?: ConfigAlerta;
  usuarioId?: string | null | undefined;
  papeis?: readonly string[] | undefined;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<"todos" | "analise" | "producao" | "pronto">("todos");
  const [modalidade, setModalidade] = useState<"todas" | "entrega" | "retirada">("todas");
  const [soAgendados, setSoAgendados] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);
  const aceitandoRef = useRef<string | null>(null);
  const [retiradaId, setRetiradaId] = useState<string | null>(null);
  const [retirando, setRetirando] = useState(false);
  const retirandoRef = useRef(false);
  const autorizado = podeAceitarPerfil({ id: usuarioId, papeis });
  const [agora, setAgora] = useState(Date.now);

  /* ---------------------------------------------------------------- */
  /* Dados reais                                                      */
  /* ---------------------------------------------------------------- */
  const {
    data: pedidosHook,
    isError: pedidosErro,
    isPending: pedidosPendentes,
    refetch: refazerPedidos,
  } = useQuery({
    queryKey: ["central-pedidos", usuarioId],
    enabled: !preview && autorizado,
    refetchInterval: CANAIS.atendente.pollingMs,
    queryFn: async ({ signal }) => {
      const pedidos = await lerDashboard<PedidoCentral>((inicio, fim) =>
        supabase
          .from("pedidos")
          .select(
            "id,numero,cliente_nome,telefone,status,tipo_entrega,total,created_at,agendado_para,prazo_prometido_em,observacoes,aceito_em_atendente,aceito_em,aceito_por,liberado_em,conferido_em,pronto_em,preparo_em,retirado_em,motoboy_id,atrasado,atraso_descricao,pagamento_status,forma_pagamento,endereco,bairro,producao_status,producao_remessas(indice,concluida_em),itens_catalogados:pedido_itens(id,nome,quantidade,produto_id,produtos(id,nome,tipo_venda,unidade_medida,categorias(slug)),pedido_item_componentes(produto_id,quantidade,produtos(nome)))",
          )
          .in("status", [...ESTADOS_CENTRAL])
          .is("retirado_em", null)
          .order("id")
          .range(inicio, fim)
          .abortSignal(signal),
      );
      return pedidos.map((pedido) => ({ ...pedido, pedido_itens: pedido.itens_catalogados ?? [] }));
    },
  });

  const {
    data: avisosHook,
    isError: avisosErro,
    refetch: refazerAvisos,
  } = useQuery({
    queryKey: ["central-pedidos-avisos", usuarioId],
    enabled: !preview && autorizado,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, tipo, titulo, detalhe, link, lida, created_at")
        .in("tipo", [TIPO_AVISO_CAIXA, TIPO_AVISO_RETIRADA])
        .order("created_at", { ascending: false })
        .order("id")
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AvisoCozinha[];
    },
  });

  useEffect(() => {
    if (preview || !autorizado) return;
    const canal = supabase
      .channel(CANAIS.atendente.nome)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["central-pedidos", usuarioId] });
      })
      .subscribe();
    const atualizarAvisos = () => {
      void queryClient.invalidateQueries({ queryKey: ["central-pedidos-avisos", usuarioId] });
    };
    const canalAvisos = supabase
      .channel(TOPICO_AVISOS_COZINHA, { config: { private: true } })
      .on("broadcast", { event: EVENTO_AVISO_COZINHA }, atualizarAvisos)
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") atualizarAvisos();
      });
    return () => {
      void supabase.removeChannel(canal);
      void supabase.removeChannel(canalAvisos);
    };
  }, [preview, autorizado, usuarioId, queryClient]);

  const pedidos = useMemo(
    () => (preview ? (pedidosInjetados ?? []) : (pedidosHook ?? [])),
    [preview, pedidosInjetados, pedidosHook],
  );
  const avisos = useMemo(
    () => (preview ? (avisosInjetados ?? []) : (avisosHook ?? [])),
    [preview, avisosInjetados, avisosHook],
  );

  const chaveAvisos = "neia:central-pedidos:avisos-reconhecidos:" + usuarioId;
  const [avisosReconhecidos, setAvisosReconhecidos] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (preview) return;
    setAvisosReconhecidos(lerReconhecidos(chaveAvisos));
    const sincronizar = (evento: StorageEvent) => {
      if (evento.key === chaveAvisos) setAvisosReconhecidos(lerReconhecidos(chaveAvisos));
    };
    window.addEventListener("storage", sincronizar);
    return () => window.removeEventListener("storage", sincronizar);
  }, [chaveAvisos, preview]);

  function reconhecerAviso(aviso: AvisoCozinha, pedidoId: string) {
    const ids = new Set([...avisosReconhecidos, ...(preview ? [] : lerReconhecidos(chaveAvisos))]);
    ids.add(aviso.tipo + ":" + pedidoId);
    if (!preview) gravarReconhecidos(ids, chaveAvisos);
    setAvisosReconhecidos(ids);
    onAvisoReconhecido?.(aviso.id);
  }

  const atualizarFilas = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["central-pedidos"] }),
      queryClient.invalidateQueries({ queryKey: ["central-pedidos-avisos"] }),
      queryClient.invalidateQueries({ queryKey: ["h02-pedidos-recentes"] }),
      queryClient.invalidateQueries({ queryKey: ["h02-pedidos-periodo"] }),
      queryClient.invalidateQueries({ queryKey: ["fila-producao"] }),
      queryClient.invalidateQueries({ queryKey: ["producao-reservas"] }),
    ]);

  /** Aceite: só confirma na interface depois do resultado da operação. */
  async function tratarAceite(pedido: PedidoCentral): Promise<void> {
    if (aceitandoRef.current || (!preview && !autorizado)) return;
    aceitandoRef.current = pedido.id;
    setAceitandoId(pedido.id);
    try {
      const resultado = onAceitar
        ? await onAceitar(pedido)
        : await executarAceiteAtendente({
            cliente: supabase,
            pedido: {
              id: pedido.id,
              status: pedido.status,
              aceito_em_atendente: pedido.aceito_em_atendente ?? pedido.aceito_em ?? null,
              pagamento_status: pedido.pagamento_status ?? "",
            },
            autor: { id: usuarioId, papeis },
          });

      if (!resultado.ok) {
        if (resultado.codigo === "conflito") await atualizarFilas();
        toast.error(mensagemFalhaAceite(resultado));
        return;
      }

      toast.success(`Pedido #${pedido.numero} aceito.`);
      await atualizarFilas();
    } catch (err) {
      console.error("[central-pedidos] aceite:", err);
      toast.error("Não foi possível confirmar o aceite. Nenhum status foi alterado.");
    } finally {
      aceitandoRef.current = null;
      setAceitandoId(null);
    }
  }

  const retirada = pedidos.find((p) => p.id === retiradaId);
  const detalhe = pedidos.find((p) => p.id === detalheId);
  const podeConfirmarRetirada = (p: PedidoCentral) =>
    !preview &&
    autorizado &&
    elegivelRetirada(
      {
        status: p.status,
        tipo_entrega: p.tipo_entrega,
        conferido_em: p.conferido_em ?? null,
        retirado_em: p.retirado_em ?? null,
      },
      true,
    ).elegivel;

  async function confirmarRetirada() {
    if (!retirada || !podeConfirmarRetirada(retirada) || retirandoRef.current) return;
    retirandoRef.current = true;
    setRetirando(true);
    try {
      const resultado = await retirarPedidoCliente(supabase, retirada.id, true);
      if (!resultado.ok) {
        toast.error(
          resultado.codigo === "flag-desativada"
            ? "A confirmação de retirada está desativada neste ambiente."
            : "A retirada não foi confirmada. Atualize a fila e tente novamente.",
        );
        if (resultado.codigo === "conflito") await atualizarFilas();
        return;
      }
      toast.success(`Retirada do pedido #${retirada.numero} confirmada.`);
      setRetiradaId(null);
      await atualizarFilas();
    } finally {
      retirandoRef.current = false;
      setRetirando(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Alerta sonoro (aprovado: ativo, 75%, 30s, reconhecimento individual) */
  /* ---------------------------------------------------------------- */
  const [config, setConfig] = useState<ConfigAlerta>(CONFIG_ALERTA_PADRAO);
  const [reconhecidosVersao, setReconhecidosVersao] = useState(0);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const reconhecidosRef = useRef<Set<string>>(new Set());
  const conhecidosRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const pendentesRef = useRef(false);
  const ultimoBipRef = useRef(-Infinity);
  const filaAnalise = useMemo(() => colunasCentral(pedidos).analise, [pedidos]);

  // Config e reconhecimento persistidos (recarregar a página não duplica alerta).
  useEffect(() => {
    if (preview) {
      setConfig(configInicial ? normalizarConfig(configInicial) : CONFIG_ALERTA_PADRAO);
      reconhecidosRef.current = new Set();
      conhecidosRef.current = new Set();
      setReconhecidosVersao((v) => v + 1);
      return;
    }
    if (configInicial) {
      const aprovada = normalizarConfig(configInicial);
      setConfig(aprovada);
      gravarArmazenamento(CHAVE_CONFIG_ALERTA, JSON.stringify(aprovada));
    } else {
      setConfig(lerConfig(lerArmazenamento(CHAVE_CONFIG_ALERTA)));
    }
    reconhecidosRef.current = lerReconhecidos();
    conhecidosRef.current = lerConhecidos();
    setReconhecidosVersao((v) => v + 1);
    const sincronizar = (evento: StorageEvent) => {
      if (evento.key === CHAVE_RECONHECIDOS) {
        reconhecidosRef.current = lerReconhecidos();
        setReconhecidosVersao((v) => v + 1);
      }
      if (evento.key === CHAVE_CONFIG_ALERTA) setConfig(lerConfig(evento.newValue));
    };
    window.addEventListener("storage", sincronizar);
    return () => window.removeEventListener("storage", sincronizar);
  }, [configInicial, preview]);

  const bip = useCallback(
    async (volume: number, testar = false, intervalo = 1000) => {
      if (volume === 0) return;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) {
          setAudioBloqueado(true);
          return;
        }
        if (!audioRef.current) audioRef.current = new Ctx();
        const ctx = audioRef.current;
        if (ctx.state !== "running" && testar) await ctx.resume();
        if (audioRef.current !== ctx) return;
        if (ctx.state !== "running") {
          setAudioBloqueado(true);
          return;
        }
        const tocar = () => {
          const agora = Date.now();
          const ultimoDaCentral = Number(lerArmazenamento("neia:central-pedidos:ultimo-bip"));
          if (agora - ultimoBipRef.current < 450) return;
          if (!testar && !preview && agora - ultimoDaCentral < intervalo) return;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.value = 880;
          g.gain.setValueAtTime(Math.max(0.0001, volume), ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          o.onended = () => {
            o.disconnect();
            g.disconnect();
          };
          o.start();
          o.stop(ctx.currentTime + 0.4);
          ultimoBipRef.current = agora;
          if (!testar && !preview)
            gravarArmazenamento("neia:central-pedidos:ultimo-bip", String(agora));
          setAudioBloqueado(false);
        };
        if (!testar && !preview && navigator.locks) {
          await navigator.locks.request(
            "neia:central-pedidos:audio",
            { ifAvailable: true },
            (lock) => {
              if (lock && audioRef.current === ctx) tocar();
            },
          );
        } else tocar();
      } catch {
        setAudioBloqueado(true);
      }
    },
    [preview],
  );

  useEffect(
    () => () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    },
    [],
  );

  const salvarConfig = useCallback(
    (nova: ConfigAlerta) => {
      const normalizada = normalizarConfig(nova);
      setConfig(normalizada);
      if (preview) return;
      try {
        localStorage.setItem(CHAVE_CONFIG_ALERTA, JSON.stringify(normalizada));
      } catch {
        /* segue */
      }
    },
    [preview],
  );

  // Um único timer: reavalia os pedidos e repete o som enquanto houver
  // pedido não reconhecido. Sem loops aninhados nem sons simultâneos.
  useEffect(() => {
    if (!config.ativo || (!preview && !autorizado)) return;
    const timer = window.setInterval(() => {
      setAgora(Date.now());
      if (pendentesRef.current)
        void bip(config.volume, false, config.intervaloSegundos * 1000 - 250);
    }, config.intervaloSegundos * 1000);
    return () => window.clearInterval(timer);
  }, [config.ativo, config.intervaloSegundos, config.volume, bip, preview, autorizado]);

  useEffect(() => {
    if (config.ativo) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [config.ativo]);

  // Reconhecimento individual: o som deixa de ser pedido por aquele pedido.
  const reconhecer = useCallback(
    (id: string) => {
      reconhecidosRef.current = new Set([
        ...reconhecidosRef.current,
        ...(preview ? [] : lerReconhecidos()),
        id,
      ]);
      if (!preview) gravarReconhecidos(reconhecidosRef.current);
      setReconhecidosVersao((v) => v + 1);
      toast.success("Alerta reconhecido.");
    },
    [preview],
  );

  // Pedido realmente novo (ID real). Na primeira leitura (reconexão/reload)
  // os pedidos existentes são registrados SEM tocar o som — só IDs que
  // aparecerem depois disparam o alerta. Reconhecimento é individual.
  const primeiraLeituraRef = useRef(true);
  useEffect(() => {
    if (!preview && (!autorizado || pedidosHook === undefined || pedidosErro)) return;
    const novos = filaAnalise.filter((p) => !conhecidosRef.current.has(p.id));
    const primeira = primeiraLeituraRef.current;
    for (const p of novos) conhecidosRef.current.add(p.id);
    if (!preview && novos.length > 0) gravarConhecidos(conhecidosRef.current);
    if (primeira) {
      primeiraLeituraRef.current = false;
      return;
    }
    if (novos.some((p) => !reconhecidosRef.current.has(p.id)) && config.ativo)
      void bip(config.volume);
  }, [
    filaAnalise,
    pedidosHook,
    pedidosErro,
    autorizado,
    config.ativo,
    config.volume,
    bip,
    preview,
  ]);

  // Reconexão/reload: pedidos já reconhecidos não voltam a tocar.
  const naoReconhecidos = useMemo(
    () => pedidosNaoReconhecidos(filaAnalise, reconhecidosRef.current),
    [filaAnalise, reconhecidosVersao],
  );
  useEffect(() => {
    pendentesRef.current = naoReconhecidos.length > 0 && (preview || !pedidosErro);
  }, [naoReconhecidos, pedidosErro, preview]);

  /* ---------------------------------------------------------------- */
  /* Colunas, filtros e métricas                                       */
  /* ---------------------------------------------------------------- */
  const filtrados = useMemo(
    () => filtrarPedidos(pedidos, { busca, status, modalidade, agendados: soAgendados }),
    [pedidos, busca, status, modalidade, soAgendados],
  );
  const colunas = useMemo(() => colunasCentral(filtrados), [filtrados]);
  const metricas = useMemo(() => metricasCentral(pedidos, agora), [pedidos, agora]);
  const idsPendentes = useMemo(() => new Set(naoReconhecidos.map((p) => p.id)), [naoReconhecidos]);
  const filaDisponivel = preview || (!pedidosErro && !pedidosPendentes);
  const valor = (n: number) => (filaDisponivel ? n : "—");
  const numeroAtrasados =
    !filaDisponivel || (metricas.atrasados === 0 && metricas.prazosSemDados > 0)
      ? "—"
      : metricas.atrasados;
  const intervalos = [...new Set([15, 30, 45, 60, 120, config.intervaloSegundos])].sort(
    (a, b) => a - b,
  );
  const podeOperar = (preview || autorizado) && filaDisponivel;

  if (!preview && !autorizado) {
    return (
      <p className="p-4" role="status">
        Acesso restrito a atendentes e administradores.
      </p>
    );
  }

  return (
    <div className="central-atendente" data-testid="central-atendente">
      <header className="ca-cabecalho">
        <h1>Central da Atendente</h1>
        <p>Recebimento, produção e liberação dos pedidos.</p>
      </header>

      <section className="ca-indicadores" aria-label="Indicadores da fila">
        <MetricaCard
          icone={ClipboardList}
          label="Em análise"
          valor={valor(metricas.novos)}
          tipo="analise"
        />
        <MetricaCard
          icone={ChefHat}
          label="Em produção"
          valor={valor(metricas.emProducao)}
          tipo="producao"
        />
        <MetricaCard
          icone={Package}
          label="Prontos"
          valor={valor(metricas.prontos)}
          tipo="pronto"
        />
        <MetricaCard
          icone={TriangleAlert}
          label="Atrasados"
          valor={numeroAtrasados}
          tipo="atraso"
        />
      </section>
      {filaDisponivel && metricas.prazosSemDados > 0 && (
        <p className="ca-nota">
          {metricas.prazosSemDados}{" "}
          {metricas.prazosSemDados === 1
            ? "pedido sem prazo verificável"
            : "pedidos sem prazo verificável"}
          .
        </p>
      )}

      <section className="ca-filtros" aria-label="Filtros dos pedidos">
        <label className="ca-busca">
          <Search size={18} aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, cliente, telefone ou produto"
            aria-label="Buscar pedidos"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label="Filtrar por status"
        >
          <option value="todos">Todos os status</option>
          {COLUNAS.map((col) => (
            <option key={col.key} value={col.key}>
              {col.titulo}
            </option>
          ))}
        </select>
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
      </section>

      <section className="ca-audio" aria-label="Controles do alerta sonoro">
        <strong>
          <Bell size={19} aria-hidden /> Alerta sonoro de novos pedidos
        </strong>
        <label>
          <input
            type="checkbox"
            role="switch"
            aria-label="Alerta sonoro"
            checked={config.ativo}
            onChange={(e) => salvarConfig({ ...config, ativo: e.target.checked })}
          />
          {config.ativo ? "Ativo" : "Desativado"}
        </label>
        <label>
          Volume
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(config.volume * 100)}
            onChange={(e) => salvarConfig({ ...config, volume: Number(e.target.value) / 100 })}
            aria-label="Volume do alerta"
          />
          <span>{Math.round(config.volume * 100)}%</span>
        </label>
        <label>
          Repetir
          <select
            value={config.intervaloSegundos}
            aria-label="Intervalo de repetição"
            onChange={(e) => salvarConfig({ ...config, intervaloSegundos: Number(e.target.value) })}
          >
            {intervalos.map((s) => (
              <option key={s} value={s}>
                {s} s
              </option>
            ))}
          </select>
        </label>
        <Button type="button" className="ca-primario" onClick={() => void bip(config.volume, true)}>
          <BellRing size={17} aria-hidden /> Testar som
        </Button>
      </section>

      {audioBloqueado && (
        <p role="status" className="ca-alerta">
          O navegador bloqueou o áudio. Clique em “Testar som” para liberar o alerta.
        </p>
      )}
      {!preview && pedidosErro && (
        <div role="alert" className="ca-alerta">
          Não foi possível carregar a fila de pedidos.
          <Button variant="outline" className="ca-secundario" onClick={() => void refazerPedidos()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!preview && pedidosPendentes && (
        <p role="status" className="ca-nota">
          Carregando pedidos.
        </p>
      )}
      {!preview && avisosErro && (
        <div role="alert" className="ca-alerta">
          Não foi possível carregar os avisos da cozinha.
          <Button variant="outline" className="ca-secundario" onClick={() => void refazerAvisos()}>
            Recarregar avisos
          </Button>
        </div>
      )}

      {filaDisponivel && (
        <div className="ca-colunas">
          {COLUNAS.map((col) => {
            const lista = ordenarPorPrioridade(colunas[col.key], agora);
            return (
              <section
                key={col.key}
                className="ca-coluna"
                aria-label={col.titulo}
                data-coluna={col.key}
                data-tom={col.key}
              >
                <header>
                  <col.icone size={23} aria-hidden />
                  <div>
                    <h2>
                      {col.titulo} ({lista.length})
                    </h2>
                    <p>{col.descricao}</p>
                  </div>
                </header>
                <div className="ca-cartoes">
                  {lista.length ? (
                    lista.map((p) => {
                      const aviso = avisoDoPedido(avisos, p.id, p.tipo_entrega);
                      return (
                        <CardPedido
                          key={p.id}
                          pedido={p}
                          coluna={col.key}
                          agora={agora}
                          aviso={aviso}
                          avisoReconhecido={
                            !!aviso && avisosReconhecidos.has(aviso.tipo + ":" + p.id)
                          }
                          onReconhecerAviso={aviso ? () => reconhecerAviso(aviso, p.id) : undefined}
                          pendente={idsPendentes.has(p.id)}
                          bloqueado={!podeOperar || aceitandoId !== null}
                          aceitando={aceitandoId === p.id}
                          onDetalhes={() => setDetalheId(p.id)}
                          onAceitar={() => void tratarAceite(p)}
                          onReconhecer={() => reconhecer(p.id)}
                          onRetirada={
                            podeConfirmarRetirada(p) ? () => setRetiradaId(p.id) : undefined
                          }
                        />
                      );
                    })
                  ) : (
                    <p className="ca-vazio">Nenhum pedido nesta coluna.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!detalhe}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalheId(null);
        }}
      >
        {detalhe && (
          <DialogContent className="ca-dialogo">
            <DialogHeader>
              <DialogTitle>Pedido #{detalhe.numero}</DialogTitle>
              <DialogDescription>
                {detalhe.cliente_nome || "Cliente não informado"}
              </DialogDescription>
            </DialogHeader>
            <dl className="ca-detalhes">
              <LinhaDetalhe rotulo="Telefone" valor={detalhe.telefone} />
              <LinhaDetalhe rotulo="Modalidade" valor={modalidadeTexto(detalhe)} />
              <LinhaDetalhe rotulo="Horário do pedido" valor={dataCentral(detalhe.created_at)} />
              <LinhaDetalhe
                rotulo="Tipo de pedido"
                valor={detalhe.agendado_para ? "Agendado" : "Imediato"}
              />
              <LinhaDetalhe
                rotulo="Prazo prometido"
                valor={dataCentral(prazoRegistrado(detalhe))}
              />
              <LinhaDetalhe rotulo="Valor" valor={valorPedido(detalhe)} />
              <LinhaDetalhe rotulo="Pagamento" valor={pagamento(detalhe)} />
              <LinhaDetalhe
                rotulo="Aceite registrado em"
                valor={dataCentral(detalhe.aceito_em_atendente ?? detalhe.aceito_em)}
              />
              <LinhaDetalhe
                rotulo="Endereço"
                valor={
                  detalhe.tipo_entrega === "retirada"
                    ? "Retirada no balcão"
                    : [detalhe.endereco, detalhe.bairro].filter(Boolean).join(", ")
                }
              />
              <LinhaDetalhe rotulo="Observações" valor={detalhe.observacoes} />
              {!!detalhe.producao_remessas?.length && (
                <LinhaDetalhe
                  rotulo="Remessas concluídas"
                  valor={
                    detalhe.producao_remessas.filter((remessa) => remessa.concluida_em).length +
                    " de " +
                    detalhe.producao_remessas.length
                  }
                />
              )}
            </dl>
            <h3>Produtos do pedido</h3>
            {detalhe.pedido_itens?.length ? (
              <ul className="ca-produtos">
                {detalhe.pedido_itens.map((item, i) => (
                  <li key={i}>
                    {item.quantidade} × {item.nome}
                    {detalhe.itens_catalogados?.[i]?.pedido_item_componentes?.map(
                      (componente, indice) => (
                        <div key={indice} className="ca-nota">
                          {componente.quantidade} ×{" "}
                          {componente.produtos?.nome ?? "Sabor não identificado"}
                        </div>
                      ),
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ca-nota">Produtos não informados.</p>
            )}
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={!!retirada}
        onOpenChange={(aberto) => {
          if (!aberto && !retirandoRef.current) setRetiradaId(null);
        }}
      >
        {retirada && (
          <DialogContent className="ca-dialogo">
            <DialogHeader>
              <DialogTitle>Confirmar retirada do pedido #{retirada.numero}</DialogTitle>
              <DialogDescription>
                Confirme depois que o pedido for entregue ao cliente no balcão.
              </DialogDescription>
            </DialogHeader>
            <div className="ca-acoes">
              <Button
                type="button"
                variant="outline"
                className="ca-secundario"
                disabled={retirando}
                onClick={() => setRetiradaId(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                className="ca-primario"
                disabled={retirando || !filaDisponivel}
                aria-busy={retirando}
                onClick={() => void confirmarRetirada()}
              >
                {retirando ? "Confirmando retirada…" : "Confirmar retirada"}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

type IconeCentral = typeof Bell;
function MetricaCard({
  icone: Icone,
  label,
  valor,
  tipo,
}: {
  icone: IconeCentral;
  label: string;
  valor: string | number;
  tipo: keyof ColunasCentral | "atraso";
}) {
  return (
    <div className="ca-metrica" data-tom={tipo}>
      <Icone size={24} aria-hidden />
      <div>
        <p>{label}</p>
        <strong>{valor}</strong>
      </div>
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
  icone?: IconeCentral;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className="ca-filtro">
      {Icone && <Icone size={17} aria-hidden />}
      {label}
    </button>
  );
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor || "—"}</dd>
    </div>
  );
}

const formatoCentral = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
function dataCentral(valor: string | number | null | undefined) {
  const ms = typeof valor === "number" ? valor : Date.parse(valor ?? "");
  return Number.isFinite(ms) ? formatoCentral.format(ms) : null;
}

function modalidadeTexto(p: PedidoCentral) {
  return p.tipo_entrega === "retirada"
    ? "Retirada"
    : p.tipo_entrega === "entrega"
      ? "Entrega"
      : "Modalidade não informada";
}

function pagamento(p: PedidoCentral) {
  return (
    [
      p.forma_pagamento && (PAGAMENTO_LABEL[p.forma_pagamento] ?? p.forma_pagamento),
      p.pagamento_status && (PAGAMENTO_STATUS_LABEL[p.pagamento_status] ?? p.pagamento_status),
    ]
      .filter(Boolean)
      .join(" · ") || "Pagamento não informado"
  );
}

function valorPedido(p: PedidoCentral) {
  return typeof p.total === "number" && Number.isFinite(p.total)
    ? brl(p.total)
    : "Valor não informado";
}

function CardPedido({
  pedido,
  coluna,
  agora,
  aviso,
  avisoReconhecido,
  onReconhecerAviso,
  pendente,
  bloqueado,
  aceitando,
  onDetalhes,
  onAceitar,
  onReconhecer,
  onRetirada,
}: {
  pedido: PedidoCentral;
  coluna: keyof ColunasCentral;
  agora: number;
  aviso: AvisoCozinha | null;
  avisoReconhecido: boolean;
  onReconhecerAviso?: (() => void) | undefined;
  pendente: boolean;
  bloqueado: boolean;
  aceitando: boolean;
  onDetalhes: () => void;
  onAceitar: () => void;
  onReconhecer: () => void;
  onRetirada: (() => void) | undefined;
}) {
  const retirada = pedido.tipo_entrega === "retirada";
  const entrega = pedido.tipo_entrega === "entrega";
  const ModalidadeIcone = retirada ? Store : Truck;
  const emPreparo = estaEmPreparo(pedido);
  const liberado = !!pedido.conferido_em || aviso?.tipo === TIPO_AVISO_RETIRADA;
  const fase =
    coluna === "producao"
      ? emPreparo
        ? "Em preparo"
        : "Aguardando preparo"
      : coluna === "analise"
        ? pendente
          ? "Novo pedido"
          : "Aguardando aceitação"
        : retirada
          ? liberado
            ? "Aguardando cliente"
            : "Conferência ainda não confirmada"
          : entrega
            ? "Aguardando motoboy ou despacho"
            : "Pronto";
  const atrasado = atrasoCentral(pedido, agora) === true;
  const prazo = prazoRegistrado(pedido);
  const janela =
    coluna === "producao" && !emPreparo && pedido.agendado_para && prazo !== null
      ? entradaJanelaProducao(pedido.agendado_para).getTime()
      : null;
  const itens = pedido.itens_catalogados ?? [];
  const produtos = new Map(
    itens.flatMap((i) => (i.produtos ? [[i.produtos.id, i.produtos] as const] : [])),
  );
  const unidades = unidadesSalgadosH02(itens, produtos);
  const combos =
    pedido.producao_remessas?.length ||
    (unidades && unidades % MINIMO_COMBO === 0 ? unidades / MINIMO_COMBO : null);
  const aceite = elegivelAceiteLocal({
    status: pedido.status,
    aceito_em_atendente: pedido.aceito_em_atendente ?? pedido.aceito_em ?? null,
    pagamento_status: pedido.pagamento_status ?? "",
  });

  return (
    <article className="ca-pedido" data-atrasado={atrasado} data-pendente={pendente}>
      <div className="ca-linha">
        <h3>#{pedido.numero}</h3>
        <span className="ca-etiqueta">{pedido.agendado_para ? "Agendado" : "Imediato"}</span>
        {atrasado && (
          <span className="ca-atraso">
            <TriangleAlert size={15} aria-hidden /> Atrasado
          </span>
        )}
      </div>
      <div className="ca-linha">
        <span className="ca-cliente">
          <UserRound size={16} aria-hidden />
          {pedido.cliente_nome || "Cliente não informado"}
        </span>
        <span className="ca-modalidade">
          {(retirada || entrega) && <ModalidadeIcone size={16} aria-hidden />}
          {modalidadeTexto(pedido)}
        </span>
      </div>
      <p className="ca-fase">{fase}</p>
      <div className="ca-linha">
        <span>
          <strong>{valorPedido(pedido)}</strong> · {pagamento(pedido)}
        </span>
      </div>
      <p className="ca-meta">
        <Package size={16} aria-hidden />
        {unidades === null ? "Unidades não informadas" : unidades + " unidades"}
        <span>
          · {combos ? combos + (combos === 1 ? " combo" : " combos") : "Combos não informados"}
        </span>
      </p>
      {pedido.pedido_itens?.length ? (
        <p className="ca-nota">
          {pedido.pedido_itens.map((i) => i.quantidade + " × " + i.nome).join(" · ")}
        </p>
      ) : null}
      <p className="ca-meta">
        <Clock size={16} aria-hidden /> Pedido às {dataCentral(pedido.created_at) ?? "—"}
        {coluna === "analise" && dataCentral(pedido.created_at) && (
          <span>· há {formatarMinutos(minutosDesde(pedido.created_at, agora))}</span>
        )}
      </p>
      <p className="ca-meta">
        <CalendarClock size={16} aria-hidden /> Prazo prometido{" "}
        <strong>{dataCentral(prazo) ?? "Não registrado"}</strong>
      </p>
      {janela !== null && janela > agora && (
        <p className="ca-nota">Entrada na fila da cozinha {dataCentral(janela)}</p>
      )}
      {pedido.pronto_em && coluna === "pronto" && (
        <p className="ca-nota">Pronto desde {dataCentral(pedido.pronto_em)}</p>
      )}
      {pedido.atraso_descricao && <p className="ca-atraso">{pedido.atraso_descricao}</p>}
      {pedido.observacoes && <p className="ca-observacoes">{pedido.observacoes}</p>}
      {aviso && (
        <div className="ca-aviso">
          <strong>{aviso.titulo}</strong>
          {aviso.detalhe && <span>{aviso.detalhe}</span>}
          {avisoReconhecido ? (
            <span>Aviso reconhecido</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="ca-secundario"
              onClick={onReconhecerAviso}
            >
              Reconhecer aviso
            </Button>
          )}
        </div>
      )}
      <div className="ca-acoes">
        {coluna === "analise" && (
          <Button
            type="button"
            className="ca-primario"
            disabled={bloqueado || !aceite.elegivel}
            aria-busy={aceitando}
            onClick={onAceitar}
          >
            <CheckCircle2 size={17} aria-hidden />
            {aceitando ? "Aceitando…" : "Aceitar pedido"}
          </Button>
        )}
        <Button type="button" variant="outline" className="ca-secundario" onClick={onDetalhes}>
          <Eye size={17} aria-hidden /> Ver detalhes
        </Button>
        {coluna === "analise" && pendente && (
          <Button type="button" variant="outline" className="ca-secundario" onClick={onReconhecer}>
            <BellRing size={17} aria-hidden /> Reconhecer alerta
          </Button>
        )}
        {onRetirada && (
          <Button type="button" className="ca-primario" onClick={onRetirada}>
            Confirmar retirada
          </Button>
        )}
      </div>
    </article>
  );
}
